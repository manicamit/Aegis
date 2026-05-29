"""Tests for dashboard/components/plain_english.py"""
from dashboard.components.plain_english import (
    generate_plain_english, format_for_mobile, format_for_dashboard,
)


def test_basic_sentence_includes_amount_and_clause():
    sentence = generate_plain_english(
        account_id="ACC_1234",
        total_amount=482000,
        shap_top_features=[
            ("layering_depth", 0.22),
            ("burst_score", 0.18),
            ("last_tx_days_max", 0.15),
        ],
        case_details={
            "time_window": "2 hours",
            "layering_depth": 6,
            "last_tx_days_max": 482,
        },
    )
    assert "ACC_1234" in sentence
    assert "₹4.8L" in sentence  # 482000 → 4.8L
    assert "2 hours" in sentence
    assert "6 intermediary layers" in sentence
    assert "482 days dormant" in sentence


def test_handles_string_factor_format():
    """SHAP factors can arrive as pre-formatted strings from format_risk_explanation."""
    sentence = generate_plain_english(
        account_id="ACC_99",
        total_amount=50_000,
        shap_top_features=["+ burst_score (0.12)", "+ rapid_withdrawal (0.08)"],
        case_details={"time_window": "30 minutes"},
    )
    assert "ACC_99" in sentence
    assert "burst" in sentence.lower() or "withdraw" in sentence.lower()


def test_empty_factors_still_produces_sentence():
    sentence = generate_plain_english(
        account_id="ACC_X",
        total_amount=0,
        shap_top_features=[],
        case_details={},
    )
    assert sentence.startswith("ACC_X moved")
    assert sentence.endswith(".")


def test_amount_formatting_thresholds():
    sentence = generate_plain_english("A", 500, [], {})
    assert "₹500" in sentence
    sentence_lakh = generate_plain_english("A", 250_000, [], {})
    assert "₹2.5L" in sentence_lakh
    sentence_crore = generate_plain_english("A", 25_000_000, [], {})
    assert "₹2.5Cr" in sentence_crore


def test_format_payloads():
    plain = "ACC_1 moved ₹1L in 1h — with coordinated burst timing."
    mob = format_for_mobile(plain)
    assert mob["summary"] == plain
    assert mob["display_mode"] == "plain_english"

    dash = format_for_dashboard(plain, [("burst_score", 0.18)])
    assert dash["plain_english"] == plain
    assert dash["shap_factors"][0]["feature"] == "burst_score"
    assert dash["shap_factors"][0]["impact"] == 0.18
