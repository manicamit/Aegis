"""
AEGIS Stage 1 — Ingestion & Normalisation
Loads IBM AML dataset CSVs, normalises currencies to INR,
flags structuring patterns, and saves processed parquet.
"""
import pandas as pd
import numpy as np
import os
import sys
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# FX rates for currency normalisation (static for prototype)
FX_RATES = {
    "US Dollar": 83.5,
    "US Dollars": 83.5,
    "Euro": 91.2,
    "Euros": 91.2,
    "Bitcoin": 6500000.0,
    "UK Pound": 105.0,
    "UK Pounds": 105.0,
    "Yuan": 11.5,
    "Yen": 0.56,
    "Rupee": 1.0,
    "Rupees": 1.0,
    "Indian Rupee": 1.0,
    "Swiss Franc": 93.0,
    "Australian Dollar": 55.0,
    "Canadian Dollar": 62.0,
    "Saudi Riyal": 22.3,
    "Mexican Peso": 4.9,
    "Brazil Real": 17.0,
    "Ruble": 0.93,
    "Shekel": 23.0,
}

# Structuring detection threshold (₹50,000 RBI reporting threshold)
STRUCTURING_LOWER = 45000
STRUCTURING_UPPER = 50000


def ingest(filepath: str, output_dir: str = "data/processed") -> pd.DataFrame:
    """
    Full ingestion pipeline:
    1. Load CSV
    2. Clean column names
    3. Normalise currencies to INR
    4. Flag structuring attempts
    5. Flag amount anomalies
    6. Parse timestamps
    7. Create account identifiers
    8. Save processed parquet
    """
    logger.info(f"Loading dataset from {filepath}")
    
    # Load with chunking for large files
    file_size_mb = os.path.getsize(filepath) / (1024 * 1024)
    logger.info(f"File size: {file_size_mb:.1f} MB")
    
    if file_size_mb > 500:
        # For very large files, read in chunks
        chunks = []
        for chunk in pd.read_csv(filepath, chunksize=500000):
            chunks.append(chunk)
        df = pd.concat(chunks, ignore_index=True)
    else:
        df = pd.read_csv(filepath)
    
    logger.info(f"Loaded {len(df):,} transactions")
    
    # Clean column names
    df.columns = df.columns.str.strip()
    
    # Rename for consistency
    col_map = {
        "Account": "Account",
        "Account.1": "Account.1",
        "From Bank": "From Bank",
        "To Bank": "To Bank",
        "Amount Received": "Amount Received",
        "Receiving Currency": "Receiving Currency",
        "Amount Paid": "Amount Paid",
        "Payment Currency": "Payment Currency",
        "Payment Format": "Payment Format",
        "Is Laundering": "Is Laundering",
        "Timestamp": "Timestamp",
    }
    
    # Verify required columns exist
    required = ["Timestamp", "From Bank", "Account", "To Bank", "Account.1",
                 "Amount Paid", "Payment Currency", "Is Laundering"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}. Available: {list(df.columns)}")
    
    # Parse timestamps
    logger.info("Parsing timestamps...")
    df["Timestamp"] = pd.to_datetime(df["Timestamp"], format="mixed", dayfirst=False)
    
    # Currency normalisation to INR
    logger.info("Normalising currencies to INR...")
    df["amount_inr"] = df.apply(
        lambda r: r["Amount Paid"] * FX_RATES.get(str(r["Payment Currency"]).strip(), 1.0),
        axis=1
    )
    
    if "Amount Received" in df.columns and "Receiving Currency" in df.columns:
        df["amount_received_inr"] = df.apply(
            lambda r: r["Amount Received"] * FX_RATES.get(str(r["Receiving Currency"]).strip(), 1.0),
            axis=1
        )
    else:
        df["amount_received_inr"] = df["amount_inr"]
    
    # Flag structuring: amounts just below ₹50,000 reporting threshold
    df["structuring_flag"] = (
        (df["amount_inr"] >= STRUCTURING_LOWER) & (df["amount_inr"] < STRUCTURING_UPPER)
    ).astype(int)
    
    # Anomaly: negative or zero amounts
    df["amount_anomaly"] = (df["Amount Paid"] <= 0).astype(int)
    
    # Create canonical account IDs
    df["src_account"] = df["From Bank"].astype(str) + "_" + df["Account"].astype(str)
    df["dst_account"] = df["To Bank"].astype(str) + "_" + df["Account.1"].astype(str)
    
    # Sort by timestamp
    df = df.sort_values("Timestamp").reset_index(drop=True)
    
    # Summary statistics
    logger.info(f"Total transactions: {len(df):,}")
    logger.info(f"Fraud transactions: {df['Is Laundering'].sum():,} ({df['Is Laundering'].mean()*100:.3f}%)")
    logger.info(f"Unique source accounts: {df['Account'].nunique():,}")
    logger.info(f"Unique dest accounts: {df['Account.1'].nunique():,}")
    logger.info(f"Date range: {df['Timestamp'].min()} to {df['Timestamp'].max()}")
    logger.info(f"Structuring flags: {df['structuring_flag'].sum():,}")
    logger.info(f"Amount anomalies: {df['amount_anomaly'].sum():,}")
    logger.info(f"Currencies: {df['Payment Currency'].unique()}")
    
    # Save processed data
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "transactions.parquet")
    df.to_parquet(output_path, index=False)
    logger.info(f"Saved processed data to {output_path}")
    
    return df


def load_processed(data_dir: str = "data/processed") -> pd.DataFrame:
    """Load previously processed transaction data."""
    path = os.path.join(data_dir, "transactions.parquet")
    if not os.path.exists(path):
        raise FileNotFoundError(f"No processed data at {path}. Run stage1_ingest first.")
    return pd.read_parquet(path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Try default location
        default_paths = [
            "data/raw/HI-Small_Trans.csv",
            "data/raw/HI_Small_Trans.csv",
        ]
        filepath = None
        for p in default_paths:
            if os.path.exists(p):
                filepath = p
                break
        if filepath is None:
            # Try to find any CSV in data/raw
            raw_dir = Path("data/raw")
            if raw_dir.exists():
                csvs = list(raw_dir.glob("*.csv"))
                if csvs:
                    filepath = str(csvs[0])
                    logger.info(f"Auto-detected CSV: {filepath}")
        if filepath is None:
            print("Usage: python -m pipeline.stage1_ingest <path_to_csv>")
            print("Or place IBM AML CSV in data/raw/")
            sys.exit(1)
    else:
        filepath = sys.argv[1]
    
    df = ingest(filepath)
    print(f"\nIngestion complete. {len(df):,} transactions processed.")
