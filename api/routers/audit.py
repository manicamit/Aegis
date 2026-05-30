"""AEGIS — Audit Trail API Router

Surfaces the hash-chained audit log to the admin UI with chain-integrity stats.
"""
from fastapi import APIRouter, Depends, Query, Request
from api.auth import require_permission
from api.middleware import limiter
from security.audit_logger import AUDIT_LOG
import hashlib
import json
import os
import time
from collections import Counter

router = APIRouter(tags=["audit"])

# Event-family map used both for filtering and human-friendly category labels.
EVENT_FAMILIES = {
    "alert_actioned":           "CASE",
    "alert_assigned":           "CASE",
    "alert_action_detail":      "CASE",
    "auto_escalation":          "CASE",
    "manual_reassign":          "CASE",
    "login_success":            "LOGIN",
    "login_failure":            "LOGIN",
    "str_generated":            "STR",
    "str_exported":             "EXPORT",
    "graph_export":             "EXPORT",
    "api_key_created":          "API",
    "api_key_revoked":          "API",
    "user_role_changed":        "API",
    "model_retrain_scheduled":  "SYSTEM",
    "session_expired":          "SYSTEM",
    "case_status_changed":      "CASE",
    "bulk_close":               "CASE",
    "investigation_opened":     "CASE",
}


