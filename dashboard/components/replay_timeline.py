"""AEGIS — Replay Timeline Component
Frame-by-frame transaction animation showing fund movement over time.
"""
import plotly.graph_objects as go
import networkx as nx
import pandas as pd
import numpy as np
from typing import Optional, Dict, List


def build_replay_animation(
    nodes: list,
    edges: list,
    title: str = "Transaction Replay",
) -> go.Figure:
    """
    Build frame-by-frame animation of fund movement.
    Each frame adds one transaction hop to the visible graph.
    edges should be sorted chronologically.
    """
    if not nodes or not edges:
        return _empty_replay("No transaction data for replay")

    # Build graph for layout
    G = nx.DiGraph()
    for n in nodes:
        G.add_node(n["id"])
    for e in edges:
        G.add_edge(e["source"], e["target"])

    pos = nx.spring_layout(G, seed=42, k=2 / max(np.sqrt(len(G)), 1))

    # Sort edges by timestamp
    sorted_edges = sorted(edges, key=lambda e: e.get("timestamp", 0))

    # Build frames
    frames = []
    visible_edges = []
    cumulative_risk = 0.0

    for i, edge in enumerate(sorted_edges):
        visible_edges.append(edge)
        cumulative_risk = min(cumulative_risk + 0.15, 1.0)

        edge_x, edge_y = [], []
        for e in visible_edges:
            if e["source"] in pos and e["target"] in pos:
                x0, y0 = pos[e["source"]]
                x1, y1 = pos[e["target"]]
                edge_x += [x0, x1, None]
                edge_y += [y0, y1, None]

        # Active edge highlight (latest)
        active_x, active_y = [], []
        if edge["source"] in pos and edge["target"] in pos:
            ax0, ay0 = pos[edge["source"]]
            ax1, ay1 = pos[edge["target"]]
            active_x = [ax0, ax1, None]
            active_y = [ay0, ay1, None]

        frame = go.Frame(
            data=[
                # All visible edges
                go.Scatter(
                    x=edge_x, y=edge_y, mode="lines",
                    line=dict(color="rgba(231,76,60,0.4)", width=2),
                    hoverinfo="none", showlegend=False,
                ),
                # Active edge glow
                go.Scatter(
                    x=active_x, y=active_y, mode="lines",
                    line=dict(color="#E24B4A", width=4),
                    hoverinfo="none", showlegend=False,
                ),
                # Nodes
                go.Scatter(
                    x=[pos[n["id"]][0] for n in nodes if n["id"] in pos],
                    y=[pos[n["id"]][1] for n in nodes if n["id"] in pos],
                    mode="markers",
                    marker=dict(
                        size=18, color="#378ADD",
                        line=dict(width=2, color="white"),
                    ),
                    hoverinfo="text",
                    hovertext=[n["id"][-8:] for n in nodes if n["id"] in pos],
                    showlegend=False,
                ),
            ],
            name=str(i),
            layout=go.Layout(
                title_text=f"Hop {i+1}/{len(sorted_edges)} | "
                           f"Risk: {cumulative_risk:.0%} | "
                           f"₹{edge.get('amount', 0):,.0f}",
            ),
        )
        frames.append(frame)

    # Base figure (nodes only, no edges initially)
    node_x = [pos[n["id"]][0] for n in nodes if n["id"] in pos]
    node_y = [pos[n["id"]][1] for n in nodes if n["id"] in pos]
    node_hover = [n["id"][-8:] for n in nodes if n["id"] in pos]

    fig = go.Figure(
        data=[
            go.Scatter(x=[], y=[], mode="lines", showlegend=False),
            go.Scatter(x=[], y=[], mode="lines", showlegend=False),
            go.Scatter(
                x=node_x, y=node_y, mode="markers",
                marker=dict(size=18, color="#378ADD",
                           line=dict(width=2, color="white")),
                hoverinfo="text", hovertext=node_hover,
                showlegend=False,
            ),
        ],
        frames=frames,
        layout=go.Layout(
            title=dict(text=title, font=dict(size=16, color="#e0e0e0")),
            updatemenus=[dict(
                type="buttons",
                showactive=False,
                y=1.12, x=0.5, xanchor="center",
                buttons=[
                    dict(label="▶ Replay", method="animate",
                         args=[None, {"frame": {"duration": 800, "redraw": True},
                                      "transition": {"duration": 300},
                                      "fromcurrent": True}]),
                    dict(label="⏸ Pause", method="animate",
                         args=[[None], {"frame": {"duration": 0},
                                        "mode": "immediate",
                                        "transition": {"duration": 0}}]),
                ],
                font=dict(color="#e0e0e0"),
                bgcolor="rgba(50,50,60,0.8)",
                bordercolor="rgba(100,100,120,0.5)",
            )],
            sliders=[dict(
                active=0,
                steps=[dict(
                    method="animate",
                    args=[[f.name], {"frame": {"duration": 300, "redraw": True},
                                     "transition": {"duration": 200}}],
                    label=f"Hop {int(f.name)+1}",
                ) for f in frames] if frames else [],
                currentvalue=dict(prefix="Step: ", font=dict(color="#c0c0c0")),
                font=dict(color="#c0c0c0"),
                bgcolor="rgba(50,50,60,0.5)",
            )] if frames else [],
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            margin=dict(b=10, l=10, r=10, t=80),
        ),
    )
    return fig


def _empty_replay(msg: str) -> go.Figure:
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
