"""
AEGIS — Immutable Audit Logger + Pending-Alert Escalation
Append-only hash-chained JSONL audit trail. Tracks pending alerts and
auto-escalates when the assigned role doesn't act within the timeout.
"""
import json
import hashlib
import time
import os
import threading
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("aegis.audit")

AUDIT_LOG = Path(os.environ.get("AUDIT_LOG_PATH", "logs/audit.jsonl"))
PENDING_LOG = Path(os.environ.get("PENDING_ALERTS_PATH", "logs/pending_alerts.jsonl"))
AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
PENDING_LOG.parent.mkdir(parents=True, exist_ok=True)

ESCALATION_TIMEOUT = int(os.environ.get("ESCALATION_TIMEOUT_SECONDS", 7200))
ESCALATION_TICK = int(os.environ.get("ESCALATION_TICK_SECONDS", 60))
ESCALATION_WEBHOOK = os.environ.get("ESCALATION_WEBHOOK_URL", "")

ESCALATION_MAP = {
    "branch_manager": "investigator",
    "investigator": "admin",
}

_last_hash = "GENESIS"
_pending_alerts: dict[str, dict] = {}
_lock = threading.Lock()
_escalation_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()


def _load_last_hash() -> None:
    """Rebuild _last_hash from the tail of the audit log on startup."""
    global _last_hash
    if not AUDIT_LOG.exists():
        return
    try:
        with open(AUDIT_LOG, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            chunk = min(size, 4096)
            f.seek(size - chunk)
            tail = f.read().decode("utf-8", errors="ignore").splitlines()
        for line in reversed(tail):
            line = line.strip()
            if not line:
                continue
            try:
                _last_hash = json.loads(line).get("hash", _last_hash)
                return
            except json.JSONDecodeError:
                continue
    except OSError as e:
        logger.warning("Could not read audit log tail: %s", e)


_load_last_hash()


def audit_log(event: str, user: str, details: dict) -> str:
    """Append tamper-evident audit entry with hash chaining. Returns the new hash."""
    global _last_hash
    with _lock:
        entry = {
            "timestamp": time.time(),
            "event": event,
            "user": user,
            "details": details,
            "prev_hash": _last_hash,
        }
        entry_str = json.dumps(entry, sort_keys=True)
        entry_hash = hashlib.sha256(entry_str.encode()).hexdigest()
        entry["hash"] = entry_hash
        _last_hash = entry_hash
        with open(AUDIT_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")
    return entry_hash


# ═══════════════════════════════════════════════════════
# Pending alert tracking & auto-escalation
# ═══════════════════════════════════════════════════════

def _append_pending_event(payload: dict) -> None:
    with open(PENDING_LOG, "a") as f:
        f.write(json.dumps(payload) + "\n")


def load_pending_state() -> int:
    """Replay PENDING_LOG to rebuild _pending_alerts dict. Returns count loaded."""
    with _lock:
        _pending_alerts.clear()
        if not PENDING_LOG.exists():
            return 0
        with open(PENDING_LOG) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    evt = json.loads(line)
                except json.JSONDecodeError:
                    continue
                alert_id = evt.get("alert_id")
                if not alert_id:
                    continue
                kind = evt.get("kind")
                if kind == "register":
                    _pending_alerts[alert_id] = {
                        "created_at": evt["created_at"],
                        "assigned_role": evt["assigned_role"],
                        "original_role": evt["assigned_role"],
                        "escalated": False,
                        "metadata": evt.get("metadata", {}),
                    }
                elif kind == "escalate" and alert_id in _pending_alerts:
                    _pending_alerts[alert_id]["assigned_role"] = evt["to_role"]
                    _pending_alerts[alert_id]["escalated"] = True
                elif kind == "action" and alert_id in _pending_alerts:
                    del _pending_alerts[alert_id]
        return len(_pending_alerts)


def register_pending_alert(
    alert_id: str,
    assigned_role: str = "branch_manager",
    metadata: Optional[dict] = None,
) -> dict:
    """Track an alert for auto-escalation. Idempotent on alert_id."""
    metadata = metadata or {}
    with _lock:
        if alert_id in _pending_alerts:
            return _pending_alerts[alert_id]
        now = time.time()
        info = {
            "created_at": now,
            "assigned_role": assigned_role,
            "original_role": assigned_role,
            "escalated": False,
            "metadata": metadata,
        }
        _pending_alerts[alert_id] = info
        _append_pending_event({
            "kind": "register",
            "alert_id": alert_id,
            "created_at": now,
            "assigned_role": assigned_role,
            "metadata": metadata,
        })
    audit_log("alert_assigned", "system", {
        "alert_id": alert_id,
        "assigned_role": assigned_role,
        "escalation_deadline_seconds": ESCALATION_TIMEOUT,
    })
    return info


def mark_alert_actioned(alert_id: str, action: str, actioned_by_role: str) -> str:
    """Mark an alert as actioned. Returns the new audit hash."""
    with _lock:
        existed = alert_id in _pending_alerts
        if existed:
            del _pending_alerts[alert_id]
            _append_pending_event({
                "kind": "action",
                "alert_id": alert_id,
                "action": action,
                "by_role": actioned_by_role,
                "at": time.time(),
            })
    return audit_log("alert_actioned", actioned_by_role, {
        "alert_id": alert_id,
        "action": action,
        "was_pending": existed,
    })


def get_pending_alerts(role: Optional[str] = None) -> list[dict]:
    """Snapshot of pending alerts. Filter by currently assigned role."""
    with _lock:
        items = []
        for aid, info in _pending_alerts.items():
            if role and info["assigned_role"] != role:
                continue
            items.append({
                "alert_id": aid,
                "created_at": info["created_at"],
                "assigned_role": info["assigned_role"],
                "original_role": info["original_role"],
                "escalated": info["escalated"],
                "age_seconds": time.time() - info["created_at"],
                "sla_remaining_seconds": max(
                    0, ESCALATION_TIMEOUT - (time.time() - info["created_at"])
                ),
                "metadata": info.get("metadata", {}),
            })
    items.sort(key=lambda x: x["created_at"])
    return items


def reassign_alert(alert_id: str, to_role: str, by_user: str) -> bool:
    """Manual reassign (admin tool)."""
    with _lock:
        if alert_id not in _pending_alerts:
            return False
        from_role = _pending_alerts[alert_id]["assigned_role"]
        _pending_alerts[alert_id]["assigned_role"] = to_role
        _append_pending_event({
            "kind": "escalate",
            "alert_id": alert_id,
            "to_role": to_role,
            "from_role": from_role,
            "manual": True,
            "at": time.time(),
        })
    audit_log("manual_reassign", by_user, {
        "alert_id": alert_id, "from_role": from_role, "to_role": to_role,
    })
    return True


def check_escalations() -> list[dict]:
    """Auto-escalate overdue alerts. Returns list of escalation events fired."""
    now = time.time()
    fired = []
    with _lock:
        overdue = [
            (aid, info) for aid, info in _pending_alerts.items()
            if (now - info["created_at"]) > ESCALATION_TIMEOUT
            and not info["escalated"]
        ]
    for alert_id, info in overdue:
        from_role = info["assigned_role"]  # capture before mutation
        next_role = ESCALATION_MAP.get(from_role, "admin")
        with _lock:
            _pending_alerts[alert_id]["assigned_role"] = next_role
            _pending_alerts[alert_id]["escalated"] = True
            _append_pending_event({
                "kind": "escalate",
                "alert_id": alert_id,
                "to_role": next_role,
                "from_role": from_role,
                "manual": False,
                "at": now,
            })
        audit_log("auto_escalation", "system", {
            "alert_id": alert_id,
            "from_role": from_role,
            "to_role": next_role,
            "overdue_seconds": int(now - info["created_at"]),
        })
        fired.append({
            "alert_id": alert_id,
            "from_role": from_role,
            "to_role": next_role,
        })
        if ESCALATION_WEBHOOK:
            _send_escalation_webhook(alert_id, next_role)
    return fired


def _send_escalation_webhook(alert_id: str, escalated_to: str) -> None:
    """Fire a webhook notification. Best-effort."""
    try:
        import httpx
        httpx.post(ESCALATION_WEBHOOK, json={
            "text": (
                f"AEGIS Auto-Escalation: Alert {alert_id} not actioned within "
                f"{ESCALATION_TIMEOUT // 3600}h — escalated to {escalated_to}."
            )
        }, timeout=5.0)
    except Exception as e:
        logger.warning("Escalation webhook failed for %s: %s", alert_id, e)


def _escalation_loop() -> None:
    """Background thread: tick check_escalations every ESCALATION_TICK seconds."""
    logger.info("Escalation loop started (timeout=%ds, tick=%ds)",
                ESCALATION_TIMEOUT, ESCALATION_TICK)
    while not _stop_event.is_set():
        try:
            check_escalations()
        except Exception as e:
            logger.exception("check_escalations failed: %s", e)
        _stop_event.wait(ESCALATION_TICK)


def start_escalation_loop() -> None:
    """Start the background thread once. Idempotent."""
    global _escalation_thread
    if _escalation_thread is not None and _escalation_thread.is_alive():
        return
    _stop_event.clear()
    _escalation_thread = threading.Thread(
        target=_escalation_loop, daemon=True, name="aegis-escalation"
    )
    _escalation_thread.start()


def stop_escalation_loop() -> None:
    """Stop the background thread (for tests/shutdown)."""
    _stop_event.set()
