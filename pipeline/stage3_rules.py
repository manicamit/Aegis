"""
AEGIS Stage 3 — FATF-Aligned Rule Engine
Decorator-based rule registration with 6 core AML detection rules.
Each rule evaluates per-account and returns a boolean flag.
"""
import pandas as pd
import networkx as nx
import numpy as np
import os
import sys
import logging
from typing import Dict, List, Set, Any, Optional
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Rule registry
RULES = {}


def rule(name: str, description: str = ""):
    """Decorator to register a rule function."""
    def decorator(fn):
        RULES[name] = {"fn": fn, "description": description}
        return fn
    return decorator


# ═══════════════════════════════════════════════════════
# Rule 1: Structuring (Smurfing)
# ═══════════════════════════════════════════════════════
@rule("structuring", "Multiple transactions just below ₹50,000 reporting threshold")
def detect_structuring(df: pd.DataFrame, account: str, **kwargs) -> bool:
    """Multiple transactions just below ₹50,000 threshold (FATF Rec. 20)."""
    acct_txns = df[df["Account"] == account]
    structured = acct_txns[acct_txns["structuring_flag"] == 1]
    return len(structured) >= 3


# ═══════════════════════════════════════════════════════
# Rule 2: Rapid Movement (Layering)
# ═══════════════════════════════════════════════════════
@rule("rapid_movement", "Multiple transfers within 1 hour — classic layering")
def detect_rapid_movement(df: pd.DataFrame, account: str, **kwargs) -> bool:
    """Multiple transfers within 1 hour (FATF Rec. 7)."""
    acct_txns = df[df["Account"] == account].sort_values("Timestamp")
    if len(acct_txns) < 2:
        return False
    time_diff = acct_txns["Timestamp"].diff().dt.total_seconds().dropna()
    return (time_diff < 3600).sum() >= 3


# ═══════════════════════════════════════════════════════
# Rule 3: Dormant Account Activation
# ═══════════════════════════════════════════════════════
@rule("dormant_activation", "No activity for 180+ days then sudden high-value transfer")
def detect_dormant_activation(df: pd.DataFrame, account: str, **kwargs) -> bool:
    """No activity for 180+ days, then sudden activity (FATF Rec. 29)."""
    acct_txns = df[df["Account"] == account].sort_values("Timestamp")
    if len(acct_txns) < 2:
        return False
    gaps = acct_txns["Timestamp"].diff().dt.days.dropna()
    return (gaps > 180).any()


# ═══════════════════════════════════════════════════════
# Rule 4: Round-Tripping (Circular Transactions)
# ═══════════════════════════════════════════════════════
@rule("round_tripping", "Account appears in a cycle in the transaction graph")
def detect_round_tripping(df: pd.DataFrame, account: str, G: nx.DiGraph = None, **kwargs) -> bool:
    """Account appears in a cycle in the transaction graph."""
    if G is None:
        return False
    node = f"ACC_{account}"
    if node not in G:
        return False
    try:
        cycles = nx.find_cycle(G, node)
        return len(cycles) > 0
    except nx.NetworkXNoCycle:
        return False


# ═══════════════════════════════════════════════════════
# Rule 5: Fan-In / Fan-Out (Mule Pattern)
# ═══════════════════════════════════════════════════════
@rule("fan_in_fan_out", "High in-degree AND out-degree — classic money mule pattern")
def detect_fan_in_fan_out(df: pd.DataFrame, account: str, G: nx.DiGraph = None, **kwargs) -> bool:
    """High in-degree AND high out-degree = classic mule pattern."""
    if G is None:
        return False
    node = f"ACC_{account}"
    if node not in G:
        return False
    in_deg = G.in_degree(node)
    out_deg = G.out_degree(node)
    return in_deg >= 5 and out_deg >= 3


# ═══════════════════════════════════════════════════════
# Rule 6: Profile Mismatch
# ═══════════════════════════════════════════════════════
@rule("profile_mismatch", "Transaction volume inconsistent with declared account profile")
def detect_profile_mismatch(df: pd.DataFrame, account: str, profile_db: dict = None, **kwargs) -> bool:
    """Transaction pattern inconsistent with account profile."""
    if profile_db is None:
        # Without profile data, use statistical anomaly detection
        acct_txns = df[df["Account"] == account]
        if len(acct_txns) == 0:
            return False
        total = acct_txns["amount_inr"].sum() if "amount_inr" in acct_txns.columns else acct_txns["Amount Paid"].sum()
        
        # Flag if total volume is > 3 standard deviations above mean
        all_volumes = df.groupby("Account")["Amount Paid"].sum()
        mean_vol = all_volumes.mean()
        std_vol = all_volumes.std()
        if std_vol > 0:
            return total > mean_vol + 3 * std_vol
        return False
    
    acct_txns = df[df["Account"] == account]
    total = acct_txns["amount_inr"].sum() if "amount_inr" in acct_txns.columns else acct_txns["Amount Paid"].sum()
    profile = profile_db.get(account, {})
    expected_max = profile.get("expected_annual_volume", float("inf"))
    return total > expected_max * 0.5


