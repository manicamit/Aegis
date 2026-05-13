"""Tests for Stage 1 — Ingestion & Normalisation"""
import pytest
import pandas as pd
import numpy as np
import os
import tempfile


def _make_sample_csv(path, n=100):
    """Create a minimal IBM-format CSV for testing."""
    np.random.seed(42)
    data = {
        "Timestamp": pd.date_range("2024-01-01", periods=n, freq="h"),
        "From Bank": np.random.choice(["Bank_A", "Bank_B", "Bank_C"], n),
        "Account": np.random.randint(100000, 999999, n),
        "To Bank": np.random.choice(["Bank_A", "Bank_B", "Bank_C"], n),
        "Account.1": np.random.randint(100000, 999999, n),
        "Amount Received": np.random.uniform(100, 100000, n),
        "Receiving Currency": np.random.choice(["Rupees", "US Dollar", "Euro"], n),
        "Amount Paid": np.random.uniform(100, 100000, n),
        "Payment Currency": np.random.choice(["Rupees", "US Dollar", "Euro"], n),
        "Payment Format": np.random.choice(["Wire", "ACH", "Cheque"], n),
        "Is Laundering": np.random.choice([0, 0, 0, 0, 0, 0, 0, 0, 0, 1], n),
    }
    df = pd.DataFrame(data)
    df.to_csv(path, index=False)
    return df


class TestStage1:
    def test_ingest_basic(self, tmp_path):
        csv_path = str(tmp_path / "test.csv")
        _make_sample_csv(csv_path, n=50)

        from pipeline.stage1_ingest import ingest
        df = ingest(csv_path, output_dir=str(tmp_path / "out"))

        assert len(df) == 50
        assert "amount_inr" in df.columns
        assert "structuring_flag" in df.columns
        assert "amount_anomaly" in df.columns
        assert "src_account" in df.columns
        assert "dst_account" in df.columns

    def test_currency_normalisation(self, tmp_path):
        csv_path = str(tmp_path / "test.csv")
        _make_sample_csv(csv_path, n=20)

        from pipeline.stage1_ingest import ingest
        df = ingest(csv_path, output_dir=str(tmp_path / "out"))

        # All amounts should be positive (except anomalies)
        assert (df["amount_inr"] >= 0).all()

    def test_structuring_flag(self, tmp_path):
        csv_path = str(tmp_path / "struct.csv")
        data = {
            "Timestamp": pd.date_range("2024-01-01", periods=5, freq="h"),
            "From Bank": ["Bank_A"] * 5,
            "Account": [111111] * 5,
            "To Bank": ["Bank_B"] * 5,
            "Account.1": [222222] * 5,
            "Amount Received": [47000, 48000, 46000, 10000, 100000],
            "Receiving Currency": ["Rupees"] * 5,
            "Amount Paid": [47000, 48000, 46000, 10000, 100000],
            "Payment Currency": ["Rupees"] * 5,
            "Payment Format": ["ACH"] * 5,
            "Is Laundering": [1, 1, 1, 0, 0],
        }
        pd.DataFrame(data).to_csv(csv_path, index=False)

        from pipeline.stage1_ingest import ingest
        df = ingest(csv_path, output_dir=str(tmp_path / "out"))

        # 3 amounts between 45k-50k should be flagged
        assert df["structuring_flag"].sum() == 3

    def test_parquet_output(self, tmp_path):
        csv_path = str(tmp_path / "test.csv")
        _make_sample_csv(csv_path, n=30)

        from pipeline.stage1_ingest import ingest
        ingest(csv_path, output_dir=str(tmp_path / "out"))

        parquet_path = tmp_path / "out" / "transactions.parquet"
        assert parquet_path.exists()
        loaded = pd.read_parquet(parquet_path)
        assert len(loaded) == 30

    def test_missing_columns_raises(self, tmp_path):
        csv_path = str(tmp_path / "bad.csv")
        pd.DataFrame({"col1": [1, 2], "col2": [3, 4]}).to_csv(csv_path, index=False)

        from pipeline.stage1_ingest import ingest
        with pytest.raises(ValueError, match="Missing required columns"):
            ingest(csv_path, output_dir=str(tmp_path / "out"))
