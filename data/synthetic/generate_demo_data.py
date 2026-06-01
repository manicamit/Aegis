"""
AEGIS — Synthetic Demo Data Generator
Generates realistic demo transactions with known laundering patterns.

Two modes of use:
  1. generate_demo_data()    — standalone synthetic dataset (fallback, no IBM)
  2. inject_demo_chains(df)  — injects hand-crafted chains into an IBM AML
                               DataFrame so demo accounts live inside the real
                               5M-transaction graph and score high at inference.
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

# IBM-realistic bank codes (from HI-Small dataset)
IBM_BANKS = ["010", "020", "021174", "01467", "0240229", "0213737",
             "014290", "0010057", "0024856", "0071", "0028628", "01292"]

# Demo account prefix — IBM accounts all start with 8xxxxxxxx so C0DE prefix
# guarantees zero collision with any real IBM account ID.
_DEMO_PREFIX = "C0DE"


def _acc(n: int) -> str:
    """Format account ID as 9-char uppercase hex to match IBM AML layout."""
    return f"{int(n):09X}"


def _demo_acc(chain_id: int, slot: int) -> str:
    """9-char hex demo account: C0DE + 2-digit chain + 3-digit slot."""
    return f"{_DEMO_PREFIX}{chain_id:02X}{slot:03X}"


def _txn(ts, from_bank, src, to_bank, dst, amount, fmt="Wire", currency="Rupees"):
    return {
        "Timestamp": ts,
        "From Bank": from_bank,
        "Account": src,
        "To Bank": to_bank,
        "Account.1": dst,
        "Amount Received": amount,
        "Receiving Currency": currency,
        "Amount Paid": amount,
        "Payment Currency": currency,
        "Payment Format": fmt,
        "Is Laundering": 1,
    }


# ---------------------------------------------------------------------------
# New high-quality generators (demo chain IDs start at 0x10 / 0x20 / 0x30)
# ---------------------------------------------------------------------------

def _gen_deep_layering_branch_switch(chain_id: int, base_time: datetime) -> list:
    """
    12-hop layering chain across 4 rotating banks.
    Amounts decay 3 % per hop.
    At hop 6 the chain forks into two parallel branches; both reconverge
    at hop 10 before continuing to the final destination.

    Topology (16 unique nodes, 17 edges):
      A0→A1→A2→A3→A4→A5→A6→A7→A8→A9→A10→A11→A12
                              ↘               ↗
                               B0→B1→B2
    """
    txns = []
    main = [_demo_acc(chain_id, i) for i in range(13)]   # A0-A12
    branch = [_demo_acc(chain_id, 20 + i) for i in range(3)]  # B0-B2
    banks = ["010", "021174", "01467", "0240229"]
    amt = 500_000.0

    # Hops 0-5: linear main chain
    for i in range(6):
        a = amt * (0.97 ** i)
        txns.append(_txn(
            base_time + timedelta(hours=i * 2, minutes=int(np.random.randint(5, 25))),
            banks[i % 4], main[i], banks[(i + 1) % 4], main[i + 1],
            round(a, 2), fmt="Wire" if i % 2 == 0 else "ACH",
        ))

    # Hop-6 fork: main[6] → main[7] (60 %) AND main[6] → branch[0] (40 %)
    fork_ts = base_time + timedelta(hours=12, minutes=10)
    fork_amt = amt * (0.97 ** 6)
    txns.append(_txn(fork_ts,              banks[2], main[6], banks[3], main[7],
                     round(fork_amt * 0.60, 2), fmt="Wire"))
    txns.append(_txn(fork_ts + timedelta(minutes=15), banks[2], main[6], banks[0], branch[0],
                     round(fork_amt * 0.40, 2), fmt="ACH"))

    # Main branch: hops 7-9
    for i in range(7, 10):
        a = amt * (0.97 ** i) * 0.60
        txns.append(_txn(
            base_time + timedelta(hours=13 + (i - 7) * 3,
                                  minutes=int(np.random.randint(0, 20))),
            banks[i % 4], main[i], banks[(i + 1) % 4], main[i + 1],
            round(a, 2), fmt="Wire",
        ))

    # Side branch: B0→B1→B2→main[10]
    for j in range(2):
        a = amt * (0.97 ** (7 + j)) * 0.40
        txns.append(_txn(
            base_time + timedelta(hours=13 + j * 4,
                                  minutes=int(np.random.randint(5, 30))),
            banks[j % 4], branch[j], banks[(j + 1) % 4], branch[j + 1],
            round(a, 2), fmt="ACH",
        ))
    # B2 reconverges into main[10]
    txns.append(_txn(
        base_time + timedelta(hours=22, minutes=20),
        banks[1], branch[2], banks[2], main[10],
        round(amt * (0.97 ** 9) * 0.35, 2), fmt="Wire",
    ))

    # Hops 10-11: main[10]→main[11]→main[12]
    for i in range(10, 12):
        a = amt * (0.97 ** i) * 0.50
        txns.append(_txn(
            base_time + timedelta(hours=24 + (i - 10) * 4,
                                  minutes=int(np.random.randint(0, 30))),
            banks[i % 4], main[i], banks[(i + 1) % 4], main[i + 1],
            round(a, 2), fmt="Wire",
        ))

    return txns


def _gen_mule_fan_in_fan_out_wide(chain_id: int, base_time: datetime) -> list:
    """
    8 distinct source accounts funnel into one mule within 60 minutes,
    then the mule disperses to 6 distinct destinations across different
    banks over the next 2 hours.  Sankey-worthy.
    """
    txns = []
    mule = _demo_acc(chain_id, 0)
    sources = [_demo_acc(chain_id, i + 1) for i in range(8)]
    dests   = [_demo_acc(chain_id, i + 10) for i in range(6)]

    src_banks = IBM_BANKS[:8]
    dst_banks = IBM_BANKS[4:10]

    # 8 sources → mule
    total_in = 0.0
    for src, bk in zip(sources, src_banks):
        a = round(float(np.random.uniform(80_000, 150_000)), 2)
        total_in += a
        txns.append(_txn(
            base_time + timedelta(minutes=int(np.random.randint(0, 55))),
            bk, src, "020", mule, a, fmt="Wire",
        ))

    # mule → 6 destinations  (distribute total_in approximately evenly)
    share = total_in / 6
    for dst, bk in zip(dests, dst_banks):
        a = round(share * float(np.random.uniform(0.85, 1.15)), 2)
        txns.append(_txn(
            base_time + timedelta(hours=1, minutes=int(np.random.randint(0, 110))),
            "020", mule, bk, dst, a, fmt="ACH",
        ))

    return txns


def _gen_inter_branch_split_consolidate(chain_id: int, base_time: datetime) -> list:
    """
    Structuring + consolidation hybrid (triggers P5 rule):
      1. Source sends 4 sub-threshold amounts (₹45-49k) to 4 different
         To Bank values within 24 h.
      2. Each of those 4 intermediaries forwards to a single ultimate
         beneficiary within the next 24 h.

    Triggers: structuring flag on all 4 outbound legs AND fan-in on beneficiary.
    """
    txns = []
    source = _demo_acc(chain_id, 0)
    intermediaries = [_demo_acc(chain_id, i + 1) for i in range(4)]
    beneficiary = _demo_acc(chain_id, 10)

    inter_banks = ["010", "021174", "01467", "0213737"]

    # Source → 4 intermediaries (sub-threshold, spread over 20 h)
    for inter, bk in zip(intermediaries, inter_banks):
        a = round(float(np.random.uniform(45_000, 49_999)), 2)
        txns.append(_txn(
            base_time + timedelta(hours=int(np.random.randint(0, 20)),
                                  minutes=int(np.random.randint(0, 59))),
            "020", source, bk, inter, a, fmt="ACH",
        ))

    # Each intermediary → common beneficiary (next 24 h)
    for i, (inter, bk) in enumerate(zip(intermediaries, inter_banks)):
        a = round(float(np.random.uniform(40_000, 48_000)), 2)
        txns.append(_txn(
            base_time + timedelta(hours=22 + i, minutes=int(np.random.randint(0, 50))),
            bk, inter, "0028628", beneficiary, a, fmt="Wire",
        ))

    return txns


def inject_demo_chains(df: pd.DataFrame, n_each: int = 4) -> pd.DataFrame:
    """
    Inject hand-crafted high-signal fraud chains into an IBM AML DataFrame.

    Chains are timestamped within the IBM dataset's date range (detected
    automatically from df["Timestamp"]).  Account IDs use the C0DE prefix
    so they can never collide with real IBM accounts (which all start with 8).

    Call this AFTER timestamp parsing but BEFORE currency normalisation so
    that stage1 computes amount_inr for injected rows automatically.

    Returns the combined DataFrame (not yet sorted — caller should sort).
    """
    rng = np.random.default_rng(seed=99)

    ts_min = df["Timestamp"].min()
    ts_max = df["Timestamp"].max()
    date_range_days = max(1, (ts_max - ts_min).days - 2)

    generators = [
        (_gen_deep_layering_branch_switch, 0x10),
        (_gen_mule_fan_in_fan_out_wide,    0x20),
        (_gen_inter_branch_split_consolidate, 0x30),
    ]

    injected: list = []
    for gen_fn, id_offset in generators:
        for i in range(n_each):
            chain_id = id_offset + i
            day_offset = int(rng.integers(1, date_range_days))
            hour_offset = int(rng.integers(0, 20))
            base_time = ts_min + timedelta(days=day_offset, hours=hour_offset)
            injected.extend(gen_fn(chain_id, base_time))

    inject_df = pd.DataFrame(injected)
    n_chains = n_each * len(generators)
    logger.info(
        "Injected %d demo transactions (%d fraud) across %d chains into IBM dataset",
        len(inject_df), int(inject_df["Is Laundering"].sum()), n_chains,
    )

    combined = pd.concat([df, inject_df], ignore_index=True)
    return combined


# ---------------------------------------------------------------------------
# Standalone synthetic dataset (fallback when IBM data unavailable)
# ---------------------------------------------------------------------------

def generate_demo_data(
    num_legit: int = 50000,
    num_fraud_chains: int = 25,
    output_dir: str = "data/synthetic",
    seed: int = 42,
):
    """Generate standalone synthetic transaction data with embedded laundering patterns."""
    np.random.seed(seed)
    logger.info(f"Generating {num_legit:,} legit + {num_fraud_chains} fraud chains...")

    base_date = datetime(2024, 1, 1)
    all_transactions = []

    logger.info("Generating legitimate transactions...")
    for i in range(num_legit):
        src_bank = np.random.choice(BANKS)
        dst_bank = np.random.choice(BANKS)
        src_acc = _acc(np.random.randint(100000, 999999))
        dst_acc = _acc(np.random.randint(100000, 999999))
        while dst_acc == src_acc:
            dst_acc = _acc(np.random.randint(100000, 999999))

        amount = np.random.lognormal(mean=8, sigma=2)
        amount = max(10, min(amount, 5_000_000))
        days_offset  = np.random.randint(0, 365)
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

    logger.info(f"Generating {num_fraud_chains} fraud chains...")
    patterns = ["layering", "structuring", "round_trip", "dormant", "fan_in_fan_out"]

    for chain_id in range(num_fraud_chains):
        pattern = patterns[chain_id % len(patterns)]
        chain_day  = np.random.randint(30, 330)
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

    # High-quality fraud chains with rich graph structure
    hq_generators = [
        (_gen_deep_layering_branch_switch, 0x10),
        (_gen_mule_fan_in_fan_out_wide,    0x20),
        (_gen_inter_branch_split_consolidate, 0x30),
    ]
    n_hq_each = 4
    logger.info(f"Generating {n_hq_each * len(hq_generators)} high-quality fraud chains...")
    for gen_fn, id_offset in hq_generators:
        for i in range(n_hq_each):
            chain_id = id_offset + i
            chain_day = np.random.randint(30, 330)
            chain_base = base_date + timedelta(days=chain_day)
            all_transactions.extend(gen_fn(chain_id, chain_base))

    df = pd.DataFrame(all_transactions)
    df = df.sort_values("Timestamp").reset_index(drop=True)

    os.makedirs(output_dir, exist_ok=True)
    csv_path = os.path.join(output_dir, "demo_transactions.csv")
    df.to_csv(csv_path, index=False)
    logger.info(f"Saved {len(df):,} transactions to {csv_path}")
    logger.info(f"  Fraud: {df['Is Laundering'].sum():,} ({df['Is Laundering'].mean()*100:.2f}%)")
    return df


# ---------------------------------------------------------------------------
# Original generators (kept for standalone mode)
# ---------------------------------------------------------------------------

def _gen_layering(chain_id, base_time, hops=7):
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
            "Amount Received": amount * (0.95 ** i), "Receiving Currency": "Rupees",
            "Amount Paid":     amount * (0.95 ** i), "Payment Currency": "Rupees",
            "Payment Format": np.random.choice(["Wire", "ACH"]),
            "Is Laundering": 1,
        })
    return txns


def _gen_structuring(chain_id, base_time, count=8):
    txns = []
    src = _acc(810000 + chain_id * 10)
    dst = _acc(810001 + chain_id * 10)
    for _ in range(count):
        amount = np.random.uniform(45000, 49999)
        txns.append({
            "Timestamp": base_time + timedelta(hours=np.random.randint(1, 48)),
            "From Bank": np.random.choice(BANKS), "Account": src,
            "To Bank": np.random.choice(BANKS), "Account.1": dst,
            "Amount Received": amount, "Receiving Currency": "Rupees",
            "Amount Paid":     amount, "Payment Currency": "Rupees",
            "Payment Format": "ACH", "Is Laundering": 1,
        })
    return txns


def _gen_round_trip(chain_id, base_time):
    accs = [_acc(820000 + chain_id * 10 + i) for i in range(3)]
    amount = np.random.uniform(100000, 300000)
    return [
        {
            "Timestamp": base_time + timedelta(hours=i * 2),
            "From Bank": np.random.choice(BANKS), "Account": accs[i],
            "To Bank": np.random.choice(BANKS), "Account.1": accs[(i + 1) % 3],
            "Amount Received": amount, "Receiving Currency": "Rupees",
            "Amount Paid":     amount, "Payment Currency": "Rupees",
            "Payment Format": "Wire", "Is Laundering": 1,
        }
        for i in range(3)
    ]


def _gen_dormant(chain_id, base_time):
    acc = _acc(830000 + chain_id * 10)
    txns = [{
        "Timestamp": base_time - timedelta(days=np.random.randint(200, 400)),
        "From Bank": np.random.choice(BANKS), "Account": acc,
        "To Bank": np.random.choice(BANKS), "Account.1": _acc(np.random.randint(100000, 999999)),
        "Amount Received": 5000, "Receiving Currency": "Rupees",
        "Amount Paid": 5000, "Payment Currency": "Rupees",
        "Payment Format": "ACH", "Is Laundering": 0,
    }]
    for _ in range(5):
        txns.append({
            "Timestamp": base_time + timedelta(minutes=np.random.randint(10, 120)),
            "From Bank": np.random.choice(BANKS),
            "Account": _acc(np.random.randint(100000, 999999)),
            "To Bank": np.random.choice(BANKS), "Account.1": acc,
            "Amount Received": np.random.uniform(50000, 200000), "Receiving Currency": "Rupees",
            "Amount Paid":     np.random.uniform(50000, 200000), "Payment Currency": "Rupees",
            "Payment Format": "Wire", "Is Laundering": 1,
        })
    return txns


def _gen_fan_in_fan_out(chain_id, base_time):
    mule = _acc(840000 + chain_id * 10)
    txns = []
    for _ in range(6):
        src = _acc(np.random.randint(100000, 799999))
        a   = np.random.uniform(30000, 80000)
        txns.append({
            "Timestamp": base_time + timedelta(minutes=np.random.randint(0, 60)),
            "From Bank": np.random.choice(BANKS), "Account": src,
            "To Bank": np.random.choice(BANKS), "Account.1": mule,
            "Amount Received": a, "Receiving Currency": "Rupees",
            "Amount Paid":     a, "Payment Currency": "Rupees",
            "Payment Format": "Wire", "Is Laundering": 1,
        })
    for _ in range(4):
        dst = _acc(np.random.randint(100000, 799999))
        a   = np.random.uniform(40000, 100000)
        txns.append({
            "Timestamp": base_time + timedelta(hours=1, minutes=np.random.randint(0, 60)),
            "From Bank": np.random.choice(BANKS), "Account": mule,
            "To Bank": np.random.choice(BANKS), "Account.1": dst,
            "Amount Received": a, "Receiving Currency": "Rupees",
            "Amount Paid":     a, "Payment Currency": "Rupees",
            "Payment Format": "ACH", "Is Laundering": 1,
        })
    return txns


if __name__ == "__main__":
    df = generate_demo_data()
    print(f"\nGenerated {len(df):,} demo transactions.")
    print(f"Fraud: {df['Is Laundering'].sum():,} ({df['Is Laundering'].mean()*100:.2f}%)")
