"""
AEGIS — Dash Dashboard Entry Point
Multi-page investigator workspace with dark theme.
"""
import dash
from dash import html, dcc, Input, Output
import dash_bootstrap_components as dbc
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Initialize app with dark Bootstrap theme
app = dash.Dash(
    __name__,
    suppress_callback_exceptions=True,
    external_stylesheets=[dbc.themes.DARKLY],
    title="AEGIS — AML Intelligence",
    meta_tags=[{"name": "viewport", "content": "width=device-width, initial-scale=1"}],
)
server = app.server

# Import pages
from dashboard.pages import alert_queue, graph_view, case_report, metrics_view

# Navigation bar
navbar = dbc.Navbar(
    dbc.Container([
        dbc.NavbarBrand([
            html.Span("🛡️ ", style={"fontSize": "24px"}),
            html.Span("AEGIS", style={
                "fontWeight": "bold", "fontSize": "20px",
                "background": "linear-gradient(90deg, #378ADD, #E24B4A)",
                "WebkitBackgroundClip": "text",
                "WebkitTextFillColor": "transparent",
            }),
            html.Span(" — Alert Investigation Workspace",
                       style={"fontSize": "13px", "color": "#888", "marginLeft": "10px"}),
        ], className="d-flex align-items-center"),
        dbc.Nav([
            dbc.NavItem(dbc.NavLink("🔔 Alerts", href="/", active="exact",
                                     className="text-light")),
            dbc.NavItem(dbc.NavLink("🕸️ Network", href="/graph", active="exact",
                                     className="text-light")),
            dbc.NavItem(dbc.NavLink("📋 Cases", href="/cases", active="exact",
                                     className="text-light")),
            dbc.NavItem(dbc.NavLink("📊 Metrics", href="/metrics", active="exact",
                                     className="text-light")),
        ], className="ms-auto", navbar=True),
    ], fluid=True),
    color="dark", dark=True, className="mb-0",
    style={"borderBottom": "2px solid #E24B4A"},
)

# Layout
app.layout = html.Div([
    dcc.Location(id="url", refresh=False),
    dcc.Store(id="selected-account-store"),
    navbar,
    html.Div(id="page-content", style={
        "backgroundColor": "#0a0a1a",
        "minHeight": "calc(100vh - 56px)",
    }),
], style={"backgroundColor": "#0a0a1a"})


# Page routing
@app.callback(Output("page-content", "children"), Input("url", "pathname"))
def display_page(pathname):
    if pathname == "/graph":
        return graph_view.get_layout()
    elif pathname == "/cases":
        return case_report.get_layout()
    elif pathname == "/metrics":
        return metrics_view.get_layout()
    return alert_queue.get_layout()


# Register page callbacks
alert_queue.register_callbacks(app)
graph_view.register_callbacks(app)
case_report.register_callbacks(app)
metrics_view.register_callbacks(app)


if __name__ == "__main__":
    port = int(os.environ.get("DASH_PORT", 8050))
    debug = os.environ.get("DASH_DEBUG", "true").lower() == "true"
    app.run(debug=debug, host="0.0.0.0", port=port)
