"""AEGIS — Identity Linking API Router

Returns accounts/links/clusters/signals derived from shared-attribute identity
graph. Caches the computation to data/processed/identity_clusters.json so the
endpoint stays fast across requests.
"""
from fastapi import APIRouter, Depends, Query, Request
from api.auth import require_permission
from api.middleware import limiter
import json
import os
import time
import logging
from pathlib import Path

logger = logging.getLogger("aegis.identity")

router = APIRouter(tags=["identity"])

DATA_DIR     = os.environ.get("DATA_DIR", "data/processed")
CACHE_PATH   = Path(DATA_DIR) / "identity_clusters.json"
CACHE_TTL    = int(os.environ.get("IDENTITY_CACHE_TTL_SECONDS", "3600"))
MAX_CLUSTERS = 8
MAX_ACCOUNTS_PER_CLUSTER = 8


SIGNAL_COLOR = {
    "device":      "#2ad1c3",
    "ip":          "#fbbf24",
    "beneficiary": "#a78bfa",
    "upi":         "#22d3ee",
    "phone":       "#f08a5d",
}

EDGE_TYPE_TO_SIGNAL = {
    "SHARED_DEVICE":      "device",
    "SHARED_BENEFICIARY": "beneficiary",
    "SHARED_IP":          "ip",
    "SHARED_UPI":         "upi",
    "SHARED_PHONE":       "phone",
}


def _mask_account(account_id: str) -> str:
    """Last-4 mask for an account identifier."""
    s = str(account_id)
    return f"·{s[-4:]}" if len(s) >= 4 else s


def _severity_for(size: int, density: float) -> str:
    if size >= 5 and density >= 0.7: return "danger"
    if size >= 4 or  density >= 0.4: return "warn"
    return "info"


def _cluster_title(idx: int, severity: str) -> str:
    prefix = {"danger": "Mule cluster", "warn": "Linkage group", "info": "Loose linkage"}[severity]
    code   = {"danger": "S", "warn": "G", "info": "L"}[severity]
    return f"{prefix} {code}-{idx:02d}"


def _bank_label(account_id: str) -> str:
    """Best-effort bank label for the demo: round-robin from a small pool."""
    pool = ["ICICI · MUM", "Axis · PNE", "HDFC · PNE", "Kotak · MUM",
            "PNB · LDH", "Canara · BLG", "BoB · SRT", "IndusInd · MUM",
            "Federal · KCH", "Yes · PNE", "SBI · HYD"]
    return pool[hash(str(account_id)) % len(pool)]


def _build_payload_from_features(force: bool = False) -> dict:
    """Heavy-lift: build identity graph + clusters from transactions parquet."""
    import pandas as pd
    import networkx as nx
    from features.identity_features import build_identity_graph, detect_mule_clusters

    tx_path = os.path.join(DATA_DIR, "transactions.parquet")
    if not os.path.exists(tx_path):
        return {"accounts": [], "links": [], "clusters": [], "signals": _signals_block(),
                "generated_at": time.time(), "source": "empty"}

    logger.info("Building identity linkage graph for /api/v1/identity/clusters…")
    tx_df = pd.read_parquet(tx_path, columns=["Account", "Account.1"])
    # Sample down for responsiveness on large datasets.
    if len(tx_df) > 200_000:
        tx_df = tx_df.sample(200_000, random_state=42)
    G = build_identity_graph(tx_df, device_logs_df=None)
    clusters = detect_mule_clusters(G, min_size=3)[:MAX_CLUSTERS]

    out_accounts: list[dict] = []
    out_links:    list[dict] = []
    out_clusters: list[dict] = []
    flagged_set: set[str]    = set()
    risk_path = os.path.join(DATA_DIR, "risk_scores.parquet")
    if os.path.exists(risk_path):
        risk_df = pd.read_parquet(risk_path, columns=["Account", "risk_score"])
        flagged_set = set(
            risk_df.loc[risk_df["risk_score"] >= 75, "Account"].astype(str).tolist()
        )

    for idx, cluster in enumerate(clusters):
        cluster_accts = cluster["accounts"][:MAX_ACCOUNTS_PER_CLUSTER]
        cluster_set   = set(cluster_accts)
        cluster_id    = f"C-{idx:02d}"
        severity      = _severity_for(cluster["size"], cluster["density"])
        title         = _cluster_title(idx + 1, severity)
        signals: set[str] = set()
        for node in cluster_accts:
            raw_id = node.removeprefix("ACC_")
            out_accounts.append({
                "id":      node,
                "label":   _mask_account(raw_id),
                "bank":    _bank_label(raw_id),
                "cluster": cluster_id,
                "flagged": str(raw_id) in flagged_set,
            })
        # Edges entirely inside the cluster.
        subgraph = G.subgraph(cluster_set)
        for u, v, data in subgraph.edges(data=True):
            edge_type = data.get("edge_type", "")
            signal    = EDGE_TYPE_TO_SIGNAL.get(edge_type)
            if not signal:
                continue
            signals.add(signal)
            out_links.append({"a": u, "b": v, "type": signal})
        out_clusters.append({
            "id":       cluster_id,
            "title":    title,
            "density":  round(cluster["density"], 2),
            "severity": severity,
            "accounts": cluster_accts,
            "signals":  sorted(signals),
            "size":     cluster["size"],
        })

    payload = {
        "accounts":     out_accounts,
        "links":        out_links,
        "clusters":     out_clusters,
        "signals":      _signals_block(),
        "generated_at": time.time(),
        "source":       "computed",
    }
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(CACHE_PATH, "w") as f:
            json.dump(payload, f)
    except OSError as e:
        logger.warning("Could not write identity clusters cache: %s", e)
    return payload


def _signals_block() -> list[dict]:
    return [
        {"id": "device",      "label": "Shared Device",      "color": SIGNAL_COLOR["device"]},
        {"id": "ip",          "label": "Shared IP",          "color": SIGNAL_COLOR["ip"]},
        {"id": "beneficiary", "label": "Shared Beneficiary", "color": SIGNAL_COLOR["beneficiary"]},
        {"id": "upi",         "label": "Shared UPI Handle",  "color": SIGNAL_COLOR["upi"]},
        {"id": "phone",       "label": "Shared Phone",       "color": SIGNAL_COLOR["phone"]},
    ]


def _try_load_cache() -> dict | None:
    if not CACHE_PATH.exists():
        return None
    try:
        stat = CACHE_PATH.stat()
        if time.time() - stat.st_mtime > CACHE_TTL:
            return None
        with open(CACHE_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


@router.get("/clusters")
@limiter.limit("30/minute")
async def list_clusters(
    request: Request,
    refresh: bool = Query(False, description="Bypass cache and recompute"),
    token: dict = Depends(require_permission("read:cases")),
):
    """Identity-linkage clusters + edge list for the Identity Linking page."""
    if not refresh:
        cached = _try_load_cache()
        if cached:
            return {**cached, "source": cached.get("source", "cache")}
    return _build_payload_from_features(force=refresh)
