"""AEGIS — Admin API Router

Endpoints powering the Settings page: users, API keys, role/permission matrix,
and system config. Persists API-key changes to a JSONL store.
"""
from fastapi import APIRouter, Depends, Request, Body, HTTPException
from api.auth import require_permission, ROLES, DEMO_USERS
from api.middleware import limiter
from security.audit_logger import audit_log
import hashlib
import json
import os
import time
import secrets
from pathlib import Path

router = APIRouter(tags=["admin"])

DATA_DIR     = os.environ.get("DATA_DIR", "data/processed")
API_KEYS_LOG = Path(os.environ.get("API_KEYS_PATH", "logs/api_keys.jsonl"))
API_KEYS_LOG.parent.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────
# Permissions
# ─────────────────────────────────────────────────────────────────────

# Display-friendly capability rows for the Settings → Roles matrix.
CAPABILITIES = [
    ("view_alert_queue",      "View alert queue",       "read:alerts"),
    ("open_workspace",        "Open case workspace",    "read:cases"),
    ("run_propagation",       "Run risk propagation",   "read:cases"),
    ("claim_alerts",          "Assign / claim alerts",  "write:alert_action"),
    ("change_status",         "Change alert status",    "write:alert_action"),
    ("generate_str",          "Generate STR narrative", "write:cases"),
    ("export_dossier",        "Export case dossier",    "read:cases"),
    ("manage_escalation",     "Bulk close / escalate",  "manage:escalation"),
    ("manage_users",          "Manage users",           "write:config"),
    ("manage_api_keys",       "Manage API keys",        "write:config"),
    ("view_audit",            "View audit log",         "read:cases"),
    ("view_benchmarks",       "Open benchmark notebook","read:metrics"),
]
# Manage-users / API keys / config are admin-only by policy even if other roles
# happen to hold a base permission. Hard-gate via this set.
ADMIN_ONLY_CAPS = {"manage_users", "manage_api_keys"}
ROLE_ORDER = ["analyst", "investigator", "admin"]


def _initials(username: str) -> str:
    parts = username.replace(".", " ").replace("_", " ").replace("@", " ").split()
    if not parts:
        return "??"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def _display_name(username: str) -> str:
    """Turn a demo username into a Title Case display name."""
    base = username.split("@")[0].replace(".", " ").replace("_", " ")
    return " ".join(p.capitalize() for p in base.split() if p) or username


# ─────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────

@router.get("/users")
@limiter.limit("30/minute")
async def list_users(
    request: Request,
    token: dict = Depends(require_permission("write:config")),
):
    """List all known operator accounts."""
    rows = []
    for username, info in DEMO_USERS.items():
        rows.append({
            "username":   username,
            "name":       _display_name(username),
            "email":      f"{username}@aegis.fiu",
            "role":       info["role"],
            "initials":   _initials(username),
            "status":     "active",
            "last_login": None,
        })
    # Stable order: admin first, then alpha.
    rows.sort(key=lambda r: (r["role"] != "admin", r["username"]))
    return {
        "rows":      rows,
        "total":     len(rows),
        "suspended": 0,
        "invited":   0,
    }


# ─────────────────────────────────────────────────────────────────────
# Permissions matrix
# ─────────────────────────────────────────────────────────────────────

@router.get("/permissions")
@limiter.limit("30/minute")
async def role_permissions(
    request: Request,
    token: dict = Depends(require_permission("write:config")),
):
    """Return capabilities × roles matrix."""
    matrix = []
    for cap_id, label, required_perm in CAPABILITIES:
        row = {"id": cap_id, "label": label, "required_permission": required_perm}
        for role in ROLE_ORDER:
            if cap_id in ADMIN_ONLY_CAPS:
                row[role] = (role == "admin")
            else:
                row[role] = required_perm in ROLES.get(role, [])
        matrix.append(row)
    return {
        "roles":      ROLE_ORDER,
        "rows":       matrix,
        "note":       "Read-only matrix · contact platform team to amend.",
    }


# ─────────────────────────────────────────────────────────────────────
# API keys (CRUD with JSONL persistence)
# ─────────────────────────────────────────────────────────────────────

def _load_api_keys() -> list[dict]:
    """Replay the JSONL store to materialise current API-key state."""
    state: dict[str, dict] = {}
    if not API_KEYS_LOG.exists():
        return []
    with open(API_KEYS_LOG) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                evt = json.loads(line)
            except json.JSONDecodeError:
                continue
            kid = evt.get("id")
            if not kid:
                continue
            kind = evt.get("kind")
            if kind == "create":
                state[kid] = {
                    "id":         kid,
                    "label":      evt["label"],
                    "scope":      evt.get("scope", "investigations"),
                    "hash":       evt["hash"],
                    "created_at": evt["created_at"],
                    "created_by": evt.get("created_by", "admin"),
                    "last_used":  None,
                    "revoked_at": None,
                }
            elif kind == "use" and kid in state:
                state[kid]["last_used"] = evt["at"]
            elif kind == "revoke" and kid in state:
                state[kid]["revoked_at"] = evt["at"]
    rows = [v for v in state.values() if v["revoked_at"] is None]
    rows.sort(key=lambda r: r["created_at"], reverse=True)
    return rows


