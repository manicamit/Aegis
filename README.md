<p align="center">
  <h1 align="center">🛡️ AEGIS</h1>
  <p align="center"><strong>AI-Enabled Graph Intelligence System</strong></p>
  <p align="center">Intelligent Fund Flow Tracking for Anti-Money Laundering Fraud Detection</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10+-blue?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/PyTorch-2.1+-ee4c2c?logo=pytorch&logoColor=white" />
  <img src="https://img.shields.io/badge/PyG-2.4+-3C2179?logo=pyg&logoColor=white" />
  <img src="https://img.shields.io/badge/LightGBM-4.1+-green" />
  <img src="https://img.shields.io/badge/FastAPI-0.104+-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Dash-2.14+-1d6fa5?logo=plotly&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

## Overview

AEGIS is an end-to-end Anti-Money Laundering (AML) system that combines **Graph Neural Networks**, **gradient boosting**, and **FATF-aligned rule engines** to detect illicit fund flows in banking transaction networks. It processes raw transaction data through a 6-stage ML pipeline, generates explainable risk scores using SHAP, and presents findings through an interactive forensic investigation dashboard.

Built and trained on the **IBM AML dataset** (~180K+ synthetic banking transactions), AEGIS demonstrates how graph-based representation learning can uncover laundering patterns invisible to traditional rule-only systems — including layering chains, round-tripping, smurfing, and mule cluster coordination.

---

## Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │              AEGIS ML Pipeline               │
                  └──────────────────────────────────────────────┘

  ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
  │  Stage 1   │───▶│  Stage 2   │───▶│  Stage 3   │───▶│  Stage 4   │
  │  Ingest &  │    │   Graph    │    │ FATF Rule  │    │  HeteroGAT │
  │ Normalise  │    │ Construct  │    │   Engine   │    │  Training  │
  └────────────┘    └────────────┘    └────────────┘    └────────────┘
   IBM AML CSV       NetworkX →        6 rules:          2-layer GAT
   FX → INR          PyG HeteroData    structuring,      4 heads, 64d
   structuring       z-score norm      layering,         → 32d embeds
   flags                               round-tripping,
                                        fan-in/out,
                                        dormant acct,
                                        profile mismatch

                                                              │
                  ┌────────────┐    ┌────────────┐            ▼
                  │  Stage 6   │◀───│  Stage 5   │◀───────────┘
                  │   Case     │    │  LightGBM  │
                  │  Builder   │    │   Fusion   │
                  └────────────┘    └────────────┘
                   SHAP explain      GAT embeds +
                   STR narrative     temporal feats +
                   case dossiers     graph feats +
                                     identity feats +
                                     rule flags
                                     → risk score

                  ┌──────────────────────────────────────────────┐
                  │          Serving & Investigation             │
                  │                                              │
                  │   FastAPI (RBAC, JWT, rate limiting)          │
                  │   Dash Dashboard (dark theme, 4 pages)       │
                  │   Hash-chained audit log + auto-escalation   │
                  └──────────────────────────────────────────────┘
