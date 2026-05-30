"""
AEGIS Stage 5 — LightGBM Fusion
Assembles all features and trains the final classifier.
"""
import pandas as pd
import numpy as np
import os
import logging
from typing import Any, Dict, List, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Rule-name → human-readable severity mapping (used by alert aggregator)
RULE_SEVERITY = {
    "rule_round_tripping":     "HIGH",
    "rule_fan_in_fan_out":     "HIGH",
    "rule_structuring":        "HIGH",
    "rule_rapid_movement":     "MEDIUM",
    "rule_dormant_activation": "MEDIUM",
    "rule_profile_mismatch":   "MEDIUM",
}
SEVERITY_WEIGHT = {"HIGH": 1.0, "MEDIUM": 0.5, "LOW": 0.2}
MAX_RULES = 6  # used to normalise rule_score


def aggregate_alerts_to_cases(
    rule_df: pd.DataFrame,
    risk_df: pd.DataFrame,
    transaction_df: Optional[pd.DataFrame] = None,
    min_priority: float = 0.0,
) -> List[Dict[str, Any]]:
    """Collapse per-rule flags + per-account risk score into one case per entity.

    Inputs:
      rule_df: from data/processed/rule_flags.parquet (one row/account,
               `rule_<name>` 0/1 columns + `rules_triggered` count)
      risk_df: from data/processed/risk_scores.parquet (Account + risk_score in 0..100)
      transaction_df: optional; used for total_amount / counterparty count

    Returns: list of case dicts with priority_score, n_alerts_collapsed, rules_triggered.
    """
    if rule_df is None or len(rule_df) == 0:
        return []

    rule_df = rule_df.copy()
    rule_df["Account"] = rule_df["Account"].astype(str)
    risk_df = risk_df.copy() if risk_df is not None else pd.DataFrame(
        columns=["Account", "risk_score"]
    )
    risk_df["Account"] = risk_df["Account"].astype(str)

    risk_lookup = dict(zip(risk_df["Account"], risk_df["risk_score"]))

    tx_lookup: Dict[str, Dict[str, Any]] = {}
    if transaction_df is not None and len(transaction_df) > 0:
        tx = transaction_df.copy()
        tx["Account"] = tx["Account"].astype(str)
        tx["Account.1"] = tx["Account.1"].astype(str)
        amt_col = "amount_inr" if "amount_inr" in tx.columns else "Amount Paid"
        per_acct = tx.groupby("Account").agg(
            total_amount=(amt_col, "sum"),
            tx_count=("Account", "size"),
            unique_counterparties=("Account.1", "nunique"),
        )
        tx_lookup = per_acct.to_dict(orient="index")

    rule_cols = [c for c in rule_df.columns if c.startswith("rule_")]
    cases: List[Dict[str, Any]] = []

    for _, row in rule_df.iterrows():
        triggered = [c for c in rule_cols if int(row.get(c, 0)) == 1]
        n_alerts = len(triggered)
        if n_alerts == 0:
            continue

        account_id = str(row["Account"])
        gnn_risk = float(risk_lookup.get(account_id, 0.0)) / 100.0
        rule_score = min(1.0, n_alerts / MAX_RULES)
        max_severity_weight = max(
            (SEVERITY_WEIGHT.get(RULE_SEVERITY.get(r, "LOW"), 0.2) for r in triggered),
            default=0.2,
        )

        priority = round(
            0.4 * gnn_risk + 0.3 * rule_score + 0.3 * max_severity_weight, 4
        )
        if priority < min_priority:
            continue

        tx_info = tx_lookup.get(account_id, {})
        case_id = f"AEGIS-{account_id}-{int(priority * 100)}"

        cases.append({
            "case_id": case_id,
            "account_id": account_id,
            "priority_score": priority,
            "risk_score_100": int(round(priority * 100)),
            "gnn_risk_score": round(gnn_risk * 100, 2),
            "n_alerts_collapsed": n_alerts,
            "rules_triggered": triggered,
            "total_amount": float(tx_info.get("total_amount", 0.0) or 0.0),
            "tx_count": int(tx_info.get("tx_count", 0) or 0),
            "unique_counterparties": int(tx_info.get("unique_counterparties", 0) or 0),
            "max_severity_weight": round(max_severity_weight, 2),
            "status": "pending",
            "assigned_to": "branch_manager",
        })

    cases.sort(key=lambda c: c["priority_score"], reverse=True)
    logger.info(
        "Aggregated %d cases from %d flagged accounts",
        len(cases),
        int((rule_df[rule_cols].sum(axis=1) > 0).sum()) if rule_cols else 0,
    )
    return cases


