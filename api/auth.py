"""
AEGIS — FastAPI Authentication
JWT token management and RBAC enforcement.
"""
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import hashlib
import hmac
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
    "investigator": ["read:alerts", "read:cases", "write:cases"],
    "analyst":      ["read:alerts", "read:cases"],
    "admin":        ["read:alerts", "read:cases", "write:cases",
                     "write:config", "read:metrics"],
}


def _hash_password(password: str) -> str:
    """Simple HMAC-SHA256 password hashing for demo purposes."""
    return hmac.new(SECRET_KEY.encode(), password.encode(), hashlib.sha256).hexdigest()


def _verify_password(password: str, hashed: str) -> bool:
    return hmac.compare_digest(_hash_password(password), hashed)


# Demo users (in production, use a proper password store)
DEMO_USERS = {
    "admin": {"password_hash": _hash_password("admin123"), "role": "admin"},
    "investigator": {"password_hash": _hash_password("invest123"), "role": "investigator"},
    "analyst": {"password_hash": _hash_password("analyst123"), "role": "analyst"},
}


def create_access_token(data: dict, role: str) -> str:
    payload = {
        **data, "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    if credentials is None:
        # Allow unauthenticated access for demo
        return {"sub": "demo", "role": "admin"}
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


def authenticate_user(username: str, password: str) -> dict:
    user = DEMO_USERS.get(username)
    if not user or not _verify_password(password, user["password_hash"]):
        return None
    return {"username": username, "role": user["role"]}
