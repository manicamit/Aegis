"""
AEGIS — Synthetic Demo Data Generator
Generates realistic demo transactions with known laundering patterns.
Use as fallback when IBM AML dataset is unavailable.
"""
import pandas as pd
import numpy as np
import os
import logging
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BANKS = ["Union Bank", "SBI", "HDFC", "ICICI", "PNB", "BOB", "Canara", "Axis"]
CURRENCIES = ["US Dollar", "Rupees", "Euro", "UK Pound", "Bitcoin", "Yuan"]
FORMATS = ["Cheque", "Wire", "ACH", "Reinvestment", "Credit Card"]


def _acc(n: int) -> str:
    """Format account ID as 9-char uppercase hex to match IBM AML layout."""
    return f"{int(n):09X}"


def generate_demo_data(
    num_legit: int = 50000,
    num_fraud_chains: int = 25,
    output_dir: str = "data/synthetic",
    seed: int = 42,
):
    """Generate synthetic transaction data with embedded laundering patterns."""
    np.random.seed(seed)
    logger.info(f"Generating {num_legit:,} legit + {num_fraud_chains} fraud chains...")

    base_date = datetime(2024, 1, 1)
    all_transactions = []

    # --- Legitimate transactions ---
    logger.info("Generating legitimate transactions...")
    for i in range(num_legit):
        src_bank = np.random.choice(BANKS)
        dst_bank = np.random.choice(BANKS)
        src_acc = _acc(np.random.randint(100000, 999999))
        dst_acc = _acc(np.random.randint(100000, 999999))
        while dst_acc == src_acc:
            dst_acc = _acc(np.random.randint(100000, 999999))

        amount = np.random.lognormal(mean=8, sigma=2)
        amount = max(10, min(amount, 5000000))
        days_offset = np.random.randint(0, 365)
        hours_offset = np.random.randint(0, 24)

        all_transactions.append({
            "Timestamp": base_date + timedelta(days=days_offset, hours=hours_offset,
                                                minutes=np.random.randint(0, 60)),
            "From Bank": src_bank,
            "Account": src_acc,
            "To Bank": dst_bank,
            "Account.1": dst_acc,
            "Amount Received": amount,
            "Receiving Currency": np.random.choice(CURRENCIES, p=[0.15, 0.55, 0.1, 0.08, 0.02, 0.1]),
            "Amount Paid": amount,
            "Payment Currency": np.random.choice(CURRENCIES, p=[0.15, 0.55, 0.1, 0.08, 0.02, 0.1]),
            "Payment Format": np.random.choice(FORMATS),
            "Is Laundering": 0,
        })

    # --- Fraud chains ---
    logger.info(f"Generating {num_fraud_chains} fraud chains...")
    patterns = ["layering", "structuring", "round_trip", "dormant", "fan_in_fan_out"]

    for chain_id in range(num_fraud_chains):
        pattern = patterns[chain_id % len(patterns)]
        chain_day = np.random.randint(30, 330)
        chain_base = base_date + timedelta(days=chain_day)

        if pattern == "layering":
            txns = _gen_layering(chain_id, chain_base)
        elif pattern == "structuring":
            txns = _gen_structuring(chain_id, chain_base)
        elif pattern == "round_trip":
            txns = _gen_round_trip(chain_id, chain_base)
        elif pattern == "dormant":
            txns = _gen_dormant(chain_id, chain_base)
        else:
            txns = _gen_fan_in_fan_out(chain_id, chain_base)

        all_transactions.extend(txns)

    df = pd.DataFrame(all_transactions)
    df = df.sort_values("Timestamp").reset_index(drop=True)

    # Save
    os.makedirs(output_dir, exist_ok=True)
    csv_path = os.path.join(output_dir, "demo_transactions.csv")
    df.to_csv(csv_path, index=False)
    logger.info(f"Saved {len(df):,} transactions to {csv_path}")
    logger.info(f"  Fraud: {df['Is Laundering'].sum():,} ({df['Is Laundering'].mean()*100:.2f}%)")
    return df


def _gen_layering(chain_id, base_time, hops=7):
    """7-hop layering chain through intermediaries."""
    txns = []
    accounts = [_acc(800000 + chain_id * 100 + i) for i in range(hops + 1)]
    amount = np.random.uniform(200000, 500000)
    for i in range(hops):
        txns.append({
            "Timestamp": base_time + timedelta(minutes=np.random.randint(5, 30) * (i + 1)),
            "From Bank": np.random.choice(BANKS),
            "Account": accounts[i],
            "To Bank": np.random.choice(BANKS),
            "Account.1": accounts[i + 1],
            "Amount Received": amount * (0.95 ** i),
            "Receiving Currency": "Rupees",
            "Amount Paid": amount * (0.95 ** i),
            "Payment Currency": "Rupees",
            "Payment Format": np.random.choice(["Wire", "ACH"]),
            "Is Laundering": 1,
        })
    return txns


