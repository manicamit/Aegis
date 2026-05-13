"""Tests for FastAPI backend"""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from api.main import app
    return TestClient(app)


class TestHealthEndpoint:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "1.0.0"


class TestAuthEndpoint:
    def test_login_success(self, client):
        resp = client.post("/api/v1/auth/login?username=admin&password=admin123")
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["role"] == "admin"

    def test_login_failure(self, client):
        resp = client.post("/api/v1/auth/login?username=admin&password=wrong")
        assert resp.status_code == 401

    def test_whoami(self, client):
        # Demo mode allows unauthenticated access
        resp = client.get("/api/v1/whoami")
        assert resp.status_code == 200
        data = resp.json()
        assert "role" in data


class TestAlertsEndpoint:
    def test_list_alerts(self, client):
        resp = client.get("/api/v1/alerts/")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "alerts" in data


class TestMetricsEndpoint:
    def test_get_metrics(self, client):
        resp = client.get("/api/v1/metrics/")
        assert resp.status_code == 200

    def test_get_benchmark(self, client):
        resp = client.get("/api/v1/metrics/benchmark")
        assert resp.status_code == 200
        data = resp.json()
        assert "headers" in data
        assert "rows" in data


class TestCasesEndpoint:
    def test_list_cases(self, client):
        resp = client.get("/api/v1/cases/")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data


class TestSecurityModules:
    def test_pii_masker(self):
        from security.pii_masker import mask_pii
        result = mask_pii({"name": "ABCDE1234F", "phone": "9876543210"})
        assert "MASKED_PAN" in str(result)
        assert "MASKED_PHONE" in str(result)

    def test_audit_logger(self, tmp_path):
        import os
        os.environ["AUDIT_LOG_PATH"] = str(tmp_path / "test_audit.jsonl")
        # Re-import to pick up new path
        import importlib
        import security.audit_logger as al
        importlib.reload(al)

        al.audit_log("test_event", "test_user", {"key": "value"})
        log_path = tmp_path / "test_audit.jsonl"
        assert log_path.exists()
        content = log_path.read_text()
        assert "test_event" in content
        assert "test_user" in content

    def test_rbac(self):
        from security.rbac import has_permission, get_permissions
        assert has_permission("admin", "read:alerts") == True
        assert has_permission("analyst", "write:cases") == False
        assert "write:cases" in get_permissions("investigator")
