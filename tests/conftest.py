"""Pytest configuration for AEGIS test suite."""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Allow unauthenticated requests in tests (mirrors the old verify_token behaviour).
os.environ.setdefault("AEGIS_DEMO_MODE", "1")

# Short SLA so the escalation test doesn't have to wait hours.
os.environ.setdefault("ESCALATION_TIMEOUT_SECONDS", "2")
os.environ.setdefault("ESCALATION_TICK_SECONDS", "1")
