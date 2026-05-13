"""AEGIS — Ego Network Component
Interactive ego-network visualization using Plotly with risk-colored nodes.
"""
import plotly.graph_objects as go
import networkx as nx
import numpy as np
from typing import Optional, Dict


def build_ego_network_figure(
    nodes: list,
    edges: list,
    center_node: str = None,
    title: str = "Account Network",
) -> go.Figure:
    """
    Build ego-network visualization from node/edge data returned by the API.
    Node colour encodes risk score (green → red).
    Edge width encodes transaction amount.
    """
    if not nodes:
        return _empty_network("No network data available")

    # Build NetworkX graph for layout
    G = nx.DiGraph()
    for n in nodes:
        G.add_node(n["id"])
    for e in edges:
        G.add_edge(e["source"], e["target"])

    # Dynamically scale layout separation based on node count
    k = 2.0 / max(np.sqrt(len(G)), 1)
    if len(G) > 100:
        k = 5.0 / np.sqrt(len(G))  # Push nodes further apart in large graphs
        
    pos = nx.spring_layout(G, seed=42, k=k, iterations=50)

    # Vectorized Edge traces for performance
    legit_x, legit_y = [], []
    fraud_x, fraud_y = [], []
    
    for e in edges:
        if e["source"] in pos and e["target"] in pos:
            x0, y0 = pos[e["source"]]
            x1, y1 = pos[e["target"]]
            if e.get("is_laundering"):
                fraud_x.extend([x0, x1, None])
                fraud_y.extend([y0, y1, None])
            else:
                legit_x.extend([x0, x1, None])
                legit_y.extend([y0, y1, None])

    edge_traces = []
    if legit_x:
        edge_traces.append(go.Scatter(
            x=legit_x, y=legit_y, mode="lines",
            line=dict(width=0.5, color="rgba(150, 150, 150, 0.3)"),
            hoverinfo="none", showlegend=False,
        ))
    if fraud_x:
        edge_traces.append(go.Scatter(
            x=fraud_x, y=fraud_y, mode="lines",
            line=dict(width=1.5, color="rgba(231, 76, 60, 0.8)"),
            hoverinfo="none", showlegend=False,
        ))

    # Node trace with dynamic sizing
    base_size = max(6, 20 - (len(nodes) / 50))  # Scale down if many nodes
    
    node_x, node_y, node_text, node_color, node_size = [], [], [], [], []
    for n in nodes:
        if n["id"] in pos:
            x, y = pos[n["id"]]
            node_x.append(x)
            node_y.append(y)
            risk = n.get("risk_score", 0)
            node_color.append(risk)
            is_center = n.get("is_center", False)
            node_size.append(base_size * 2 if is_center else base_size)
            short_id = n["id"][-8:] if len(n["id"]) > 8 else n["id"]
            node_text.append(
                f"<b>{short_id}</b><br>"
                f"Risk: {risk:.1f}<br>"
                f"Bank: {n.get('bank', 'N/A')}"
            )

    node_trace = go.Scatter(
        x=node_x, y=node_y,
        mode="markers",
        hoverinfo="text",
        hovertext=node_text,
        marker=dict(
            showscale=True,
            colorscale="RdYlGn_r",
            color=node_color,
            cmin=0, cmax=100,
            size=node_size,
            colorbar=dict(
                title="Risk",
                thickness=15,
                x=1.02,
                tickfont=dict(color="#c0c0c0"),
                title_font=dict(color="#c0c0c0"),
            ),
            line=dict(width=2, color="white"),
        ),
        showlegend=False,
    )

    fig = go.Figure(
        data=edge_traces + [node_trace],
        layout=go.Layout(
            title=dict(text=title, font=dict(size=16, color="#e0e0e0")),
            showlegend=False,
            hovermode="closest",
            margin=dict(b=10, l=10, r=30, t=40),
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
        ),
    )
    return fig


def _empty_network(msg: str) -> go.Figure:
    fig = go.Figure()
    fig.add_annotation(
        text=msg, x=0.5, y=0.5,
        xref="paper", yref="paper",
        showarrow=False, font=dict(size=16, color="#888"),
    )
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
        yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
    )
    return fig
