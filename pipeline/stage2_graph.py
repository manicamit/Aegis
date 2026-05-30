"""
AEGIS Stage 2 — Heterogeneous Graph Construction
Builds a directed transaction graph and converts to PyTorch Geometric HeteroData.
"""
import networkx as nx
import pandas as pd
import numpy as np
import torch
import pickle
import os
import sys
import logging
from typing import Dict, Any, Tuple
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def build_heterogeneous_graph(df: pd.DataFrame, max_edges: int = None) -> nx.DiGraph:
    """
    Build a heterogeneous directed graph from transaction data.
    Nodes carry type and feature attributes.
    Edges carry transaction metadata.
    
    For large datasets, optionally limit edges to max_edges (sampled).
    """
    G = nx.DiGraph()
    
    if max_edges and len(df) > max_edges:
        logger.info(f"Sampling {max_edges:,} edges from {len(df):,} transactions")
        # Keep all fraud transactions + sample legitimate
        fraud_df = df[df["Is Laundering"] == 1]
        legit_df = df[df["Is Laundering"] == 0]
        sample_size = max(max_edges - len(fraud_df), 0)
        if sample_size < len(legit_df):
            legit_sample = legit_df.sample(n=sample_size, random_state=42)
        else:
            legit_sample = legit_df
        df = pd.concat([fraud_df, legit_sample]).sort_values("Timestamp").reset_index(drop=True)
        logger.info(f"Sampled dataset: {len(df):,} transactions ({len(fraud_df):,} fraud)")
    
    logger.info("Building graph nodes and edges...")
    
    # Track per-account statistics for node features
    account_stats = defaultdict(lambda: {
        "tx_count_out": 0, "tx_count_in": 0,
        "total_out": 0.0, "total_in": 0.0,
        "banks": set(), "is_laundering_any": 0,
    })
    
    edge_count = 0
    for idx, row in df.iterrows():
        src = f"ACC_{row['Account']}"
        dst = f"ACC_{row['Account.1']}"
        
        # Update account stats
        account_stats[src]["tx_count_out"] += 1
        account_stats[src]["total_out"] += row.get("amount_inr", row["Amount Paid"])
        account_stats[src]["banks"].add(str(row["From Bank"]))
        
        account_stats[dst]["tx_count_in"] += 1
        account_stats[dst]["total_in"] += row.get("amount_inr", row["Amount Paid"])
        account_stats[dst]["banks"].add(str(row["To Bank"]))
        
        if row["Is Laundering"] == 1:
            account_stats[src]["is_laundering_any"] = 1
            account_stats[dst]["is_laundering_any"] = 1
        
        # Add nodes
        if src not in G:
            G.add_node(src, node_type="account", bank=str(row["From Bank"]), risk_score=0.0)
        if dst not in G:
            G.add_node(dst, node_type="account", bank=str(row["To Bank"]), risk_score=0.0)
        
        # Add transaction edge (multi-edge via key)
        G.add_edge(src, dst,
                    key=edge_count,
                    edge_type="TRANSFER",
                    amount=float(row.get("amount_inr", row["Amount Paid"])),
                    currency=str(row.get("Payment Currency", "Unknown")),
                    timestamp=row["Timestamp"].timestamp() if pd.notna(row["Timestamp"]) else 0.0,
                    format=str(row.get("Payment Format", "Unknown")),
                    is_laundering=int(row["Is Laundering"]))
        edge_count += 1
        
        if edge_count % 500000 == 0:
            logger.info(f"  Processed {edge_count:,} edges, {len(G.nodes):,} nodes")
    
    # Update node features from statistics
    for node in G.nodes:
        stats = account_stats[node]
        G.nodes[node]["tx_count_out"] = stats["tx_count_out"]
        G.nodes[node]["tx_count_in"] = stats["tx_count_in"]
        G.nodes[node]["total_out"] = stats["total_out"]
        G.nodes[node]["total_in"] = stats["total_in"]
        G.nodes[node]["num_banks"] = len(stats["banks"])
        G.nodes[node]["is_laundering"] = stats["is_laundering_any"]
    
    logger.info(f"Graph built: {len(G.nodes):,} nodes, {G.number_of_edges():,} edges")
    return G


