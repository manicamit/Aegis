"""
AEGIS — Heartbeat / Service-Health Monitor + Dead-Letter Queue

Background thread that ticks every HEARTBEAT_INTERVAL seconds, executes a
set of `SERVICE_CHECKS`, and emits a webhook after `FAILURE_THRESHOLD`
consecutive failures of any single service. The DLQ persists failed
operations (e.g. LLM timeouts) so an operator can retry or discard them.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("aegis.heartbeat")

HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", 30))
FAILURE_THRESHOLD = int(os.environ.get("HEARTBEAT_FAILURE_THRESHOLD", 2))
HEARTBEAT_WEBHOOK = os.environ.get("HEARTBEAT_WEBHOOK_URL", "")

DLQ_PATH = Path(os.environ.get("DLQ_LOG_PATH", "logs/dlq.jsonl"))
DLQ_MAX = int(os.environ.get("DLQ_MAX_ENTRIES", 500))
DLQ_PATH.parent.mkdir(parents=True, exist_ok=True)

DATA_DIR = Path(os.environ.get("DATA_DIR", "data/processed"))
MODEL_DIR = Path(os.environ.get("MODEL_DIR", "models/saved"))
AUDIT_LOG = Path(os.environ.get("AUDIT_LOG_PATH", "logs/audit.jsonl"))

# Parquet files we treat as the freshness signal.
FRESHNESS_FILES = [
    "transactions.parquet",
    "feature_matrix.parquet",
    "risk_scores.parquet",
    "rule_flags.parquet",
    "gat_embeddings.parquet",
    "graph_features.parquet",
    "identity_features.parquet",
    "transaction_graph.gpickle",
]
FRESHNESS_HOURS = float(os.environ.get("PARQUET_FRESHNESS_HOURS", 6))


@dataclass
class CheckResult:
    status: str  # "ok" | "degraded" | "down"
    latency_ms: float = 0.0
    message: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


def _timed(fn: Callable[[], CheckResult]) -> CheckResult:
    t0 = time.perf_counter()
    try:
        result = fn()
    except Exception as e:
        return CheckResult(status="down", latency_ms=(time.perf_counter() - t0) * 1000,
                           message=f"check raised: {e}")
    result.latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    return result


# ═══════════════════════════════════════════════════════
# Service checks
# ═══════════════════════════════════════════════════════

def _check_lgbm_model() -> CheckResult:
    path = MODEL_DIR / "lgbm_model.joblib"
    if not path.exists():
        return CheckResult(status="down", message=f"missing {path}")
    return CheckResult(status="ok", metadata={"size_bytes": path.stat().st_size})


def _check_gat_model() -> CheckResult:
    path = MODEL_DIR / "gat_model.pt"
    if not path.exists():
        return CheckResult(status="down", message=f"missing {path}")
    return CheckResult(status="ok", metadata={"size_bytes": path.stat().st_size})


def _check_audit_writable() -> CheckResult:
    try:
        AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
        probe = AUDIT_LOG.parent / ".heartbeat_probe"
        probe.write_text(str(time.time()))
        probe.unlink()
    except OSError as e:
        return CheckResult(status="down", message=f"audit dir unwritable: {e}")
    return CheckResult(status="ok")


def _check_parquet_freshness() -> CheckResult:
    """Pass if at least one freshness file exists AND none is older than threshold."""
    now = time.time()
    stale: list[str] = []
    present = 0
    threshold_sec = FRESHNESS_HOURS * 3600
    for name in FRESHNESS_FILES:
        p = DATA_DIR / name
        if not p.exists():
            continue
        present += 1
        age = now - p.stat().st_mtime
        if age > threshold_sec:
            stale.append(f"{name} ({age/3600:.1f}h)")
    if present == 0:
        return CheckResult(status="down", message="no parquet artefacts present")
    if stale:
        return CheckResult(
            status="degraded",
            message=f"stale: {', '.join(stale)}",
            metadata={"stale": stale, "present": present},
        )
    return CheckResult(status="ok", metadata={"present": present})


def _check_llm_provider() -> CheckResult:
    provider = os.environ.get("LLM_PROVIDER", "template").lower()
    if provider == "template":
        return CheckResult(status="ok", message="template fallback (no LLM required)")
    if provider == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return CheckResult(status="degraded", message="ANTHROPIC_API_KEY unset")
    if provider == "openai":
        if not os.environ.get("OPENAI_API_KEY"):
            return CheckResult(status="degraded", message="OPENAI_API_KEY unset")
    return CheckResult(status="ok", message=f"provider={provider}")


SERVICE_CHECKS: Dict[str, Callable[[], CheckResult]] = {
    "lgbm_model": _check_lgbm_model,
    "gat_model": _check_gat_model,
    "audit_log": _check_audit_writable,
    "parquet_freshness": _check_parquet_freshness,
    "llm_provider": _check_llm_provider,
}


# Public mutable so tests can swap implementations.
def register_check(name: str, fn: Callable[[], CheckResult]) -> None:
    SERVICE_CHECKS[name] = fn


# ═══════════════════════════════════════════════════════
# Snapshot + background loop
# ═══════════════════════════════════════════════════════

_lock = threading.Lock()
_status_snapshot: Dict[str, dict] = {}
_failure_counts: Dict[str, int] = {}
_thread: Optional[threading.Thread] = None
_stop = threading.Event()


def check_all_services() -> Dict[str, dict]:
    """Run every registered check once and update the in-memory snapshot."""
    now = time.time()
    snap: Dict[str, dict] = {}
    for name, fn in SERVICE_CHECKS.items():
        result = _timed(fn)
        snap[name] = {
            "name": name,
            "status": result.status,
            "latency_ms": result.latency_ms,
            "message": result.message,
            "metadata": result.metadata,
            "checked_at": now,
        }
        if result.status == "down":
            _failure_counts[name] = _failure_counts.get(name, 0) + 1
        else:
            _failure_counts[name] = 0
        if _failure_counts.get(name, 0) == FAILURE_THRESHOLD and HEARTBEAT_WEBHOOK:
            _send_webhook(name, result)
    with _lock:
        _status_snapshot.clear()
        _status_snapshot.update(snap)
    return snap


def get_status_snapshot() -> Dict[str, dict]:
    with _lock:
        if not _status_snapshot:
            return check_all_services()
        return dict(_status_snapshot)


def list_freshness() -> List[dict]:
    """File-level freshness rows for the heartbeat UI."""
    now = time.time()
    rows = []
    threshold_sec = FRESHNESS_HOURS * 3600
    for name in FRESHNESS_FILES:
        p = DATA_DIR / name
        if not p.exists():
            rows.append({
                "name": name, "exists": False, "size_bytes": 0,
                "age_seconds": None, "stale": True, "status": "missing",
            })
            continue
        st = p.stat()
        age = now - st.st_mtime
        stale = age > threshold_sec
        rows.append({
            "name": name,
            "exists": True,
            "size_bytes": st.st_size,
            "age_seconds": int(age),
            "stale": stale,
            "status": "stale" if stale else "fresh",
        })
    return rows


def _send_webhook(service: str, result: CheckResult) -> None:
    try:
        import httpx
        httpx.post(HEARTBEAT_WEBHOOK, json={
            "text": (
                f"AEGIS heartbeat: service '{service}' is "
                f"{result.status.upper()} after {FAILURE_THRESHOLD} checks — "
                f"{result.message}"
            )
        }, timeout=5.0)
    except Exception as e:
        logger.warning("Heartbeat webhook failed: %s", e)


def _loop() -> None:
    logger.info("Heartbeat loop started (interval=%ds, threshold=%d)",
                HEARTBEAT_INTERVAL, FAILURE_THRESHOLD)
    while not _stop.is_set():
        try:
            check_all_services()
        except Exception as e:
            logger.exception("Heartbeat tick failed: %s", e)
        _stop.wait(HEARTBEAT_INTERVAL)


def start_heartbeat_loop() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, daemon=True, name="aegis-heartbeat")
    _thread.start()


def stop_heartbeat_loop() -> None:
    _stop.set()


# ═══════════════════════════════════════════════════════
# Dead-letter queue
# ═══════════════════════════════════════════════════════

_dlq: deque = deque(maxlen=DLQ_MAX)
_dlq_lock = threading.Lock()


def _persist_dlq_event(event: dict) -> None:
    try:
        with open(DLQ_PATH, "a") as f:
            f.write(json.dumps(event, default=str) + "\n")
    except OSError as e:
        logger.warning("DLQ persistence failed: %s", e)


def _load_dlq_state() -> int:
    """Replay DLQ_PATH to rebuild the in-memory deque."""
    with _dlq_lock:
        _dlq.clear()
    if not DLQ_PATH.exists():
        return 0
    by_id: Dict[str, dict] = {}
    with open(DLQ_PATH) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                evt = json.loads(line)
            except json.JSONDecodeError:
                continue
            eid = evt.get("entry_id")
            if not eid:
                continue
            kind = evt.get("kind")
            if kind == "push":
                by_id[eid] = {k: v for k, v in evt.items() if k != "kind"}
            elif kind in {"retry_success", "discard"}:
                by_id.pop(eid, None)
            elif kind == "retry_fail" and eid in by_id:
                by_id[eid]["retries"] = by_id[eid].get("retries", 0) + 1
                by_id[eid]["last_retry_error"] = evt.get("error", "")
    with _dlq_lock:
        for entry in sorted(by_id.values(), key=lambda e: e.get("when", 0)):
            _dlq.append(entry)
    return len(_dlq)


def dlq_push(service: str, op: str, error: str, payload: Optional[dict] = None) -> str:
    """Record a failed operation. Returns the new entry_id."""
    entry_id = uuid.uuid4().hex[:12]
    entry = {
        "entry_id": entry_id,
        "service": service,
        "op": op,
        "error": str(error)[:1000],
        "payload": payload or {},
        "retries": 0,
        "when": time.time(),
    }
    with _dlq_lock:
        _dlq.append(entry)
    _persist_dlq_event({"kind": "push", **entry})
    logger.warning("DLQ push: service=%s op=%s error=%s", service, op, error)
    return entry_id


def get_dlq_snapshot(limit: int = 100) -> List[dict]:
    with _dlq_lock:
        items = list(_dlq)
    items.sort(key=lambda e: e.get("when", 0), reverse=True)
    return items[:limit]


def _find_entry(entry_id: str) -> Optional[dict]:
    with _dlq_lock:
        for entry in _dlq:
            if entry["entry_id"] == entry_id:
                return entry
    return None


def dlq_discard(entry_id: str) -> bool:
    with _dlq_lock:
        for entry in list(_dlq):
            if entry["entry_id"] == entry_id:
                _dlq.remove(entry)
                _persist_dlq_event({"kind": "discard", "entry_id": entry_id,
                                    "when": time.time()})
                return True
    return False


def dlq_retry(entry_id: str, retry_fn: Optional[Callable[[dict], Any]] = None) -> dict:
    """Retry an entry. If no retry_fn supplied, the caller just gets the payload.

    Returns: {"success": bool, "result": ..., "entry_id": ...}.
    Removes the entry on success; bumps retry counter on failure.
    """
    entry = _find_entry(entry_id)
    if entry is None:
        return {"success": False, "error": "entry_not_found"}
    if retry_fn is None:
        return {"success": False, "entry": entry,
                "error": "no_retry_fn_supplied"}
    try:
        result = retry_fn(entry)
        with _dlq_lock:
            if entry in _dlq:
                _dlq.remove(entry)
        _persist_dlq_event({"kind": "retry_success", "entry_id": entry_id,
                            "when": time.time()})
        return {"success": True, "result": result, "entry_id": entry_id}
    except Exception as e:
        with _dlq_lock:
            entry["retries"] = entry.get("retries", 0) + 1
            entry["last_retry_error"] = str(e)[:500]
        _persist_dlq_event({"kind": "retry_fail", "entry_id": entry_id,
                            "error": str(e)[:500], "when": time.time()})
        return {"success": False, "error": str(e), "entry_id": entry_id}


_load_dlq_state()
