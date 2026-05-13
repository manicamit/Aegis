"""
AEGIS — FastAPI Entry Point
Intelligent Fund Flow Tracking for AML Fraud Detection.
"""
from fastapi import FastAPI, Depends
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
from api.routers import alerts, graph, cases, metrics

app = FastAPI(
    title="AEGIS AML API",
    description="AI-Enabled Graph Intelligence System — "
                "Intelligent Fund Flow Tracking for Fraud Detection",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
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


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0", "system": "AEGIS"}


@app.post("/api/v1/auth/login")
async def login(username: str, password: str):
    """Authenticate and receive JWT token."""
    user = authenticate_user(username, password)
    if not user:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    token = create_access_token({"sub": user["username"]}, user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
    }


@app.get("/api/v1/whoami")
async def whoami(token: dict = Depends(verify_token)):
    """Return current user info from JWT."""
    return {
        "username": token.get("sub", "unknown"),
        "role": token.get("role", "unknown"),
    }