def _read_entries(limit: int, offset: int, family: str | None, search: str | None) -> tuple[list[dict], int]:
    """Tail-first read of the JSONL audit log. Returns (page rows, total matched)."""
    if not os.path.exists(AUDIT_LOG):
        return [], 0
    with open(AUDIT_LOG, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    matched: list[dict] = []
    for raw in reversed(lines):
        raw = raw.strip()
        if not raw:
            continue
        try:
            entry = json.loads(raw)
        except json.JSONDecodeError:
            continue
        ev = (entry.get("event") or "").lower()
        fam = EVENT_FAMILIES.get(ev, "OTHER")
        if family and family.upper() != "ALL" and fam != family.upper():
            continue
        if search:
            q = search.lower()
            blob = (
                f"{entry.get('event','')} {entry.get('user','')} "
                f"{json.dumps(entry.get('details', {}))}"
            ).lower()
            if q not in blob:
                continue
        matched.append(entry)
    sliced = matched[offset : offset + limit]
    return sliced, len(matched)


def _verify_chain(window: int = 256) -> dict:
    """Walk the most recent `window` entries and recompute their hash chain."""
    if not os.path.exists(AUDIT_LOG):
        return {
            "total_entries":   0,
            "verified_window": 0,
            "anomalies":       [],
            "head_hash":       None,
            "head_prev":       None,
            "last_timestamp":  None,
        }
    with open(AUDIT_LOG, "r", encoding="utf-8", errors="replace") as f:
        lines = [ln.strip() for ln in f if ln.strip()]
    total = len(lines)
    if total == 0:
        return {
            "total_entries":   0, "verified_window": 0, "anomalies": [],
            "head_hash":       None, "head_prev": None, "last_timestamp": None,
        }
    tail = lines[-window:]
    parsed: list[dict] = []
    for raw in tail:
        try:
            parsed.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    anomalies: list[dict] = []
    prev_hash = None
    for entry in parsed:
        stored_hash = entry.get("hash")
        # Re-hash the entry without the `hash` field, mirroring audit_log() exactly.
        rebuilt = {k: entry[k] for k in entry if k != "hash"}
        rebuilt_str = json.dumps(rebuilt, sort_keys=True)
        rebuilt_hash = hashlib.sha256(rebuilt_str.encode()).hexdigest()
        if stored_hash != rebuilt_hash:
            anomalies.append({
                "event":       entry.get("event"),
                "timestamp":   entry.get("timestamp"),
                "stored_hash": stored_hash,
                "computed":    rebuilt_hash,
                "reason":      "hash_mismatch",
            })
        if prev_hash is not None:
            declared_prev = entry.get("prev_hash")
            if declared_prev != prev_hash:
                anomalies.append({
                    "event":        entry.get("event"),
                    "timestamp":    entry.get("timestamp"),
                    "declared_prev": declared_prev,
                    "actual_prev":  prev_hash,
                    "reason":       "broken_link",
                })
        prev_hash = stored_hash
    head = parsed[-1] if parsed else {}
    return {
        "total_entries":   total,
        "verified_window": len(parsed),
        "anomalies":       anomalies,
        "head_hash":       head.get("hash"),
        "head_prev":       head.get("prev_hash"),
        "last_timestamp":  head.get("timestamp"),
    }


def _short_hash(h: str) -> str:
    return f"0x{h[:4]}…{h[-4:]}" if h and len(h) >= 8 else h


def _build_description(event: str, details: dict) -> str:
    """One-line human summary for the event row."""
    ev = event.lower()
    if ev == "alert_actioned":
        return f"Alert {details.get('action','?')} (was_pending={details.get('was_pending')})"
    if ev == "alert_assigned":
        return f"Assigned to {details.get('assigned_role','?')}"
    if ev == "alert_action_detail":
        note = details.get("note") or ""
        return f"{details.get('action','?')} by {details.get('actor_role','?')}" + (f" · {note}" if note else "")
    if ev == "auto_escalation":
        return f"Auto-escalated {details.get('from_role','?')} → {details.get('to_role','?')}"
    if ev == "manual_reassign":
        return f"Reassigned {details.get('from_role','?')} → {details.get('to_role','?')}"
    if ev == "login_success":
        return f"Signed in · role={details.get('role','?')}"
    if ev == "login_failure":
        return f"Sign-in failed · {details.get('reason','')}"
    if ev == "str_generated":
        return f"STR generated · words={details.get('words','?')}"
    if ev == "str_exported":
        return f"STR exported · {details.get('format','?')} · {details.get('size_kb','?')} KB"
    return ", ".join(f"{k}={v}" for k, v in list(details.items())[:3]) or "—"


def _format_event(entry: dict, index_from_head: int) -> dict:
    """Shape one audit entry for the UI."""
    ev      = entry.get("event") or "unknown"
    fam     = EVENT_FAMILIES.get(ev.lower(), "OTHER")
    user    = entry.get("user") or "system"
    details = entry.get("details") or {}
    ts      = entry.get("timestamp") or 0
    full_hash = entry.get("hash") or ""
    prev      = entry.get("prev_hash") or ""
    case_ref  = (
        details.get("case_id")
        or details.get("alert_id")
        or details.get("account_id")
        or ""
    )
    return {
        "id":              full_hash[:16] or f"evt-{int(ts)}",
        "event":           ev.upper(),
        "family":          fam,
        "timestamp":       ts,
        "actor":           user,
        "actor_role":      details.get("actor_role") or details.get("role") or "",
        "case_ref":        case_ref,
        "description":     _build_description(ev, details),
        "hash":            full_hash,
        "hash_short":      _short_hash(full_hash),
        "prev_hash":       prev,
        "prev_hash_short": _short_hash(prev),
        "block_index":     index_from_head,
        "details":         details,
    }


@router.get("/trail")
@limiter.limit("60/minute")
async def audit_trail(
    request: Request,
    limit:  int = Query(50, ge=1, le=500),
    offset: int = Query(0,  ge=0),
    family: str = Query("", description="LOGIN|STR|CASE|SYSTEM|API|EXPORT|ALL"),
    search: str = Query("", description="Free-text substring match"),
    token:  dict = Depends(require_permission("read:cases")),
):
    """Return paged audit events plus chain-integrity stats."""
    entries, total = _read_entries(
        limit=limit, offset=offset,
        family=(family or None), search=(search or None),
    )
    integrity = _verify_chain(window=256)
    rows = [_format_event(e, index_from_head=offset + i) for i, e in enumerate(entries)]
    fam_counts = Counter(r["family"] for r in rows)
    return {
        "rows":          rows,
        "total":         total,
        "limit":         limit,
        "offset":        offset,
        "family_counts": dict(fam_counts),
        "integrity":     integrity,
        "generated_at":  time.time(),
    }
