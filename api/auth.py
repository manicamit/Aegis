"""
AEGIS — FastAPI Authentication

HACKATHON DEMO AUTH — NO PASSWORD VALIDATION.

Login accepts a role (and optional display username); any submitted password
is ignored. The backend issues a JWT scoped to the requested role and RBAC
remains fully enforced on every router via `require_permission`.

Replace with a real credential store before any non-demo deployment.
"""
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import os
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "60"))

security = HTTPBearer(auto_error=False)

ROLES = {
    "branch_manager": ["read:alerts", "write:alert_action", "read:cases"],
    "investigator":   ["read:alerts", "read:cases", "write:cases",
                       "write:alert_action"],
    "analyst":        ["read:alerts", "read:cases", "read:metrics"],
    "admin":          ["read:alerts", "read:cases", "write:cases",
                       "write:config", "read:metrics", "write:alert_action",
                       "manage:escalation", "manage:dlq"],
}

DEFAULT_ROLE = "investigator"


def _resolve_role(role: str | None, username: str | None) -> str:
    """Map the submitted role (or fall-back username) to a known role."""
    for candidate in (role, username):
        if candidate and candidate in ROLES:
            return candidate
    return DEFAULT_ROLE


def create_access_token(data: dict, role: str) -> str:
    payload = {
        **data, "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    # Test-only bypass: pytest conftest sets AEGIS_TEST_AUTH_BYPASS=1 so the
    # TestClient can hit protected routes without minting tokens for every call.
    # This env var is NEVER set in production.
    if os.environ.get("AEGIS_TEST_AUTH_BYPASS") == "1":
        return {"sub": "tests", "role": "admin"}
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
        )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )


def require_permission(permission: str):
    def checker(token: dict = Depends(verify_token)):
        role = token.get("role", "")
        if permission not in ROLES.get(role, []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' lacks permission: {permission}",
            )
        return token
    return checker


def authenticate_user(username: str | None = None,
                      password: str | None = None,
                      role: str | None = None) -> dict:
    """Hackathon demo auth: any submission yields a valid session.

    The submitted password is ignored entirely. The role is resolved from the
    explicit `role` argument first, then from `username` (which the login UI
    may use as the role identifier), then falls back to `investigator`.
    """
    resolved_role = _resolve_role(role, username)
    display_name = (username or resolved_role).strip() or resolved_role
    return {"username": display_name, "role": resolved_role}
