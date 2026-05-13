"""AEGIS — SHAP Explanation Panel Component
Horizontal waterfall bar chart showing SHAP feature contributions.
"""
import plotly.graph_objects as go
from typing import List, Tuple


def build_shap_waterfall(
    top_features: List[Tuple[str, float]],
    base_value: float = 0.5,
    final_score: float = 0,
    title: str = None,
) -> go.Figure:
    """
    Build a horizontal waterfall bar chart for SHAP values.
    Positive SHAP = pushes toward fraud (red).
    Negative SHAP = pushes away from fraud (green).
    """
    if not top_features:
        return _empty_shap("No SHAP data available")

    names = [_format_feature_name(f[0]) for f in top_features]
    values = [f[1] for f in top_features]
    colors = ["#E24B4A" if v > 0 else "#1D9E75" for v in values]

    fig = go.Figure(go.Bar(
        x=values,
        y=names,
        orientation="h",
        marker_color=colors,
        text=[f"{v:+.3f}" for v in values],
        textposition="auto",
        textfont=dict(color="#e0e0e0", size=11),
    ))

    if title is None:
        title = f"Risk Score: {final_score:.0f}/100 — Why was this flagged?"

    fig.update_layout(
        title=dict(text=title, font=dict(size=14, color="#e0e0e0")),
        xaxis_title="SHAP Contribution",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        yaxis=dict(autorange="reversed", tickfont=dict(color="#c0c0c0")),
        xaxis=dict(
            tickfont=dict(color="#c0c0c0"),
            title_font=dict(color="#c0c0c0"),
            gridcolor="rgba(100,100,100,0.3)",
            zeroline=True,
            zerolinecolor="rgba(200,200,200,0.5)",
        ),
        margin=dict(l=200, r=20, t=40, b=40),
        height=max(250, len(top_features) * 35 + 80),
    )
    return fig


def build_risk_factors_html(explanation: dict) -> str:
    """Build HTML block showing human-readable risk factors."""
    if not explanation or not explanation.get("factors"):
        return '<div class="risk-factors"><p style="color:#888">No risk factors available</p></div>'

    risk_score = explanation.get("risk_score", 0)

    # Color based on score
    if risk_score >= 75:
        badge_color = "#E24B4A"
        label = "CRITICAL"
    elif risk_score >= 50:
        badge_color = "#EF9F27"
        label = "HIGH"
    elif risk_score >= 25:
        badge_color = "#3498DB"
        label = "MEDIUM"
    else:
        badge_color = "#1D9E75"
        label = "LOW"

    html = f"""
    <div style="background:rgba(30,30,40,0.7); border-radius:8px; padding:16px; margin:8px 0;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div style="background:{badge_color}; color:white; padding:6px 16px;
                        border-radius:20px; font-weight:bold; font-size:18px;">
                {risk_score:.0f}/100
            </div>
            <span style="color:{badge_color}; font-weight:bold; font-size:14px;">{label}</span>
        </div>
        <div style="color:#c0c0c0; font-size:13px; line-height:1.8;">
    """

    for factor in explanation["factors"][:8]:
        html += f'<div style="padding:2px 0;">⚠️ {factor}</div>'

    html += "</div></div>"
    return html


def _format_feature_name(name: str) -> str:
    """Convert feature column names to readable labels."""
    label_map = {
        "dormancy_flag": "Dormant Account Activation",
        "burst_score": "Burst Transfer Timing",
        "tx_velocity_1h": "Transaction Velocity",
        "hop_delta_seconds": "Rapid Hop Movement",
        "layering_depth": "Layering Chain Depth",
        "circular_score": "Circular Fund Routing",
        "amount_zscore": "Unusual Amount",
        "rapid_withdrawal": "Rapid Withdrawal",
        "in_mule_cluster": "Mule Cluster Member",
        "fan_in_score": "High Fan-In",
        "fan_out_score": "High Fan-Out",
        "pagerank": "Network Centrality",
        "rules_triggered": "FATF Rules Triggered",
        "betweenness_centrality": "Bridge Node Score",
        "degree_ratio": "In/Out Degree Ratio",
        "cluster_density": "Cluster Density",
    }
    for key, label in label_map.items():
        if key in name:
            return label
    return name.replace("_", " ").title()


def _empty_shap(msg: str) -> go.Figure:
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
