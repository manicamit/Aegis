"""
AEGIS — Graph Feature Engineering
Computes structural graph features: centrality, PageRank, layering depth,
circular transaction detection, and risk propagation.
"""
import networkx as nx
import numpy as np
import pandas as pd
import os
import logging
from typing import Dict, Set, List, Tuple
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

GRAPH_FEATURES = [
    "in_degree",
    "out_degree",
    "degree_ratio",
    "pagerank",
    "betweenness_centrality",
    "clustering_coeff",
    "layering_depth",
    "fan_in_score",
    "fan_out_score",
    "circular_score",
    "total_flow_in",
    "total_flow_out",
    "flow_ratio",
    "unique_counterparties",
]


def compute_graph_features(G: nx.DiGraph) -> pd.DataFrame:
    """
    Compute structural graph features for each node.
    Returns DataFrame with account as index.
    """
    logger.info("Computing graph features...")
    nodes = list(G.nodes())
    features = {}
    
    # Degree features
    logger.info("  Computing degree features...")
    in_degrees = dict(G.in_degree())
    out_degrees = dict(G.out_degree())
    
    # PageRank
    logger.info("  Computing PageRank...")
    try:
        pagerank = nx.pagerank(G, alpha=0.85, max_iter=200)
    except Exception:
        pagerank = {n: 1.0 / len(G) for n in G.nodes()}
    
    # Betweenness centrality (sample for large graphs)
    logger.info("  Computing betweenness centrality...")
    if len(G) > 10000:
        betweenness = nx.betweenness_centrality(G, k=min(500, len(G)))
    else:
        betweenness = nx.betweenness_centrality(G)
    
    # Clustering coefficient (on undirected projection)
    logger.info("  Computing clustering coefficients...")
    G_undir = G.to_undirected()
    clustering = nx.clustering(G_undir)
    
    # Flow features
    logger.info("  Computing flow features...")
    flow_in = defaultdict(float)
    flow_out = defaultdict(float)
    counterparties = defaultdict(set)
    
    for u, v, data in G.edges(data=True):
        amount = data.get("amount", 0)
        flow_out[u] += amount
        flow_in[v] += amount
        counterparties[u].add(v)
        counterparties[v].add(u)
    
    # Layering depth (max path length from node in BFS)
    logger.info("  Computing layering depth (sampling)...")
    layering_depths = {}
    sample_nodes = list(G.nodes())[:5000]  # Sample for large graphs
    for node in sample_nodes:
        try:
            lengths = nx.single_source_shortest_path_length(G, node, cutoff=10)
            layering_depths[node] = max(lengths.values()) if lengths else 0
        except Exception:
            layering_depths[node] = 0
    
    # Build feature DataFrame
    rows = []
    for node in nodes:
        in_deg = in_degrees.get(node, 0)
        out_deg = out_degrees.get(node, 0)
        
        rows.append({
            "Account": node,
            "in_degree": in_deg,
            "out_degree": out_deg,
            "degree_ratio": out_deg / (in_deg + 1),
            "pagerank": pagerank.get(node, 0),
            "betweenness_centrality": betweenness.get(node, 0),
            "clustering_coeff": clustering.get(node, 0),
            "layering_depth": layering_depths.get(node, 0),
            "fan_in_score": min(in_deg / 5.0, 1.0),  # normalised
            "fan_out_score": min(out_deg / 3.0, 1.0),
            "circular_score": 0,  # computed separately
            "total_flow_in": flow_in.get(node, 0),
            "total_flow_out": flow_out.get(node, 0),
            "flow_ratio": flow_out.get(node, 0) / (flow_in.get(node, 0) + 1),
            "unique_counterparties": len(counterparties.get(node, set())),
        })
    
    df = pd.DataFrame(rows)
    logger.info(f"  Graph features shape: {df.shape}")
    return df


