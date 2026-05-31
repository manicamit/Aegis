"""AEGIS — Pre-generate STR narratives for every case.

Reads every JSON in `data/processed/cases/`, calls the configured LLM provider
to author a real STR narrative, writes the result both to
`data/precomputed/str_narratives.json` (cache consumed by Stage 6 on subsequent
runs) and back into each case JSON's `str_narrative` field so the API serves
the LLM text directly without indirection.

Usage:
    ANTHROPIC_API_KEY=sk-... LLM_PROVIDER=anthropic python scripts/precompute_narratives.py

Env vars honored:
    LLM_PROVIDER          anthropic | openai | ollama          (default: anthropic)
    ANTHROPIC_API_KEY     for the default provider
    CASES_DIR             default: data/processed/cases
    STR_CACHE             default: data/precomputed/str_narratives.json
    FORCE_REGENERATE      set to "1" to re-author even cases already in the cache
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from pathlib import Path

# Make the repo importable when run as `python scripts/precompute_narratives.py`.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from pipeline.stage6_case_builder import (
    _build_llm_prompt,
    _generate_narrative_anthropic,
    _generate_narrative_openai,
    _generate_narrative_ollama,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("precompute_narratives")

PROVIDER_FNS = {
    "anthropic": _generate_narrative_anthropic,
    "openai":    _generate_narrative_openai,
    "ollama":    _generate_narrative_ollama,
}


def _format_total_amount(case: dict) -> str:
    amt = case.get("total_amount")
    if isinstance(amt, (int, float)) and amt > 0:
        return f"₹{amt:,.0f}"
    return "Unknown"


def _build_args_from_case(case: dict) -> tuple[str, float, list, dict, dict]:
    """Reconstruct the (account_id, risk_score, factors, tx_summary, graph_evidence)
    tuple that `_build_llm_prompt` expects, using only the fields present in the
    saved case JSON. Missing fields fall back to sensible defaults."""
    account_id = case.get("account_id") or case.get("account_reference") or "UNKNOWN"
    risk_score = float(case.get("risk_score", 0.0))
    factors = case.get("risk_factors") or []

    tx_summary = {
        "total_amount": _format_total_amount(case),
        "tx_count":     case.get("transaction_count", 0),
        "time_window":  case.get("time_window", "the observed period"),
        "account_count": case.get("unique_counterparties", 0),
    }

    rules = (case.get("compliance") or {}).get("fatf_rules_triggered") or []
    graph_evidence = {
        "layering_depth":    case.get("layering_depth", 0),
        "circular":          "rule_round_tripping" in rules,
        "flagged_neighbours": case.get("unique_counterparties", 0),
        "dormancy_days":     case.get("dormancy_days", 0),
    }
    return account_id, risk_score, factors, tx_summary, graph_evidence


def precompute(
    cases_dir: str = "data/processed/cases",
    cache_path: str = "data/precomputed/str_narratives.json",
    provider: str | None = None,
    force: bool = False,
    sleep_seconds: float = 0.0,
) -> dict:
    provider = (provider or os.environ.get("LLM_PROVIDER", "anthropic")).lower()
    fn = PROVIDER_FNS.get(provider)
    if fn is None:
        raise SystemExit(
            f"Unsupported provider {provider!r}. Set LLM_PROVIDER to one of: "
            f"{', '.join(PROVIDER_FNS)}."
        )

    cases_dir_p = Path(cases_dir)
    if not cases_dir_p.is_dir():
        raise SystemExit(f"Cases directory not found: {cases_dir_p}")

    cache_path_p = Path(cache_path)
    cache_path_p.parent.mkdir(parents=True, exist_ok=True)

    cache: dict[str, str] = {}
    if cache_path_p.exists() and not force:
        try:
            cache = json.loads(cache_path_p.read_text())
            logger.info("Loaded existing cache (%d entries) from %s", len(cache), cache_path_p)
        except Exception as e:
            logger.warning("Could not read existing cache %s: %s — starting fresh.", cache_path_p, e)
            cache = {}

    case_files = sorted(cases_dir_p.glob("AEGIS-*.json"))
    logger.info("Found %d case files in %s", len(case_files), cases_dir_p)
    logger.info("Using LLM provider: %s", provider)

    ok = skipped = failed = 0
    for case_file in case_files:
        try:
            case = json.loads(case_file.read_text())
        except Exception as e:
            logger.warning("Skipping %s — could not parse JSON: %s", case_file.name, e)
            failed += 1
            continue

        case_id = case.get("case_id") or case_file.stem
        if not force and case_id in cache:
            skipped += 1
            continue

        account_id, risk_score, factors, tx_summary, graph_evidence = _build_args_from_case(case)
        prompt = _build_llm_prompt(account_id, risk_score, factors, tx_summary, graph_evidence)

        try:
            narrative = fn(prompt).strip()
        except Exception as e:
            logger.error("LLM call failed for %s: %s", case_id, e)
            failed += 1
            continue

        cache[case_id] = narrative
        case["str_narrative"] = narrative
        case_file.write_text(json.dumps(case, indent=2, default=str))

        cache_path_p.write_text(json.dumps(cache, indent=2, ensure_ascii=False))
        ok += 1
        logger.info("[%d/%d] %s — narrative generated (%d chars)",
                    ok + skipped + failed, len(case_files), case_id, len(narrative))

        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    # Rebuild all_cases.json so the alerts list reflects the new narratives.
    all_cases_path = Path("data/processed/all_cases.json")
    if all_cases_path.exists():
        try:
            cases_payload = []
            for case_file in case_files:
                try:
                    cases_payload.append(json.loads(case_file.read_text()))
                except Exception:
                    continue
            all_cases_path.write_text(json.dumps(cases_payload, indent=2, default=str))
            logger.info("Rebuilt %s with %d cases", all_cases_path, len(cases_payload))
        except Exception as e:
            logger.warning("Could not rebuild %s: %s", all_cases_path, e)

    logger.info("Done. generated=%d skipped=%d failed=%d total=%d",
                ok, skipped, failed, len(case_files))
    logger.info("Cache written to %s (%d entries)", cache_path_p, len(cache))
    return cache


if __name__ == "__main__":
    force = os.environ.get("FORCE_REGENERATE", "0") == "1"
    precompute(
        cases_dir=os.environ.get("CASES_DIR", "data/processed/cases"),
        cache_path=os.environ.get("STR_CACHE", "data/precomputed/str_narratives.json"),
        provider=os.environ.get("LLM_PROVIDER"),
        force=force,
        sleep_seconds=float(os.environ.get("SLEEP_SECONDS", "0")),
    )
