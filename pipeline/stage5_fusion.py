"""
AEGIS Stage 5 — LightGBM Fusion
Assembles all features and trains the final classifier.
"""
import pandas as pd
import numpy as np
import os
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


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


def run_stage5(data_dir="data/processed", model_dir="models/saved"):
    """Train LightGBM fusion model on assembled features."""
    from models.lgbm_model import (
        train_fusion_model, evaluate_model,
        get_risk_scores, save_lgbm_model,
    )
    
    logger.info("=== AEGIS Stage 5 — LightGBM Fusion ===")
    
    feature_df = assemble_features(data_dir)
    
    # Separate features and labels
    exclude_cols = {"Account", "is_fraud"}
    feature_cols = [c for c in feature_df.columns if c not in exclude_cols]
    
    X = feature_df[feature_cols].values.astype(np.float32)
    y = feature_df["is_fraud"].values.astype(int)
    accounts = feature_df["Account"].values
    
    # Chronological split (80/20) — features are already sorted
    split_idx = int(0.8 * len(X))
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]
    
    logger.info(f"Train: {len(X_train):,} | Val: {len(X_val):,}")
    logger.info(f"Train fraud: {y_train.sum():,} | Val fraud: {y_val.sum():,}")
    
    # Train
    model = train_fusion_model(X_train, y_train, X_val, y_val,
                                feature_names=feature_cols, use_smote=True)
    
    # Evaluate
    metrics = evaluate_model(model, X_val, y_val, feature_names=feature_cols)
    
    # Generate risk scores for all accounts
    risk_df = get_risk_scores(model, X, accounts.tolist())
    risk_df.to_parquet(os.path.join(data_dir, "risk_scores.parquet"), index=False)
    logger.info(f"Saved risk scores for {len(risk_df):,} accounts")
    
    # Save model
    save_lgbm_model(model, metrics, feature_cols, model_dir)
    
    # Save feature matrix for SHAP
    feature_df.to_parquet(os.path.join(data_dir, "feature_matrix.parquet"), index=False)
    
    logger.info("Stage 5 complete.")
    return model, metrics, risk_df


if __name__ == "__main__":
    model, metrics, risk_df = run_stage5()
    print(f"\nStage 5 complete.")
    print(f"Top 10 highest risk accounts:")
    print(risk_df.head(10)[["Account", "risk_score", "risk_label"]].to_string())
