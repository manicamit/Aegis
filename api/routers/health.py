"""AEGIS — Health & DLQ API Router."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from api.auth import require_permission
from api.middleware import limiter
from monitoring.heartbeat import (
    get_status_snapshot, list_freshness, get_dlq_snapshot, dlq_discard, dlq_retry,
)

router = APIRouter(tags=["health"])


@router.get("/services")
@limiter.limit("120/minute")
async def services(
    request: Request,
    token: dict = Depends(require_permission("read:metrics")),
):
    """Latest snapshot of every registered service check."""
    snap = get_status_snapshot()
    services_list = list(snap.values())
    degraded = [s for s in services_list if s["status"] != "ok"]
    return {
        "services": services_list,
        "freshness": list_freshness(),
        "summary": {
            "total": len(services_list),
            "degraded": len(degraded),
            "all_ok": len(degraded) == 0,
        },
    }


@router.get("/dlq")
@limiter.limit("60/minute")
async def dlq_list(
    request: Request,
    limit: int = Query(100, ge=1, le=500),
    token: dict = Depends(require_permission("read:metrics")),
):
    """Recent dead-letter-queue entries (most recent first)."""
    items = get_dlq_snapshot(limit=limit)
    return {"total": len(items), "entries": items}


@router.post("/dlq/{entry_id}/discard")
@limiter.limit("30/minute")
async def dlq_discard_entry(
    request: Request,
    entry_id: str,
    token: dict = Depends(require_permission("manage:dlq")),
):
    ok = dlq_discard(entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="entry not found")
    return {"entry_id": entry_id, "discarded": True}


@router.post("/dlq/{entry_id}/retry")
@limiter.limit("30/minute")
async def dlq_retry_entry(
    request: Request,
    entry_id: str,
    token: dict = Depends(require_permission("manage:dlq")),
):
    """Retry a DLQ entry. Currently supports STR-narrative retries."""
    def _retry(entry: dict):
        if entry.get("op") == "str_generate":
            from pipeline.stage6_case_builder import _generate_narrative_template
            return {"narrative": _generate_narrative_template({
                "account_id": entry.get("payload", {}).get("account_id", "?"),
                "risk_score": entry.get("payload", {}).get("risk_score", 0),
                "factors": [],
            })}
        raise RuntimeError(f"no retry handler for op={entry.get('op')}")

    result = dlq_retry(entry_id, _retry)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "retry failed"))
    return result