def evaluate_rules(
    df: pd.DataFrame,
    G: nx.DiGraph = None,
    accounts: List[str] = None,
    profile_db: dict = None,
    progress: bool = True
) -> pd.DataFrame:
    """
    Evaluate all registered rules for each account — vectorized batch mode.
    Pre-groups the DataFrame to avoid repeated O(N) scans.
    Returns DataFrame with one row per account and one column per rule (0/1).
    """
    if accounts is None:
        accounts = sorted(df["Account"].unique())
    
    logger.info(f"Evaluating {len(RULES)} rules across {len(accounts):,} accounts...")
    
    # ── Pre-compute grouped data (single O(N) pass) ──
    logger.info("  Pre-grouping transactions by account...")
    acct_groups = dict(list(df.groupby("Account")))
    
    # Pre-compute volume stats for profile_mismatch
    vol_stats = df.groupby("Account")["Amount Paid"].sum()
    mean_vol = vol_stats.mean()
    std_vol = vol_stats.std()
    vol_threshold = mean_vol + 3 * std_vol if std_vol > 0 else float("inf")
    
    logger.info("  Running rules...")
    results = []
    for i, account in enumerate(accounts):
        row = {"Account": account}
        acct_df = acct_groups.get(account, pd.DataFrame())
        
        # Rule 1: Structuring
        if len(acct_df) > 0 and "structuring_flag" in acct_df.columns:
            row["rule_structuring"] = int((acct_df["structuring_flag"] == 1).sum() >= 3)
        else:
            row["rule_structuring"] = 0
        
        # Rule 2: Rapid movement
        if len(acct_df) >= 2:
            sorted_ts = acct_df["Timestamp"].sort_values()
            diffs = sorted_ts.diff().dt.total_seconds().dropna()
            row["rule_rapid_movement"] = int((diffs < 3600).sum() >= 3)
        else:
            row["rule_rapid_movement"] = 0
        
        # Rule 3: Dormant activation
        if len(acct_df) >= 2:
            sorted_ts = acct_df["Timestamp"].sort_values()
            gaps = sorted_ts.diff().dt.days.dropna()
            row["rule_dormant_activation"] = int((gaps > 180).any())
        else:
            row["rule_dormant_activation"] = 0
        
        # Rule 4: Round-tripping (graph-based)
        if G is not None:
            node = f"ACC_{account}"
            if node in G:
                try:
                    cycles = nx.find_cycle(G, node)
                    row["rule_round_tripping"] = int(len(cycles) > 0)
                except nx.NetworkXNoCycle:
                    row["rule_round_tripping"] = 0
            else:
                row["rule_round_tripping"] = 0
        else:
            row["rule_round_tripping"] = 0
        
        # Rule 5: Fan-in/fan-out (graph-based)
        if G is not None:
            node = f"ACC_{account}"
            if node in G:
                row["rule_fan_in_fan_out"] = int(
                    G.in_degree(node) >= 5 and G.out_degree(node) >= 3
                )
            else:
                row["rule_fan_in_fan_out"] = 0
        else:
            row["rule_fan_in_fan_out"] = 0
        
        # Rule 6: Profile mismatch
        if len(acct_df) > 0:
            total = acct_df["amount_inr"].sum() if "amount_inr" in acct_df.columns else acct_df["Amount Paid"].sum()
            row["rule_profile_mismatch"] = int(total > vol_threshold)
        else:
            row["rule_profile_mismatch"] = 0
        
        # Composite score
        rule_cols = [f"rule_{r}" for r in RULES]
        row["rules_triggered"] = sum(row.get(c, 0) for c in rule_cols)
        results.append(row)
        
        if progress and (i + 1) % 50000 == 0:
            logger.info(f"  Evaluated {i+1:,}/{len(accounts):,} accounts")
    
    result_df = pd.DataFrame(results)
    
    # Summary
    for rule_name in RULES:
        col = f"rule_{rule_name}"
        count = result_df[col].sum()
        logger.info(f"  Rule '{rule_name}': {count:,} accounts flagged ({count/len(accounts)*100:.2f}%)")
    
    logger.info(f"  Accounts with ≥1 rule triggered: {(result_df['rules_triggered'] > 0).sum():,}")
    
    return result_df


def save_rule_results(rule_df: pd.DataFrame, output_dir: str = "data/processed"):
    """Save rule evaluation results."""
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "rule_flags.parquet")
    rule_df.to_parquet(path, index=False)
    logger.info(f"Saved rule flags to {path}")


def load_rule_results(data_dir: str = "data/processed") -> pd.DataFrame:
    """Load saved rule results."""
    path = os.path.join(data_dir, "rule_flags.parquet")
    return pd.read_parquet(path)


if __name__ == "__main__":
    from pipeline.stage1_ingest import load_processed
    from pipeline.stage2_graph import load_graph
    
    df = load_processed()
    
    # Try to load graph for graph-based rules
    try:
        G, _, _ = load_graph()
        logger.info("Loaded transaction graph for graph-based rules")
    except FileNotFoundError:
        G = None
        logger.warning("No graph found — skipping graph-based rules (round_tripping, fan_in_fan_out)")
    
    accounts = sorted(df["Account"].unique())
    rule_df = evaluate_rules(df, G=G, accounts=accounts)
    save_rule_results(rule_df)
    
    print(f"\nRule evaluation complete for {len(accounts):,} accounts.")