def assemble_features(data_dir="data/processed"):
    """Merge all feature sources into a single account-level matrix."""
    logger.info("Assembling feature matrix...")
    
    # Load transaction data for ground truth labels
    tx_df = pd.read_parquet(os.path.join(data_dir, "transactions.parquet"))
    
    # Ground truth: account is fraud if it appears in ANY laundering transaction
    fraud_src = set(tx_df.loc[tx_df["Is Laundering"] == 1, "Account"].unique())
    fraud_dst = set(tx_df.loc[tx_df["Is Laundering"] == 1, "Account.1"].unique())
    fraud_accounts = fraud_src | fraud_dst
    
    all_accounts = sorted(set(tx_df["Account"].unique()) | set(tx_df["Account.1"].unique()))
    labels = pd.DataFrame({
        "Account": all_accounts,
        "is_fraud": [1 if a in fraud_accounts else 0 for a in all_accounts],
    })
    logger.info(f"  Accounts: {len(all_accounts):,} ({labels['is_fraud'].sum():,} fraud)")
    
    merged = labels.copy()
    
    # 1. Temporal features (account-level aggregates)
    temp_path = os.path.join(data_dir, "temporal_features_account.parquet")
    if os.path.exists(temp_path):
        temp_df = pd.read_parquet(temp_path)
        merged = merged.merge(temp_df, on="Account", how="left")
        logger.info(f"  + Temporal features: {temp_df.shape[1]-1} cols")
    
    # 2. Graph features
    graph_path = os.path.join(data_dir, "graph_features.parquet")
    if os.path.exists(graph_path):
        graph_df = pd.read_parquet(graph_path)
        # Graph features use ACC_ prefix
        graph_df["Account"] = graph_df["Account"].str.replace("ACC_", "", regex=False)
        merged = merged.merge(graph_df, on="Account", how="left")
        logger.info(f"  + Graph features: {graph_df.shape[1]-1} cols")
    
    # 3. GAT embeddings
    emb_path = os.path.join(data_dir, "gat_embeddings.parquet")
    if os.path.exists(emb_path):
        emb_df = pd.read_parquet(emb_path)
        emb_df["Account"] = emb_df["Account"].str.replace("ACC_", "", regex=False)
        merged = merged.merge(emb_df, on="Account", how="left")
        emb_cols = [c for c in emb_df.columns if c.startswith("gat_emb_")]
        logger.info(f"  + GAT embeddings: {len(emb_cols)} dims")
    
    # 4. Rule flags
    rule_path = os.path.join(data_dir, "rule_flags.parquet")
    if os.path.exists(rule_path):
        rule_df = pd.read_parquet(rule_path)
        rule_df["Account"] = rule_df["Account"].astype(str)
        merged["Account"] = merged["Account"].astype(str)
        merged = merged.merge(rule_df, on="Account", how="left")
        logger.info(f"  + Rule flags: {rule_df.shape[1]-1} cols")
    
    # 5. Identity features
    id_path = os.path.join(data_dir, "identity_features.parquet")
    if os.path.exists(id_path):
        id_df = pd.read_parquet(id_path)
        id_df["Account"] = id_df["Account"].astype(str)
        merged = merged.merge(id_df, on="Account", how="left")
        logger.info(f"  + Identity features: {id_df.shape[1]-1} cols")
    
    # Fill NaN
    merged = merged.fillna(0)
    
    logger.info(f"  Final feature matrix: {merged.shape}")
    return merged


