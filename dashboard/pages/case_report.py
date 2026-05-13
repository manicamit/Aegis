"""AEGIS — Case Report Page
Case dossier display with SHAP explanations and STR narratives.
"""
from dash import html, dcc, callback, Input, Output, State
import dash_bootstrap_components as dbc
from dashboard.components.shap_panel import build_shap_waterfall
import pandas as pd
import os, json, glob

DATA_DIR = os.environ.get("DATA_DIR", "data/processed")


def get_layout():
    return dbc.Container([
        dbc.Row([
            dbc.Col(html.H4("📋 Case Reports", className="text-light mb-3"), width=8),
            dbc.Col(dbc.InputGroup([
                dbc.Input(id="case-account-input", type="text", placeholder="Account ID...",
                          className="bg-dark text-light border-secondary"),
                dbc.Button("View", id="case-view-btn", color="primary", outline=True, size="sm"),
            ], size="sm"), width=4, className="d-flex align-items-center"),
        ], className="mb-3"),
        dbc.Row([
            dbc.Col(dbc.Card([
                dbc.CardHeader("Cases", className="bg-dark text-light border-secondary"),
                dbc.CardBody(html.Div(id="case-list-container")),
            ], className="bg-dark border-secondary"), width=4),
            dbc.Col(dbc.Card([
                dbc.CardHeader(id="case-detail-header", children="Select a case",
                               className="bg-dark text-light border-secondary"),
                dbc.CardBody(html.Div(id="case-detail-container")),
            ], className="bg-dark border-secondary"), width=8),
        ]),
    ], fluid=True, className="py-3")


def register_callbacks(app):
    @app.callback(Output("case-list-container", "children"), Input("case-view-btn", "n_clicks"))
    def load_case_list(n):
        cases = _load_all_cases()
        if not cases:
            return html.P("No cases yet.", className="text-secondary text-center py-4")
        items = []
        for c in cases[:30]:
            s = c.get("risk_score", 0)
            bc = "danger" if s >= 75 else ("warning" if s >= 50 else "info")
            items.append(dbc.ListGroupItem([
                html.Div([html.Span(c.get("case_id", ""), style={"fontSize": "12px", "fontWeight": "bold"}),
                          dbc.Badge(f"{s:.0f}", color=bc, className="ms-2", pill=True)]),
                html.Small(c.get("account_reference", ""), className="text-secondary"),
            ], className="bg-dark text-light border-secondary py-2"))
        return dbc.ListGroup(items, flush=True)

    @app.callback(
        [Output("case-detail-container", "children"), Output("case-detail-header", "children")],
        Input("case-view-btn", "n_clicks"), State("case-account-input", "value"))
    def show_detail(n, acc_id):
        if not acc_id:
            return html.P("Enter an account ID.", className="text-secondary py-4"), "Select a case"
        case = _find_case(acc_id)
        if not case:
            return html.P(f"No case for {acc_id}.", className="text-warning py-4"), "Not found"
        return _render(case), f"Case: {case.get('case_id', '')}"

    @app.callback(Output("case-account-input", "value"), Input("selected-account-store", "data"),
                  prevent_initial_call=True)
    def autofill(a):
        return a or ""


def _render(case):
    s = case.get("risk_score", 0)
    bc = "#E24B4A" if s >= 75 else ("#EF9F27" if s >= 50 else "#1D9E75")
    lbl = "CRITICAL" if s >= 75 else ("HIGH" if s >= 50 else "LOW")
    narrative = case.get("str_narrative", "No narrative")
    factors = case.get("risk_factors", [])
    shap_data = []
    for f in factors:
        parts = f.split("(impact: ")
        if len(parts) == 2:
            try: shap_data.append((parts[0].strip("+ ").strip(), float(parts[1].rstrip(")"))))
            except ValueError: pass
    children = [
        html.Div([html.Span(f"{s:.0f}", style={"fontSize":"48px","fontWeight":"bold","color":bc}),
                   html.Span("/100", style={"fontSize":"20px","color":"#888"}),
                   dbc.Badge(lbl, style={"backgroundColor":bc,"fontSize":"14px"}, className="ms-3")],
                 className="d-flex align-items-center mb-3"),
        html.Small(f"Account: {case.get('account_reference','')} | Txns: {case.get('transaction_count',0)} | Total: ₹{case.get('total_amount',0):,.0f}", className="text-secondary"),
        html.Hr(style={"borderColor":"#333"}),
        html.H6("📝 STR Narrative", className="text-light"),
        dbc.Card(dbc.CardBody(html.P(narrative, style={"color":"#c0c0c0","lineHeight":"1.7","fontStyle":"italic"})),
                 className="bg-dark border-secondary mb-3", style={"borderLeft":f"3px solid {bc}"}),
        html.H6("⚠️ Risk Factors", className="text-light"),
    ]
    for f in factors[:8]:
        children.append(html.Div(f"  {f}", className="text-secondary", style={"fontSize":"13px"}))
    if shap_data:
        children += [html.Hr(style={"borderColor":"#333"}), html.H6("📊 SHAP", className="text-light"),
                     dcc.Graph(figure=build_shap_waterfall(shap_data, final_score=s),
                               config={"displayModeBar":False}, style={"height":"300px"})]
    return html.Div(children)


def _load_all_cases():
    p = os.path.join(DATA_DIR, "all_cases.json")
    if os.path.exists(p):
        with open(p) as f: return json.load(f)
    cd = os.path.join(DATA_DIR, "cases"); cases = []
    if os.path.exists(cd):
        for fp in sorted(glob.glob(os.path.join(cd, "AEGIS-*.json"))):
            with open(fp) as f: cases.append(json.load(f))
    return cases


def _find_case(aid):
    for c in _load_all_cases():
        if str(c.get("account_reference", "")) == str(aid): return c
    return None
