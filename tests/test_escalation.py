"""Tests for security.audit_logger pending-alert + auto-escalation."""
import importlib
import json
import os
import time

import pytest


@pytest.fixture
def audit(tmp_path, monkeypatch):
    """Fresh audit_logger pointed at tmp_path, with a 2-second escalation timeout."""
    monkeypatch.setenv("AUDIT_LOG_PATH", str(tmp_path / "audit.jsonl"))
    monkeypatch.setenv("PENDING_ALERTS_PATH", str(tmp_path / "pending.jsonl"))
    monkeypatch.setenv("ESCALATION_TIMEOUT_SECONDS", "2")
    monkeypatch.setenv("ESCALATION_TICK_SECONDS", "1")
    monkeypatch.delenv("ESCALATION_WEBHOOK_URL", raising=False)

    import security.audit_logger as al
    importlib.reload(al)
    yield al
    al.stop_escalation_loop()


def test_register_and_action_clears_alert(audit):
    audit.register_pending_alert("ALERT-1", "branch_manager",
                                 metadata={"account_id": "ACC_X"})
    snapshot = audit.get_pending_alerts()
    assert len(snapshot) == 1
    assert snapshot[0]["alert_id"] == "ALERT-1"

    h = audit.mark_alert_actioned("ALERT-1", "freeze", "branch_manager")
    assert isinstance(h, str) and len(h) == 64  # SHA-256 hex
    assert audit.get_pending_alerts() == []


def test_check_escalations_promotes_role(audit):
    audit.register_pending_alert("ALERT-2", "branch_manager")
    # With timeout=2s, sleep 3s ensures the alert is overdue
    time.sleep(3)
    fired = audit.check_escalations()
    assert len(fired) == 1
    assert fired[0]["alert_id"] == "ALERT-2"
    assert fired[0]["from_role"] == "branch_manager"
    assert fired[0]["to_role"] == "investigator"
    # Second call shouldn't re-fire (escalated flag set)
    assert audit.check_escalations() == []


def test_state_replay_from_jsonl(audit, tmp_path):
    audit.register_pending_alert("ALERT-A", "branch_manager")
    audit.register_pending_alert("ALERT-B", "investigator",
                                 metadata={"priority": 0.9})
    audit.mark_alert_actioned("ALERT-A", "approve", "branch_manager")

    # Wipe in-memory state and reload from disk
    audit._pending_alerts.clear()
    loaded = audit.load_pending_state()
    assert loaded == 1
    items = audit.get_pending_alerts()
    assert [i["alert_id"] for i in items] == ["ALERT-B"]
    assert items[0]["metadata"] == {"priority": 0.9}


def test_audit_chain_links_correctly(audit):
    h1 = audit.audit_log("first", "alice", {"x": 1})
    h2 = audit.audit_log("second", "bob", {"x": 2})
    assert h1 != h2

    lines = open(audit.AUDIT_LOG).read().strip().splitlines()
    entries = [json.loads(l) for l in lines]
    # Each entry's prev_hash should match the previous entry's hash
    for i in range(1, len(entries)):
        assert entries[i]["prev_hash"] == entries[i - 1]["hash"]


def test_manual_reassign(audit):
    audit.register_pending_alert("ALERT-R", "branch_manager")
    ok = audit.reassign_alert("ALERT-R", "investigator", "admin_user")
    assert ok is True
    items = audit.get_pending_alerts()
    assert items[0]["assigned_role"] == "investigator"
    # Unknown alert id returns False
    assert audit.reassign_alert("NOPE", "admin", "admin_user") is False
