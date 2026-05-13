"""AEGIS — Metrics View Page
Benchmark comparison table, confusion matrix, and ROC curve.
"""
from dash import html, dcc, callback, Input, Output
import dash_bootstrap_components as dbc
import plotly.graph_objects as go
import os, json

MODEL_DIR = os.environ.get("MODEL_DIR", "models/saved")
DATA_DIR = os.environ.get("DATA_DIR", "data/processed")


def get_layout():
    return dbc.Container([
        html.H4("📊 Model Performance", className="text-light mb-3"),
        dbc.Row([
            dbc.Col(dbc.Card([
                dbc.CardHeader("Benchmark: AEGIS vs Rule Engine", className="bg-dark text-light border-secondary"),
                dbc.CardBody(id="benchmark-table-container"),
            ], className="bg-dark border-secondary"), width=7),
            dbc.Col(dbc.Card([
                dbc.CardHeader("Risk Distribution", className="bg-dark text-light border-secondary"),
                dbc.CardBody(dcc.Graph(id="risk-dist-chart", style={"height": "280px"},
                                        config={"displayModeBar": False})),
            ], className="bg-dark border-secondary"), width=5),
        ], className="mb-3"),
        dbc.Row([
            dbc.Col(dbc.Card([
                dbc.CardHeader("Confusion Matrix", className="bg-dark text-light border-secondary"),
                dbc.CardBody(dcc.Graph(id="confusion-matrix-chart", style={"height": "320px"},
                                        config={"displayModeBar": False})),
            ], className="bg-dark border-secondary"), width=6),
            dbc.Col(dbc.Card([
                dbc.CardHeader("Key Metrics", className="bg-dark text-light border-secondary"),
                dbc.CardBody(id="key-metrics-container"),
            ], className="bg-dark border-secondary"), width=6),
        ]),
        dcc.Interval(id="metrics-refresh", interval=30000, n_intervals=0),
    ], fluid=True, className="py-3")


def register_callbacks(app):
    @app.callback(
        [Output("benchmark-table-container", "children"),
         Output("risk-dist-chart", "figure"),
         Output("confusion-matrix-chart", "figure"),
         Output("key-metrics-container", "children")],
        Input("metrics-refresh", "n_intervals"),
    )
    def update_metrics(n):
        lgbm = _load_lgbm_metrics()
        risk = _load_risk_distribution()
        return _benchmark_table(lgbm), _risk_chart(risk), _confusion_chart(lgbm), _key_metrics(lgbm)


def _load_lgbm_metrics():
    p = os.path.join(MODEL_DIR, "lgbm_metrics.json")
    if os.path.exists(p):
        with open(p) as f: return json.load(f)
    return {}


def _load_risk_distribution():
    import pandas as pd
    p = os.path.join(DATA_DIR, "risk_scores.parquet")
    if not os.path.exists(p): return {"critical": 0, "high": 0, "medium": 0, "low": 0}
    df = pd.read_parquet(p)
    return {
        "critical": int((df["risk_score"] >= 75).sum()),
        "high": int(((df["risk_score"] >= 50) & (df["risk_score"] < 75)).sum()),
        "medium": int(((df["risk_score"] >= 25) & (df["risk_score"] < 50)).sum()),
        "low": int((df["risk_score"] < 25).sum()),
    }


def _benchmark_table(m):
    def fmt(v):
        if isinstance(v, float): return f"{v:.4f}"
        return str(v) if v else "Pending"
    rows = [
        ("ROC-AUC", "~0.72", fmt(m.get("roc_auc"))),
        ("Precision", "~0.12", fmt(m.get("precision"))),
        ("Recall", "~0.71", fmt(m.get("recall"))),
        ("F1 Score", "~0.21", fmt(m.get("f1"))),
        ("FP Rate", "~0.28", fmt(m.get("fp_rate"))),
    ]
    return dbc.Table([
        html.Thead(html.Tr([html.Th("Metric", style={"color": "#e0e0e0"}),
                             html.Th("Rule Engine", style={"color": "#888"}),
                             html.Th("AEGIS", style={"color": "#378ADD"})])),
        html.Tbody([html.Tr([html.Td(r[0], style={"color": "#c0c0c0"}),
                             html.Td(r[1], style={"color": "#888"}),
                             html.Td(r[2], style={"color": "#378ADD", "fontWeight": "bold"})]) for r in rows]),
    ], bordered=True, color="dark", hover=True, size="sm", className="mb-0")


def _risk_chart(dist):
    cats = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    vals = [dist["critical"], dist["high"], dist["medium"], dist["low"]]
    colors = ["#E24B4A", "#EF9F27", "#3498DB", "#1D9E75"]
    fig = go.Figure(go.Bar(x=cats, y=vals, marker_color=colors, text=vals, textposition="auto",
                           textfont=dict(color="#e0e0e0")))
    fig.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                      xaxis=dict(tickfont=dict(color="#c0c0c0")),
                      yaxis=dict(tickfont=dict(color="#c0c0c0"), gridcolor="rgba(100,100,100,0.2)"),
                      margin=dict(l=40, r=10, t=10, b=30))
    return fig


def _confusion_chart(m):
    cm = m.get("confusion_matrix", {"tn": 0, "fp": 0, "fn": 0, "tp": 0})
    z = [[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]]
    text = [[f"TN: {cm['tn']}", f"FP: {cm['fp']}"], [f"FN: {cm['fn']}", f"TP: {cm['tp']}"]]
    fig = go.Figure(go.Heatmap(z=z, text=text, texttemplate="%{text}", x=["Pred Legit", "Pred Fraud"],
                                y=["Actual Legit", "Actual Fraud"],
                                colorscale=[[0, "#16213e"], [1, "#E24B4A"]], showscale=False,
                                textfont=dict(size=14, color="#e0e0e0")))
    fig.update_layout(paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
                      xaxis=dict(tickfont=dict(color="#c0c0c0")), yaxis=dict(tickfont=dict(color="#c0c0c0")),
                      margin=dict(l=80, r=10, t=10, b=40))
    return fig


def _key_metrics(m):
    if not m:
        return html.P("Train the model first.", className="text-secondary")
    items = [
        ("🎯 ROC-AUC", m.get("roc_auc"), "#378ADD"),
        ("✅ Precision", m.get("precision"), "#1D9E75"),
        ("🔍 Recall", m.get("recall"), "#EF9F27"),
        ("📐 F1 Score", m.get("f1"), "#9B59B6"),
        ("🚨 FP Rate", m.get("fp_rate"), "#E24B4A"),
    ]
    cards = []
    for label, val, color in items:
        v = f"{val:.4f}" if isinstance(val, float) else "N/A"
        cards.append(dbc.Col(html.Div([
            html.Div(v, style={"fontSize": "24px", "fontWeight": "bold", "color": color}),
            html.Small(label, className="text-secondary"),
        ], className="text-center p-2"), width=4, className="mb-2"))
    return dbc.Row(cards)
