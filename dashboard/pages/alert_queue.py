"""AEGIS — Alert Queue Page
Sortable alert list with risk scores and click-to-investigate.
"""
from dash import html, dcc, callback, Input, Output, State, dash_table
import dash_bootstrap_components as dbc
import pandas as pd
import os
import requests

DATA_DIR = os.environ.get("DATA_DIR", "data/processed")
API_BASE = os.environ.get("API_BASE_URL", "http://localhost:8000")


def get_layout():
    return dbc.Container([
        dbc.Row([
            dbc.Col([
                html.H4("🔔 Alert Queue", className="text-light mb-3"),
                html.P("Accounts flagged by AEGIS, sorted by risk score.",
                       className="text-secondary mb-3"),
            ], width=8),
            dbc.Col([
                dbc.InputGroup([
                    dbc.InputGroupText("Min Risk", className="bg-dark text-light border-secondary"),
                    dbc.Input(
                        id="alert-min-score", type="number",
                        value=25, min=0, max=100, step=5,
                        className="bg-dark text-light border-secondary",
                    ),
                    dbc.Button("Refresh", id="alert-refresh-btn",
                               color="primary", outline=True, size="sm"),
                ], size="sm"),
            ], width=4, className="d-flex align-items-center"),
        ], className="mb-3"),

        dbc.Card([
            dbc.CardBody([
                html.Div(id="alert-table-container"),
            ]),
        ], className="bg-dark border-secondary"),

        dcc.Store(id="selected-account-store"),

    ], fluid=True, className="py-3")


def register_callbacks(app):
    @app.callback(
        Output("alert-table-container", "children"),
        [Input("alert-refresh-btn", "n_clicks"),
         Input("alert-min-score", "value")],
    )
    def update_alert_table(n_clicks, min_score):
        min_score = min_score or 25
        df = _load_alerts(min_score)

        if df.empty:
            return html.P("No alerts found. Run the pipeline first.",
                          className="text-secondary text-center py-4")

        # Format for display
        display_df = df[["Account", "risk_score", "risk_label"]].copy()
        display_df.columns = ["Account ID", "Risk Score", "Risk Level"]
        display_df["Risk Score"] = display_df["Risk Score"].round(1)

        return dash_table.DataTable(
            id="alert-datatable",
            columns=[{"name": c, "id": c} for c in display_df.columns],
            data=display_df.to_dict("records"),
            sort_action="native",
            sort_mode="single",
            sort_by=[{"column_id": "Risk Score", "direction": "desc"}],
            row_selectable="single",
            selected_rows=[],
            page_size=20,
            style_table={"overflowX": "auto"},
            style_header={
                "backgroundColor": "#1a1a2e",
                "color": "#e0e0e0",
                "fontWeight": "bold",
                "borderBottom": "2px solid #E24B4A",
            },
            style_cell={
                "backgroundColor": "#16213e",
                "color": "#c0c0c0",
                "border": "1px solid #2a2a4a",
                "fontSize": "13px",
                "padding": "8px 12px",
            },
            style_data_conditional=[
                {"if": {"filter_query": "{Risk Score} >= 75"},
                 "backgroundColor": "rgba(226,75,74,0.15)",
                 "color": "#E24B4A", "fontWeight": "bold"},
                {"if": {"filter_query": "{Risk Score} >= 50 && {Risk Score} < 75"},
                 "backgroundColor": "rgba(239,159,39,0.1)",
                 "color": "#EF9F27"},
                {"if": {"state": "selected"},
                 "backgroundColor": "rgba(55,138,221,0.2)",
                 "border": "1px solid #378ADD"},
            ],
        )

    @app.callback(
        Output("selected-account-store", "data"),
        Input("alert-datatable", "selected_rows"),
        State("alert-datatable", "data"),
        prevent_initial_call=True,
    )
    def on_row_select(selected_rows, data):
        if selected_rows and data:
            return data[selected_rows[0]]["Account ID"]
        return None


def _load_alerts(min_score=25):
    """Load risk scores from parquet."""
    path = os.path.join(DATA_DIR, "risk_scores.parquet")
    if not os.path.exists(path):
        return pd.DataFrame()
    df = pd.read_parquet(path)
    df = df[df["risk_score"] >= min_score].sort_values("risk_score", ascending=False)
    return df.head(200)
