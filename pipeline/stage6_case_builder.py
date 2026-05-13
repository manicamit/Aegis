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
    """Generate narrative using OpenAI-compatible API."""
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
    """Generate narrative using Anthropic API."""
    import anthropic
    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-20250514", max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _generate_narrative_ollama(prompt: str) -> str:
    """Generate narrative using local Ollama."""
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


def generate_str_narrative(account_id, risk_score, shap_factors,
                           transaction_summary, graph_evidence):
    """Generate STR narrative using configured LLM provider with fallback."""
    provider = os.environ.get("LLM_PROVIDER", "template").lower()
    
    if provider == "template":
        prompt_data = {
            "account_id": account_id,
            "risk_score": risk_score,
            "factors": shap_factors,
            **transaction_summary,
            **graph_evidence,
        }
        return _generate_narrative_template(prompt_data)
    
    prompt = _build_llm_prompt(account_id, risk_score, shap_factors,
                                transaction_summary, graph_evidence)
    
    try:
        if provider == "openai":
            return _generate_narrative_openai(prompt)
        elif provider == "anthropic":
            return _generate_narrative_anthropic(prompt)
        elif provider == "ollama":
            return _generate_narrative_ollama(prompt)
    except Exception as e:
        logger.warning(f"LLM ({provider}) failed: {e}. Using template fallback.")
    
    # Fallback
    prompt_data = {
        "account_id": account_id, "risk_score": risk_score,
        "factors": shap_factors, **transaction_summary, **graph_evidence,
    }
    return _generate_narrative_template(prompt_data)


def build_case_dossier(account_id, risk_score, narrative, shap_factors,
                        transaction_df, sankey_json=None, ego_json=None,
                        rules_triggered=None):
    """Assemble complete investigation package."""
    return {
        "case_id": f"AEGIS-{account_id}-{int(risk_score)}",
        "account_reference": account_id,
        "risk_score": risk_score,
        "risk_factors": shap_factors,
        "str_narrative": narrative,
        "transaction_count": len(transaction_df) if transaction_df is not None else 0,
        "total_amount": float(transaction_df["Amount Paid"].sum()) if transaction_df is not None else 0,
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


def run_stage6(data_dir="data/processed", model_dir="models/saved", top_k=20):
    """Generate case dossiers for top-K risky accounts."""
    from models.lgbm_model import load_lgbm_model
    
    logger.info("=== AEGIS Stage 6 — Case Builder ===")
    
    model, metrics, feature_names = load_lgbm_model(model_dir)
    risk_df = pd.read_parquet(os.path.join(data_dir, "risk_scores.parquet"))
    feature_df = pd.read_parquet(os.path.join(data_dir, "feature_matrix.parquet"))
    tx_df = pd.read_parquet(os.path.join(data_dir, "transactions.parquet"))
    
    top_accounts = risk_df.head(top_k)
    cases = []
    
    for _, row in top_accounts.iterrows():
        account_id = str(row["Account"])
        risk_score = float(row["risk_score"])
        
        # Get SHAP explanation
        acct_features = feature_df[feature_df["Account"].astype(str) == account_id]
        if len(acct_features) == 0:
            continue
        
        exclude = {"Account", "is_fraud"}
        feat_cols = [c for c in feature_df.columns if c not in exclude]
        X_instance = acct_features[feat_cols].values.astype(np.float32)
        
        try:
            top_feats, base_val = compute_shap_explanation(model, X_instance, feat_cols)
            explanation = format_risk_explanation(top_feats, account_id, risk_score)
        except Exception as e:
            logger.warning(f"SHAP failed for {account_id}: {e}")
            explanation = {"account_id": account_id, "risk_score": risk_score, "factors": []}
            top_feats = []
        
        # Transaction summary
        acct_tx = tx_df[tx_df["Account"].astype(str) == account_id]
        tx_summary = {
            "total_amount": f"₹{acct_tx['Amount Paid'].sum():,.0f}" if len(acct_tx) > 0 else "Unknown",
            "tx_count": len(acct_tx),
            "time_window": f"{acct_tx['Timestamp'].min()} to {acct_tx['Timestamp'].max()}" if len(acct_tx) > 0 else "unknown",
            "account_count": acct_tx["Account.1"].nunique() if len(acct_tx) > 0 else 0,
        }
        
        graph_evidence = {
            "layering_depth": int(acct_features.get("layering_depth", pd.Series([0])).values[0]) if "layering_depth" in acct_features.columns else 0,
            "circular": bool(acct_features.get("circular_score", pd.Series([0])).values[0] > 0) if "circular_score" in acct_features.columns else False,
            "flagged_neighbours": 0,
            "dormancy_days": int(acct_features.get("last_tx_days_max", pd.Series([0])).values[0]) if "last_tx_days_max" in acct_features.columns else 0,
        }
        
        narrative = generate_str_narrative(
            account_id, risk_score, explanation["factors"],
            tx_summary, graph_evidence,
        )
        
        case = build_case_dossier(
            account_id, risk_score, narrative, explanation["factors"],
            acct_tx, rules_triggered=[],
        )
        cases.append(case)
        logger.info(f"  Case {case['case_id']}: score={risk_score:.1f}")
    
    # Save cases
    os.makedirs(os.path.join(data_dir, "cases"), exist_ok=True)
    for case in cases:
        path = os.path.join(data_dir, "cases", f"{case['case_id']}.json")
        with open(path, "w") as f:
            json.dump(case, f, indent=2, default=str)
    
    all_cases_path = os.path.join(data_dir, "all_cases.json")
    with open(all_cases_path, "w") as f:
        json.dump(cases, f, indent=2, default=str)
    
    logger.info(f"Generated {len(cases)} case dossiers.")
    return cases


if __name__ == "__main__":
    cases = run_stage6()
    print(f"\nGenerated {len(cases)} case dossiers.")
