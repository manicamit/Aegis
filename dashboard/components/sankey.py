"""AEGIS — Sankey Diagram Component
Interactive fund flow Sankey visualization using Plotly.
"""
import plotly.graph_objects as go
import pandas as pd
from typing import Optional, List, Dict


def build_sankey(path_data: list, title: str = "Fund Flow Path") -> go.Figure:
    """
    Build Sankey diagram for a traced fund flow path.
    path_data: list of dicts with keys: source, target, amount, hop_index
    """
    if not path_data:
        return _empty_sankey("No fund flow data available")

    path_df = pd.DataFrame(path_data)
    
    # Plotly Sankey crashes or becomes unreadable with too many edges. 
    # Cap to top flows by volume for large networks.
    MAX_EDGES = 60
    if len(path_df) > MAX_EDGES:
        path_df = path_df.sort_values("amount", ascending=False).head(MAX_EDGES).reset_index(drop=True)
        title = f"{title} (Top {MAX_EDGES} by Volume)"

    labels = sorted(list(set(path_df["source"]) | set(path_df["target"])))
    label_idx = {l: i for i, l in enumerate(labels)}

    # Color-code nodes by risk indicators in their names
    node_colors = []
    for l in labels:
        l_upper = l.upper()
        if "MULE" in l_upper or "SUSPECT" in l_upper:
            node_colors.append("#E24B4A")  # red
        elif "INTER" in l_upper or "LAYER" in l_upper:
            node_colors.append("#EF9F27")  # amber
        else:
            node_colors.append("#378ADD")  # blue

    fig = go.Figure(go.Sankey(
        node=dict(
            pad=15, thickness=20,
            line=dict(color="#2d2d2d", width=0.5),
            label=[_short_label(l) for l in labels],
            color=node_colors,
        ),
        link=dict(
            source=[label_idx[r["source"]] for _, r in path_df.iterrows()],
            target=[label_idx[r["target"]] for _, r in path_df.iterrows()],
            value=[max(r["amount"], 0.01) for _, r in path_df.iterrows()],
            label=[f"₹{r['amount']:,.0f}" if r["amount"] > 0 else "" for _, r in path_df.iterrows()],
            color="rgba(231, 76, 60, 0.3)",
        ),
    ))

    fig.update_layout(
        title=dict(text=title, font=dict(size=16, color="#e0e0e0")),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(size=12, color="#c0c0c0"),
        margin=dict(l=10, r=10, t=40, b=10),
    )
    return fig


def _short_label(label: str) -> str:
    """Shorten ACC_XXXX labels for display."""
    if label.startswith("ACC_"):
        acc_id = label[4:]
        if len(acc_id) > 10:
            return f"...{acc_id[-6:]}"
    return label


def _empty_sankey(msg: str) -> go.Figure:
    """Return an empty figure with a message."""
    fig = go.Figure()
    fig.add_annotation(
        text=msg, x=0.5, y=0.5,
        xref="paper", yref="paper",
        showarrow=False, font=dict(size=16, color="#888"),
    )
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return fig
