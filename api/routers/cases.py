"""AEGIS — Cases API Router
Endpoints for generating and retrieving investigation case dossiers.
"""
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from api.auth import verify_token, require_permission
from api.middleware import limiter
from security.audit_logger import audit_log, register_pending_alert
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
    min_priority: float = Query(0.0, ge=0.0, le=1.0),
    status: str = Query("", description="Optional status filter (pending/escalated/closed)"),
    token: dict = Depends(require_permission("read:cases")),
):
    """List generated case dossiers sorted by priority_score desc."""
    cases_path = os.path.join(DATA_DIR, "all_cases.json")
    if os.path.exists(cases_path):
        with open(cases_path) as f:
            cases = json.load(f)
    else:
        case_dir = os.path.join(DATA_DIR, "cases")
        cases = []
        if os.path.exists(case_dir):
            for fp in sorted(glob.glob(os.path.join(case_dir, "AEGIS-*.json"))):
                with open(fp) as f:
                    cases.append(json.load(f))

    if min_priority > 0:
        cases = [c for c in cases if (c.get("priority_score") or 0) >= min_priority]
    if status:
        cases = [c for c in cases if c.get("status") == status]

    cases.sort(
        key=lambda c: (c.get("priority_score") or 0, c.get("risk_score") or 0),
        reverse=True,
    )

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
    """Generate a case dossier for a specific account on demand.

    Uses the alert aggregator to pull rules_triggered + priority_score so the
    on-demand result matches what `run_stage6` produces in batch mode.
    """
    from pipeline.stage6_case_builder import (
        compute_shap_explanation, format_risk_explanation,
        generate_str_narrative, build_case_dossier, _summarize_time_window,
    )
    from pipeline.stage5_fusion import aggregate_alerts_to_cases
    from models.lgbm_model import load_lgbm_model
    import numpy as np

    try:
        model, _metrics, _feature_names = load_lgbm_model(MODEL_DIR)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Model not trained yet")

    risk_path = os.path.join(DATA_DIR, "risk_scores.parquet")
    feat_path = os.path.join(DATA_DIR, "feature_matrix.parquet")
    tx_path = os.path.join(DATA_DIR, "transactions.parquet")
    rule_path = os.path.join(DATA_DIR, "rule_flags.parquet")

    for p, name in [(risk_path, "risk scores"), (feat_path, "features"), (tx_path, "transactions")]:
        if not os.path.exists(p):
            raise HTTPException(status_code=503, detail=f"Missing {name} data")

    risk_df = pd.read_parquet(risk_path)
    feature_df = pd.read_parquet(feat_path)
    tx_df = pd.read_parquet(tx_path)
    rule_df = pd.read_parquet(rule_path) if os.path.exists(rule_path) else pd.DataFrame(
        {"Account": risk_df["Account"].astype(str), "rule_unknown": 1, "rules_triggered": 1}
    )

    risk_row = risk_df[risk_df["Account"].astype(str) == account_id]
    if len(risk_row) == 0:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")

    # Aggregate this single account
    rule_row = rule_df[rule_df["Account"].astype(str) == account_id]
    aggregations = aggregate_alerts_to_cases(rule_row, risk_row, transaction_df=tx_df)
    if not aggregations:
        # Fall back to a single-rule aggregation if no rules triggered
        gnn = float(risk_row.iloc[0]["risk_score"])
        aggregations = [{
            "case_id": f"AEGIS-{account_id}-{int(gnn)}",
            "account_id": account_id,
            "priority_score": round(gnn / 100.0, 4),
            "risk_score_100": int(gnn),
            "gnn_risk_score": gnn,
            "n_alerts_collapsed": 0,
            "rules_triggered": [],
            "total_amount": 0.0,
            "tx_count": 0,
            "unique_counterparties": 0,
            "max_severity_weight": 0.2,
            "status": "pending",
            "assigned_to": "branch_manager",
        }]
    agg = aggregations[0]
    risk_score = agg["gnn_risk_score"]

    acct_features = feature_df[feature_df["Account"].astype(str) == account_id]
    exclude = {"Account", "is_fraud"}
    feat_cols = [c for c in feature_df.columns if c not in exclude]
    X_instance = acct_features[feat_cols].values.astype(np.float32)

    try:
        top_feats, _base = compute_shap_explanation(model, X_instance, feat_cols)
        explanation = format_risk_explanation(top_feats, account_id, risk_score)
    except Exception:
        explanation = {"account_id": account_id, "risk_score": risk_score, "factors": []}
        top_feats = []

    acct_tx = tx_df[tx_df["Account"].astype(str) == account_id]
    tx_summary = {
        "total_amount": f"₹{acct_tx['Amount Paid'].sum():,.0f}" if len(acct_tx) > 0 else "Unknown",
        "tx_count": len(acct_tx),
        "time_window": (
            f"{acct_tx['Timestamp'].min()} to {acct_tx['Timestamp'].max()}"
            if len(acct_tx) > 0 else "unknown"
        ),
        "account_count": acct_tx["Account.1"].nunique() if len(acct_tx) > 0 else 0,
    }

    layering_depth = (
        int(acct_features["layering_depth"].iloc[0])
        if "layering_depth" in acct_features.columns else 0
    )
    dormancy_days = (
        int(acct_features["last_tx_days_max"].iloc[0])
        if "last_tx_days_max" in acct_features.columns else 0
    )
    graph_evidence = {
        "layering_depth": layering_depth,
        "circular": bool(
            acct_features["circular_score"].iloc[0] > 0
            if "circular_score" in acct_features.columns else False
        ),
        "flagged_neighbours": 0,
        "dormancy_days": dormancy_days,
    }
    case_details = {
        "time_window": _summarize_time_window(acct_tx),
        "layering_depth": layering_depth,
        "last_tx_days": dormancy_days,
        "last_tx_days_max": dormancy_days,
        "dormancy_days": dormancy_days,
        "n_branches": agg.get("unique_counterparties", 0),
    }

    narrative = generate_str_narrative(
        account_id, risk_score, explanation["factors"],
        tx_summary, graph_evidence,
    )

    case = build_case_dossier(
        account_id, risk_score, narrative, explanation["factors"],
        acct_tx,
        rules_triggered=agg["rules_triggered"],
        aggregation=agg,
        shap_top_features=top_feats,
        case_details=case_details,
    )

    os.makedirs(os.path.join(DATA_DIR, "cases"), exist_ok=True)
    case_path = os.path.join(DATA_DIR, "cases", f"{case['case_id']}.json")
    with open(case_path, "w") as f:
        json.dump(case, f, indent=2, default=str)

    register_pending_alert(case["case_id"], "branch_manager",
                           metadata={"account_id": account_id,
                                     "priority_score": agg["priority_score"]})
    audit_log("case_generated", token.get("sub", "demo"),
              {"case_id": case["case_id"], "account": account_id, "risk_score": risk_score})

    return case