def _short_hash(h: str) -> str:
    return f"ak_{h[:4]}…{h[-4:]}" if h and len(h) >= 8 else h


@router.get("/api-keys")
@limiter.limit("30/minute")
async def list_api_keys(
    request: Request,
    token: dict = Depends(require_permission("write:config")),
):
    rows = _load_api_keys()
    return {
        "rows": [
            {
                "id":         r["id"],
                "label":      r["label"],
                "scope":      r["scope"],
                "hash_short": _short_hash(r["hash"]),
                "created_at": r["created_at"],
                "last_used":  r["last_used"],
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.post("/api-keys")
@limiter.limit("10/minute")
async def create_api_key(
    request: Request,
    payload: dict = Body(...),
    token: dict = Depends(require_permission("write:config")),
):
    """Create a new API key. Returns the plaintext key ONCE."""
    label = (payload.get("label") or "").strip()
    scope = (payload.get("scope") or "investigations").strip()
    if not label:
        raise HTTPException(status_code=400, detail="label required")
    plaintext = "aegis_" + secrets.token_urlsafe(24)
    h = hashlib.sha256(plaintext.encode()).hexdigest()
    kid = secrets.token_hex(8)
    now = time.time()
    with open(API_KEYS_LOG, "a") as f:
        f.write(json.dumps({
            "kind":       "create",
            "id":         kid,
            "label":      label,
            "scope":      scope,
            "hash":       h,
            "created_at": now,
            "created_by": token.get("sub", "admin"),
        }) + "\n")
    audit_log("api_key_created", token.get("sub", "admin"), {
        "key_id": kid, "label": label, "scope": scope, "key_hash": _short_hash(h),
    })
    return {
        "id":         kid,
        "label":      label,
        "scope":      scope,
        "plaintext":  plaintext,
        "hash_short": _short_hash(h),
        "created_at": now,
    }


@router.delete("/api-keys/{key_id}")
@limiter.limit("10/minute")
async def revoke_api_key(
    request: Request,
    key_id: str,
    token: dict = Depends(require_permission("write:config")),
):
    rows = _load_api_keys()
    if not any(r["id"] == key_id for r in rows):
        raise HTTPException(status_code=404, detail=f"key {key_id} not found")
    now = time.time()
    with open(API_KEYS_LOG, "a") as f:
        f.write(json.dumps({
            "kind": "revoke", "id": key_id, "at": now,
        }) + "\n")
    audit_log("api_key_revoked", token.get("sub", "admin"), {
        "key_id": key_id,
    })
    return {"id": key_id, "revoked_at": now}


# ─────────────────────────────────────────────────────────────────────
# Config (read-only)
# ─────────────────────────────────────────────────────────────────────

def _env(key: str, default: str | None = None) -> str:
    v = os.environ.get(key)
    return v if v is not None else (default or "")


@router.get("/config")
@limiter.limit("30/minute")
async def system_config(
    request: Request,
    token: dict = Depends(require_permission("write:config")),
):
    """Return environment-derived operational config."""
    from api.auth import EXPIRE_MINUTES
    return {
        "rate_limiting": {
            "requests_per_minute":      _env("RATE_PER_MINUTE", "60"),
            "burst":                    _env("RATE_BURST", "120"),
            "concurrent_investigations": _env("CONCURRENT_INVESTIGATIONS", "48"),
            "str_per_hour":             _env("STR_PER_HOUR", "20"),
        },
        "session": {
            "jwt_expiry_minutes": EXPIRE_MINUTES,
            "idle_timeout_minutes": int(_env("IDLE_TIMEOUT_MINUTES", "30")),
            "mfa_required_for":   "admin",
        },
        "paths": {
            "audit_log":        _env("AUDIT_LOG_PATH", "logs/audit.jsonl"),
            "model_dir":        _env("MODEL_DIR",      "models/saved"),
            "data_dir":         _env("DATA_DIR",       "data/processed"),
            "pending_alerts":   _env("PENDING_ALERTS_PATH", "logs/pending_alerts.jsonl"),
            "api_keys":         str(API_KEYS_LOG),
        },
        "escalation": {
            "timeout_seconds": int(_env("ESCALATION_TIMEOUT_SECONDS", "7200")),
            "tick_seconds":    int(_env("ESCALATION_TICK_SECONDS", "60")),
            "webhook_url":     _env("ESCALATION_WEBHOOK_URL", ""),
        },
    }