def graph_to_pyg_heterodata(G: nx.DiGraph, df: pd.DataFrame) -> "torch_geometric.data.HeteroData":
    """
    Convert NetworkX graph to PyTorch Geometric HeteroData for GAT training.
    """
    from torch_geometric.data import HeteroData
    
    data = HeteroData()
    
    # Build node mapping
    account_nodes = [n for n in G.nodes if G.nodes[n].get("node_type") == "account"]
    node_to_idx = {n: i for i, n in enumerate(account_nodes)}
    
    # Node features: [tx_count_out, tx_count_in, total_out, total_in, num_banks]
    features = []
    labels = []
    for node in account_nodes:
        attrs = G.nodes[node]
        features.append([
            attrs.get("tx_count_out", 0),
            attrs.get("tx_count_in", 0),
            attrs.get("total_out", 0.0),
            attrs.get("total_in", 0.0),
            attrs.get("num_banks", 1),
        ])
        labels.append(attrs.get("is_laundering", 0))
    
    features = np.array(features, dtype=np.float32)

    # Normalise features (z-score); compute stats from this graph
    means = features.mean(axis=0)
    stds = features.std(axis=0) + 1e-8
    features = (features - means) / stds

    data["account"].x = torch.tensor(features, dtype=torch.float32)
    data["account"].y = torch.tensor(labels, dtype=torch.long)
    data["account"].node_ids = account_nodes
    # Attach norm stats so callers can save/reuse them
    data["account"].norm_means = means
    data["account"].norm_stds = stds
    
    # Edge index for TRANSFER edges
    src_indices = []
    dst_indices = []
    edge_attrs = []
    
    for u, v, edata in G.edges(data=True):
        if u in node_to_idx and v in node_to_idx:
            src_indices.append(node_to_idx[u])
            dst_indices.append(node_to_idx[v])
            edge_attrs.append([
                edata.get("amount", 0.0),
                edata.get("timestamp", 0.0),
            ])
    
    if src_indices:
        edge_index = torch.tensor([src_indices, dst_indices], dtype=torch.long)
        edge_attr = torch.tensor(edge_attrs, dtype=torch.float32)
        
        # Normalise edge attributes
        if len(edge_attr) > 0:
            edge_means = edge_attr.mean(dim=0)
            edge_stds = edge_attr.std(dim=0) + 1e-8
            edge_attr = (edge_attr - edge_means) / edge_stds
        
        data["account", "transfers", "account"].edge_index = edge_index
        data["account", "transfers", "account"].edge_attr = edge_attr
    
    logger.info(f"HeteroData: {data['account'].x.shape[0]} nodes, "
                f"{len(src_indices)} edges, {data['account'].x.shape[1]} features")
    
    return data, node_to_idx


def save_graph(G: nx.DiGraph, data, node_to_idx: dict, output_dir: str = "data/processed"):
    """Save graph artefacts including node-feature normalisation stats."""
    os.makedirs(output_dir, exist_ok=True)

    # Save NetworkX graph
    nx_path = os.path.join(output_dir, "transaction_graph.gpickle")
    with open(nx_path, "wb") as f:
        pickle.dump(G, f)
    logger.info(f"Saved NetworkX graph to {nx_path}")

    # Save PyG data
    pyg_path = os.path.join(output_dir, "hetero_data.pt")
    torch.save(data, pyg_path)
    logger.info(f"Saved PyG HeteroData to {pyg_path}")

    # Save node mapping
    mapping_path = os.path.join(output_dir, "node_mapping.pkl")
    with open(mapping_path, "wb") as f:
        pickle.dump(node_to_idx, f)
    logger.info(f"Saved node mapping to {mapping_path}")

    # Save z-score stats so stage 4 infer mode can apply the training distribution
    norm_path = os.path.join(output_dir, "graph_norm_stats.npz")
    np.savez(norm_path,
             means=data["account"].norm_means,
             stds=data["account"].norm_stds)
    logger.info(f"Saved graph norm stats to {norm_path}")


def load_graph(data_dir: str = "data/processed"):
    """Load saved graph artefacts."""
    nx_path = os.path.join(data_dir, "transaction_graph.gpickle")
    pyg_path = os.path.join(data_dir, "hetero_data.pt")
    mapping_path = os.path.join(data_dir, "node_mapping.pkl")
    
    with open(nx_path, "rb") as f:
        G = pickle.load(f)
    data = torch.load(pyg_path, weights_only=False)
    with open(mapping_path, "rb") as f:
        node_to_idx = pickle.load(f)
    
    return G, data, node_to_idx


if __name__ == "__main__":
    from pipeline.stage1_ingest import load_processed
    
    df = load_processed()
    
    # For prototype: limit to manageable size for graph construction
    # Use all fraud + sample of legit to keep graph tractable
    max_edges = int(os.environ.get("AEGIS_MAX_EDGES", 1000000))
    
    G = build_heterogeneous_graph(df, max_edges=max_edges)
    data, node_to_idx = graph_to_pyg_heterodata(G, df)
    save_graph(G, data, node_to_idx)
    
    print(f"\nGraph construction complete.")
    print(f"  Nodes: {len(G.nodes):,}")
    print(f"  Edges: {G.number_of_edges():,}")
