"""
AEGIS Stage 4 — GAT Embedding
Load graph, train GAT model, extract node embeddings for LightGBM fusion.

mode="train"  — trains the GAT on the current graph, saves model + norm stats
mode="infer"  — loads the saved IBM-trained GAT, re-applies IBM norm stats to
                the current (synthetic) graph before extracting embeddings so
                the embedding space matches what LightGBM was trained on
"""
import torch
import numpy as np
import pandas as pd
import os
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def run_stage4(data_dir="data/processed", model_dir="models/saved",
               epochs=200, device="auto", mode="train"):
    from pipeline.stage2_graph import load_graph
    from models.gat_model import train_gat, save_gat_model, get_gnn_embeddings, load_gat_model

    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    logger.info(f"=== AEGIS Stage 4 — GAT Embedding ({mode}) ===")
    G, data, node_to_idx = load_graph(data_dir)

    if mode == "train":
        model, metrics = train_gat(data, epochs=epochs, device=device)
        save_gat_model(model, metrics, model_dir)

        # Copy norm stats to model_dir so infer mode can find them
        norm_src = os.path.join(data_dir, "graph_norm_stats.npz")
        norm_dst = os.path.join(model_dir, "graph_norm_stats.npz")
        if os.path.exists(norm_src):
            import shutil
            shutil.copy2(norm_src, norm_dst)
            logger.info(f"Copied graph norm stats to {norm_dst}")

    elif mode == "infer":
        # Load IBM-trained GAT
        in_channels = data["account"].x.shape[1]
        model, metrics = load_gat_model(in_channels=in_channels,
                                        save_dir=model_dir, device=device)
        logger.info("Loaded saved GAT model for inference")

        # Re-normalise node features using IBM training stats instead of
        # the synthetic dataset's stats that stage2 already baked in
        ibm_norm_path = os.path.join(model_dir, "graph_norm_stats.npz")
        syn_norm_path = os.path.join(data_dir, "graph_norm_stats.npz")

        if os.path.exists(ibm_norm_path) and os.path.exists(syn_norm_path):
            ibm_stats = np.load(ibm_norm_path)
            syn_stats = np.load(syn_norm_path)

            ibm_means = torch.tensor(ibm_stats["means"], dtype=torch.float32)
            ibm_stds  = torch.tensor(ibm_stats["stds"],  dtype=torch.float32)
            syn_means = torch.tensor(syn_stats["means"], dtype=torch.float32)
            syn_stds  = torch.tensor(syn_stats["stds"],  dtype=torch.float32)

            # Un-apply synthetic z-score, re-apply IBM z-score
            raw = data["account"].x * syn_stds + syn_means
            data["account"].x = (raw - ibm_means) / ibm_stds
            logger.info("Re-normalised node features using IBM training stats")
        else:
            logger.warning(
                "graph_norm_stats.npz not found — using synthetic normalisation. "
                "Run stage 4 in train mode on IBM data first to fix this."
            )

    else:
        raise ValueError(f"mode must be 'train' or 'infer', got '{mode}'")

    model = model.to(device)
    embeddings = get_gnn_embeddings(model, data.to(device))

    account_emb = embeddings["account"]
    emb_cols = [f"gat_emb_{i}" for i in range(account_emb.shape[1])]
    emb_df = pd.DataFrame(account_emb, columns=emb_cols)
    emb_df["Account"] = data["account"].node_ids

    emb_df.to_parquet(os.path.join(data_dir, "gat_embeddings.parquet"), index=False)
    logger.info(f"Saved {len(emb_df)} embeddings ({account_emb.shape[1]} dims)")
    return emb_df, metrics


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["train", "infer"], default="train")
    parser.add_argument("--data-dir", default="data/processed")
    parser.add_argument("--model-dir", default="models/saved")
    parser.add_argument("--epochs", type=int, default=200)
    args = parser.parse_args()

    emb_df, metrics = run_stage4(
        data_dir=args.data_dir,
        model_dir=args.model_dir,
        epochs=args.epochs,
        mode=args.mode,
    )
    print(f"Stage 4 complete. Embeddings: {emb_df.shape}")