def run_stage5(data_dir="data/processed", model_dir="models/saved", mode="train"):
    """
    Train or run inference with the LightGBM fusion model.

    mode="train"  — assemble features, train, evaluate, save model + risk scores
    mode="infer"  — assemble features, load saved IBM model, score accounts,
                    save risk scores (no training, no ground-truth evaluation)
    """
    from models.lgbm_model import (
        train_fusion_model, evaluate_model,
        get_risk_scores, save_lgbm_model, load_lgbm_model,
    )

    logger.info(f"=== AEGIS Stage 5 — LightGBM Fusion ({mode}) ===")

    feature_df = assemble_features(data_dir)

    exclude_cols = {"Account", "is_fraud"}
    feature_cols = [c for c in feature_df.columns if c not in exclude_cols]

    X = feature_df[feature_cols].values.astype(np.float32)
    y = feature_df["is_fraud"].values.astype(int)
    accounts = feature_df["Account"].values

    if mode == "train":
        split_idx = int(0.8 * len(X))
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]

        logger.info(f"Train: {len(X_train):,} | Val: {len(X_val):,}")
        logger.info(f"Train fraud: {y_train.sum():,} | Val fraud: {y_val.sum():,}")

        model = train_fusion_model(X_train, y_train, X_val, y_val,
                                   feature_names=feature_cols, use_smote=True)

        # Threshold tuned on val set via precision-recall curve
        from sklearn.metrics import precision_recall_curve
        y_prob_val = model.predict_proba(X_val)[:, 1]
        precisions, recalls, thresholds = precision_recall_curve(y_val, y_prob_val)
        f1_scores = (2 * precisions * recalls
                     / (precisions + recalls + 1e-9))
        best_threshold = float(thresholds[np.argmax(f1_scores[:-1])])
        logger.info(f"Optimal threshold (max F1 on val): {best_threshold:.4f}")

        metrics = evaluate_model(model, X_val, y_val,
                                 threshold=best_threshold,
                                 feature_names=feature_cols)
        metrics["threshold"] = best_threshold

        risk_df = get_risk_scores(model, X, accounts.tolist())
        risk_df.to_parquet(os.path.join(data_dir, "risk_scores.parquet"), index=False)
        logger.info(f"Saved risk scores for {len(risk_df):,} accounts")

        save_lgbm_model(model, metrics, feature_cols, model_dir)
        feature_df.to_parquet(os.path.join(data_dir, "feature_matrix.parquet"), index=False)

    elif mode == "infer":
        model, metrics, saved_feature_cols = load_lgbm_model(model_dir)
        logger.info("Loaded saved LightGBM model for inference")

        # Align feature columns to what the model was trained on
        missing = [c for c in saved_feature_cols if c not in feature_df.columns]
        extra   = [c for c in feature_cols if c not in saved_feature_cols]
        if missing:
            logger.warning(f"{len(missing)} features missing vs saved model — filling with 0: {missing[:5]}")
            for c in missing:
                feature_df[c] = 0.0
        if extra:
            logger.warning(f"{len(extra)} extra features dropped: {extra[:5]}")

        X = feature_df[saved_feature_cols].values.astype(np.float32)

        risk_df = get_risk_scores(model, X, accounts.tolist())
        risk_df.to_parquet(os.path.join(data_dir, "risk_scores.parquet"), index=False)
        logger.info(f"Saved risk scores for {len(risk_df):,} accounts")

        # Stage 6 needs feature_matrix.parquet; save it here too
        feature_df.to_parquet(os.path.join(data_dir, "feature_matrix.parquet"), index=False)

    else:
        raise ValueError(f"mode must be 'train' or 'infer', got '{mode}'")

    logger.info("Stage 5 complete.")
    return model, metrics, risk_df


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["train", "infer"], default="train")
    parser.add_argument("--data-dir", default="data/processed")
    parser.add_argument("--model-dir", default="models/saved")
    args = parser.parse_args()

    model, metrics, risk_df = run_stage5(
        data_dir=args.data_dir,
        model_dir=args.model_dir,
        mode=args.mode,
    )
    print(f"\nStage 5 complete.")
    print(f"Top 10 highest risk accounts:")
    print(risk_df.head(10)[["Account", "risk_score", "risk_label"]].to_string())
