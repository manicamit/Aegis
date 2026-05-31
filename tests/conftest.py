"""Pytest configuration for AEGIS test suite."""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Test-only auth bypass — read at request-time by api.auth.verify_token.
# Never set in production environments.
os.environ.setdefault("AEGIS_TEST_AUTH_BYPASS", "1")

# Short SLA so the escalation test doesn't have to wait hours.
os.environ.setdefault("ESCALATION_TIMEOUT_SECONDS", "2")
os.environ.setdefault("ESCALATION_TICK_SECONDS", "1")
