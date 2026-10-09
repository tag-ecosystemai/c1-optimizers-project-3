"""
RunOut v2 — Build a point-in-time inventory snapshot
Location: cascade/build_inventory_snapshot.py

WHY THIS EXISTS
The original seed stamped inventory at 2015-01-01 (3x total orders), but
the cascade needs stock AS OF the simulated "today" (late in the data).
With 3x stock a stockout would also basically never happen.

HOW IT WORKS
For each (warehouse, product) with recent demand:
    weekly_avg   = units ordered in the trailing N weeks / N
    cover_weeks  = deterministic pseudo-random value in [min_cover, max_cover]
    stock_on_hand = weekly_avg * cover_weeks
So stock reflects real demand but some SKUs are lean and others comfortable.
The random draw is seeded by (seed, warehouse, product), so re-runs give
identical numbers. This is SIMULATED inventory; the cover range is a demo knob.

Usage:
    python cascade/build_inventory_snapshot.py
    python cascade/build_inventory_snapshot.py --as-of 2018-01-20
    python cascade/build_inventory_snapshot.py --min-cover 0.3 --max-cover 3
"""

import os
import sys
import random
import argparse
from collections import defaultdict
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from ingestion.common.client import get_client
from cascade.db_utils import fetch_all, default_as_of

EXCLUDED_STATUSES = {"CANCELED", "SUSPECTED_FRAUD"}
BATCH = 500


def run(args):
    sb = get_client()
    as_of = args.as_of or default_as_of(sb)
    lo = as_of - timedelta(days=7 * args.lookback_weeks)

    print("=" * 60)
    print("RunOut — Inventory snapshot")
    print("=" * 60)
    print(f"As-of date:     {as_of}")
    print(f"Demand window:  {lo} to {as_of - timedelta(days=1)} ({args.lookback_weeks} weeks)")
    print(f"Cover range:    {args.min_cover} to {args.max_cover} weeks (seed={args.seed})")

    print("\nLoading orders in the demand window...")
    rows = fetch_all(
        sb, "orders",
        "order_id,warehouse_id,product_id,order_item_quantity,order_status",
        "order_id",
        apply=lambda q: q.gte("order_date", lo.isoformat()).lt("order_date", as_of.isoformat()),
    )
    print(f"  {len(rows):,} orders")

    units = defaultdict(float)
    for o in rows:
        if o.get("order_status") in EXCLUDED_STATUSES:
            continue
        key = (o["warehouse_id"], o["product_id"])
        units[key] += o.get("order_item_quantity") or 0

    inv_rows = []
    for (wid, pid), total in units.items():
        weekly = total / args.lookback_weeks
        cover = random.Random(f"{args.seed}-{wid}-{pid}").uniform(args.min_cover, args.max_cover)
        stock = max(1, int(round(weekly * cover)))
        inv_rows.append({
            "warehouse_id": wid,
            "product_id": pid,
            "stock_on_hand": stock,
            "as_of_date": as_of.isoformat(),
        })

    print(f"\nWriting {len(inv_rows):,} inventory rows (as_of_date={as_of})...")
    for i in range(0, len(inv_rows), BATCH):
        sb.table("warehouse_inventory").upsert(
            inv_rows[i:i + BATCH],
            on_conflict="warehouse_id,product_id,as_of_date",
        ).execute()

    covers = sorted(
        r["stock_on_hand"] / (units[(r["warehouse_id"], r["product_id"])] / args.lookback_weeks)
        for r in inv_rows
    )
    if covers:
        print("\nSimulated cover (weeks of trailing demand):")
        print(f"  min {covers[0]:.2f} | median {covers[len(covers)//2]:.2f} | max {covers[-1]:.2f}")
        print(f"  under 1 week: {sum(c < 1 for c in covers):,} SKUs")
        print(f"  1 to 2 weeks: {sum(1 <= c < 2 for c in covers):,} SKUs")
        print(f"  2+ weeks:     {sum(c >= 2 for c in covers):,} SKUs")

    print("\nDone. Older snapshots (e.g. 2015-01-01) are ignored by the cascade.")
    print("NOTE: inventory is simulated from historical DataCo demand.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", type=date.fromisoformat, default=None,
                    help="simulated today, YYYY-MM-DD (default: last order date minus 7 days)")
    ap.add_argument("--lookback-weeks", type=int, default=8)
    ap.add_argument("--min-cover", type=float, default=0.5, help="min weeks of cover")
    ap.add_argument("--max-cover", type=float, default=4.0, help="max weeks of cover")
    ap.add_argument("--seed", type=int, default=42)
    run(ap.parse_args())