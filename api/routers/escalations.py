"""AEGIS — Escalations API Router

Surface the pending-alert / auto-escalation registry to the admin UI.
"""
from fastapi import APIRouter, Depends, Query, Request, HTTPException, Body
from api.auth import require_permission
from api.middleware import limiter
from security.audit_logger import (
    get_pending_alerts, reassign_alert, check_escalations,
    ESCALATION_TIMEOUT, ESCALATION_MAP,
)

router = APIRouter(tags=["escalations"])


@router.get("/")
@limiter.limit("60/minute")
async def list_escalations(
    request: Request,
    role: str = Query("", description="Filter by currently assigned role"),
    escalated_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    token: dict = Depends(require_permission("read:cases")),
):
    """List every pending alert plus its escalation state and SLA timer."""
    items = get_pending_alerts(role=role or None)
    if escalated_only:
        items = [i for i in items if i["escalated"]]
    return {
        "total": len(items),
        "timeout_seconds": ESCALATION_TIMEOUT,
        "escalation_map": ESCALATION_MAP,
        "alerts": items[:limit],
    }


@router.post("/{alert_id}/reassign")
@limiter.limit("30/minute")
async def reassign(
    request: Request,
    alert_id: str,
    payload: dict = Body(...),
    token: dict = Depends(require_permission("manage:escalation")),
):
    """Manual reassign by admin."""
    to_role = (payload.get("to_role") or "").strip()
    if not to_role:
        raise HTTPException(status_code=400, detail="to_role required")
    ok = reassign_alert(alert_id, to_role, token.get("sub", "admin"))
    if not ok:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not pending")
    return {"alert_id": alert_id, "assigned_role": to_role}


@router.post("/check")
@limiter.limit("10/minute")
async def force_check(
    request: Request,
    token: dict = Depends(require_permission("manage:escalation")),
):
    """Force-run an escalation sweep (for demos / testing the auto-promote)."""
    fired = check_escalations()
    return {"fired": fired, "count": len(fired)}
