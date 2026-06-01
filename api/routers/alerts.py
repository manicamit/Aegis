"""AEGIS — Alerts API Router

Exposes:
  GET  /api/v1/alerts/                — risk-score-ranked list (legacy)
  GET  /api/v1/alerts/queue           — pending alerts assigned to a role
  GET  /api/v1/alerts/{account_id}    — single alert + dossier
  POST /api/v1/alerts/{case_id}/action — Approve/Flag/Freeze, returns audit hash
"""
from fastapi import APIRouter, Depends, Query, Request, HTTPException, Body
from api.auth import verify_token, require_permission
from api.middleware import limiter
from security.audit_logger import (
    audit_log, mark_alert_actioned, get_pending_alerts, register_pending_alert,
)
import pandas as pd
import os
import json
import glob
import time

router = APIRouter(tags=["alerts"])

DATA_DIR = os.environ.get("DATA_DIR", "data/processed")
VALID_ACTIONS = {"approve", "flag", "freeze"}


def _load_risks() -> pd.DataFrame:
    path = os.path.join(DATA_DIR, "risk_scores.parquet")
    empty = pd.DataFrame(columns=["Account", "risk_score", "risk_label"])
    if not os.path.exists(path):
        return empty
    try:
        return pd.read_parquet(path)
    except Exception:
        return empty


def _load_all_cases() -> list[dict]:
    """Read the most recent batch of aggregated cases."""
    all_path = os.path.join(DATA_DIR, "all_cases.json")
    if os.path.exists(all_path):
        with open(all_path) as f:
            return json.load(f)
    case_dir = os.path.join(DATA_DIR, "cases")
    if not os.path.exists(case_dir):
        return []
    cases = []
    for fp in sorted(glob.glob(os.path.join(case_dir, "AEGIS-*.json"))):
        with open(fp) as f:
            cases.append(json.load(f))
    return cases


def _find_case(case_id: str) -> dict | None:
    case_path = os.path.join(DATA_DIR, "cases", f"{case_id}.json")
    if os.path.exists(case_path):
        with open(case_path) as f:
            return json.load(f)
    for case in _load_all_cases():
        if case.get("case_id") == case_id:
            return case
    return None


@router.get("/")
@limiter.limit("60/minute")
async def list_alerts(
    request: Request,
    min_score: float = Query(50, ge=0, le=100),
    limit: int = Query(50, ge=1, le=500),
    token: dict = Depends(require_permission("read:alerts")),
):
    """List alerts sorted by risk score (legacy path, no aggregation)."""
    df = _load_risks()
    df = df[df["risk_score"] >= min_score].head(limit)
    return {
        "total": len(df),
        "alerts": df.to_dict(orient="records"),
    }


@router.get("/queue")
@limiter.limit("60/minute")
async def alert_queue(
    request: Request,
    role: str = Query("branch_manager"),
    limit: int = Query(20, ge=1, le=100),
    token: dict = Depends(require_permission("read:alerts")),
):
    """Return aggregated cases currently pending action for the given role.

    Joins the in-memory pending-alerts registry with the latest case dossiers
    so each item carries plain-English summary, priority, SLA timer, and rules.
    """
    pending = get_pending_alerts(role=role)
    if not pending:
        return {"role": role, "total": 0, "alerts": []}

    cases_by_id = {c["case_id"]: c for c in _load_all_cases()}
    items = []
    for p in pending[:limit]:
        case = cases_by_id.get(p["alert_id"])
        if case is None:
            items.append({
                "case_id": p["alert_id"],
                "assigned_role": p["assigned_role"],
                "sla_remaining_seconds": p["sla_remaining_seconds"],
                "age_seconds": p["age_seconds"],
                "escalated": p["escalated"],
            })
            continue
        items.append({
            "case_id": case["case_id"],
            "account_id": case.get("account_id") or case.get("account_reference"),
            "plain_english": case.get("plain_english"),
            "priority_score": case.get("priority_score"),
            "risk_score": case.get("risk_score"),
            "rules_triggered": case.get("rules_triggered", []),
            "n_alerts_collapsed": case.get("n_alerts_collapsed"),
            "total_amount": case.get("total_amount"),
            "transaction_count": case.get("transaction_count"),
            "assigned_role": p["assigned_role"],
            "sla_remaining_seconds": p["sla_remaining_seconds"],
            "age_seconds": p["age_seconds"],
            "escalated": p["escalated"],
        })
    return {"role": role, "total": len(items), "alerts": items}


@router.get("/{account_id}")
@limiter.limit("60/minute")
async def get_alert_detail(
    request: Request,
    account_id: str,
    token: dict = Depends(require_permission("read:alerts")),
):
    """Get detailed alert info for an account."""
    df = _load_risks()
    row = df[df["Account"].astype(str) == account_id]
    if len(row) == 0:
        return {"error": "Account not found"}

    result = row.iloc[0].to_dict()

    case_path = os.path.join(
        DATA_DIR, "cases", f"AEGIS-{account_id}-{int(result['risk_score'])}.json"
    )
    if os.path.exists(case_path):
        with open(case_path) as f:
            result["case"] = json.load(f)

    return result


@router.post("/{case_id}/action")
@limiter.limit("30/minute")
async def record_action(
    request: Request,
    case_id: str,
    payload: dict = Body(...),
    token: dict = Depends(require_permission("write:alert_action")),
):
    """Record a branch-manager (or investigator) action against a case.

    Body: `{ "action": "approve" | "flag" | "freeze", "note": "<optional>" }`
    Returns: `{ case_id, action, audit_hash, timestamp, was_pending }`.
    """
    action = (payload.get("action") or "").lower().strip()
    if action not in VALID_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"action must be one of {sorted(VALID_ACTIONS)}",
        )
    note = (payload.get("note") or "").strip()
    actor_role = token.get("role", "")
    actor_user = token.get("sub", "unknown")

    case = _find_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    audit_hash = mark_alert_actioned(case_id, action, actor_role)

    audit_log("alert_action_detail", actor_user, {
        "case_id": case_id,
        "action": action,
        "actor_role": actor_role,
        "note": note,
        "account_id": case.get("account_id") or case.get("account_reference"),
    })

    status_map = {"approve": "approved", "flag": "flagged", "freeze": "frozen"}
    case["status"] = status_map[action]
    case["actioned_at"] = time.time()
    case["actioned_by_role"] = actor_role
    case["actioned_note"] = note
    case_path = os.path.join(DATA_DIR, "cases", f"{case_id}.json")
    try:
        os.makedirs(os.path.dirname(case_path), exist_ok=True)
        with open(case_path, "w") as f:
            json.dump(case, f, indent=2, default=str)
    except OSError:
        pass

    return {
        "case_id": case_id,
        "action": action,
        "audit_hash": audit_hash,
        "timestamp": time.time(),
        "actor_role": actor_role,
        "status": case["status"],
    }


@router.post("/{case_id}/register")
@limiter.limit("30/minute")
async def register_alert(
    request: Request,
    case_id: str,
    role: str = Query("branch_manager"),
    token: dict = Depends(require_permission("write:alert_action")),
):
    """Idempotent: enqueue an existing case into the pending-alerts registry.

    Useful when cases were generated outside run_stage6 (e.g. via /cases/generate)
    and the SLA timer should start now.
    """
    info = register_pending_alert(case_id, role,
                                   metadata={"registered_by": token.get("sub", "")})
    return {
        "case_id": case_id,
        "assigned_role": info["assigned_role"],
        "created_at": info["created_at"],
    }
