"""
RunOut v2 — Build M2 Distributor Usage Features (DataCo)
Location: ml/build_distributor_features.py

Reads from `orders` table, groups by distributor + product + ISO week,
builds time-series features for M2 training (forecasting next week's
order quantity per distributor).

Features: lagged quantities (1w, 4w), rolling averages, month, peak season.
Target: next week's order quantity (real — from historical data).

Usage:
    python ml/build_distributor_features.py
"""

import os
import sys
from datetime import date, timedelta, datetime
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ingestion.common.client import get_client

PEAK_MONTHS = {10, 11, 12}
BATCH_SIZE = 1000


def monday_of(d):
    return d - timedelta(days=d.weekday())


def load_all_orders(sb):
    """Supabase caps a single select() at 1,000 rows by default —
    this pages through until everything is loaded."""
    all_orders = []
    page_size = 1000
    start = 0
    while True:
        batch = sb.table("orders").select(
            "order_id,distributor_id,product_id,order_date,order_item_quantity"
        ).range(start, start + page_size - 1).execute().data
        if not batch:
            break
        all_orders.extend(batch)
        start += page_size
        print(f"  ... loaded {len(all_orders):,} so far")
    return all_orders


def build_features():
    sb = get_client()

    print("Loading orders...")
    orders = load_all_orders(sb)
    print(f"  {len(orders):,} orders loaded")

    # Group by (distributor_id, product_id, ISO week) -> total quantity
    weekly = defaultdict(int)
    weekly_dates = {}  # (dist, prod, week_start) -> first order date for period_start

    for o in orders:
        did = o.get("distributor_id")
        pid = o.get("product_id")
        qty = o.get("order_item_quantity") or 0
        od_str = o.get("order_date")
        if not did or not pid or not od_str:
            continue
        try:
            od = date.fromisoformat(str(od_str)[:10]) if isinstance(od_str, str) else od_str
        except (ValueError, TypeError):
            continue
        wk = monday_of(od)
        key = (did, pid, wk)
        weekly[key] += qty
        if key not in weekly_dates:
            weekly_dates[key] = wk

    print(f"  {len(weekly):,} distributor-product-week groups")

    # Build feature rows
    # First, group by (distributor_id, product_id) for lag computation
    grouped = defaultdict(dict)
    for (did, pid, wk), qty in sorted(weekly.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
        grouped[(did, pid)][wk] = qty

    rows = []
    skipped = 0

    for (did, pid), weeks in grouped.items():
        sorted_weeks = sorted(weeks.items())
        for i, (wk, qty) in enumerate(sorted_weeks):
            lag_1w = sorted_weeks[i - 1][1] if i >= 1 else None
            lag_4w = sorted_weeks[i - 4][1] if i >= 4 else None

            # Rolling average of last 4 weeks (excluding this week)
            ma_values = [sorted_weeks[j][1] for j in range(max(0, i - 4), i)]
            ma_4w = sum(ma_values) / len(ma_values) if ma_values else None

            # Target: next week's qty
            next_qty = sorted_weeks[i + 1][1] if i < len(sorted_weeks) - 1 else None

            rows.append({
                "distributor_id": did,
                "product_id": pid,
                "period_start": wk.isoformat(),
                "order_quantity": qty,
                "month": wk.month,
                "is_peak_season": wk.month in PEAK_MONTHS,
                "qty_lag_1w": lag_1w,
                "qty_lag_4w": lag_4w,
                "qty_ma_4w": round(ma_4w, 2) if ma_4w else None,
                "label_next_week_qty": next_qty,
            })

    print(f"  Feature rows: {len(rows):,}")

    # Upsert in batches
    written = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        sb.table("distributor_usage").upsert(
            batch,
            on_conflict="distributor_id,product_id,period_start"
        ).execute()
        written += len(batch)
        if written % 10000 == 0:
            print(f"  ... {written:,}/{len(rows):,} written")

    print(f"\nDone. Written: {written:,}")
    print("Features:")
    print("  - order_quantity (this week)")
    print("  - month")
    print("  - is_peak_season")
    print("  - qty_lag_1w (last week)")
    print("  - qty_lag_4w (4 weeks ago)")
    print("  - qty_ma_4w (4-week rolling average)")
    print("Label: label_next_week_qty (next week's order quantity)")


if __name__ == "__main__":
    build_features()