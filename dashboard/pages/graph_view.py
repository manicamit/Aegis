"""AEGIS — Graph View Page
Interactive ego network + Sankey toggle with replay timeline controls.
"""
from dash import html, dcc, callback, Input, Output, State
import dash_bootstrap_components as dbc
import pandas as pd
import pickle
import os
import networkx as nx

from dashboard.components.ego_network import build_ego_network_figure
from dashboard.components.sankey import build_sankey
from dashboard.components.replay_timeline import build_replay_animation

DATA_DIR = os.environ.get("DATA_DIR", "data/processed")


def get_layout():
    return dbc.Container([
        dbc.Row([
            dbc.Col([
                html.H4("🕸️ Network Investigation", className="text-light mb-3"),
            ], width=6),
            dbc.Col([
                dbc.InputGroup([
                    dbc.InputGroupText("Account", className="bg-dark text-light border-secondary"),
                    dbc.Input(
                        id="graph-account-input", type="text",
                        placeholder="Enter Account ID...",
                        className="bg-dark text-light border-secondary",
                    ),
                    dbc.Button("Investigate", id="graph-investigate-btn",
                               color="danger", outline=True, size="sm"),
                ], size="sm"),
            ], width=6, className="d-flex align-items-center"),
        ], className="mb-3"),

        dbc.Row([
            dbc.Col([
                dbc.ButtonGroup([
                    dbc.Button("Ego Network", id="btn-ego", color="primary",
                               outline=True, active=True, size="sm"),
                    dbc.Button("Sankey Flow", id="btn-sankey", color="primary",
                               outline=True, size="sm"),
                    dbc.Button("Replay", id="btn-replay", color="danger",
                               outline=True, size="sm"),
                ], className="mb-3"),
            ]),
        ]),

        dbc.Card([
            dbc.CardBody([
                dcc.Loading(
                    dcc.Graph(id="graph-display", style={"height": "550px"},
                              config={"displayModeBar": True, "responsive": True}),
                    type="circle", color="#378ADD",
                ),
            ]),
        ], className="bg-dark border-secondary"),

        dbc.Row([
            dbc.Col([
                html.Div(id="graph-stats", className="text-secondary mt-2",
                          style={"fontSize": "12px"}),
            ]),
        ]),

        dcc.Store(id="graph-view-mode", data="ego"),

    ], fluid=True, className="py-3")


def register_callbacks(app):
    @app.callback(
        Output("graph-view-mode", "data"),
        [Input("btn-ego", "n_clicks"),
         Input("btn-sankey", "n_clicks"),
         Input("btn-replay", "n_clicks")],
        prevent_initial_call=True,
    )
    def switch_view(ego_clicks, sankey_clicks, replay_clicks):
        from dash import ctx
        if ctx.triggered_id == "btn-sankey":
            return "sankey"
        elif ctx.triggered_id == "btn-replay":
            return "replay"
        return "ego"

    @app.callback(
        [Output("graph-display", "figure"),
         Output("graph-stats", "children")],
        [Input("graph-investigate-btn", "n_clicks"),
         Input("graph-view-mode", "data")],
        [State("graph-account-input", "value")],
    )
    def update_graph(n_clicks, view_mode, account_id):
        import plotly.graph_objects as go

        if not account_id:
            empty = go.Figure()
            empty.add_annotation(
                text="Enter an Account ID and click 'Investigate'",
                x=0.5, y=0.5, xref="paper", yref="paper",
                showarrow=False, font=dict(size=16, color="#888"),
            )
            empty.update_layout(
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
                xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            )
            return empty, ""

        # Load graph data
        try:
            nodes, edges = _get_graph_data(account_id)
        except Exception as e:
            empty = go.Figure()
            empty.add_annotation(
                text=f"Error: {str(e)}", x=0.5, y=0.5,
                xref="paper", yref="paper",
                showarrow=False, font=dict(size=14, color="#E24B4A"),
            )
            empty.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
            return empty, ""

        stats = f"Nodes: {len(nodes)} | Edges: {len(edges)} | View: {view_mode}"

        if view_mode == "sankey":
            paths = [{"source": e["source"], "target": e["target"],
                      "amount": e.get("amount", 0), "hop_index": 0}
                     for e in edges]
            fig = build_sankey(paths, title=f"Fund Flow — {account_id}")
        elif view_mode == "replay":
            fig = build_replay_animation(nodes, edges,
                                          title=f"Transaction Replay — {account_id}")
        else:
            fig = build_ego_network_figure(nodes, edges, center_node=account_id,
                                            title=f"Ego Network — {account_id}")

        return fig, stats

    # Sync button active states
    @app.callback(
        [Output("btn-ego", "active"),
         Output("btn-sankey", "active"),
         Output("btn-replay", "active")],
        Input("graph-view-mode", "data"),
    )
    def update_button_states(mode):
        return mode == "ego", mode == "sankey", mode == "replay"

    # Auto-fill from alert queue selection
    @app.callback(
        Output("graph-account-input", "value"),
        Input("selected-account-store", "data"),
        prevent_initial_call=True,
    )
    def autofill_from_alert(account_id):
        return account_id or ""


def _get_graph_data(account_id, radius=2):
    """Load ego network data from the graph file."""
    nx_path = os.path.join(DATA_DIR, "transaction_graph.gpickle")
    if not os.path.exists(nx_path):
        raise FileNotFoundError("Transaction graph not built. Run pipeline first.")

    with open(nx_path, "rb") as f:
        G = pickle.load(f)

    node = f"ACC_{account_id}" if not account_id.startswith("ACC_") else account_id
    if node not in G:
        raise ValueError(f"Account {account_id} not found in graph")

    sub = nx.ego_graph(G, node, radius=radius, undirected=True)

    # Load risk scores
    risk_map = {}
    risk_path = os.path.join(DATA_DIR, "risk_scores.parquet")
    if os.path.exists(risk_path):
        risk_df = pd.read_parquet(risk_path)
        for _, r in risk_df.iterrows():
            key = f"ACC_{r['Account']}" if not str(r["Account"]).startswith("ACC_") else str(r["Account"])
            risk_map[key] = r["risk_score"]

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

    return nodes, edges
