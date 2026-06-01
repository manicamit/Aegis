"""
AEGIS — Plain English Explanation Builder

Converts SHAP feature contributions + case details into a single,
non-technical sentence that any branch manager or non-technical
judge understands immediately.
"""
from typing import Any, List, Optional, Sequence, Tuple


def _extract(details: dict, key: str, default: str = "multiple") -> str:
    val = details.get(key)
    if val is None or val == "":
        return default
    return str(val)


CLAUSE_TEMPLATES: dict[str, dict] = {
    "dormancy_flag": {
        "template": "after {days} days dormant",
        "extract": lambda d: {"days": _extract(d, "last_tx_days", "unknown")},
    },
    "last_tx_days_max": {
        "template": "after {days} days dormant",
        "extract": lambda d: {"days": _extract(d, "last_tx_days_max",
                                               _extract(d, "dormancy_days", "unknown"))},
    },
    "burst_score": {"template": "with coordinated burst timing"},
    "tx_velocity_1h": {"template": "at unusually high speed"},
    "tx_velocity_24h": {"template": "with rapid 24-hour movement"},
    "hop_delta_seconds": {"template": "with rapid hop-to-hop movement"},
    "layering_depth": {
        "template": "through {hops} intermediary layers",
        "extract": lambda d: {"hops": _extract(d, "layering_depth", "multiple")},
    },
    "circular_score": {"template": "routing funds in a circle back to origin"},
    "amount_zscore": {"template": "with unusual transaction amounts"},
    "rapid_withdrawal": {"template": "withdrawing funds immediately after deposit"},
    "split_consolidation": {
        "template": "splitting across {n_branches} branches and recombining",
        "extract": lambda d: {"n_branches": _extract(d, "n_branches", "multiple")},
    },
    "profile_mismatch": {"template": "inconsistent with account profile"},
    "gnn_embedding_risk": {"template": "connected to a high-risk transaction network"},
    "structuring_flag": {"template": "with multiple sub-threshold transfers"},
    "rule_structuring": {"template": "with multiple sub-threshold transfers"},
    "rule_fan_in_fan_out": {"template": "with mule-pattern fan-in / fan-out"},
    "rule_rapid_movement": {"template": "with multiple transfers in under an hour"},
    "rule_round_tripping": {"template": "routing funds in a circle back to origin"},
    "rule_dormant_activation": {"template": "after a long dormant period"},
    "rule_profile_mismatch": {"template": "inconsistent with account profile"},
}


def _format_amount(total_amount: float) -> str:
    if total_amount is None:
        return "an unknown amount"
    try:
        amt = float(total_amount)
    except (TypeError, ValueError):
        return str(total_amount)
    if amt >= 10_000_000:
        return f"₹{amt/10_000_000:.1f}Cr"
    if amt >= 100_000:
        return f"₹{amt/100_000:.1f}L"
    return f"₹{amt:,.0f}"


def _parse_feature_value(item: Any) -> Tuple[str, float]:
    """Accept (name, value) tuples OR pre-formatted strings like '+ feature_name (0.12)'."""
    if isinstance(item, tuple) and len(item) >= 2:
        return str(item[0]), float(item[1])
    if isinstance(item, dict):
        return str(item.get("feature", "")), float(item.get("impact", 0.0))
    if isinstance(item, str):
        s = item.lstrip("+ ").strip()
        if "(" in s and s.endswith(")"):
            name, _, rest = s.rpartition("(")
            try:
                return name.strip(), float(rest.rstrip(")"))
            except ValueError:
                return s, 0.0
        return s, 0.0
    return "unknown", 0.0


def generate_plain_english(
    account_id: str,
    total_amount: float,
    shap_top_features: Sequence[Any],
    case_details: Optional[dict] = None,
) -> str:
    """Build a single human-readable sentence summarising the case."""
    case_details = case_details or {}
    pairs = [_parse_feature_value(x) for x in (shap_top_features or [])]
    active = [(f, v) for f, v in pairs if v > 0.05 and f]
    if not active:
        active = [(f, v) for f, v in pairs if f][:3]

    clauses: List[str] = []
    seen: set[str] = set()
    for feat, _val in active[:4]:
        tmpl_info = CLAUSE_TEMPLATES.get(feat)
        if tmpl_info is None:
            phrase = feat.replace("_", " ").strip()
            if phrase and phrase not in seen:
                clauses.append(phrase)
                seen.add(phrase)
            continue
        template = tmpl_info["template"]
        if "extract" in tmpl_info:
            try:
                params = tmpl_info["extract"](case_details)
                template = template.format(**params)
            except Exception:
                pass
        if template not in seen:
            clauses.append(template)
            seen.add(template)

    amt_str = _format_amount(total_amount)
    time_window = case_details.get("time_window", "a short period")

    if len(clauses) == 0:
        clause_str = "showing patterns consistent with money-laundering typologies"
    elif len(clauses) == 1:
        clause_str = clauses[0]
    else:
        clause_str = ", ".join(clauses[:-1]) + f", and {clauses[-1]}"

    return f"{account_id} moved {amt_str} in {time_window} — {clause_str}."


def format_for_mobile(plain_english: str) -> dict:
    """Mobile-optimised payload with the plain English summary."""
    return {
        "summary": plain_english,
        "display_mode": "plain_english",
        "toggle_label": "Show technical details →",
    }


def format_for_dashboard(
    plain_english: str,
    shap_top_features: Sequence[Any],
) -> dict:
    """Dashboard payload exposing both plain English and SHAP factors."""
    factors = []
    for item in shap_top_features or []:
        feat, val = _parse_feature_value(item)
        factors.append({"feature": feat, "impact": round(val, 4)})
    return {
        "plain_english": plain_english,
        "shap_factors": factors,
        "default_view": "plain_english",
        "toggle_label": "Show SHAP details →",
    }
