"""Tests for Stage 3 — FATF Rule Engine"""
import pytest
import pandas as pd
import numpy as np
import networkx as nx


def _make_test_df():
    """Create test transaction DataFrame."""
    np.random.seed(42)
    data = {
        "Timestamp": pd.date_range("2024-01-01", periods=20, freq="10min"),
        "Account": [111] * 10 + [222] * 5 + [333] * 5,
        "Account.1": np.random.randint(100, 999, 20),
        "Amount Paid": [47000, 48000, 46000, 49000, 10000, 20000, 30000, 40000, 50000, 60000,
                        1000, 2000, 3000, 4000, 5000,
                        100000, 200000, 300000, 400000, 500000],
        "Payment Currency": ["Rupees"] * 20,
        "Is Laundering": [1] * 10 + [0] * 5 + [1] * 5,
        "From Bank": ["Bank_A"] * 20,
        "To Bank": ["Bank_B"] * 20,
    }
    df = pd.DataFrame(data)
    df["amount_inr"] = df["Amount Paid"]
    df["structuring_flag"] = ((df["amount_inr"] >= 45000) & (df["amount_inr"] < 50000)).astype(int)
    return df


class TestRuleEngine:
    def test_structuring_detection(self):
        from pipeline.stage3_rules import detect_structuring
        df = _make_test_df()
        # Account 111 has 3 transactions between 45k-50k
        assert detect_structuring(df, 111) == True
        # Account 222 has none
        assert detect_structuring(df, 222) == False

    def test_rapid_movement(self):
        from pipeline.stage3_rules import detect_rapid_movement
        df = _make_test_df()
        # Account 111 has 10 transactions within 100 min → rapid
        assert detect_rapid_movement(df, 111) == True
        # Account 222 has 5 transactions within 50 min → may trigger
        assert detect_rapid_movement(df, 222) == True

    def test_dormant_activation(self):
        from pipeline.stage3_rules import detect_dormant_activation
        # Create dormant account
        data = {
            "Timestamp": [pd.Timestamp("2023-01-01"), pd.Timestamp("2024-07-15")],
            "Account": [444, 444],
            "Account.1": [555, 666],
            "Amount Paid": [1000, 50000],
            "Payment Currency": ["Rupees", "Rupees"],
            "Is Laundering": [0, 1],
            "From Bank": ["A", "A"],
            "To Bank": ["B", "B"],
            "amount_inr": [1000, 50000],
            "structuring_flag": [0, 0],
        }
        df = pd.DataFrame(data)
        assert detect_dormant_activation(df, 444) == True

    def test_round_tripping(self):
        from pipeline.stage3_rules import detect_round_tripping
        G = nx.DiGraph()
        G.add_edges_from([("ACC_100", "ACC_200"), ("ACC_200", "ACC_300"), ("ACC_300", "ACC_100")])
        df = pd.DataFrame()
        assert detect_round_tripping(df, "100", G=G) == True
        assert detect_round_tripping(df, "999", G=G) == False

    def test_fan_in_fan_out(self):
        from pipeline.stage3_rules import detect_fan_in_fan_out
        G = nx.DiGraph()
        mule = "ACC_500"
        for i in range(6):
            G.add_edge(f"ACC_{600+i}", mule)
        for i in range(4):
            G.add_edge(mule, f"ACC_{700+i}")
        df = pd.DataFrame()
        assert detect_fan_in_fan_out(df, "500", G=G) == True

    def test_evaluate_rules(self):
        from pipeline.stage3_rules import evaluate_rules
        df = _make_test_df()
        result = evaluate_rules(df, accounts=[111, 222], progress=False)
        assert len(result) == 2
        assert "rules_triggered" in result.columns
        assert "rule_structuring" in result.columns

    def test_rule_registry(self):
        from pipeline.stage3_rules import RULES
        assert "structuring" in RULES
        assert "rapid_movement" in RULES
        assert "dormant_activation" in RULES
        assert "round_tripping" in RULES
        assert "fan_in_fan_out" in RULES
        assert "profile_mismatch" in RULES
