"""
AEGIS Stage 6 — Case Builder & STR Narrative
Generates investigation dossiers with SHAP explanations and LLM narratives.
Supports pluggable LLM providers: anthropic, openai, ollama, template.
"""
import shap
import json
import os
import logging
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Load env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def compute_shap_explanation(model, X_instance, feature_names):
    """Compute SHAP values for a single prediction using TreeExplainer."""
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_instance)
    
    if isinstance(shap_values, list):
        shap_values = shap_values[1]  # class 1 (fraud)
    
    if len(shap_values.shape) == 1:
        vals = shap_values
    else:
        vals = shap_values[0]
    
    contributions = list(zip(feature_names, vals.tolist()))
    contributions.sort(key=lambda x: abs(x[1]), reverse=True)
    top_features = contributions[:10]
    
    base_value = explainer.expected_value
    if isinstance(base_value, (list, np.ndarray)):
        base_value = base_value[1] if len(base_value) > 1 else base_value[0]
    
    return top_features, float(base_value)


def format_risk_explanation(shap_top_features, account_id, risk_score):
    """Format SHAP factors into human-readable risk factors."""
    label_map = {
        "dormancy_flag": "Dormant account suddenly activated",
        "burst_score": "Coordinated burst transfer timing",
        "tx_velocity_1h": "Abnormal transaction velocity",
        "hop_delta_seconds": "Rapid hop-to-hop movement",
        "layering_depth": "Deep layering chain detected",
        "circular_score": "Circular fund routing detected",
        "amount_zscore": "Unusual transaction amount",
        "rapid_withdrawal": "Rapid withdrawal after deposit",
        "in_mule_cluster": "Part of suspected mule cluster",
        "fan_in_score": "High fan-in pattern (many sources)",
        "fan_out_score": "High fan-out pattern (many destinations)",
        "pagerank": "Central node in transaction network",
        "rules_triggered": "Multiple FATF rules triggered",
    }
    
    factors = []
    for feat, val in shap_top_features:
        if val > 0.01:
            # Match partial keys
            label = None
            for key, desc in label_map.items():
                if key in feat:
                    label = desc
                    break
            if label is None:
                label = feat.replace("_", " ").title()
            factors.append(f"+ {label} (impact: {val:.3f})")
    
    return {
        "account_id": account_id,
        "risk_score": risk_score,
        "factors": factors,
    }


# ═══════════════════════════════════════════════════════
# LLM Provider Interface
# ═══════════════════════════════════════════════════════

def _generate_narrative_template(prompt_data: dict) -> str:
    """Template-based STR narrative (no LLM required)."""
    d = prompt_data
    narrative = (
        f"Account {d['account_id']} (risk score: {d['risk_score']}/100) "
        f"was flagged for suspicious activity. "
        f"Analysis reveals {d.get('tx_count', 'multiple')} transactions "
        f"totalling approximately {d.get('total_amount', 'significant')} "
        f"within {d.get('time_window', 'a short period')}. "
    )
    if d.get("factors"):
        narrative += "Key risk indicators include: "
        narrative += "; ".join(f.lstrip("+ ") for f in d["factors"][:3])
        narrative += ". "
    
    if d.get("layering_depth", 0) > 3:
        narrative += (
            f"Fund flow analysis indicates a {d['layering_depth']}-hop "
            f"layering chain through intermediary accounts. "
        )
    if d.get("circular"):
        narrative += "Circular transaction patterns (round-tripping) were detected. "
    if d.get("dormancy_days", 0) > 180:
        narrative += (
            f"The account was dormant for {d['dormancy_days']} days "
            f"before sudden high-value activity. "
        )
    
    narrative += (
        "This pattern is consistent with FATF-identified money laundering "
        "typologies and warrants further investigation by the FIU."
    )
    return narrative


