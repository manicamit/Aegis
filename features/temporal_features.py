"""
AEGIS — Temporal Feature Engineering
Computes time-based risk features per account for LightGBM fusion.
"""
import pandas as pd
import numpy as np
import os
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Feature names exported for use in Stage 5
TEMPORAL_FEATURES = [
    "tx_velocity_1h",
    "hop_delta_seconds",
    "burst_score",
    "rapid_withdrawal",
    "dormancy_flag",
    "last_tx_days",
    "amount_zscore",
    "tx_count_1h",
    "tx_sum_1h",
    "tx_count_24h",
]


def compute_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute time-based risk features per transaction.
    These feed directly into LightGBM Stage 5.
    """
    logger.info("Computing temporal features...")
    df = df.copy()
    df["Timestamp"] = pd.to_datetime(df["Timestamp"])
    df = df.sort_values(["Account", "Timestamp"]).reset_index(drop=True)

    # 1. Transfer velocity: transactions per hour (expanding window)
    logger.info("  Computing transfer velocity...")
    df["tx_velocity_1h"] = (
        df.groupby("Account")["Timestamp"]
        .transform(lambda x: x.expanding()
                   .count() / ((x - x.min()).dt.total_seconds() / 3600 + 1))
    )

    # 2. Time between consecutive hops
    logger.info("  Computing hop deltas...")
    df["hop_delta_seconds"] = (
        df.groupby("Account")["Timestamp"]
        .transform(lambda x: x.diff().dt.total_seconds().fillna(0))
    )

    # 3. Burst score: inverse stddev of hop deltas (low stddev = coordinated)
    logger.info("  Computing burst scores...")
    df["burst_score"] = (
        df.groupby("Account")["hop_delta_seconds"]
        .transform(lambda x: 1 / (x.std() + 1))
    )
    df["burst_score"] = df["burst_score"].fillna(0)

    # 4. Rapid withdrawal after deposit flag
    logger.info("  Computing withdrawal ratios...")
    amount_col = "amount_inr" if "amount_inr" in df.columns else "Amount Paid"
    received_col = "amount_received_inr" if "amount_received_inr" in df.columns else "Amount Received"
    
    if received_col in df.columns:
        df["_amount_in"] = df.groupby("Account")[received_col].transform("sum")
    else:
        df["_amount_in"] = df.groupby("Account")[amount_col].transform("sum")
    df["_amount_out"] = df.groupby("Account")[amount_col].transform("sum")
    df["rapid_withdrawal"] = (
        (df["_amount_out"] / (df["_amount_in"] + 1)) > 0.95
    ).astype(int)
    df.drop(columns=["_amount_in", "_amount_out"], inplace=True)

    # 5. Dormancy score: days since last transaction
    logger.info("  Computing dormancy flags...")
    df["last_tx_days"] = (
        df.groupby("Account")["Timestamp"]
        .transform(lambda x: (x - x.shift(1)).dt.days.fillna(999))
    )
    df["dormancy_flag"] = (df["last_tx_days"] > 180).astype(int)

    # 6. Amount anomaly: z-score per account
    logger.info("  Computing amount z-scores...")
    df["amount_zscore"] = (
        df.groupby("Account")[amount_col]
        .transform(lambda x: (x - x.mean()) / (x.std() + 1))
    )
    df["amount_zscore"] = df["amount_zscore"].fillna(0)

    logger.info("Temporal features computed successfully.")
    return df


def compute_rolling_windows(df: pd.DataFrame) -> pd.DataFrame:
    """
    1-hour and 24-hour rolling aggregates per account.
    Uses vectorized groupby().rolling() instead of per-account loops.
    """
    logger.info("Computing rolling window features...")
    df = df.copy()
    df["Timestamp"] = pd.to_datetime(df["Timestamp"])
    df = df.sort_values(["Account", "Timestamp"]).reset_index(drop=True)
    
    amount_col = "amount_inr" if "amount_inr" in df.columns else "Amount Paid"
    
    # Set Timestamp as index for time-based rolling
    df = df.set_index("Timestamp")
    
    logger.info("  Computing 1h rolling count...")
    df["tx_count_1h"] = (
        df.groupby("Account")[amount_col]
        .transform(lambda x: x.rolling("1h").count())
    )
    
    logger.info("  Computing 1h rolling sum...")
    df["tx_sum_1h"] = (
        df.groupby("Account")[amount_col]
        .transform(lambda x: x.rolling("1h").sum())
    )
    
    logger.info("  Computing 24h rolling count...")
    df["tx_count_24h"] = (
        df.groupby("Account")[amount_col]
        .transform(lambda x: x.rolling("24h").count())
    )
    
    df = df.reset_index()
    
    # Fill NaN for accounts with single transactions
    df["tx_count_1h"] = df["tx_count_1h"].fillna(1.0)
    df["tx_sum_1h"] = df["tx_sum_1h"].fillna(df[amount_col])
    df["tx_count_24h"] = df["tx_count_24h"].fillna(1.0)
    
    logger.info("Rolling window features computed.")
    return df


def compute_all_temporal(df: pd.DataFrame) -> pd.DataFrame:
    """Run full temporal feature pipeline."""
    df = compute_temporal_features(df)
    df = compute_rolling_windows(df)
    return df


def aggregate_temporal_per_account(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate temporal features to account-level for LightGBM.
    Takes mean/max/std of transaction-level temporal features per account.
    """
    logger.info("Aggregating temporal features per account...")
    
    agg_funcs = {}
    for feat in TEMPORAL_FEATURES:
        if feat in df.columns:
            agg_funcs[feat] = ["mean", "max", "std"]
    
    if not agg_funcs:
        logger.warning("No temporal features found to aggregate!")
        return pd.DataFrame({"Account": df["Account"].unique()})
    
    agg_df = df.groupby("Account").agg(agg_funcs)
    
    # Flatten multi-level column names
    agg_df.columns = [f"{col[0]}_{col[1]}" for col in agg_df.columns]
    agg_df = agg_df.reset_index()
    
    # Fill NaN
    agg_df = agg_df.fillna(0)
    
    logger.info(f"  Aggregated features shape: {agg_df.shape}")
    return agg_df


if __name__ == "__main__":
    from pipeline.stage1_ingest import load_processed
    
    df = load_processed()
    df = compute_all_temporal(df)
    
    # Save
    os.makedirs("data/processed", exist_ok=True)
    df.to_parquet("data/processed/transactions_temporal.parquet", index=False)
    
    agg = aggregate_temporal_per_account(df)
    agg.to_parquet("data/processed/temporal_features_account.parquet", index=False)
    
    print(f"\nTemporal features computed for {len(df):,} transactions.")
    print(f"Account-level features: {agg.shape}")
