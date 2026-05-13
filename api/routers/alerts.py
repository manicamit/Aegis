"""AEGIS — Alerts API Router"""
from fastapi import APIRouter, Depends, Query, Request
from api.auth import verify_token, require_permission
from api.middleware import limiter
import pandas as pd
import os
import json

router = APIRouter(tags=["alerts"])

DATA_DIR = os.environ.get("DATA_DIR", "data/processed")


def _load_risks():
    path = os.path.join(DATA_DIR, "risk_scores.parquet")
    if os.path.exists(path):
        return pd.read_parquet(path)
    return pd.DataFrame(columns=["Account", "risk_score", "risk_label"])


@router.get("/")
@limiter.limit("60/minute")
async def list_alerts(
    request: Request,
    min_score: float = Query(50, ge=0, le=100),
    limit: int = Query(50, ge=1, le=500),
    token: dict = Depends(require_permission("read:alerts")),
):
    """List alerts sorted by risk score."""
    df = _load_risks()
    df = df[df["risk_score"] >= min_score].head(limit)
    return {
        "total": len(df),
        "alerts": df.to_dict(orient="records"),
    }


@router.get("/{account_id}")
@limiter.limit("60/minute")
async def get_alert_detail(
    request: Request,
    account_id: str,
    token: dict = Depends(require_permission("read:alerts")),
):
    """Get detailed alert info for an account."""
    df = _load_risks()
    row = df[df["Account"].astype(str) == account_id]
    if len(row) == 0:
        return {"error": "Account not found"}
    
    result = row.iloc[0].to_dict()
    
    # Load SHAP if available
    case_path = os.path.join(DATA_DIR, "cases", f"AEGIS-{account_id}-{int(result['risk_score'])}.json")
    if os.path.exists(case_path):
        with open(case_path) as f:
            result["case"] = json.load(f)
    
    return result
