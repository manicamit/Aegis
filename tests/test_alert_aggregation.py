"""Tests for pipeline.stage5_fusion.aggregate_alerts_to_cases"""
import pandas as pd
import pytest

from pipeline.stage5_fusion import aggregate_alerts_to_cases


def _make_rule_df(rows):
    """rows: list of (account, {rule_name: 0|1})."""
    df_rows = []
    rule_names = set()
    for _, flags in rows:
        rule_names.update(flags.keys())
    rule_names = sorted(rule_names)
    for account, flags in rows:
        d = {"Account": account}
        for r in rule_names:
            d[r] = int(flags.get(r, 0))
        d["rules_triggered"] = sum(d[r] for r in rule_names)
        df_rows.append(d)
    return pd.DataFrame(df_rows)


def test_collapses_multiple_rules_into_one_case():
    rule_df = _make_rule_df([
        ("ACC1", {"rule_structuring": 1, "rule_rapid_movement": 1,
                  "rule_fan_in_fan_out": 1, "rule_dormant_activation": 1,
                  "rule_round_tripping": 1, "rule_profile_mismatch": 1, "rule_extra": 1}),
    ])
    risk_df = pd.DataFrame({"Account": ["ACC1"], "risk_score": [88.0]})
    cases = aggregate_alerts_to_cases(rule_df, risk_df)
    assert len(cases) == 1
    case = cases[0]
    assert case["account_id"] == "ACC1"
    assert case["n_alerts_collapsed"] == 7
    assert set(case["rules_triggered"]) == {
        "rule_structuring", "rule_rapid_movement", "rule_fan_in_fan_out",
        "rule_dormant_activation", "rule_round_tripping",
        "rule_profile_mismatch", "rule_extra",
    }
    assert case["status"] == "pending"
    assert case["assigned_to"] == "branch_manager"
    assert 0.0 <= case["priority_score"] <= 1.0


def test_priority_score_sorting():
    rule_df = _make_rule_df([
        ("LOW",  {"rule_profile_mismatch": 1}),
        ("HIGH", {"rule_structuring": 1, "rule_fan_in_fan_out": 1,
                  "rule_round_tripping": 1}),
        ("MED",  {"rule_rapid_movement": 1, "rule_dormant_activation": 1}),
    ])
    risk_df = pd.DataFrame({
        "Account": ["LOW", "HIGH", "MED"],
        "risk_score": [40.0, 92.0, 65.0],
    })
    cases = aggregate_alerts_to_cases(rule_df, risk_df)
    ordering = [c["account_id"] for c in cases]
    assert ordering == ["HIGH", "MED", "LOW"]


def test_accounts_with_no_rules_are_skipped():
    rule_df = _make_rule_df([
        ("CLEAN", {"rule_structuring": 0}),
        ("DIRTY", {"rule_structuring": 1, "rule_fan_in_fan_out": 1}),
    ])
    risk_df = pd.DataFrame({"Account": ["CLEAN", "DIRTY"], "risk_score": [10, 80]})
    cases = aggregate_alerts_to_cases(rule_df, risk_df)
    assert [c["account_id"] for c in cases] == ["DIRTY"]


def test_uses_transaction_df_for_totals():
    rule_df = _make_rule_df([("X", {"rule_structuring": 1})])
    risk_df = pd.DataFrame({"Account": ["X"], "risk_score": [75]})
    tx = pd.DataFrame({
        "Account": ["X", "X", "X"],
        "Account.1": ["A", "B", "B"],
        "amount_inr": [10_000, 20_000, 30_000],
    })
    cases = aggregate_alerts_to_cases(rule_df, risk_df, transaction_df=tx)
    assert cases[0]["total_amount"] == 60_000
    assert cases[0]["tx_count"] == 3
    assert cases[0]["unique_counterparties"] == 2


def test_empty_rule_df_returns_empty():
    cases = aggregate_alerts_to_cases(pd.DataFrame(columns=["Account"]),
                                      pd.DataFrame(columns=["Account", "risk_score"]))
    assert cases == []
