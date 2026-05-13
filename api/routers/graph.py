"""AEGIS — Graph API Router
Endpoints for ego network, Sankey fund flow, and risk propagation.
"""
from fastapi import APIRouter, Depends, Query, Request, HTTPException
from api.auth import verify_token, require_permission
from api.middleware import limiter
from security.audit_logger import audit_log
import pandas as pd
import networkx as nx
import pickle
import os
import json

router = APIRouter(tags=["graph"])

DATA_DIR = os.environ.get("DATA_DIR", "data/processed")

_graph_cache = {}


def _load_graph():
    """Load and cache the transaction graph."""
    if "G" not in _graph_cache:
        nx_path = os.path.join(DATA_DIR, "transaction_graph.gpickle")
        if not os.path.exists(nx_path):
            return None
        with open(nx_path, "rb") as f:
            _graph_cache["G"] = pickle.load(f)
    return _graph_cache["G"]


def _load_risks():
    path = os.path.join(DATA_DIR, "risk_scores.parquet")
    if os.path.exists(path):
        return pd.read_parquet(path)
    return pd.DataFrame(columns=["Account", "risk_score", "risk_label"])


@router.get("/ego/{account_id}")
@limiter.limit("30/minute")
async def get_ego_network(
    request: Request,
    account_id: str,
    radius: int = Query(2, ge=1, le=4),
    token: dict = Depends(require_permission("read:alerts")),
):
    """Get ego-network subgraph centred on an account."""
    G = _load_graph()
    if G is None:
        raise HTTPException(status_code=503, detail="Transaction graph not available")

    node = f"ACC_{account_id}" if not account_id.startswith("ACC_") else account_id
    if node not in G:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found in graph")

    sub = nx.ego_graph(G, node, radius=radius)
    risk_df = _load_risks()
    risk_map = dict(zip(
        risk_df["Account"].astype(str).apply(lambda x: f"ACC_{x}" if not x.startswith("ACC_") else x),
        risk_df["risk_score"],
    ))

    nodes = []
    for n in sub.nodes():
        attrs = sub.nodes[n]
        nodes.append({
            "id": n,
            "node_type": attrs.get("node_type", "account"),
            "bank": attrs.get("bank", ""),
            "risk_score": risk_map.get(n, 0.0),
            "is_center": n == node,
        })

    edges = []
    for u, v, data in sub.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "amount": data.get("amount", 0),
            "currency": data.get("currency", ""),
            "timestamp": data.get("timestamp", 0),
            "edge_type": data.get("edge_type", "TRANSFER"),
            "is_laundering": data.get("is_laundering", 0),
        })

    audit_log("graph_query", token.get("sub", "demo"),
              {"action": "ego_network", "account": account_id, "radius": radius})

    return {
        "center": node,
        "radius": radius,
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


@router.get("/sankey/{account_id}")
@limiter.limit("30/minute")
async def get_sankey_data(
    request: Request,
    account_id: str,
    max_hops: int = Query(3, ge=1, le=6),
    token: dict = Depends(require_permission("read:alerts")),
):
    """Get Sankey flow data for a specific account — traces fund paths."""
    G = _load_graph()
    if G is None:
        raise HTTPException(status_code=503, detail="Transaction graph not available")

    node = f"ACC_{account_id}" if not account_id.startswith("ACC_") else account_id
    if node not in G:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found in graph")

    # Trace outgoing paths using BFS
    paths = []
    visited = {node}
    frontier = [(node, 0)]

    while frontier:
        current, hop = frontier.pop(0)
        if hop >= max_hops:
            continue
        for _, target, data in G.out_edges(current, data=True):
            paths.append({
                "source": current,
                "target": target,
                "amount": data.get("amount", 0),
                "hop_index": hop,
            })
            if target not in visited:
                visited.add(target)
                frontier.append((target, hop + 1))

    return {
        "account": account_id,
        "max_hops": max_hops,
        "paths": paths,
        "total_nodes": len(visited),
        "total_links": len(paths),
    }


@router.post("/propagate")
@limiter.limit("10/minute")
async def propagate_risk(
    request: Request,
    seed_accounts: list[str] = [],
    alpha: float = Query(0.85, ge=0.1, le=0.99),
    token: dict = Depends(require_permission("read:alerts")),
):
    """Run Personalised PageRank risk propagation from seed nodes."""
    from features.graph_features import propagate_risk as _propagate

    G = _load_graph()
    if G is None:
        raise HTTPException(status_code=503, detail="Transaction graph not available")

    seed_nodes = set()
    for acc in seed_accounts:
        node = f"ACC_{acc}" if not acc.startswith("ACC_") else acc
        if node in G:
            seed_nodes.add(node)

    if not seed_nodes:
        raise HTTPException(status_code=400, detail="No valid seed accounts found in graph")

    risk_scores = _propagate(G, seed_nodes, alpha=alpha)

    # Return top 50 highest risk
    sorted_risks = sorted(risk_scores.items(), key=lambda x: x[1], reverse=True)[:50]

    audit_log("graph_query", token.get("sub", "demo"),
              {"action": "risk_propagation", "seeds": list(seed_accounts), "alpha": alpha})

    return {
        "seed_nodes": list(seed_nodes),
        "alpha": alpha,
        "top_risks": [{"account": k, "risk_score": round(v, 4)} for k, v in sorted_risks],
        "total_affected": sum(1 for v in risk_scores.values() if v > 0.1),
    }
