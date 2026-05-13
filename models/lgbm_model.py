"""
AEGIS — LightGBM Fusion Model
Combines GAT embeddings, temporal features, graph features, and rule flags
into a single LightGBM classifier for final fraud scoring.
"""
import lightgbm as lgb
from lightgbm import LGBMClassifier
import numpy as np
import pandas as pd
import os
import joblib
import json
import logging
from typing import Tuple, Dict, List, Optional
from sklearn.metrics import (
    classification_report, roc_auc_score, confusion_matrix,
    average_precision_score, precision_recall_curve
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def train_fusion_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray = None,
    y_val: np.ndarray = None,
    feature_names: List[str] = None,
    use_smote: bool = False,
) -> LGBMClassifier:
    """
    Train LightGBM fusion model with class imbalance handling.
    """
    fraud_count = y_train.sum()
    legit_count = len(y_train) - fraud_count
    
    logger.info(f"Training set: {len(y_train):,} samples ({fraud_count:,} fraud, {legit_count:,} legit)")
    
    if use_smote and fraud_count > 0 and fraud_count < legit_count:
        try:
            from imblearn.over_sampling import SMOTE
            target_ratio = min(0.1, fraud_count / legit_count * 5)
            smote = SMOTE(sampling_strategy=target_ratio, random_state=42)
            X_train, y_train = smote.fit_resample(X_train, y_train)
            logger.info(f"After SMOTE: {len(y_train):,} samples ({y_train.sum():,} fraud)")
        except ImportError:
            logger.warning("imblearn not available, using scale_pos_weight only")
    
    # Compute class weight
    scale_pos_weight = legit_count / max(fraud_count, 1)
    
    model = LGBMClassifier(
        n_estimators=500,
        learning_rate=0.05,
        num_leaves=63,
        max_depth=8,
        min_child_samples=50,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
        verbose=-1,
    )
    
    callbacks = [lgb.early_stopping(50, verbose=True), lgb.log_evaluation(50)]
    
    if X_val is not None and y_val is not None:
        model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            eval_metric=["binary_logloss", "auc"],
            callbacks=callbacks,
        )
    else:
        model.fit(X_train, y_train)
    
    return model


def evaluate_model(
    model: LGBMClassifier,
    X_test: np.ndarray,
    y_test: np.ndarray,
    threshold: float = 0.5,
    feature_names: List[str] = None,
) -> Dict:
    """Full evaluation suite with detailed metrics."""
    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)

    logger.info("=== Classification Report ===")
    report = classification_report(y_test, y_pred, target_names=["Legit", "Fraud"])
    logger.info(f"\n{report}")

    roc_auc = roc_auc_score(y_test, y_prob) if len(np.unique(y_test)) > 1 else 0.0
    avg_precision = average_precision_score(y_test, y_prob) if len(np.unique(y_test)) > 1 else 0.0
    
    logger.info(f"ROC-AUC:              {roc_auc:.4f}")
    logger.info(f"Average Precision:    {avg_precision:.4f}")

    cm = confusion_matrix(y_test, y_pred)
    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
    else:
        tn, fp, fn, tp = 0, 0, 0, 0
    
    logger.info(f"\nTrue Positives:  {tp}")
    logger.info(f"False Positives: {fp}")
    logger.info(f"False Negatives: {fn}")
    logger.info(f"True Negatives:  {tn}")
    
    fp_rate = fp / (fp + tn) if (fp + tn) > 0 else 0
    logger.info(f"\nFalse Positive Rate: {fp_rate:.4f}")
    logger.info(f"Alert Reduction:     {(1 - fp_rate) * 100:.1f}%")

    # Feature importance
    if feature_names and hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        sorted_idx = np.argsort(importances)[::-1][:15]
        logger.info("\nTop 15 Feature Importances:")
        for idx in sorted_idx:
            if idx < len(feature_names):
                logger.info(f"  {feature_names[idx]:40s} {importances[idx]:.0f}")

    metrics = {
        "roc_auc": roc_auc,
        "avg_precision": avg_precision,
        "precision": tp / (tp + fp) if (tp + fp) > 0 else 0,
        "recall": tp / (tp + fn) if (tp + fn) > 0 else 0,
        "f1": 2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) > 0 else 0,
        "fp_rate": fp_rate,
        "alert_reduction": (1 - fp_rate),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "threshold": threshold,
    }

    return metrics


def get_risk_scores(
    model: LGBMClassifier,
    X: np.ndarray,
    accounts: List[str],
) -> pd.DataFrame:
    """
    Generate risk scores for all accounts.
    Returns DataFrame with Account, risk_score (0-100), risk_label.
    """
    y_prob = model.predict_proba(X)[:, 1]
    
    risk_df = pd.DataFrame({
        "Account": accounts,
        "risk_score": (y_prob * 100).round(1),
        "risk_probability": y_prob,
    })
    
    # Assign risk labels
    risk_df["risk_label"] = pd.cut(
        risk_df["risk_score"],
        bins=[0, 25, 50, 75, 100],
        labels=["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        include_lowest=True,
    )
    
    return risk_df.sort_values("risk_score", ascending=False).reset_index(drop=True)


def save_lgbm_model(
    model: LGBMClassifier,
    metrics: dict,
    feature_names: List[str],
    save_dir: str = "models/saved",
):
    """Save trained LightGBM model, metrics, and feature names."""
    os.makedirs(save_dir, exist_ok=True)
    
    joblib.dump(model, os.path.join(save_dir, "lgbm_model.joblib"))
    
    with open(os.path.join(save_dir, "lgbm_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    
    with open(os.path.join(save_dir, "feature_names.json"), "w") as f:
        json.dump(feature_names, f)
    
    logger.info(f"Saved LightGBM model to {save_dir}/")


def load_lgbm_model(save_dir: str = "models/saved") -> Tuple[LGBMClassifier, dict, List[str]]:
    """Load trained LightGBM model."""
    model = joblib.load(os.path.join(save_dir, "lgbm_model.joblib"))
    
    with open(os.path.join(save_dir, "lgbm_metrics.json"), "r") as f:
        metrics = json.load(f)
    
    with open(os.path.join(save_dir, "feature_names.json"), "r") as f:
        feature_names = json.load(f)
    
    return model, metrics, feature_names
