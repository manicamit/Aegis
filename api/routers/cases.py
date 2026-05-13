"""AEGIS — Cases API Router
Endpoints for generating and retrieving investigation case dossiers.
"""
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from api.auth import verify_token, require_permission
from api.middleware import limiter
from security.audit_logger import audit_log
import pandas as pd
import os
import json
import glob

router = APIRouter(tags=["cases"])

DATA_DIR = os.environ.get("DATA_DIR", "data/processed")
MODEL_DIR = os.environ.get("MODEL_DIR", "models/saved")


@router.get("/")
@limiter.limit("30/minute")
async def list_cases(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    token: dict = Depends(require_permission("read:cases")),
):
    """List all generated case dossiers."""
    cases_path = os.path.join(DATA_DIR, "all_cases.json")
    if os.path.exists(cases_path):
        with open(cases_path) as f:
            cases = json.load(f)
    else:
        # Try loading individual case files
        case_dir = os.path.join(DATA_DIR, "cases")
        cases = []
        if os.path.exists(case_dir):
            for fp in sorted(glob.glob(os.path.join(case_dir, "AEGIS-*.json")))[:limit]:
                with open(fp) as f:
                    cases.append(json.load(f))

    return {
        "total": len(cases),
        "cases": cases[:limit],
    }


@router.get("/{case_id}")
@limiter.limit("30/minute")
async def get_case(
    request: Request,
    case_id: str,
    token: dict = Depends(require_permission("read:cases")),
):
    """Retrieve a specific case dossier by case ID."""
    case_path = os.path.join(DATA_DIR, "cases", f"{case_id}.json")
    if os.path.exists(case_path):
        with open(case_path) as f:
            case = json.load(f)
        audit_log("case_viewed", token.get("sub", "demo"),
                  {"case_id": case_id})
        return case

    # Try searching in all_cases.json
    all_path = os.path.join(DATA_DIR, "all_cases.json")
    if os.path.exists(all_path):
        with open(all_path) as f:
            cases = json.load(f)
        for case in cases:
            if case.get("case_id") == case_id:
                return case

    raise HTTPException(status_code=404, detail=f"Case {case_id} not found")


@router.post("/generate")
@limiter.limit("5/minute")
async def generate_case(
    request: Request,
    account_id: str = Query(..., description="Account ID to generate case for"),
    token: dict = Depends(require_permission("write:cases")),
):
    """Generate a case dossier for a specific account on demand."""
    from pipeline.stage6_case_builder import (
        compute_shap_explanation, format_risk_explanation,
        generate_str_narrative, build_case_dossier,
    )
    from models.lgbm_model import load_lgbm_model
    import numpy as np

    # Load model and data
    try:
        model, metrics, feature_names = load_lgbm_model(MODEL_DIR)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Model not trained yet")

    risk_path = os.path.join(DATA_DIR, "risk_scores.parquet")
    feat_path = os.path.join(DATA_DIR, "feature_matrix.parquet")
    tx_path = os.path.join(DATA_DIR, "transactions.parquet")

    for p, name in [(risk_path, "risk scores"), (feat_path, "features"), (tx_path, "transactions")]:
        if not os.path.exists(p):
            raise HTTPException(status_code=503, detail=f"Missing {name} data")

    risk_df = pd.read_parquet(risk_path)
    feature_df = pd.read_parquet(feat_path)
    tx_df = pd.read_parquet(tx_path)

    # Find account
    risk_row = risk_df[risk_df["Account"].astype(str) == account_id]
    if len(risk_row) == 0:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    risk_score = float(risk_row.iloc[0]["risk_score"])

    # SHAP explanation
    acct_features = feature_df[feature_df["Account"].astype(str) == account_id]
    exclude = {"Account", "is_fraud"}
    feat_cols = [c for c in feature_df.columns if c not in exclude]
    X_instance = acct_features[feat_cols].values.astype(np.float32)

    try:
        top_feats, base_val = compute_shap_explanation(model, X_instance, feat_cols)
        explanation = format_risk_explanation(top_feats, account_id, risk_score)
    except Exception:
        explanation = {"account_id": account_id, "risk_score": risk_score, "factors": []}

    # Transaction summary
    acct_tx = tx_df[tx_df["Account"].astype(str) == account_id]
    tx_summary = {
        "total_amount": f"₹{acct_tx['Amount Paid'].sum():,.0f}" if len(acct_tx) > 0 else "Unknown",
        "tx_count": len(acct_tx),
        "time_window": f"{acct_tx['Timestamp'].min()} to {acct_tx['Timestamp'].max()}" if len(acct_tx) > 0 else "unknown",
        "account_count": acct_tx["Account.1"].nunique() if len(acct_tx) > 0 else 0,
    }

    graph_evidence = {
        "layering_depth": int(acct_features.get("layering_depth", pd.Series([0])).values[0]) if "layering_depth" in acct_features.columns else 0,
        "circular": bool(acct_features.get("circular_score", pd.Series([0])).values[0] > 0) if "circular_score" in acct_features.columns else False,
        "flagged_neighbours": 0,
        "dormancy_days": int(acct_features.get("last_tx_days_max", pd.Series([0])).values[0]) if "last_tx_days_max" in acct_features.columns else 0,
    }

    narrative = generate_str_narrative(
        account_id, risk_score, explanation["factors"],
        tx_summary, graph_evidence,
    )

    case = build_case_dossier(
        account_id, risk_score, narrative, explanation["factors"],
        acct_tx, rules_triggered=[],
    )

    # Save case
    os.makedirs(os.path.join(DATA_DIR, "cases"), exist_ok=True)
    case_path = os.path.join(DATA_DIR, "cases", f"{case['case_id']}.json")
    with open(case_path, "w") as f:
        json.dump(case, f, indent=2, default=str)

    audit_log("case_generated", token.get("sub", "demo"),
              {"case_id": case["case_id"], "account": account_id, "risk_score": risk_score})

    return case
