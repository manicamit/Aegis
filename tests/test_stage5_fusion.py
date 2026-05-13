"""Tests for Stage 5 — LightGBM Fusion"""
import pytest
import numpy as np


class TestLGBMModel:
    def test_train_and_predict(self):
        from models.lgbm_model import train_fusion_model, get_risk_scores
        np.random.seed(42)
        n = 500
        X = np.random.randn(n, 10).astype(np.float32)
        y = (X[:, 0] + X[:, 1] > 0.5).astype(int)

        X_train, X_val = X[:400], X[400:]
        y_train, y_val = y[:400], y[400:]

        model = train_fusion_model(X_train, y_train, X_val, y_val, use_smote=False)
        assert hasattr(model, "predict_proba")

        probs = model.predict_proba(X_val)
        assert probs.shape == (100, 2)
        assert np.all(probs >= 0) and np.all(probs <= 1)

    def test_evaluate_model(self):
        from models.lgbm_model import train_fusion_model, evaluate_model
        np.random.seed(42)
        n = 300
        X = np.random.randn(n, 5).astype(np.float32)
        y = (X[:, 0] > 0).astype(int)

        model = train_fusion_model(X[:240], y[:240], X[240:], y[240:])
        metrics = evaluate_model(model, X[240:], y[240:])

        assert "roc_auc" in metrics
        assert "precision" in metrics
        assert "recall" in metrics
        assert "f1" in metrics
        assert "fp_rate" in metrics
        assert 0 <= metrics["roc_auc"] <= 1

    def test_risk_scores(self):
        from models.lgbm_model import train_fusion_model, get_risk_scores
        np.random.seed(42)
        X = np.random.randn(100, 5).astype(np.float32)
        y = (X[:, 0] > 0).astype(int)

        model = train_fusion_model(X, y)
        risk_df = get_risk_scores(model, X, [f"ACC_{i}" for i in range(100)])

        assert len(risk_df) == 100
        assert "risk_score" in risk_df.columns
        assert "risk_label" in risk_df.columns
        assert risk_df["risk_score"].between(0, 100).all()

    def test_save_load(self, tmp_path):
        from models.lgbm_model import train_fusion_model, save_lgbm_model, load_lgbm_model
        np.random.seed(42)
        X = np.random.randn(100, 3).astype(np.float32)
        y = (X[:, 0] > 0).astype(int)

        model = train_fusion_model(X, y)
        save_lgbm_model(model, {"roc_auc": 0.9}, ["f1", "f2", "f3"], str(tmp_path))

        loaded_model, metrics, names = load_lgbm_model(str(tmp_path))
        assert metrics["roc_auc"] == 0.9
        assert names == ["f1", "f2", "f3"]

        preds = loaded_model.predict_proba(X)
        assert preds.shape == (100, 2)
