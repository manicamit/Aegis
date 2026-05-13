"""
AEGIS — Identity Feature Engineering
Builds identity linkage graph from shared beneficiaries and synthetic device data.
Detects mule clusters via connected components.
"""
import networkx as nx
import pandas as pd
import numpy as np
import os
import logging
from typing import Dict, List
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def build_identity_graph(
    transactions_df: pd.DataFrame,
    device_logs_df: pd.DataFrame = None
) -> nx.Graph:
    """
    Build undirected identity linkage graph.
    Edges represent shared attributes across accounts.
    """
    logger.info("Building identity linkage graph...")
    G = nx.Graph()

    # Add all accounts as nodes
    all_accounts = set(transactions_df["Account"].unique()) | set(transactions_df["Account.1"].unique())
    for acc in all_accounts:
        G.add_node(f"ACC_{acc}", node_type="account")

    # Link by shared beneficiary (accounts sending to the same destination)
    logger.info("  Linking by shared beneficiary...")
    beneficiary_groups = transactions_df.groupby("Account.1")["Account"].apply(list)
    shared_ben_edges = 0
    
    for beneficiary, senders in beneficiary_groups.items():
        unique_senders = list(set(senders))
        if len(unique_senders) < 2:
            continue
        # Limit pairwise combinations for very popular beneficiaries
        if len(unique_senders) > 50:
            unique_senders = unique_senders[:50]
        
        for i in range(len(unique_senders)):
            for j in range(i + 1, len(unique_senders)):
                u = f"ACC_{unique_senders[i]}"
                v = f"ACC_{unique_senders[j]}"
                if G.has_edge(u, v):
                    G[u][v]["shared_beneficiaries"] = G[u][v].get("shared_beneficiaries", 0) + 1
                else:
                    G.add_edge(u, v,
                               edge_type="SHARED_BENEFICIARY",
                               shared_beneficiaries=1)
                    shared_ben_edges += 1

    logger.info(f"  Added {shared_ben_edges:,} shared beneficiary edges")

    # Link by shared device (if device log available)
    if device_logs_df is not None:
        logger.info("  Linking by shared device...")
        device_groups = device_logs_df.groupby("device_id")["account_id"].apply(list)
        shared_dev_edges = 0
        
        for device, accounts in device_groups.items():
            unique_accounts = list(set(accounts))
            if len(unique_accounts) < 2:
                continue
            for i in range(len(unique_accounts)):
                for j in range(i + 1, len(unique_accounts)):
                    u = f"ACC_{unique_accounts[i]}"
                    v = f"ACC_{unique_accounts[j]}"
                    if u in G and v in G:
                        G.add_edge(u, v,
                                   edge_type="SHARED_DEVICE",
                                   device_id=str(device))
                        shared_dev_edges += 1
        
        logger.info(f"  Added {shared_dev_edges:,} shared device edges")

    logger.info(f"Identity graph: {len(G.nodes):,} nodes, {G.number_of_edges():,} edges")
    return G


def detect_mule_clusters(identity_graph: nx.Graph, min_size: int = 3) -> List[dict]:
    """
    Find clusters of accounts linked by hidden identity signals.
    These clusters are mule network candidates.
    """
    logger.info("Detecting mule clusters...")
    clusters = []
    
    for component in nx.connected_components(identity_graph):
        if len(component) >= min_size:
            subgraph = identity_graph.subgraph(component)
            edge_types = set()
            for _, _, data in subgraph.edges(data=True):
                edge_types.add(data.get("edge_type", "unknown"))
            
            clusters.append({
                "accounts": sorted(list(component)),
                "size": len(component),
                "edge_types": sorted(list(edge_types)),
                "density": nx.density(subgraph),
                "num_edges": subgraph.number_of_edges(),
            })

    clusters = sorted(clusters, key=lambda x: x["size"], reverse=True)
    logger.info(f"Found {len(clusters)} mule cluster candidates (min_size={min_size})")
    
    if clusters:
        logger.info(f"  Largest cluster: {clusters[0]['size']} accounts")
        logger.info(f"  Total accounts in clusters: {sum(c['size'] for c in clusters)}")
    
    return clusters


