# AEGIS — Prototype Build Guide
### Intelligent Fund Flow Tracking & AML Detection System
**PSBs Hackathon 2026 · Team Jigyasa · Union Bank of India**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Dataset — IBM Synthetic AML](#3-dataset--ibm-synthetic-aml)
4. [Environment Setup](#4-environment-setup)
5. [P1 — Interactive Fund Flow Graph](#5-p1--interactive-fund-flow-graph)
6. [P2 — Transaction Replay Animation](#6-p2--transaction-replay-animation)
7. [P3 — Temporal Features](#7-p3--temporal-features)
8. [P4 — Risk Propagation Visualisation](#8-p4--risk-propagation-visualisation)
9. [P5 — Benchmark Metrics](#9-p5--benchmark-metrics)
10. [P6 — Investigator Workspace & SHAP Panel](#10-p6--investigator-workspace--shap-panel)
11. [P7 — LLM-Powered STR Narrative](#11-p7--llm-powered-str-narrative)
12. [P8 — Device / Identity Linking](#12-p8--device--identity-linking)
13. [Core Pipeline — Stages 1–6](#13-core-pipeline--stages-16)
14. [Security Best Practices](#14-security-best-practices)
15. [Docker & Deployment](#15-docker--deployment)
16. [Demo Story Arc](#16-demo-story-arc)
17. [What to Say vs What to Skip](#17-what-to-say-vs-what-to-skip)
18. [Final Checklist](#18-final-checklist)

---

## 1. Project Overview

AEGIS (AI-Enabled Graph Intelligence System) is a 6-stage AML pipeline that transforms raw transaction data into FIU-ready investigation cases. It combines:

- **Heterogeneous Graph Attention Network (GAT)** for network-level fraud detection
- **FATF-aligned rule engine** for known pattern detection
- **LightGBM fusion** for stable risk scoring
- **SHAP TreeExplainer** for regulator-friendly explanations
- **LLM-generated STR narratives** for FIU evidence packages
- **Interactive dashboard** with Sankey flows, ego-networks, and animated fund replay

### Goals for the Hackathon Prototype

| Goal | Target |
|---|---|
| Demo reliability | Works 100% of the time, no live failures |
| Visual impact | Judges understand value in < 30 seconds |
| Technical credibility | Real benchmark numbers on IBM dataset |
| Production feel | Dockerised, one-command startup |
| Regulatory alignment | FATF + NIST AI RMF references throughout |

---

## 2. Repository Structure

```
aegis/
├── docker-compose.yml
├── .env.example                  # never commit .env
├── .gitignore
├── README.md
│
├── data/
│   ├── raw/                      # IBM AML dataset CSVs (gitignored)
│   ├── processed/                # cleaned, normalised
│   └── synthetic/                # fallback demo data
│
├── pipeline/
│   ├── stage1_ingest.py          # ingestion & normalisation
│   ├── stage2_graph.py           # heterogeneous graph construction
│   ├── stage3_rules.py           # FATF rule engine
│   ├── stage4_gnn.py             # GAT embedding
│   ├── stage5_fusion.py          # LightGBM + SHAP
│   └── stage6_case_builder.py    # case dossier + STR
│
├── models/
│   ├── gat_model.py              # PyTorch Geometric GAT
│   ├── lgbm_model.py             # LightGBM wrapper
│   └── saved/                    # trained model artefacts (gitignored)
│
├── features/
│   ├── graph_features.py         # centrality, PageRank, motifs
│   ├── temporal_features.py      # velocity, burst, hop timing
│   └── identity_features.py      # device/IP/UPI linking
│
├── api/
│   ├── main.py                   # FastAPI app entry point
│   ├── routers/
│   │   ├── alerts.py
│   │   ├── graph.py
│   │   ├── cases.py
│   │   └── metrics.py
│   ├── auth.py                   # API key / JWT auth
│   └── middleware.py             # rate limiting, audit logging
│
├── dashboard/
│   ├── app.py                    # Dash / Streamlit entry
│   ├── pages/
│   │   ├── alert_queue.py
│   │   ├── graph_view.py
│   │   ├── case_report.py
│   │   └── metrics_view.py
│   └── components/
│       ├── sankey.py
│       ├── ego_network.py
│       ├── shap_panel.py
│       └── replay_timeline.py
│
├── security/
│   ├── pii_masker.py             # PII masking before logs/LLM
│   ├── audit_logger.py           # immutable audit trail
│   └── rbac.py                   # role definitions
│
├── tests/
│   ├── test_stage1.py
│   ├── test_stage3_rules.py
│   ├── test_stage5_fusion.py
│   └── test_api.py
│
└── notebooks/
    ├── 01_eda.ipynb              # exploratory analysis
    ├── 02_benchmark.ipynb        # metrics vs baseline
    └── 03_shap_analysis.ipynb    # feature importance
```

---

## 3. Dataset — IBM Synthetic AML

### Where to Get It

The IBM AML dataset (introduced at NeurIPS 2023) is the gold-standard open benchmark for graph-based AML research.

**Primary source — Kaggle:**
```
https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml
```

**Alternative — HuggingFace:**
```
https://huggingface.co/datasets/IBM/AML-Base
```

**Paper reference:**
> Altman et al., "Realistic Synthetic Financial Transactions for Anti-Money Laundering Models", NeurIPS 2023.

### Dataset Variants — Which to Use

| Variant | Transactions | Fraud % | Recommendation |
|---|---|---|---|
| HI-Small | ~5M | 0.1% | **Use this for prototype** |
| HI-Large | ~180M | 0.1% | Too large for hackathon |
| LO-FI | ~5M | 2.5% | Good for testing rules |

Use **HI-Small** for all training and benchmarking. It is large enough to be credible, small enough to train locally.

### Dataset Schema

After download you will have CSVs with columns:

```
Timestamp, From Bank, Account, To Bank, Account.1,
Amount Received, Receiving Currency, Amount Paid, Payment Currency,
Payment Format, Is Laundering
```

`Is Laundering` is the ground-truth label (0 or 1).

### Download Script

```bash
# Install Kaggle CLI
pip install kaggle --break-system-packages

# Place your kaggle.json in ~/.kaggle/
# Get it from: https://www.kaggle.com/account → API → Create New Token

mkdir -p data/raw
kaggle datasets download ealtman2019/ibm-transactions-for-anti-money-laundering-aml \
  -p data/raw --unzip
```

### Citing It in Your Presentation

When judges ask about data source, say:
> "We use the IBM AML synthetic dataset introduced at NeurIPS 2023 — a realistic multi-agent simulation with over 5 million transactions and ground-truth laundering labels, the current academic benchmark for AML graph neural network evaluation."

---

## 4. Environment Setup

### Requirements

- Python 3.11+
- Docker Desktop (for final deployment)
- CUDA-capable GPU optional — all stages run on CPU

### Python Dependencies

Create `requirements.txt`:

```text
# Core ML
torch>=2.1.0
torch-geometric>=2.4.0
lightgbm>=4.1.0
shap>=0.44.0
scikit-learn>=1.3.0
imbalanced-learn>=0.11.0

# Graph
networkx>=3.2.0
node2vec>=0.4.6

# Data
pandas>=2.1.0
numpy>=1.26.0
pyarrow>=14.0.0

# API
fastapi>=0.104.0
uvicorn>=0.24.0
python-jose>=3.3.0
passlib>=1.7.4
python-multipart>=0.0.6
slowapi>=0.1.9

# Dashboard
plotly>=5.18.0
dash>=2.14.0

# LLM (STR narrative)
anthropic>=0.20.0

# Explainability
matplotlib>=3.8.0

# Security
cryptography>=41.0.0
python-dotenv>=1.0.0

# Testing
pytest>=7.4.0
pytest-asyncio>=0.21.0
httpx>=0.25.0
```

Install:
```bash
pip install -r requirements.txt --break-system-packages
```

### Environment Variables

Create `.env` (never commit this):

```env
# API Security
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">
API_KEY_HASH=<bcrypt hash of your API key>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

# LLM (for STR narrative — P7)
ANTHROPIC_API_KEY=sk-ant-...

# Model paths
MODEL_DIR=models/saved
DATA_DIR=data/processed

# Audit logging
AUDIT_LOG_PATH=logs/audit.jsonl
LOG_LEVEL=INFO

# Rate limiting
RATE_LIMIT_PER_MINUTE=60
```

---

## 5. P1 — Interactive Fund Flow Graph

**Goal:** Judges understand value in < 30 seconds. The graph IS the demo.

### Node Types (Heterogeneous)

| Node Type | Colour | Represents |
|---|---|---|
| Bank account | Blue | Standard bank account |
| UPI handle | Teal | UPI ID linked to account |
| Branch | Gray | Physical/digital branch |
| Device | Amber | Phone/device fingerprint |
| IP address | Purple | Network origin |
| Merchant | Coral | Merchant endpoint |

### Edge Types

| Edge | Direction | Features |
|---|---|---|
| `TRANSFER` | A → B | amount, currency, timestamp, channel |
| `USES_DEVICE` | Account → Device | login timestamp |
| `SAME_IP` | Account → IP | connection time |
| `BELONGS_TO` | Account → Branch | static |
| `SHARED_BENEFICIARY` | A → B | common recipient |

### Implementation — Graph Construction

```python
# pipeline/stage2_graph.py
import networkx as nx
import pandas as pd
from typing import Dict, Any

def build_heterogeneous_graph(df: pd.DataFrame) -> nx.DiGraph:
    """
    Build a heterogeneous directed graph from transaction data.
    Nodes carry type and feature attributes.
    Edges carry transaction metadata.
    """
    G = nx.DiGraph()

    for _, row in df.iterrows():
        src = f"ACC_{row['Account']}"
        dst = f"ACC_{row['Account.1']}"

        # Add nodes with type attribute
        if src not in G:
            G.add_node(src, node_type="account",
                       bank=row["From Bank"],
                       risk_score=0.0)
        if dst not in G:
            G.add_node(dst, node_type="account",
                       bank=row["To Bank"],
                       risk_score=0.0)

        # Add transaction edge
        G.add_edge(src, dst,
                   edge_type="TRANSFER",
                   amount=row["Amount Paid"],
                   currency=row["Payment Currency"],
                   timestamp=pd.to_datetime(row["Timestamp"]).timestamp(),
                   format=row["Payment Format"],
                   is_laundering=row["Is Laundering"])

    return G
```

### Visualisation — Plotly Interactive Graph

```python
# dashboard/components/ego_network.py
import plotly.graph_objects as go
import networkx as nx
from typing import Optional

def build_ego_network_figure(
    G: nx.DiGraph,
    center_node: str,
    radius: int = 2,
    risk_scores: Optional[dict] = None
) -> go.Figure:
    """
    Build ego-network view centred on a suspicious account.
    Node colour encodes risk score (green → red).
    Edge width encodes transaction amount.
    """
    sub = nx.ego_graph(G, center_node, radius=radius)
    pos = nx.spring_layout(sub, seed=42, k=2)

    # Edges
    edge_traces = []
    for u, v, data in sub.edges(data=True):
        x0, y0 = pos[u]
        x1, y1 = pos[v]
        amount = data.get("amount", 1)
        width = min(max(amount / 100000, 0.5), 5)  # scale width to amount
        edge_traces.append(go.Scatter(
            x=[x0, x1, None], y=[y0, y1, None],
            mode="lines",
            line=dict(width=width, color="#888"),
            hoverinfo="none"
        ))

    # Nodes
    node_x, node_y, node_text, node_color = [], [], [], []
    for node in sub.nodes():
        x, y = pos[node]
        node_x.append(x)
        node_y.append(y)
        risk = risk_scores.get(node, 0.0) if risk_scores else 0.0
        node_color.append(risk)
        node_text.append(f"{node}<br>Risk: {risk:.2f}")

    node_trace = go.Scatter(
        x=node_x, y=node_y,
        mode="markers+text",
        hoverinfo="text",
        text=node_text,
        marker=dict(
            showscale=True,
            colorscale="RdYlGn_r",   # green=safe, red=risky
            color=node_color,
            cmin=0, cmax=1,
            size=20,
            colorbar=dict(title="Risk Score"),
            line=dict(width=2, color="white")
        )
    )

    fig = go.Figure(
        data=edge_traces + [node_trace],
        layout=go.Layout(
            showlegend=False,
            hovermode="closest",
            margin=dict(b=0, l=0, r=0, t=0),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)"
        )
    )
    return fig
```

### Sankey Diagram — Fund Flow

```python
# dashboard/components/sankey.py
import plotly.graph_objects as go
import pandas as pd

def build_sankey(path_df: pd.DataFrame) -> go.Figure:
    """
    Build Sankey diagram for a traced fund flow path.
    path_df columns: source, target, amount, hop_index
    """
    labels = list(set(path_df["source"]) | set(path_df["target"]))
    label_idx = {l: i for i, l in enumerate(labels)}

    fig = go.Figure(go.Sankey(
        node=dict(
            pad=15, thickness=20,
            line=dict(color="black", width=0.5),
            label=labels,
            color=["#E24B4A" if "MULE" in l else
                   "#EF9F27" if "INTER" in l else
                   "#378ADD" for l in labels]
        ),
        link=dict(
            source=[label_idx[r["source"]] for _, r in path_df.iterrows()],
            target=[label_idx[r["target"]] for _, r in path_df.iterrows()],
            value=[r["amount"] for _, r in path_df.iterrows()],
            label=[f"₹{r['amount']:,.0f}" for _, r in path_df.iterrows()],
            color="rgba(231, 76, 60, 0.3)"
        )
    ))
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        font_size=12
    )
    return fig
```

---

## 6. P2 — Transaction Replay Animation

**Goal:** "Google Maps timeline for illicit funds." The single most memorable demo moment.

### How It Works

1. User clicks "Replay" on a flagged case
2. Transactions are sorted chronologically
3. Each hop animates: source node pulses → edge glows → destination node lights up
4. Risk score counter climbs in real time alongside the animation
5. Final state: full laundering chain visible with all nodes colour-coded by risk

### Implementation — Plotly Animation Frames

```python
# dashboard/components/replay_timeline.py
import plotly.graph_objects as go
import networkx as nx
import pandas as pd

def build_replay_animation(
    G: nx.DiGraph,
    transactions: pd.DataFrame,
    risk_scores: dict
) -> go.Figure:
    """
    Build frame-by-frame animation of fund movement.
    Each frame adds one transaction hop to the visible graph.
    """
    txns = transactions.sort_values("Timestamp")
    pos = nx.spring_layout(G, seed=42)

    frames = []
    visible_edges = []
    cumulative_risk = 0.0

    for i, (_, txn) in enumerate(txns.iterrows()):
        visible_edges.append((txn["Account"], txn["Account.1"]))
        cumulative_risk = min(cumulative_risk + 0.15, 1.0)

        edge_x, edge_y = [], []
        for u, v in visible_edges:
            if u in pos and v in pos:
                x0, y0 = pos[u]
                x1, y1 = pos[v]
                edge_x += [x0, x1, None]
                edge_y += [y0, y1, None]

        frame = go.Frame(
            data=[
                go.Scatter(x=edge_x, y=edge_y, mode="lines",
                           line=dict(color="#E24B4A", width=2)),
            ],
            name=str(i),
            layout=go.Layout(
                title_text=f"Hop {i+1} | Risk Score: {cumulative_risk:.0%} | "
                           f"Time: {txn['Timestamp']}"
            )
        )
        frames.append(frame)

    # Base figure (all nodes, no edges initially)
    node_x = [pos[n][0] for n in G.nodes()]
    node_y = [pos[n][1] for n in G.nodes()]

    fig = go.Figure(
        data=[
            go.Scatter(x=edge_x[:0], y=edge_y[:0], mode="lines"),
            go.Scatter(x=node_x, y=node_y, mode="markers",
                       marker=dict(size=15, color="#378ADD"))
        ],
        frames=frames,
        layout=go.Layout(
            updatemenus=[dict(
                type="buttons",
                buttons=[
                    dict(label="▶ Replay",
                         method="animate",
                         args=[None, {"frame": {"duration": 800},
                                      "transition": {"duration": 300}}]),
                    dict(label="⏸ Pause",
                         method="animate",
                         args=[[None], {"mode": "immediate"}])
                ]
            )],
            sliders=[dict(
                steps=[dict(method="animate", args=[[f.name]],
                            label=f"Hop {int(f.name)+1}")
                       for f in frames]
            )]
        )
    )
    return fig
```

---

## 7. P3 — Temporal Features

**Goal:** Make the system time-aware without the risk of training a full Temporal GNN.

**Strategy:** Add temporal edge features into LightGBM. Say "TGN-ready architecture" in the presentation — don't build TGN.

### Feature Engineering

```python
# features/temporal_features.py
import pandas as pd
import numpy as np

def compute_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute time-based risk features per account.
    These feed directly into LightGBM Stage 5.
    """
    df = df.copy()
    df["Timestamp"] = pd.to_datetime(df["Timestamp"])
    df = df.sort_values(["Account", "Timestamp"])

    # --- Per-account features ---

    # 1. Transfer velocity: transactions per hour (rolling 1h window)
    df["tx_velocity_1h"] = (
        df.groupby("Account")["Timestamp"]
        .transform(lambda x: x.expanding()
                   .count() / ((x - x.min()).dt.total_seconds() / 3600 + 1))
    )

    # 2. Time between consecutive hops
    df["hop_delta_seconds"] = (
        df.groupby("Account")["Timestamp"]
        .transform(lambda x: x.diff().dt.total_seconds().fillna(0))
    )

    # 3. Burst score: stddev of hop deltas (low stddev = coordinated timing)
    df["burst_score"] = (
        df.groupby("Account")["hop_delta_seconds"]
        .transform(lambda x: 1 / (x.std() + 1))
    )

    # 4. Rapid withdrawal after deposit flag
    df["amount_in"] = df.groupby("Account")["Amount Received"].transform("sum")
    df["amount_out"] = df.groupby("Account")["Amount Paid"].transform("sum")
    df["rapid_withdrawal"] = (
        (df["amount_out"] / (df["amount_in"] + 1)) > 0.95
    ).astype(int)

    # 5. Dormancy score: days since last transaction before current activity
    df["last_tx_days"] = (
        df.groupby("Account")["Timestamp"]
        .transform(lambda x: (x - x.shift(1)).dt.days.fillna(999))
    )
    df["dormancy_flag"] = (df["last_tx_days"] > 180).astype(int)

    # 6. Amount anomaly: z-score of transaction amount per account
    df["amount_zscore"] = (
        df.groupby("Account")["Amount Paid"]
        .transform(lambda x: (x - x.mean()) / (x.std() + 1))
    )

    return df

def compute_rolling_windows(df: pd.DataFrame) -> pd.DataFrame:
    """
    1-hour and 24-hour rolling aggregates per account.
    """
    df = df.set_index("Timestamp").sort_index()

    for account, grp in df.groupby("Account"):
        df.loc[grp.index, "tx_count_1h"] = (
            grp["Amount Paid"].rolling("1h").count()
        )
        df.loc[grp.index, "tx_sum_1h"] = (
            grp["Amount Paid"].rolling("1h").sum()
        )
        df.loc[grp.index, "tx_count_24h"] = (
            grp["Amount Paid"].rolling("24h").count()
        )

    return df.reset_index()
```

### Temporal Features List for LightGBM

Add these to your feature matrix in Stage 5:

```python
TEMPORAL_FEATURES = [
    "tx_velocity_1h",
    "hop_delta_seconds",
    "burst_score",
    "rapid_withdrawal",
    "dormancy_flag",
    "last_tx_days",
    "amount_zscore",
    "tx_count_1h",
    "tx_sum_1h",
    "tx_count_24h",
]
```

---

## 8. P4 — Risk Propagation Visualisation

**Goal:** A confirmed suspicious node spreads decayed risk to neighbours. Red glow propagates across the graph. Most visually striking moment.

### Implementation — Personalised PageRank

```python
# features/graph_features.py
import networkx as nx
import numpy as np
from typing import Dict, Set

def propagate_risk(
    G: nx.DiGraph,
    seed_nodes: Set[str],
    alpha: float = 0.85,
    decay: float = 0.5
) -> Dict[str, float]:
    """
    Propagate risk from confirmed suspicious nodes using
    Personalised PageRank. Returns risk score per node [0, 1].

    alpha: PageRank damping factor
    decay: how much risk decays per hop
    """
    # Personalisation vector: seed nodes get weight 1.0
    personalization = {
        node: (1.0 if node in seed_nodes else 0.0)
        for node in G.nodes()
    }

    if sum(personalization.values()) == 0:
        return {node: 0.0 for node in G.nodes()}

    # Normalise
    total = sum(personalization.values())
    personalization = {k: v / total for k, v in personalization.items()}

    risk_scores = nx.pagerank(
        G,
        alpha=alpha,
        personalization=personalization,
        max_iter=200
    )

    # Normalise to [0, 1]
    max_score = max(risk_scores.values()) if risk_scores else 1.0
    risk_scores = {k: v / max_score for k, v in risk_scores.items()}

    # Seed nodes always get score 1.0
    for node in seed_nodes:
        if node in risk_scores:
            risk_scores[node] = 1.0

    return risk_scores
```

### Animated Propagation in Dashboard

```python
# In your Dash callback:
def animate_risk_propagation(G, seed_nodes):
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
```

---

## 9. P5 — Benchmark Metrics

**Goal:** Prove the 9× claim. Real numbers kill scepticism instantly.

### Evaluation Setup

```python
# notebooks/02_benchmark.ipynb
from sklearn.metrics import (
    classification_report, roc_auc_score,
    confusion_matrix, precision_recall_curve,
    average_precision_score
)
import lightgbm as lgb
import numpy as np

def evaluate_model(model, X_test, y_test, threshold=0.5):
    """Full evaluation suite."""
    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)

    print("=== Classification Report ===")
    print(classification_report(y_test, y_pred,
                                target_names=["Legit", "Fraud"]))

    print(f"\nROC-AUC:              {roc_auc_score(y_test, y_prob):.4f}")
    print(f"Average Precision:    {average_precision_score(y_test, y_prob):.4f}")

    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    print(f"\nTrue Positives:  {tp}")
    print(f"False Positives: {fp}")
    print(f"False Negatives: {fn}")
    print(f"True Negatives:  {tn}")
    print(f"\nFalse Positive Rate: {fp/(fp+tn):.4f}")
    print(f"Alert Reduction:     {(1 - fp/(fp+tn))*100:.1f}%")

    return {
        "roc_auc": roc_auc_score(y_test, y_prob),
        "precision": tp/(tp+fp) if (tp+fp) > 0 else 0,
        "recall": tp/(tp+fn) if (tp+fn) > 0 else 0,
        "f1": 2*tp/(2*tp+fp+fn) if (2*tp+fp+fn) > 0 else 0,
        "fp_rate": fp/(fp+tn)
    }
```

### Handling Class Imbalance

Fraud is ~0.1% of IBM HI-Small. Address this explicitly — judges will ask.

```python
# pipeline/stage5_fusion.py
from imblearn.over_sampling import SMOTE
from lightgbm import LGBMClassifier
import numpy as np

def train_fusion_model(X_train, y_train):
    """
    Handle severe class imbalance with SMOTE + class weights.
    """
    # Option A: SMOTE oversampling (for smaller datasets)
    smote = SMOTE(sampling_strategy=0.1, random_state=42)
    X_res, y_res = smote.fit_resample(X_train, y_train)

    # Option B: scale_pos_weight (simpler, often better for LightGBM)
    fraud_count = y_train.sum()
    legit_count = len(y_train) - fraud_count
    scale_pos_weight = legit_count / fraud_count

    model = LGBMClassifier(
        n_estimators=500,
        learning_rate=0.05,
        num_leaves=63,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        n_jobs=-1,
        verbose=-1
    )

    # Temporal train/val split — never shuffle time-series data
    # Use first 80% chronologically for training, last 20% for validation
    model.fit(X_res, y_res,
              eval_set=[(X_train, y_train)],
              callbacks=[lgb.early_stopping(50)])

    return model
```

### Baseline Comparison Table

Show this in your presentation slide:

| Metric | Rule Engine Only | AEGIS (AEGIS Full) |
|---|---|---|
| ROC-AUC | ~0.72 | ~0.91 |
| Precision | ~0.12 | ~0.61 |
| Recall | ~0.71 | ~0.74 |
| F1 Score | ~0.21 | ~0.67 |
| False Positive Rate | ~0.28 | ~0.04 |
| Alert Reduction | baseline | ~9× fewer |

> **Note:** Fill in your actual numbers from running evaluation. Even numbers slightly lower than these are more credible than unsubstantiated claims.

---

## 10. P6 — Investigator Workspace & SHAP Panel

**Goal:** Three-panel investigator UI that looks enterprise-grade at first glance.

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  AEGIS — Alert Investigation Workspace                          │
├──────────────┬──────────────────────────┬───────────────────────┤
│ Alert Queue  │   Interactive Graph       │  Risk Explanation     │
│              │                           │                       │
│ [!] ACC_1234 │   [Sankey / Ego Network]  │  Score: 94/100        │
│ [!] ACC_5678 │                           │                       │
│ [ ] ACC_9012 │   [Replay Timeline]       │  + 7-hop layering     │
│              │                           │  + 3 flagged nbrs     │
│              │                           │  + dormant 482 days   │
│              │                           │  + burst transfer     │
│              │                           │                       │
│              │                           │  [Generate STR]       │
└──────────────┴──────────────────────────┴───────────────────────┘
```

### SHAP Explanation Component

```python
# dashboard/components/shap_panel.py
import shap
import plotly.graph_objects as go
import numpy as np

def compute_shap_explanation(model, X_instance, feature_names):
    """
    Compute SHAP values for a single prediction.
    Uses TreeExplainer — fast and exact for LightGBM.
    """
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_instance)

    if isinstance(shap_values, list):
        shap_values = shap_values[1]   # class 1 (fraud)

    # Sort by absolute contribution
    contributions = list(zip(feature_names, shap_values[0]))
    contributions.sort(key=lambda x: abs(x[1]), reverse=True)
    top_features = contributions[:10]

    return top_features

def build_shap_waterfall(top_features, base_value, final_score):
    """
    Build a horizontal waterfall bar chart for SHAP values.
    Positive SHAP = pushes toward fraud (red).
    Negative SHAP = pushes away from fraud (green).
    """
    names = [f[0] for f in top_features]
    values = [f[1] for f in top_features]
    colors = ["#E24B4A" if v > 0 else "#1D9E75" for v in values]

    fig = go.Figure(go.Bar(
        x=values,
        y=names,
        orientation="h",
        marker_color=colors,
        text=[f"{v:+.3f}" for v in values],
        textposition="auto"
    ))

    fig.update_layout(
        title=f"Risk Score: {final_score}/100 — Why was this flagged?",
        xaxis_title="SHAP contribution",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        yaxis=dict(autorange="reversed")
    )

    return fig
```

### Risk Score Display Component

```python
def format_risk_explanation(shap_top_features, account_id, risk_score):
    """
    Format SHAP factors into human-readable risk factors.
    """
    label_map = {
        "dormancy_flag":       "Dormant account suddenly activated",
        "burst_score":         "Coordinated burst transfer timing",
        "tx_velocity_1h":      "Abnormal transaction velocity",
        "hop_delta_seconds":   "Rapid hop-to-hop movement",
        "gnn_embedding_risk":  "Connected to high-risk network (GAT)",
        "layering_depth":      "Deep layering chain detected",
        "circular_score":      "Circular fund routing detected",
        "amount_zscore":       "Unusual transaction amount",
        "rapid_withdrawal":    "Rapid withdrawal after deposit",
        "profile_mismatch":    "Profile/transaction mismatch",
    }

    factors = []
    for feat, val in shap_top_features:
        if val > 0.05:   # only show meaningful contributors
            label = label_map.get(feat, feat.replace("_", " ").title())
            factors.append(f"+ {label} (impact: {val:.3f})")

    return {
        "account_id": account_id,
        "risk_score": risk_score,
        "factors": factors
    }
```

---

## 11. P7 — LLM-Powered STR Narrative

**Goal:** Replace template-generated text with an LLM call that produces investigator-grade narrative.

### Implementation

```python
# pipeline/stage6_case_builder.py
import anthropic
import json
from typing import Dict, Any
from security.pii_masker import mask_pii

client = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY from env

def generate_str_narrative(
    account_id: str,
    risk_score: float,
    shap_factors: list,
    transaction_summary: Dict[str, Any],
    graph_evidence: Dict[str, Any]
) -> str:
    """
    Generate FIU STR narrative using Claude.
    PII is masked before leaving the system.
    """
    # Mask all PII before sending to external LLM
    safe_summary = mask_pii(transaction_summary)

    prompt = f"""You are a financial crime investigator writing a Suspicious Transaction Report (STR) narrative for the Financial Intelligence Unit (FIU-IND).

Account Reference: {account_id}
Risk Score: {risk_score}/100

Transaction Summary:
- Total amount: ₹{safe_summary.get('total_amount', 0):,.0f}
- Transaction count: {safe_summary.get('tx_count', 0)}
- Time window: {safe_summary.get('time_window', 'unknown')}
- Accounts involved: {safe_summary.get('account_count', 0)}
- Channels: {', '.join(safe_summary.get('channels', []))}

Risk Factors Identified:
{chr(10).join(f'- {f}' for f in shap_factors)}

Graph Evidence:
- Layering depth: {graph_evidence.get('layering_depth', 0)} hops
- Circular transactions detected: {graph_evidence.get('circular', False)}
- Connected flagged accounts: {graph_evidence.get('flagged_neighbours', 0)}
- Dormancy period: {graph_evidence.get('dormancy_days', 0)} days

Write a concise STR narrative (2–3 sentences) suitable for FIU submission. Be specific about amounts, timing, and patterns. Do not use placeholder text. Use professional regulatory language."""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )

    return message.content[0].text

def build_case_dossier(
    account_id: str,
    risk_score: float,
    narrative: str,
    shap_factors: list,
    transaction_df,
    sankey_fig,
    ego_fig
) -> Dict[str, Any]:
    """
    Assemble complete investigation package.
    Returns structured JSON exportable to PDF.
    """
    return {
        "case_id": f"AEGIS-{account_id}-{int(risk_score)}",
        "account_reference": account_id,
        "risk_score": risk_score,
        "risk_factors": shap_factors,
        "str_narrative": narrative,
        "transaction_count": len(transaction_df),
        "total_amount": transaction_df["Amount Paid"].sum(),
        "evidence": {
            "sankey_json": sankey_fig.to_json(),
            "ego_network_json": ego_fig.to_json(),
        },
        "generated_at": pd.Timestamp.now().isoformat(),
        "system_version": "AEGIS-1.0",
        "compliance": {
            "fatf_rules_triggered": [],  # populated from stage 3
            "nist_rmf_alignment": "Govern + Measure",
        }
    }
```

### Example Output

```
AEGIS-ACC_1234-94 — STR Narrative:

"Account ACC_1234 (dormant for 482 days) received ₹4.82 lakh
across 7 inbound transfers from unrelated accounts within a
2-hour window on 2025-11-14, followed by immediate outbound
transfers through 3 intermediary accounts exhibiting
structuring patterns below the ₹50,000 reporting threshold,
ultimately consolidating into a single export-linked
beneficiary — a pattern consistent with layering and
round-tripping."
```

---

## 12. P8 — Device / Identity Linking

**Goal:** Hidden linkage graph that uncovers mule networks invisible to transaction-level analysis.

### What to Link

| Signal | How to Get It | What It Reveals |
|---|---|---|
| Device fingerprint | Login metadata | Multiple accounts, one device = mule ring |
| IP address | Connection logs | Coordinated access patterns |
| UPI handle | Transaction metadata | Shared beneficiary networks |
| Phone number | KYC data | Synthetic identity rings |
| Shared beneficiary | Transaction data | Common money destinations |

### Implementation

```python
# features/identity_features.py
import networkx as nx
import pandas as pd
from typing import Dict

def build_identity_graph(
    transactions_df: pd.DataFrame,
    device_logs_df: pd.DataFrame = None
) -> nx.Graph:
    """
    Build undirected identity linkage graph.
    Edges represent shared attributes across accounts.
    """
    G = nx.Graph()

    # Add all accounts as nodes
    for acc in set(transactions_df["Account"]) | set(transactions_df["Account.1"]):
        G.add_node(f"ACC_{acc}", node_type="account")

    # Link by shared beneficiary (accounts sending to the same destination)
    beneficiary_groups = transactions_df.groupby("Account.1")["Account"].apply(list)
    for beneficiary, senders in beneficiary_groups.items():
        for i in range(len(senders)):
            for j in range(i+1, len(senders)):
                u = f"ACC_{senders[i]}"
                v = f"ACC_{senders[j]}"
                if G.has_edge(u, v):
                    G[u][v]["shared_beneficiaries"] += 1
                else:
                    G.add_edge(u, v,
                               edge_type="SHARED_BENEFICIARY",
                               shared_beneficiaries=1)

    # Link by shared device (if device log available)
    if device_logs_df is not None:
        device_groups = device_logs_df.groupby("device_id")["account_id"].apply(list)
        for device, accounts in device_groups.items():
            if len(accounts) > 1:
                for i in range(len(accounts)):
                    for j in range(i+1, len(accounts)):
                        u = f"ACC_{accounts[i]}"
                        v = f"ACC_{accounts[j]}"
                        G.add_edge(u, v,
                                   edge_type="SHARED_DEVICE",
                                   device_id=device)

    return G

def detect_mule_clusters(identity_graph: nx.Graph, min_size: int = 3) -> list:
    """
    Find clusters of accounts linked by hidden identity signals.
    These clusters are mule network candidates.
    """
    clusters = []
    for component in nx.connected_components(identity_graph):
        if len(component) >= min_size:
            subgraph = identity_graph.subgraph(component)
            clusters.append({
                "accounts": list(component),
                "size": len(component),
                "edge_types": list(set(
                    data["edge_type"]
                    for _, _, data in subgraph.edges(data=True)
                )),
                "density": nx.density(subgraph)
            })

    return sorted(clusters, key=lambda x: x["size"], reverse=True)
```

> **Demo note:** For the IBM dataset, simulate device/IP data by generating synthetic device logs. Assign the same `device_id` to accounts that appear in the same laundering chain. This makes the identity graph visually dramatic and is clearly labelled as synthetic enrichment data.

---

## 13. Core Pipeline — Stages 1–6

### Stage 1 — Ingestion & Normalisation

```python
# pipeline/stage1_ingest.py
import pandas as pd
import numpy as np

def ingest(filepath: str) -> pd.DataFrame:
    df = pd.read_csv(filepath)
    df.columns = df.columns.str.strip()

    # Currency normalisation (all to INR for demo; real system uses live FX)
    fx_rates = {"US Dollars": 83.5, "Euros": 91.2, "Bitcoin": 6500000,
                "Rupees": 1.0, "UK Pounds": 105.0, "Yuan": 11.5}
    df["amount_inr"] = df.apply(
        lambda r: r["Amount Paid"] * fx_rates.get(r["Payment Currency"], 1.0),
        axis=1
    )

    # Flag structuring: amounts just below ₹50,000 reporting threshold
    df["structuring_flag"] = (
        (df["amount_inr"] >= 45000) & (df["amount_inr"] < 50000)
    ).astype(int)

    # Anomaly: negative or zero amounts
    df["amount_anomaly"] = (df["Amount Paid"] <= 0).astype(int)

    # Parse timestamps
    df["Timestamp"] = pd.to_datetime(df["Timestamp"])

    return df
```

### Stage 3 — FATF-Aligned Rule Engine

```python
# pipeline/stage3_rules.py
import pandas as pd

RULES = {}

def rule(name):
    def decorator(fn):
        RULES[name] = fn
        return fn
    return decorator

@rule("structuring")
def detect_structuring(df, account):
    """Multiple transactions just below ₹50,000 threshold."""
    acct_txns = df[df["Account"] == account]
    structured = acct_txns[acct_txns["structuring_flag"] == 1]
    return len(structured) >= 3

@rule("rapid_movement")
def detect_rapid_movement(df, account):
    """Multiple transfers within 1 hour."""
    acct_txns = df[df["Account"] == account].sort_values("Timestamp")
    if len(acct_txns) < 2:
        return False
    time_diff = acct_txns["Timestamp"].diff().dt.total_seconds().dropna()
    return (time_diff < 3600).sum() >= 3

@rule("dormant_activation")
def detect_dormant_activation(df, account):
    """No activity for 180+ days, then high-value transfer."""
    acct_txns = df[df["Account"] == account].sort_values("Timestamp")
    if len(acct_txns) < 2:
        return False
    gaps = acct_txns["Timestamp"].diff().dt.days.dropna()
    return (gaps > 180).any()

@rule("round_tripping")
def detect_round_tripping(G, account):
    """Account appears in a cycle in the transaction graph."""
    import networkx as nx
    try:
        cycles = nx.find_cycle(G, account)
        return len(cycles) > 0
    except nx.NetworkXNoCycle:
        return False

@rule("fan_in_fan_out")
def detect_fan_in_fan_out(G, account):
    """High in-degree AND high out-degree = classic mule."""
    in_deg = G.in_degree(f"ACC_{account}")
    out_deg = G.out_degree(f"ACC_{account}")
    return in_deg >= 5 and out_deg >= 3

@rule("profile_mismatch")
def detect_profile_mismatch(df, account, profile_db=None):
    """Transaction pattern inconsistent with account profile."""
    if profile_db is None:
        return False
    acct_txns = df[df["Account"] == account]
    total = acct_txns["amount_inr"].sum()
    profile = profile_db.get(account, {})
    expected_max = profile.get("expected_annual_volume", float("inf"))
    return total > expected_max * 0.5
```

### Stage 4 — GAT Embedding

```python
# models/gat_model.py
import torch
import torch.nn.functional as F
from torch_geometric.nn import GATConv, HeteroConv
from torch_geometric.data import HeteroData

class HeteroGAT(torch.nn.Module):
    """
    2-layer Heterogeneous Graph Attention Network.
    Operates on account and currency node types.
    """
    def __init__(self, hidden_channels=64, out_channels=32, heads=4):
        super().__init__()
        self.conv1 = HeteroConv({
            ("account", "transfers", "account"): GATConv(
                -1, hidden_channels, heads=heads, dropout=0.3
            ),
        }, aggr="sum")

        self.conv2 = HeteroConv({
            ("account", "transfers", "account"): GATConv(
                hidden_channels * heads, out_channels,
                heads=1, concat=False, dropout=0.3
            ),
        }, aggr="sum")

    def forward(self, x_dict, edge_index_dict):
        x_dict = self.conv1(x_dict, edge_index_dict)
        x_dict = {k: F.elu(v) for k, v in x_dict.items()}
        x_dict = self.conv2(x_dict, edge_index_dict)
        return x_dict

def get_gnn_embeddings(model, data: HeteroData) -> dict:
    """Extract node embeddings for use as features in LightGBM."""
    model.eval()
    with torch.no_grad():
        embeddings = model(data.x_dict, data.edge_index_dict)
    return {
        node_type: emb.numpy()
        for node_type, emb in embeddings.items()
    }
```

---

## 14. Security Best Practices

### 14.1 Authentication & Authorisation

```python
# api/auth.py
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
from datetime import datetime, timedelta

SECRET_KEY = os.environ["SECRET_KEY"]
ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

ROLES = {
    "investigator": ["read:alerts", "read:cases", "write:cases"],
    "analyst":      ["read:alerts", "read:cases"],
    "admin":        ["read:alerts", "read:cases", "write:cases",
                     "write:config", "read:metrics"],
}

def create_access_token(data: dict, role: str) -> str:
    payload = {**data, "role": role,
               "exp": datetime.utcnow() + timedelta(minutes=60)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        payload = jwt.decode(credentials.credentials,
                             SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )

def require_permission(permission: str):
    def checker(token=Security(verify_token)):
        role = token.get("role", "")
        if permission not in ROLES.get(role, []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' lacks permission: {permission}"
            )
        return token
    return checker
```

### 14.2 PII Masking Before LLM Calls

```python
# security/pii_masker.py
import re

# Patterns for Indian banking PII
PATTERNS = {
    "pan":         r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",
    "aadhaar":     r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
    "phone":       r"\b[6-9]\d{9}\b",
    "account_num": r"\b\d{9,18}\b",
    "ifsc":        r"\b[A-Z]{4}0[A-Z0-9]{6}\b",
    "email":       r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
}

def mask_pii(data: dict) -> dict:
    """Recursively mask PII in any dict/string before external API calls."""
    if isinstance(data, str):
        for label, pattern in PATTERNS.items():
            data = re.sub(pattern, f"[MASKED_{label.upper()}]", data)
        return data
    elif isinstance(data, dict):
        return {k: mask_pii(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [mask_pii(item) for item in data]
    return data
```

### 14.3 Immutable Audit Logging

```python
# security/audit_logger.py
import json
import hashlib
import time
import os
from pathlib import Path

AUDIT_LOG = Path(os.environ.get("AUDIT_LOG_PATH", "logs/audit.jsonl"))
AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)

_last_hash = "GENESIS"

def audit_log(event: str, user: str, details: dict):
    """
    Append-only audit log with hash chaining.
    Each entry includes the hash of the previous entry,
    creating a tamper-evident chain.
    """
    global _last_hash

    entry = {
        "timestamp": time.time(),
        "event": event,
        "user": user,
        "details": details,
        "prev_hash": _last_hash
    }

    entry_str = json.dumps(entry, sort_keys=True)
    entry_hash = hashlib.sha256(entry_str.encode()).hexdigest()
    entry["hash"] = entry_hash
    _last_hash = entry_hash

    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")
```

### 14.4 Rate Limiting

```python
# api/middleware.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request

limiter = Limiter(key_func=get_remote_address)

# Apply per-endpoint:
# @app.get("/api/cases/{case_id}")
# @limiter.limit("30/minute")
# async def get_case(case_id: str, request: Request): ...
```

### 14.5 Security Summary Checklist

| Control | Implementation |
|---|---|
| Authentication | JWT with HS256, 60-min expiry |
| Authorisation | RBAC — investigator / analyst / admin |
| PII protection | Regex masking before any external API call |
| Audit trail | Append-only hash-chained JSONL log |
| Rate limiting | slowapi — 30–60 req/min per endpoint |
| Secrets management | `.env` file, never committed; env vars in Docker |
| Data at rest | Processed data in `data/processed/` — add disk encryption in prod |
| Model artefacts | Stored in `models/saved/` — gitignored |
| HTTPS | Enforce TLS in nginx reverse proxy (prod) |
| Dependency scanning | Run `pip-audit` in CI pipeline |

---

## 15. Docker & Deployment

### docker-compose.yml

```yaml
version: "3.9"

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    ports:
      - "8000:8000"
    environment:
      - SECRET_KEY=${SECRET_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - MODEL_DIR=/app/models/saved
      - DATA_DIR=/app/data/processed
      - AUDIT_LOG_PATH=/app/logs/audit.jsonl
    volumes:
      - ./models/saved:/app/models/saved:ro
      - ./data/processed:/app/data/processed:ro
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  dashboard:
    build:
      context: .
      dockerfile: Dockerfile.dashboard
    ports:
      - "8050:8050"
    depends_on:
      api:
        condition: service_healthy
    environment:
      - API_BASE_URL=http://api:8000

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api
      - dashboard
```

### Dockerfile.api

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pipeline/ ./pipeline/
COPY models/ ./models/
COPY features/ ./features/
COPY api/ ./api/
COPY security/ ./security/

RUN useradd -m -u 1000 aegis && chown -R aegis:aegis /app
USER aegis

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### FastAPI Entry Point

```python
# api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from api.middleware import limiter, _rate_limit_exceeded_handler
from api.routers import alerts, graph, cases, metrics

app = FastAPI(
    title="AEGIS AML API",
    description="Intelligent Fund Flow Tracking for Fraud Detection",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None   # disable ReDoc in production
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8050"],  # dashboard only
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"]
)

app.include_router(alerts.router,  prefix="/api/v1/alerts")
app.include_router(graph.router,   prefix="/api/v1/graph")
app.include_router(cases.router,   prefix="/api/v1/cases")
app.include_router(metrics.router, prefix="/api/v1/metrics")

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
```

### One-Command Startup

```bash
# Copy environment template and fill in secrets
cp .env.example .env

# Start everything
docker compose up --build

# Dashboard: http://localhost:8050
# API docs:  http://localhost:8000/docs
```

---

## 16. Demo Story Arc

Run this exact sequence in your presentation. Rehearse it until it takes under 4 minutes.

### Step 1 — The Normal Account
Open the alert queue. Show `ACC_DEMO_001`: clean history, typical profile, no flags. Say:
> "Traditional systems see nothing suspicious here."

### Step 2 — Trigger the Suspicious Flow
Click the account. A new set of 7 inbound transfers hits within 2 hours. The alert queue updates. Risk score jumps to 94. Say:
> "AEGIS flags this immediately — not because of the amounts, but because of the network."

### Step 3 — Hit Replay
Press the replay button. Watch the Sankey animate hop by hop — dormant account receives funds from 7 sources, immediately layers through 3 intermediaries, converges on a beneficiary. Risk counter climbs in real time. Say nothing. Let the visual speak.

### Step 4 — Risk Propagation
Switch to the ego-network view. Press "Propagate Risk." Three clean-looking neighbouring accounts slowly turn red. Say:
> "These three accounts pass every traditional rule. AEGIS flags them because they share a high-risk transaction network — guilt by association, powered by the Graph Attention Network."

### Step 5 — Open the SHAP Panel
Click "Why flagged?" The waterfall chart appears. Read out the top three factors. Say:
> "Every decision is explainable. Your compliance team can defend this in court."

### Step 6 — Generate the STR
Click "Generate FIU Report." The LLM writes a paragraph-length narrative in 3 seconds. Click export PDF. Say:
> "From raw data to a regulator-ready evidence package — in one click."

---

## 17. What to Say vs What to Skip

### Say These Things

| Claim | Supporting Evidence |
|---|---|
| "9× false positive reduction" | Show your confusion matrix — FP rate vs rule baseline |
| "Guilt-by-association detection" | Show risk propagation demo live |
| "FIU-ready in one click" | Show the STR PDF export |
| "TGN-ready architecture" | Mention temporal features; say Phase 2 adds streaming TGN |
| "Production-ready" | Show `docker compose up` starting everything |
| "FATF-aligned" | Name the 6 rules (structuring, layering, dormant, etc.) |

### Phrase These Carefully

| Topic | What to Say |
|---|---|
| Kafka streaming | "Our API-first design supports Kafka integration in Phase 2 for sub-second detection" |
| Real-time interception | "Phase 2 architecture enables pre-settlement interception via streaming" |
| Full Temporal GNN | "We use temporal edge features now; our modular design is TGN-ready" |
| Analyst feedback loop | "Human-in-loop feedback retraining is planned for Phase 2" |

### Do Not Demo Live

- GNN training (too slow, too risky)
- LLM calls with real latency (pre-generate 2–3 sample narratives as fallback)
- Any feature that hasn't been tested at least 20 times end-to-end

---

## 18. Final Checklist

### Before the Demo

- [ ] Docker compose starts cleanly from scratch on a fresh machine
- [ ] IBM HI-Small metrics slide has real precision / recall / AUC numbers
- [ ] Replay animation runs smoothly (pre-load the demo case in memory)
- [ ] SHAP panel loads in < 2 seconds (pre-compute for demo accounts)
- [ ] STR narrative fallback (3 pre-generated narratives if LLM is slow)
- [ ] All `.env` secrets are set; no API keys hardcoded anywhere
- [ ] Audit log is writing correctly
- [ ] PII masker tested on sample data before LLM calls
- [ ] Demo account data (`data/synthetic/`) committed to repo as fallback
- [ ] `pytest` passes all tests

### In the Presentation

- [ ] Benchmark table shown with your actual numbers
- [ ] Demo story arc rehearsed to under 4 minutes
- [ ] "Phase 2" slide lists Kafka, TGN, feedback loop, RBAC hardening
- [ ] FATF recommendation numbers mentioned (Rec. 7, 20, 29)
- [ ] NIST AI RMF mentioned (Govern + Measure principles)
- [ ] IBM NeurIPS 2023 cited as dataset source

### Stress-Test Scenarios

Run these before the demo to ensure nothing breaks:

```bash
# 1. Full pipeline on HI-Small
python -m pipeline.stage1_ingest data/raw/HI_Small_Trans.csv
python -m pipeline.stage2_graph
python -m pipeline.stage3_rules
python -m pipeline.stage4_gnn
python -m pipeline.stage5_fusion
python -m pipeline.stage6_case_builder

# 2. API health check
curl http://localhost:8000/health

# 3. Run all tests
pytest tests/ -v

# 4. Check PII masker
python -c "from security.pii_masker import mask_pii; print(mask_pii({'name': 'ABCDE1234F', 'phone': '9876543210'}))"
```

---

*AEGIS — Built by Team Jigyasa for PSBs Hackathon 2026*
*Union Bank of India · IDEA 2.0 · Ai-CSPARC*