def detect_cycles(G: nx.DiGraph, max_length: int = 6) -> Dict[str, float]:
    """
    Detect circular transaction patterns.
    Returns circular_score per node based on participation in cycles.
    """
    logger.info(f"Detecting cycles (max length {max_length})...")
    cycle_count = defaultdict(int)
    
    # Use simple_cycles with length limit for efficiency
    try:
        cycle_iter = nx.simple_cycles(G, length_bound=max_length)
        total_cycles = 0
        for cycle in cycle_iter:
            total_cycles += 1
            for node in cycle:
                cycle_count[node] += 1
            if total_cycles >= 50000:  # Cap for performance
                logger.info(f"  Capped at {total_cycles} cycles")
                break
        logger.info(f"  Found {total_cycles} cycles involving {len(cycle_count)} nodes")
    except Exception as e:
        logger.warning(f"  Cycle detection error: {e}")
    
    # Normalise to [0, 1]
    max_count = max(cycle_count.values()) if cycle_count else 1
    return {node: count / max_count for node, count in cycle_count.items()}


def propagate_risk(
    G: nx.DiGraph,
    seed_nodes: Set[str],
    alpha: float = 0.85,
    decay: float = 0.5
) -> Dict[str, float]:
    """
    Propagate risk from confirmed suspicious nodes using
    Personalised PageRank. Returns risk score per node [0, 1].
    """
    logger.info(f"Propagating risk from {len(seed_nodes)} seed nodes...")
    
    personalization = {
        node: (1.0 if node in seed_nodes else 0.0)
        for node in G.nodes()
    }

    total = sum(personalization.values())
    if total == 0:
        return {node: 0.0 for node in G.nodes()}
    
    personalization = {k: v / total for k, v in personalization.items()}

    risk_scores = nx.pagerank(
        G, alpha=alpha, personalization=personalization, max_iter=200
    )

    # Normalise to [0, 1]
    max_score = max(risk_scores.values()) if risk_scores else 1.0
    risk_scores = {k: v / max_score for k, v in risk_scores.items()}

    # Seed nodes always get score 1.0
    for node in seed_nodes:
        if node in risk_scores:
            risk_scores[node] = 1.0

    return risk_scores


def animate_risk_propagation(G: nx.DiGraph, seed_nodes: Set[str]) -> List[dict]:
    """
    Yield graph states frame-by-frame showing risk spreading.
    Each frame adds one BFS level of propagation.
    """
    from collections import deque

    visited = set(seed_nodes)
    queue = deque([(node, 1.0) for node in seed_nodes])
    frames = []
    current_risk = {node: 1.0 for node in seed_nodes}

    while queue:
        node, parent_risk = queue.popleft()
        child_risk = parent_risk * 0.6   # 40% decay per hop

        for neighbour in G.successors(node):
            if neighbour not in visited and child_risk > 0.1:
                visited.add(neighbour)
                current_risk[neighbour] = child_risk
                queue.append((neighbour, child_risk))

        frames.append(dict(current_risk))  # snapshot for this frame

    return frames


def save_graph_features(gf_df: pd.DataFrame, output_dir: str = "data/processed"):
    """Save graph features."""
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "graph_features.parquet")
    gf_df.to_parquet(path, index=False)
    logger.info(f"Saved graph features to {path}")


def load_graph_features(data_dir: str = "data/processed") -> pd.DataFrame:
    """Load saved graph features."""
    path = os.path.join(data_dir, "graph_features.parquet")
    return pd.read_parquet(path)


if __name__ == "__main__":
    from pipeline.stage2_graph import load_graph
    
    G, _, _ = load_graph()
    gf_df = compute_graph_features(G)
    
    # Compute circular scores
    circular = detect_cycles(G)
    gf_df["circular_score"] = gf_df["Account"].map(circular).fillna(0)
    
    save_graph_features(gf_df)
    print(f"\nGraph features computed for {len(gf_df):,} nodes.")
