"""
AEGIS — IBM AML Training Pipeline Runner
Runs the full training pipeline on HI-Small_Trans.csv and saves
trained GAT + LightGBM models to models/saved/.

Run from the project root:
    python run_ibm_pipeline.py
"""
import sys
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

RAW_CSV    = "data/raw/HI-Small_Trans.csv"
PROCESSED_DIR = "data/processed"
MODEL_DIR  = "models/saved"


def main():
    if not Path(RAW_CSV).exists():
        logger.error("IBM AML CSV not found at %s", RAW_CSV)
        sys.exit(1)

    # ── Stage 1: Ingest ───────────────────────────────────────────────────────
    logger.info("=== Stage 1: Ingesting IBM AML transactions ===")
    from pipeline.stage1_ingest import ingest, load_processed
    ingest(RAW_CSV, output_dir=PROCESSED_DIR)

    # ── Stage 2: Build graph ──────────────────────────────────────────────────
    logger.info("=== Stage 2: Building heterogeneous graph ===")
    from pipeline.stage2_graph import (
        build_heterogeneous_graph, graph_to_pyg_heterodata, save_graph,
    )
    df = load_processed(PROCESSED_DIR)
    G = build_heterogeneous_graph(df)
    data, node_to_idx = graph_to_pyg_heterodata(G, df)
    save_graph(G, data, node_to_idx, output_dir=PROCESSED_DIR)

    # ── Stage 3: AML rules ────────────────────────────────────────────────────
    logger.info("=== Stage 3: Evaluating AML rules ===")
    from pipeline.stage2_graph import load_graph
    from pipeline.stage3_rules import evaluate_rules, save_rule_results
    G, _, _ = load_graph(PROCESSED_DIR)
    accounts = sorted(df["Account"].unique())
    rule_df = evaluate_rules(df, G=G, accounts=accounts)
    save_rule_results(rule_df, output_dir=PROCESSED_DIR)

    # ── Feature extraction ────────────────────────────────────────────────────
    logger.info("=== Features: Computing temporal features ===")
    from features.temporal_features import compute_all_temporal, aggregate_temporal_per_account
    df_temp = compute_all_temporal(df)
    agg = aggregate_temporal_per_account(df_temp)
    agg.to_parquet(f"{PROCESSED_DIR}/temporal_features_account.parquet", index=False)

    logger.info("=== Features: Computing graph features ===")
    from features.graph_features import compute_graph_features, detect_cycles, save_graph_features
    gf = compute_graph_features(G)
    gf["circular_score"] = gf["Account"].map(detect_cycles(G)).fillna(0)
    save_graph_features(gf, output_dir=PROCESSED_DIR)

    logger.info("=== Features: Computing identity features ===")
    from features.identity_features import compute_identity_features
    idf = compute_identity_features(df)
    idf.to_parquet(f"{PROCESSED_DIR}/identity_features.parquet", index=False)

    # ── Stage 4: Train GAT ────────────────────────────────────────────────────
    logger.info("=== Stage 4: Training GAT ===")
    from pipeline.stage4_gnn import run_stage4
    run_stage4(data_dir=PROCESSED_DIR, model_dir=MODEL_DIR, mode="train")

    # ── Stage 5: Train LightGBM ───────────────────────────────────────────────
    logger.info("=== Stage 5: Training LightGBM ===")
    from pipeline.stage5_fusion import run_stage5
    model, metrics, risk_df = run_stage5(data_dir=PROCESSED_DIR, model_dir=MODEL_DIR, mode="train")

    logger.info("=== IBM training pipeline complete ===")
    logger.info("ROC-AUC: %.4f  |  Threshold: %.4f", metrics["roc_auc"], metrics["threshold"])
    logger.info("TP=%d  FP=%d  FN=%d  Precision=%.3f  Recall=%.3f",
                metrics["confusion_matrix"]["tp"],
                metrics["confusion_matrix"]["fp"],
                metrics["confusion_matrix"]["fn"],
                metrics["precision"],
                metrics["recall"])


if __name__ == "__main__":
    sys.exit(main())
