"""
AEGIS — FastAPI Entry Point
Intelligent Fund Flow Tracking for AML Fraud Detection.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from api.middleware import limiter
from api.auth import verify_token, authenticate_user, create_access_token
from api.routers import (
    alerts, graph, cases, metrics, escalations,
    health as health_router, audit, identity, admin, pipeline,
)
from security.audit_logger import (
    load_pending_state, start_escalation_loop, stop_escalation_loop,
)
from monitoring.heartbeat import (
    start_heartbeat_loop, stop_heartbeat_loop, check_all_services,
)

logger = logging.getLogger("aegis.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    pending = load_pending_state()
    logger.info("Loaded %d pending alerts from JSONL", pending)
    start_escalation_loop()
    # Prime the heartbeat snapshot synchronously so the first request to
    # /api/v1/health/services returns real data, then continue ticking.
    try:
        check_all_services()
    except Exception:
        logger.exception("Initial heartbeat tick failed")
    start_heartbeat_loop()
    yield
    stop_heartbeat_loop()
    stop_escalation_loop()


app = FastAPI(
    title="AEGIS AML API",
    description="AI-Enabled Graph Intelligence System — "
                "Intelligent Fund Flow Tracking for Fraud Detection",
    version="1.1.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8050", "http://localhost:3000", "*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# Register routers
app.include_router(alerts.router, prefix="/api/v1/alerts")
app.include_router(graph.router, prefix="/api/v1/graph")
app.include_router(cases.router, prefix="/api/v1/cases")
app.include_router(metrics.router, prefix="/api/v1/metrics")
app.include_router(escalations.router, prefix="/api/v1/escalations")
app.include_router(health_router.router, prefix="/api/v1/health")
app.include_router(audit.router, prefix="/api/v1/audit")
app.include_router(identity.router, prefix="/api/v1/identity")
app.include_router(admin.router, prefix="/api/v1/admin")
app.include_router(pipeline.router, prefix="/api/v1/pipeline")


@app.get("/health")
async def health():
    """Cheap liveness probe (does NOT touch SERVICE_CHECKS)."""
    return {"status": "ok", "version": "1.1.0", "system": "AEGIS"}


@app.post("/api/v1/auth/login")
async def login(
    username: str | None = None,
    password: str | None = None,
    role: str | None = None,
    payload: dict | None = Body(default=None),
):
    """Hackathon-mode auth: pick a role, password is ignored.

    Accepts the role via JSON body `{role}` (preferred), query-string `role=`,
    or — for backward compatibility with the old form-style call — `username=`
    where the username doubles as the role identifier.
    """
    if payload:
        role = role or payload.get("role")
        username = username or payload.get("username")
        password = password or payload.get("password")
    user = authenticate_user(username=username, password=password, role=role)
    token = create_access_token({"sub": user["username"]}, user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"],
    }


@app.get("/api/v1/whoami")
async def whoami(token: dict = Depends(verify_token)):
    """Return current user info from JWT."""
    return {
        "username": token.get("sub", "unknown"),
        "role": token.get("role", "unknown"),
    }
