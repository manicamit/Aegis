"""
AEGIS — Immutable Audit Logger
Append-only hash-chained JSONL audit trail.
"""
import json
import hashlib
import time
import os
from pathlib import Path

AUDIT_LOG = Path(os.environ.get("AUDIT_LOG_PATH", "logs/audit.jsonl"))
AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)

_last_hash = "GENESIS"


def audit_log(event: str, user: str, details: dict):
    """Append tamper-evident audit entry with hash chaining."""
    global _last_hash
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