def _generate_narrative_openai(prompt: str) -> str:
    """Generate narrative using OpenAI-compatible API. Wrapped in DLQ at call site."""
    from openai import OpenAI
    client = OpenAI(
        api_key=os.environ.get("OPENAI_API_KEY"),
        base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    )
    model = os.environ.get("OPENAI_MODEL", "gpt-4o")
    response = client.chat.completions.create(
        model=model, max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content


def _generate_narrative_anthropic(prompt: str) -> str:
    """Generate narrative using Anthropic API. Wrapped in DLQ at call site."""
    import anthropic
    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-20250514", max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _generate_narrative_ollama(prompt: str) -> str:
    """Generate narrative using local Ollama. Wrapped in DLQ at call site."""
    import requests
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.environ.get("OLLAMA_MODEL", "llama3")
    resp = requests.post(f"{base_url}/api/generate", json={
        "model": model, "prompt": prompt, "stream": False,
    }, timeout=60)
    return resp.json().get("response", "")


def _build_llm_prompt(account_id, risk_score, shap_factors, tx_summary, graph_evidence):
    """Build the STR prompt for LLM providers."""
    from security.pii_masker import mask_pii
    safe = mask_pii(tx_summary)
    
    factors_text = "\n".join(f"- {f}" for f in shap_factors) if shap_factors else "- No specific factors"
    
    return f"""You are a financial crime investigator writing a Suspicious Transaction Report (STR) narrative for the Financial Intelligence Unit (FIU-IND).

Account Reference: {account_id}
Risk Score: {risk_score}/100

Transaction Summary:
- Total amount: {safe.get('total_amount', 'Unknown')}
- Transaction count: {safe.get('tx_count', 0)}
- Time window: {safe.get('time_window', 'unknown')}
- Accounts involved: {safe.get('account_count', 0)}

Risk Factors:
{factors_text}

Graph Evidence:
- Layering depth: {graph_evidence.get('layering_depth', 0)} hops
- Circular transactions: {graph_evidence.get('circular', False)}
- Connected flagged accounts: {graph_evidence.get('flagged_neighbours', 0)}
- Dormancy period: {graph_evidence.get('dormancy_days', 0)} days

Write a concise STR narrative (2-3 sentences) for FIU submission. Be specific. Use professional regulatory language."""


_STR_CACHE: Optional[Dict[str, str]] = None


def _load_str_cache() -> Dict[str, str]:
    """Lazy-load the pre-generated narrative cache from disk."""
    global _STR_CACHE
    if _STR_CACHE is not None:
        return _STR_CACHE
    path = os.environ.get("STR_CACHE", "data/precomputed/str_narratives.json")
    if os.path.exists(path):
        try:
            with open(path) as f:
                _STR_CACHE = json.load(f)
                logger.info("Loaded %d cached STR narratives from %s", len(_STR_CACHE), path)
                return _STR_CACHE
        except Exception as e:
            logger.warning("Failed to read STR cache %s: %s", path, e)
    _STR_CACHE = {}
    return _STR_CACHE


def generate_str_narrative(account_id, risk_score, shap_factors,
                           transaction_summary, graph_evidence,
                           case_id: Optional[str] = None):
    """Generate STR narrative using configured LLM provider with template fallback.

    Resolution order:
      1. Pre-generated cache at data/precomputed/str_narratives.json (keyed by case_id
         or by account_id) — populated by scripts/precompute_narratives.py.
      2. Live LLM call via LLM_PROVIDER (anthropic / openai / ollama).
      3. Template fallback.

    LLM failures are pushed to the dead-letter queue (monitoring.heartbeat.dlq_push)
    so an operator can retry without losing the request.
    """
    cache = _load_str_cache()
    if cache:
        for key in (case_id, account_id, f"AEGIS-{account_id}-{int(risk_score)}"):
            if key and key in cache:
                return cache[key]

    provider = os.environ.get("LLM_PROVIDER", "template").lower()

    prompt_data = {
        "account_id": account_id, "risk_score": risk_score,
        "factors": shap_factors, **transaction_summary, **graph_evidence,
    }

    if provider == "template":
        return _generate_narrative_template(prompt_data)

    prompt = _build_llm_prompt(account_id, risk_score, shap_factors,
                                transaction_summary, graph_evidence)

    provider_fns = {
        "openai": _generate_narrative_openai,
        "anthropic": _generate_narrative_anthropic,
        "ollama": _generate_narrative_ollama,
    }
    fn = provider_fns.get(provider)
    if fn is None:
        logger.warning("Unknown LLM_PROVIDER=%r; using template", provider)
        return _generate_narrative_template(prompt_data)

    try:
        return fn(prompt)
    except Exception as e:
        logger.warning("LLM (%s) failed: %s. Using template fallback.", provider, e)
        try:
            from monitoring.heartbeat import dlq_push
            dlq_push(
                service=f"llm_{provider}",
                op="str_generate",
                error=str(e),
                payload={
                    "account_id": account_id,
                    "risk_score": risk_score,
                    "provider": provider,
                },
            )
        except Exception:
            pass
        return _generate_narrative_template(prompt_data)


def build_case_dossier(account_id, risk_score, narrative, shap_factors,
                        transaction_df, sankey_json=None, ego_json=None,
                        rules_triggered=None, aggregation=None,
                        shap_top_features=None, case_details=None):
    """Assemble complete investigation package.

    `aggregation` is the dict produced by `aggregate_alerts_to_cases` for this
    account; if present its priority_score, n_alerts_collapsed, etc. are merged in.
    `shap_top_features` should be the raw [(feature, value), ...] from
    compute_shap_explanation (used to build the plain English summary).
    `case_details` carries context (time_window, dormancy_days, n_branches, ...)
    consumed by plain_english.CLAUSE_TEMPLATES.
    """
    from dashboard.components.plain_english import generate_plain_english

    total_amount = (
        float(transaction_df["Amount Paid"].sum())
        if transaction_df is not None and len(transaction_df) > 0
        else 0.0
    )
    case_details = case_details or {}

    plain_english = generate_plain_english(
        account_id=account_id,
        total_amount=total_amount,
        shap_top_features=shap_top_features or shap_factors or [],
        case_details=case_details,
    )

    case_id = (
        aggregation.get("case_id") if aggregation
        else f"AEGIS-{account_id}-{int(risk_score)}"
    )

    dossier = {
        "case_id": case_id,
        "account_reference": account_id,
        "account_id": account_id,
        "risk_score": risk_score,
        "plain_english": plain_english,
        "risk_factors": shap_factors,
        "str_narrative": narrative,
        "transaction_count": len(transaction_df) if transaction_df is not None else 0,
        "total_amount": total_amount,
        "evidence": {
            "sankey_json": sankey_json,
            "ego_network_json": ego_json,
        },
        "generated_at": datetime.now().isoformat(),
        "system_version": "AEGIS-1.0",
        "compliance": {
            "fatf_rules_triggered": rules_triggered or [],
            "nist_rmf_alignment": "Govern + Measure",
        },
    }
    if aggregation:
        dossier.update({
            "priority_score": aggregation.get("priority_score"),
            "n_alerts_collapsed": aggregation.get("n_alerts_collapsed"),
            "rules_triggered": aggregation.get("rules_triggered", []),
            "max_severity_weight": aggregation.get("max_severity_weight"),
            "status": aggregation.get("status", "pending"),
            "assigned_to": aggregation.get("assigned_to", "branch_manager"),
            "unique_counterparties": aggregation.get("unique_counterparties", 0),
        })
    return dossier


def run_stage6(data_dir="data/processed", model_dir="models/saved", top_k=20):
    """Generate case dossiers for top-K aggregated cases (priority-ordered)."""
    from models.lgbm_model import load_lgbm_model
    from pipeline.stage5_fusion import aggregate_alerts_to_cases
    from security.audit_logger import register_pending_alert

    logger.info("=== AEGIS Stage 6 — Case Builder ===")

    model, metrics, feature_names = load_lgbm_model(model_dir)
    risk_df = pd.read_parquet(os.path.join(data_dir, "risk_scores.parquet"))
    feature_df = pd.read_parquet(os.path.join(data_dir, "feature_matrix.parquet"))
    tx_df = pd.read_parquet(os.path.join(data_dir, "transactions.parquet"))

    rule_path = os.path.join(data_dir, "rule_flags.parquet")
    if os.path.exists(rule_path):
        rule_df = pd.read_parquet(rule_path)
    else:
        logger.warning("rule_flags.parquet missing — building cases from risk only.")
        rule_df = pd.DataFrame({"Account": risk_df["Account"], "rule_unknown": 1, "rules_triggered": 1})

    aggregated = aggregate_alerts_to_cases(rule_df, risk_df, transaction_df=tx_df)
    aggregated = aggregated[:top_k]
    logger.info("  Building dossiers for top %d aggregated cases", len(aggregated))

    exclude = {"Account", "is_fraud"}
    feat_cols = [c for c in feature_df.columns if c not in exclude]
    cases = []

    for agg in aggregated:
        account_id = agg["account_id"]
        risk_score = agg["gnn_risk_score"]

        acct_features = feature_df[feature_df["Account"].astype(str) == account_id]
        if len(acct_features) == 0:
            logger.warning("No feature row for %s; skipping dossier", account_id)
            continue

        X_instance = acct_features[feat_cols].values.astype(np.float32)
        try:
            top_feats, _base = compute_shap_explanation(model, X_instance, feat_cols)
            explanation = format_risk_explanation(top_feats, account_id, risk_score)
        except Exception as e:
            logger.warning("SHAP failed for %s: %s", account_id, e)
            explanation = {"account_id": account_id, "risk_score": risk_score, "factors": []}
            top_feats = []

        acct_tx = tx_df[tx_df["Account"].astype(str) == account_id]
        tx_summary = {
            "total_amount": f"₹{acct_tx['Amount Paid'].sum():,.0f}" if len(acct_tx) > 0 else "Unknown",
            "tx_count": len(acct_tx),
            "time_window": (
                f"{acct_tx['Timestamp'].min()} to {acct_tx['Timestamp'].max()}"
                if len(acct_tx) > 0 else "unknown"
            ),
            "account_count": acct_tx["Account.1"].nunique() if len(acct_tx) > 0 else 0,
        }

        layering_depth = (
            int(acct_features["layering_depth"].iloc[0])
            if "layering_depth" in acct_features.columns else 0
        )
        dormancy_days = (
            int(acct_features["last_tx_days_max"].iloc[0])
            if "last_tx_days_max" in acct_features.columns else 0
        )
        graph_evidence = {
            "layering_depth": layering_depth,
            "circular": bool(
                acct_features["circular_score"].iloc[0] > 0
                if "circular_score" in acct_features.columns else False
            ),
            "flagged_neighbours": 0,
            "dormancy_days": dormancy_days,
        }

        case_details = {
            "time_window": _summarize_time_window(acct_tx),
            "layering_depth": layering_depth,
            "last_tx_days": dormancy_days,
            "last_tx_days_max": dormancy_days,
            "dormancy_days": dormancy_days,
            "n_branches": agg.get("unique_counterparties", 0),
        }

        case_id_for_cache = (
            agg.get("case_id") or f"AEGIS-{account_id}-{int(risk_score)}"
        )
        narrative = generate_str_narrative(
            account_id, risk_score, explanation["factors"],
            tx_summary, graph_evidence,
            case_id=case_id_for_cache,
        )

        case = build_case_dossier(
            account_id, risk_score, narrative, explanation["factors"],
            acct_tx,
            rules_triggered=agg["rules_triggered"],
            aggregation=agg,
            shap_top_features=top_feats,
            case_details=case_details,
        )
        cases.append(case)
        register_pending_alert(case["case_id"], "branch_manager",
                               metadata={"account_id": account_id,
                                         "priority_score": agg["priority_score"]})
        logger.info("  Case %s: priority=%.3f rules=%d",
                    case["case_id"], agg["priority_score"], agg["n_alerts_collapsed"])

    # Save cases
    os.makedirs(os.path.join(data_dir, "cases"), exist_ok=True)
    for case in cases:
        path = os.path.join(data_dir, "cases", f"{case['case_id']}.json")
        with open(path, "w") as f:
            json.dump(case, f, indent=2, default=str)

    all_cases_path = os.path.join(data_dir, "all_cases.json")
    with open(all_cases_path, "w") as f:
        json.dump(cases, f, indent=2, default=str)

    logger.info("Generated %d case dossiers.", len(cases))
    return cases


def _summarize_time_window(acct_tx) -> str:
    """Short human-readable window like '4h 02m' or '2 days'."""
    if acct_tx is None or len(acct_tx) == 0 or "Timestamp" not in acct_tx.columns:
        return "a short period"
    try:
        ts_min = pd.to_datetime(acct_tx["Timestamp"].min())
        ts_max = pd.to_datetime(acct_tx["Timestamp"].max())
        delta = ts_max - ts_min
        secs = int(delta.total_seconds())
        if secs <= 0:
            return "under a minute"
        if secs < 3600:
            return f"{secs // 60} minutes"
        if secs < 86400:
            h = secs // 3600
            m = (secs % 3600) // 60
            return f"{h}h {m:02d}m"
        days = secs // 86400
        return f"{days} day{'s' if days != 1 else ''}"
    except Exception:
        return "a short period"


if __name__ == "__main__":
    cases = run_stage6()
    print(f"\nGenerated {len(cases)} case dossiers.")