```

---

## ML Pipeline — 6 Stages

### Stage 1 — Ingestion & Normalisation
Loads raw IBM AML CSVs, normalises multi-currency amounts to INR using static FX rates, flags structuring attempts (transactions just below ₹50,000 RBI threshold), detects amount anomalies, and outputs a cleaned Parquet file.

### Stage 2 — Graph Construction
Builds a directed heterogeneous transaction graph using NetworkX. Each account is a node with aggregated features (tx counts, volumes, bank affiliations). Edges carry transaction metadata (amount, timestamp, currency, payment format). Converts to PyTorch Geometric `HeteroData` with z-score normalised node/edge features.

### Stage 3 — FATF-Aligned Rule Engine
Decorator-based rule registry evaluating 6 core AML detection rules per account:

| Rule | FATF Rec. | Detection Logic |
|------|-----------|-----------------|
| Structuring (Smurfing) | Rec. 20 | ≥3 transactions in ₹45K–50K band |
| Rapid Movement (Layering) | Rec. 7 | ≥3 transfers within 1 hour |
| Dormant Activation | Rec. 29 | 180+ day gap then sudden activity |
| Round-Tripping | — | Cycle detection in transaction graph |
| Fan-In/Fan-Out (Mule) | — | In-degree ≥5 AND out-degree ≥3 |
| Profile Mismatch | — | Volume >3σ above population mean |

### Stage 4 — Graph Attention Network
**2-layer Heterogeneous GAT** (PyTorch Geometric) trained with early stopping:
- Layer 1: `GATConv(in → 64, heads=4)` → ELU → Dropout(0.3)
- Layer 2: `GATConv(256 → 32, heads=1)` → 32-dim node embeddings
- Classification head: `Linear(32→16) → ReLU → Dropout → Linear(16→2)`
- Class-imbalance handling via inverse frequency weighted `CrossEntropyLoss`
- 80/20 train/val split with patience-30 early stopping

### Stage 5 — LightGBM Fusion
Assembles a unified feature matrix by merging:
- **GAT embeddings** (32 dims per account)
- **Temporal features** — tx velocity, hop deltas, burst scores, dormancy flags, amount z-scores, rolling 1h/24h windows (30 features via mean/max/std aggregation)
- **Graph features** — PageRank, betweenness centrality, clustering coefficient, layering depth, fan-in/out scores, circular transaction scores, flow ratios (14 features)
- **Identity features** — mule cluster membership, shared beneficiary counts, identity graph degree (5 features)
- **Rule flags** — 6 binary flags + composite rules_triggered count

Trains a **LightGBM classifier** (500 estimators, 63 leaves, depth-8) with SMOTE oversampling, `scale_pos_weight`, and threshold tuning via precision-recall curve optimisation.

### Stage 6 — Case Builder & STR Narrative
For top-K flagged accounts:
1. Computes **SHAP TreeExplainer** values identifying top-10 risk drivers
2. Generates human-readable risk factor explanations
3. Produces **Suspicious Transaction Report (STR)** narratives via pluggable LLM (Anthropic / OpenAI / Ollama) with template fallback
4. Assembles complete investigation dossiers with FATF compliance metadata
5. Outputs case JSON files with Sankey flow and ego-network evidence

---

## Feature Engineering

| Category | Features | Count |
|----------|----------|:-----:|
| **Temporal** | tx_velocity, hop_delta, burst_score, dormancy_flag, amount_zscore, rolling windows (×mean/max/std) | ~30 |
| **Graph** | in/out degree, PageRank, betweenness, clustering, layering_depth, fan scores, circular_score, flow ratios | 14 |
| **Identity** | mule_cluster, cluster_size, cluster_density, shared_beneficiary_count, identity_degree | 5 |
| **GAT Embeddings** | 32-dimensional learned node representations | 32 |
| **Rule Flags** | 6 FATF rules + composite count | 7 |
| **Total** | | **~88** |

---

## Project Structure

```
Aegis/
├── pipeline/                    # 6-stage ML pipeline
│   ├── stage1_ingest.py         # CSV → Parquet, FX normalisation
│   ├── stage2_graph.py          # NetworkX/PyG graph construction
│   ├── stage3_rules.py          # FATF rule engine (decorator-based)
│   ├── stage4_gnn.py            # GAT training orchestration
│   ├── stage5_fusion.py         # Feature assembly + LightGBM training
│   └── stage6_case_builder.py   # SHAP + STR narrative + case dossiers
│
├── models/
│   ├── gat_model.py             # HeteroGAT architecture (PyG)
│   ├── lgbm_model.py            # LightGBM training, eval, risk scoring
│   └── saved/                   # Serialised model checkpoints
│
├── features/
│   ├── temporal_features.py     # Time-based risk signals
│   ├── graph_features.py        # Structural graph centrality features
│   └── identity_features.py     # Mule cluster detection
│
├── api/                         # FastAPI backend (v1.1.0)
│   ├── main.py                  # App entry, lifespan, CORS, routers
│   ├── auth.py                  # JWT authentication
│   ├── middleware.py             # Rate limiting (SlowAPI)
│   └── routers/                 # 10 API routers
│       ├── alerts.py            # Alert queue management
│       ├── cases.py             # Case CRUD + dossier retrieval
│       ├── graph.py             # Network visualisation data
│       ├── metrics.py           # System performance metrics
│       ├── escalations.py       # Auto-escalation management
│       ├── identity.py          # Identity linkage queries
│       ├── audit.py             # Hash-chained audit log
│       ├── health.py            # Service health checks
│       ├── admin.py             # Admin operations
│       └── pipeline.py          # Pipeline trigger/status
│
├── dashboard/                   # Dash investigator workspace
│   ├── app.py                   # Multi-page Dash app (DARKLY theme)
│   ├── pages/
│   │   ├── alert_queue.py       # Priority-ranked alert queue
│   │   ├── graph_view.py        # Interactive transaction network
│   │   ├── case_report.py       # Case dossier viewer
│   │   └── metrics_view.py      # System metrics dashboard
│   └── components/              # Reusable UI components
│
├── security/
│   ├── rbac.py                  # Role-based access control
│   ├── pii_masker.py            # Regex PII masking (PAN, Aadhaar, IFSC)
│   └── audit_logger.py         # Hash-chained JSONL + auto-escalation
│
├── tests/
│   ├── test_stage1.py           # Ingestion tests
│   ├── test_stage3_rules.py     # Rule engine tests
│   ├── test_stage5_fusion.py    # Fusion model tests
│   └── test_api.py              # API endpoint tests
│
├── data/
│   ├── raw/                     # IBM AML dataset CSVs
│   ├── processed/               # Pipeline outputs (Parquet)
│   └── synthetic/               # Generated test data
│
├── docker-compose.yml           # Multi-container orchestration
├── Dockerfile.api               # API container
├── Dockerfile.dashboard         # Dashboard container
├── nginx.conf                   # Reverse proxy config
├── requirements.txt             # Python dependencies
└── run_ibm_pipeline.py          # One-command full pipeline execution
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Graph Neural Network** | PyTorch + PyTorch Geometric (HeteroConv, GATConv) |
| **Ensemble Classifier** | LightGBM with SMOTE (imbalanced-learn) |
| **Explainability** | SHAP TreeExplainer |
| **Graph Analysis** | NetworkX (PageRank, betweenness, cycle detection) |
| **Feature Store** | Pandas + PyArrow (Parquet) |
| **API** | FastAPI + JWT + SlowAPI rate limiting |
| **Dashboard** | Plotly Dash + dash-bootstrap-components |
| **Security** | RBAC, PII masking, hash-chained audit log |
| **STR Narratives** | Pluggable LLM (Anthropic / OpenAI / Ollama / template) |
| **Deployment** | Docker Compose + Nginx |
| **Dataset** | IBM AML Transactions (Kaggle) |

