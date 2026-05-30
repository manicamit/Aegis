"""
AEGIS — Synthetic Pipeline Runner
Generates synthetic demo data, runs it through all 5 pipeline stages
using pre-trained IBM models (infer mode for stages 4 & 5).

Run from the project root:
    python run_synthetic_pipeline.py
"""
import sys
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

SYNTHETIC_DIR = "data/synthetic"
PROCESSED_DIR = "data/synthetic/processed"
MODEL_DIR = "models/saved"


def main():
    # ── Stage 0: Generate synthetic CSV ──────────────────────────────────────
    logger.info("=== Stage 0: Generating synthetic demo data ===")
    from data.synthetic.generate_demo_data import generate_demo_data
    generate_demo_data(output_dir=SYNTHETIC_DIR)

    # ── Stage 1: Ingest synthetic CSV ────────────────────────────────────────
    logger.info("=== Stage 1: Ingesting synthetic transactions ===")
    from pipeline.stage1_ingest import ingest, load_processed
    ingest(f"{SYNTHETIC_DIR}/demo_transactions.csv", output_dir=PROCESSED_DIR)

    # ── Stage 2: Build heterogeneous graph ───────────────────────────────────
    logger.info("=== Stage 2: Building heterogeneous graph ===")
    from pipeline.stage2_graph import (
        build_heterogeneous_graph,
        graph_to_pyg_heterodata,
        save_graph,
    )
    df = load_processed(PROCESSED_DIR)
    G = build_heterogeneous_graph(df)
    data, node_to_idx = graph_to_pyg_heterodata(G, df)
    save_graph(G, data, node_to_idx, output_dir=PROCESSED_DIR)

    # ── Stage 3: Evaluate AML rules ──────────────────────────────────────────
    logger.info("=== Stage 3: Evaluating AML rules ===")
    from pipeline.stage2_graph import load_graph
    from pipeline.stage3_rules import evaluate_rules, save_rule_results
    G, _, _ = load_graph(PROCESSED_DIR)
    accounts = sorted(df["Account"].unique())
    rule_df = evaluate_rules(df, G=G, accounts=accounts)
    save_rule_results(rule_df, output_dir=PROCESSED_DIR)

    # ── Feature extraction (required by stage 5 fusion) ──────────────────────
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

    # ── Stage 4: Infer GAT embeddings (IBM-trained model) ────────────────────
    logger.info("=== Stage 4: Inferring GAT embeddings ===")
    from pipeline.stage4_gnn import run_stage4
    run_stage4(data_dir=PROCESSED_DIR, model_dir=MODEL_DIR, mode="infer")

    # ── Stage 5: Score accounts with LightGBM (IBM-trained model) ────────────
    logger.info("=== Stage 5: Scoring accounts ===")
    from pipeline.stage5_fusion import run_stage5
    run_stage5(data_dir=PROCESSED_DIR, model_dir=MODEL_DIR, mode="infer")

    # ── Stage 6: Build case dossiers for top-K flagged accounts ──────────────
    logger.info("=== Stage 6: Building case dossiers ===")
    from pipeline.stage6_case_builder import run_stage6
    run_stage6(data_dir=PROCESSED_DIR, model_dir=MODEL_DIR)

    logger.info("=== Synthetic pipeline complete. Results in %s ===", PROCESSED_DIR)


if __name__ == "__main__":
    sys.exit(main())
