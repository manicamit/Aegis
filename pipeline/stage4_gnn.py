"""
AEGIS Stage 4 — GAT Embedding
Load graph, train GAT model, extract node embeddings for LightGBM fusion.
"""
import torch
import numpy as np
import pandas as pd
import os
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def run_stage4(data_dir="data/processed", model_dir="models/saved",
               epochs=200, device="auto"):
    from pipeline.stage2_graph import load_graph
    from models.gat_model import train_gat, save_gat_model, get_gnn_embeddings

    logger.info("=== AEGIS Stage 4 — GAT Embedding ===")
    G, data, node_to_idx = load_graph(data_dir)
    
    model, metrics = train_gat(data, epochs=epochs, device=device)
    save_gat_model(model, metrics, model_dir)
    
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
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
    emb_df, metrics = run_stage4()
    print(f"Stage 4 complete. Embeddings: {emb_df.shape}")