def _gen_structuring(chain_id, base_time, count=8):
    """Multiple transfers just below ₹50k threshold."""
    txns = []
    src = _acc(810000 + chain_id * 10)
    dst = _acc(810001 + chain_id * 10)
    for i in range(count):
        amount = np.random.uniform(45000, 49999)
        txns.append({
            "Timestamp": base_time + timedelta(hours=np.random.randint(1, 48)),
            "From Bank": np.random.choice(BANKS),
            "Account": src,
            "To Bank": np.random.choice(BANKS),
            "Account.1": dst,
            "Amount Received": amount, "Receiving Currency": "Rupees",
            "Amount Paid": amount, "Payment Currency": "Rupees",
            "Payment Format": "ACH", "Is Laundering": 1,
        })
    return txns


def _gen_round_trip(chain_id, base_time):
    """Circular transaction pattern A→B→C→A."""
    accs = [_acc(820000 + chain_id * 10 + i) for i in range(3)]
    amount = np.random.uniform(100000, 300000)
    txns = []
    for i in range(3):
        txns.append({
            "Timestamp": base_time + timedelta(hours=i * 2),
            "From Bank": np.random.choice(BANKS),
            "Account": accs[i],
            "To Bank": np.random.choice(BANKS),
            "Account.1": accs[(i + 1) % 3],
            "Amount Received": amount, "Receiving Currency": "Rupees",
            "Amount Paid": amount, "Payment Currency": "Rupees",
            "Payment Format": "Wire", "Is Laundering": 1,
        })
    return txns


def _gen_dormant(chain_id, base_time):
    """Dormant account suddenly activated with large transfers."""
    acc = _acc(830000 + chain_id * 10)
    txns = []
    # Old transaction 200+ days ago
    txns.append({
        "Timestamp": base_time - timedelta(days=np.random.randint(200, 400)),
        "From Bank": np.random.choice(BANKS), "Account": acc,
        "To Bank": np.random.choice(BANKS), "Account.1": _acc(np.random.randint(100000, 999999)),
        "Amount Received": 5000, "Receiving Currency": "Rupees",
        "Amount Paid": 5000, "Payment Currency": "Rupees",
        "Payment Format": "ACH", "Is Laundering": 0,
    })
    # Sudden burst
    for i in range(5):
        txns.append({
            "Timestamp": base_time + timedelta(minutes=np.random.randint(10, 120)),
            "From Bank": np.random.choice(BANKS),
            "Account": _acc(np.random.randint(100000, 999999)),
            "To Bank": np.random.choice(BANKS), "Account.1": acc,
            "Amount Received": np.random.uniform(50000, 200000), "Receiving Currency": "Rupees",
            "Amount Paid": np.random.uniform(50000, 200000), "Payment Currency": "Rupees",
            "Payment Format": "Wire", "Is Laundering": 1,
        })
    return txns


def _gen_fan_in_fan_out(chain_id, base_time):
    """Multiple sources → mule → multiple destinations."""
    mule = _acc(840000 + chain_id * 10)
    txns = []
    for i in range(6):
        src = _acc(np.random.randint(100000, 799999))
        txns.append({
            "Timestamp": base_time + timedelta(minutes=np.random.randint(0, 60)),
            "From Bank": np.random.choice(BANKS), "Account": src,
            "To Bank": np.random.choice(BANKS), "Account.1": mule,
            "Amount Received": np.random.uniform(30000, 80000), "Receiving Currency": "Rupees",
            "Amount Paid": np.random.uniform(30000, 80000), "Payment Currency": "Rupees",
            "Payment Format": "Wire", "Is Laundering": 1,
        })
    for i in range(4):
        dst = _acc(np.random.randint(100000, 799999))
        txns.append({
            "Timestamp": base_time + timedelta(hours=1, minutes=np.random.randint(0, 60)),
            "From Bank": np.random.choice(BANKS), "Account": mule,
            "To Bank": np.random.choice(BANKS), "Account.1": dst,
            "Amount Received": np.random.uniform(40000, 100000), "Receiving Currency": "Rupees",
            "Amount Paid": np.random.uniform(40000, 100000), "Payment Currency": "Rupees",
            "Payment Format": "ACH", "Is Laundering": 1,
        })
    return txns


if __name__ == "__main__":
    df = generate_demo_data()
    print(f"\nGenerated {len(df):,} demo transactions.")
    print(f"Fraud: {df['Is Laundering'].sum():,} ({df['Is Laundering'].mean()*100:.2f}%)")