def generate_synthetic_device_logs(
    transactions_df: pd.DataFrame,
    fraud_accounts: set = None,
    num_devices: int = 50,
    seed: int = 42
) -> pd.DataFrame:
    """
    Generate synthetic device logs for demo purposes.
    Assigns shared device IDs to accounts in the same laundering chains.
    """
    logger.info("Generating synthetic device logs...")
    np.random.seed(seed)
    
    if fraud_accounts is None:
        # Find accounts involved in laundering
        fraud_mask = transactions_df["Is Laundering"] == 1
        fraud_src = set(transactions_df.loc[fraud_mask, "Account"].unique())
        fraud_dst = set(transactions_df.loc[fraud_mask, "Account.1"].unique())
        fraud_accounts = fraud_src | fraud_dst
    
    records = []
    device_id = 0
    
    # Group fraud accounts into clusters sharing devices
    fraud_list = sorted(list(fraud_accounts))
    cluster_size = max(2, len(fraud_list) // num_devices)
    
    for i in range(0, len(fraud_list), cluster_size):
        cluster = fraud_list[i:i + cluster_size]
        if len(cluster) >= 2:
            dev = f"DEV_{device_id:04d}"
            for acc in cluster:
                records.append({
                    "account_id": acc,
                    "device_id": dev,
                    "ip_address": f"192.168.{device_id % 256}.{np.random.randint(1, 255)}",
                    "login_time": pd.Timestamp.now() - pd.Timedelta(days=np.random.randint(1, 365)),
                })
            device_id += 1
    
    # Add some legitimate accounts with their own unique devices
    legit_accounts = set(transactions_df["Account"].unique()) - fraud_accounts
    sample_legit = list(legit_accounts)[:200]
    for acc in sample_legit:
        dev = f"DEV_{device_id:04d}"
        records.append({
            "account_id": acc,
            "device_id": dev,
            "ip_address": f"10.0.{np.random.randint(0, 255)}.{np.random.randint(1, 255)}",
            "login_time": pd.Timestamp.now() - pd.Timedelta(days=np.random.randint(1, 365)),
        })
        device_id += 1
    
    df = pd.DataFrame(records)
    logger.info(f"Generated {len(df)} device log entries for {df['account_id'].nunique()} accounts")
    return df


def compute_identity_features(
    transactions_df: pd.DataFrame,
    device_logs_df: pd.DataFrame = None
) -> pd.DataFrame:
    """
    Compute identity-based features per account.
    """
    logger.info("Computing identity features...")
    
    if device_logs_df is None:
        device_logs_df = generate_synthetic_device_logs(transactions_df)
    
    identity_graph = build_identity_graph(transactions_df, device_logs_df)
    clusters = detect_mule_clusters(identity_graph, min_size=3)
    
    # Create account → cluster mapping
    account_cluster = {}
    for i, cluster in enumerate(clusters):
        for acc in cluster["accounts"]:
            account_cluster[acc] = {
                "cluster_id": i,
                "cluster_size": cluster["size"],
                "cluster_density": cluster["density"],
            }
    
    # Build features DataFrame
    all_accounts = set(transactions_df["Account"].unique()) | set(transactions_df["Account.1"].unique())
    rows = []
    for acc in all_accounts:
        node = f"ACC_{acc}"
        cluster_info = account_cluster.get(node, {})
        
        # Shared beneficiary count
        shared_ben = 0
        if node in identity_graph:
            for _, _, data in identity_graph.edges(node, data=True):
                if data.get("edge_type") == "SHARED_BENEFICIARY":
                    shared_ben += data.get("shared_beneficiaries", 0)
        
        rows.append({
            "Account": acc,
            "in_mule_cluster": 1 if node in account_cluster else 0,
            "cluster_size": cluster_info.get("cluster_size", 0),
            "cluster_density": cluster_info.get("cluster_density", 0),
            "shared_beneficiary_count": shared_ben,
            "identity_degree": identity_graph.degree(node) if node in identity_graph else 0,
        })
    
    df = pd.DataFrame(rows)
    logger.info(f"  Identity features shape: {df.shape}")
    return df


if __name__ == "__main__":
    from pipeline.stage1_ingest import load_processed
    
    df = load_processed()
    identity_df = compute_identity_features(df)
    
    os.makedirs("data/processed", exist_ok=True)
    identity_df.to_parquet("data/processed/identity_features.parquet", index=False)
    
    print(f"\nIdentity features computed for {len(identity_df):,} accounts.")
