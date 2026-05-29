"""Tests for the new /alerts/{case_id}/action and /alerts/queue endpoints."""
import importlib
import json
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("AUDIT_LOG_PATH", str(tmp_path / "audit.jsonl"))
    monkeypatch.setenv("PENDING_ALERTS_PATH", str(tmp_path / "pending.jsonl"))
    monkeypatch.setenv("DLQ_LOG_PATH", str(tmp_path / "dlq.jsonl"))
    monkeypatch.setenv("AEGIS_DEMO_MODE", "1")
    monkeypatch.setenv("HEARTBEAT_INTERVAL_SECONDS", "60")

    # Seed an aggregated case on disk
    data_dir = tmp_path / "data"
    cases_dir = data_dir / "cases"
    cases_dir.mkdir(parents=True)
    case = {
        "case_id": "AEGIS-ACC42-72",
        "account_id": "ACC42",
        "account_reference": "ACC42",
        "risk_score": 72,
        "priority_score": 0.72,
        "n_alerts_collapsed": 3,
        "rules_triggered": ["rule_structuring", "rule_fan_in_fan_out"],
        "plain_english": "ACC42 moved ₹4.8L in 2 hours — with coordinated burst timing.",
        "str_narrative": "stub",
        "transaction_count": 12,
        "total_amount": 480000,
        "status": "pending",
        "assigned_to": "branch_manager",
    }
    (cases_dir / f"{case['case_id']}.json").write_text(json.dumps(case))
    (data_dir / "all_cases.json").write_text(json.dumps([case]))

    # Force-reload modules so they pick up the tmp paths
    import security.audit_logger as al
    importlib.reload(al)
    import monitoring.heartbeat as hb
    importlib.reload(hb)
    from api.routers import alerts as alerts_router
    importlib.reload(alerts_router)
    import api.main as main_mod
    importlib.reload(main_mod)

    # Register the case in the pending registry
    al.register_pending_alert(case["case_id"], "branch_manager",
                              metadata={"account_id": "ACC42"})
    return TestClient(main_mod.app), case, al


def test_action_returns_real_audit_hash(client):
    tc, case, al = client
    resp = tc.post(
        f"/api/v1/alerts/{case['case_id']}/action",
        json={"action": "freeze", "note": "smells like a mule"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["case_id"] == case["case_id"]
    assert body["action"] == "freeze"
    assert isinstance(body["audit_hash"], str) and len(body["audit_hash"]) == 64
    # Hash should appear in the audit JSONL
    lines = open(al.AUDIT_LOG).read().strip().splitlines()
    assert any(json.loads(l).get("hash") == body["audit_hash"] for l in lines)


def test_action_rejects_invalid_kind(client):
    tc, case, _al = client
    resp = tc.post(
        f"/api/v1/alerts/{case['case_id']}/action",
        json={"action": "explode"},
    )
    assert resp.status_code == 400


def test_action_404_for_unknown_case(client):
    tc, _case, _al = client
    resp = tc.post(
        "/api/v1/alerts/AEGIS-DOES-NOT-EXIST/action",
        json={"action": "approve"},
    )
    assert resp.status_code == 404


def test_queue_returns_aggregated_cases_for_role(client):
    tc, case, _al = client
    resp = tc.get("/api/v1/alerts/queue?role=branch_manager")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    first = body["alerts"][0]
    assert first["case_id"] == case["case_id"]
    assert first["plain_english"] == case["plain_english"]
    assert first["n_alerts_collapsed"] == 3
    assert first["rules_triggered"] == ["rule_structuring", "rule_fan_in_fan_out"]
    assert first["sla_remaining_seconds"] > 0


def test_action_removes_from_queue(client):
    tc, case, _al = client
    tc.post(f"/api/v1/alerts/{case['case_id']}/action", json={"action": "approve"})
    body = tc.get("/api/v1/alerts/queue?role=branch_manager").json()
    assert body["total"] == 0