---

## Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/manicamit/Aegis.git
cd Aegis
pip install -r requirements.txt
```

### 2. Download the IBM AML Dataset

```bash
# Place CSV in data/raw/
# Dataset: https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml
```

### 3. Run the Full Pipeline

```bash
python run_ibm_pipeline.py
```

This runs all 6 stages sequentially — ingestion, graph construction, rule evaluation, GAT training, LightGBM fusion, and case building.

### 4. Launch the Dashboard

```bash
python -m dashboard.app
# Open http://localhost:8050
```

### 5. Start the API

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000
# Docs at http://localhost:8000/docs
```

### Docker Deployment

```bash
docker-compose up --build
# API → :8000  |  Dashboard → :8050  |  Nginx → :80
```

---

## Security & Compliance

- **RBAC** — Role-based access (`investigator`, `analyst`, `admin`) with scoped permissions
- **JWT Authentication** — Token-based API access with configurable expiry
- **PII Masking** — Regex-based detection and redaction of PAN, Aadhaar, IFSC, phone, email before LLM calls
- **Hash-Chained Audit Log** — Append-only JSONL with SHA-256 chain for tamper evidence
- **Auto-Escalation** — Unactioned alerts are automatically escalated (`branch_manager → investigator → admin`) after configurable timeout
- **Rate Limiting** — SlowAPI-based API throttling

---

## License

MIT

---

<p align="center">
  Built by <a href="https://github.com/manicamit">Amit Anand</a>
</p>
