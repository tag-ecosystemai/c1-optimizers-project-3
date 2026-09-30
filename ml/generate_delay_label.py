"""
RunOut — Independent synthetic delay_days label generator
Location: ml/generate_delay_label.py

Generates delay_days from HIDDEN variables that are NOT in the feature
table. Updates only label_delay_days + label_source columns per row.

Usage:
    python ml/generate_delay_label.py
    python ml/generate_delay_label.py --reset  (re-generate all labels)
"""

import os
import sys
import random
import argparse
import time as _time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ingestion.common.client import get_client

# ---------------------------------------------------------------------------
# Hidden variables (NEVER written to the feature table)
# ---------------------------------------------------------------------------

PORT_EFFICIENCY = {
    "Yantian, China": 1.2, "Ningbo, China": 1.1, "Shanghai, China": 1.0,
    "Port Klang, Malaysia": 0.8, "Valencia, Spain": 1.0,
    "Long Beach, USA": 0.7, "Los Angeles, USA": 0.7, "Tacoma, USA": 0.9,
    "Norfolk, USA": 1.0, "Newark, USA": 0.9,
}

ROUTE_BASE_DELAY = {
    ("Yantian, China", "Long Beach, USA"): 2.5,
    ("Ningbo, China", "Long Beach, USA"): 2.5,
    ("Shanghai, China", "Long Beach, USA"): 2.5,
    ("Port Klang, Malaysia", "Long Beach, USA"): 3.5,
    ("Valencia, Spain", "Newark, USA"): 1.5,
}

EFFICIENCY_WEIGHT = 5.0
NOISE_STD = 1.5
RARE_EVENT_PROB = 0.02
RARE_EVENT_MIN = 5.0
RARE_EVENT_MAX = 15.0
SYNTHETIC_SOURCE = "synthetic"


def generate_delay(origin, dest, seed):
    rng = random.Random(seed)
    efficiency = PORT_EFFICIENCY.get(origin, 1.0)
    base = ROUTE_BASE_DELAY.get((origin, dest), 2.0)
    noise = rng.gauss(0.0, NOISE_STD)
    rare = rng.uniform(RARE_EVENT_MIN, RARE_EVENT_MAX) if rng.random() < RARE_EVENT_PROB else 0.0
    delay = base + (1.0 - efficiency) * EFFICIENCY_WEIGHT + noise + rare
    return round(max(0.0, delay), 2)


def run():
    sb = get_client()

    # Fetch ALL valid rows (exclude ghosts where origin_portname is null)
    all_rows = []
    start = 0
    batch_size = 2000
    while True:
        batch = (sb.table("ml_port_features")
                 .select("feature_id,origin_portname,dest_portname,period_start,label_delay_days")
                 .not_.is_("origin_portname", "null")
                 .range(start, start + batch_size - 1)
                 .order("feature_id")
                 .execute().data)
        if not batch:
            break
        all_rows.extend(batch)
        start += batch_size
        print(f"  fetched {len(batch)} rows (total {len(all_rows)})")

    print(f"Total rows: {len(all_rows)}")

    # Generate labels and update one at a time (avoids upsert issues)
    updated = 0
    for row in all_rows:
        if not FLAGS.reset and row["label_delay_days"] is not None:
            continue
        fid = row["feature_id"]
        origin = row["origin_portname"]
        dest = row["dest_portname"]
        seed = f"{origin}|{dest}|{row['period_start']}"
        delay = generate_delay(origin, dest, seed)
        for attempt in range(1, 4):
            try:
                sb.table("ml_port_features").update({
                    "label_delay_days": delay,
                    "label_source": SYNTHETIC_SOURCE,
                }).eq("feature_id", fid).execute()
                updated += 1
                if updated % 500 == 0:
                    print(f"  ... {updated}/{len(all_rows)}")
                break
            except Exception as e:
                if attempt < 3:
                    _time.sleep(2)
                else:
                    print(f"  FAILED row {fid}: {e}")

    delays = []
    sample = (sb.table("ml_port_features")
              .select("label_delay_days")
              .not_.is_("label_delay_days", "null")
              .limit(10000)
              .execute().data)
    delays = [r["label_delay_days"] for r in sample if r.get("label_delay_days") is not None]
    print(f"\nDone. Rows updated: {updated}")
    if delays:
        print(f"Delay range: {min(delays):.2f} - {max(delays):.2f} days")
        print(f"Delay mean:  {sum(delays)/len(delays):.2f} days")
        print(f"Delay median: {sorted(delays)[len(delays)//2]:.2f} days")
    print(f"Source: {SYNTHETIC_SOURCE}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true",
                    help="regenerate all labels even if they exist")
    FLAGS = ap.parse_args()
    run()