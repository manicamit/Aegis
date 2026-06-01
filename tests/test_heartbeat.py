"""Tests for monitoring.heartbeat (service checks + DLQ)."""
import importlib
import json
import time

import pytest


@pytest.fixture
def hb(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MODEL_DIR", str(tmp_path / "models"))
    monkeypatch.setenv("AUDIT_LOG_PATH", str(tmp_path / "audit.jsonl"))
    monkeypatch.setenv("DLQ_LOG_PATH", str(tmp_path / "dlq.jsonl"))
    monkeypatch.setenv("HEARTBEAT_INTERVAL_SECONDS", "60")  # disable auto loop
    monkeypatch.setenv("PARQUET_FRESHNESS_HOURS", "1")

    import monitoring.heartbeat as h
    importlib.reload(h)
    yield h


def test_missing_parquet_marks_down(hb):
    snap = hb.check_all_services()
    assert snap["parquet_freshness"]["status"] == "down"
    assert "no parquet artefacts" in snap["parquet_freshness"]["message"]


def test_fresh_parquet_passes(hb, tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "risk_scores.parquet").write_text("dummy")
    snap = hb.check_all_services()
    assert snap["parquet_freshness"]["status"] == "ok"


def test_stale_parquet_marks_degraded(hb, tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(exist_ok=True)
    f = data_dir / "transactions.parquet"
    f.write_text("dummy")
    # Backdate mtime by 2 hours (threshold is 1 hour from fixture)
    past = time.time() - 7200
    import os
    os.utime(f, (past, past))
    snap = hb.check_all_services()
    assert snap["parquet_freshness"]["status"] == "degraded"
    assert "transactions.parquet" in snap["parquet_freshness"]["message"]


def test_dlq_push_retry_discard(hb):
    eid = hb.dlq_push("llm_anthropic", "str_generate", "timeout",
                      payload={"account_id": "A1"})
    assert isinstance(eid, str) and len(eid) == 12
    items = hb.get_dlq_snapshot()
    assert len(items) == 1
    assert items[0]["entry_id"] == eid
    assert items[0]["service"] == "llm_anthropic"

    # retry_fn that always succeeds
    result = hb.dlq_retry(eid, lambda entry: {"ok": True})
    assert result["success"] is True
    assert hb.get_dlq_snapshot() == []

    # Discard path
    eid2 = hb.dlq_push("x", "y", "z")
    assert hb.dlq_discard(eid2) is True
    assert hb.dlq_discard("nonexistent") is False


def test_dlq_persistence_replay(hb, tmp_path):
    hb.dlq_push("svc1", "op1", "err1")
    hb.dlq_push("svc2", "op2", "err2")
    # Verify on-disk events
    lines = (tmp_path / "dlq.jsonl").read_text().strip().splitlines()
    kinds = [json.loads(l)["kind"] for l in lines]
    assert kinds.count("push") == 2

    # Replay drops the in-memory deque first
    hb._dlq.clear()
    loaded = hb._load_dlq_state()
    assert loaded == 2


def test_dlq_retry_failure_increments_counter(hb):
    eid = hb.dlq_push("flaky", "op", "first error")

    def always_fails(_entry):
        raise RuntimeError("still broken")

    result = hb.dlq_retry(eid, always_fails)
    assert result["success"] is False
    items = hb.get_dlq_snapshot()
    assert items[0]["retries"] == 1
    assert "still broken" in items[0]["last_retry_error"]
