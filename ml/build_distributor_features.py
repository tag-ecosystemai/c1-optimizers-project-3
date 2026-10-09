"""
RunOut v2 — Build M2 Distributor Usage Features (DataCo)
Location: ml/build_distributor_features.py

Reads from `orders`, groups by distributor + product + ISO week, and builds
time-series features for M2 (forecasting next week's order quantity).

What changed in this version
  1. Weeks with NO orders are now filled with 0 (from each series' first week up to the
     last complete week of the data). Before, empty weeks were skipped, so "lag 1 week"
     could really mean several weeks ago and the model never saw quiet weeks, which made
     it overestimate sparse products.
  2. The final partial week of the data is dropped (it would look like a collapse in demand).
  3. A real rolling average of 0 is kept as 0 (it used to become missing).

Features: this week's quantity, lag 1w, lag 4w, 4-week rolling average, month, peak season.
Target:   next week's order quantity (real, from historical data).

Usage:
    python ml/build_distributor_features.py
    python ml/build_distributor_features.py --no-zero-fill     # old behaviour, for comparison
"""

import os
import sys
import argparse
from datetime import date, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

PEAK_MONTHS = {10, 11, 12}
BATCH_SIZE = 1000


def monday_of(d):
    return d - timedelta(days=d.weekday())


def load_all_orders(sb):
    """Supabase caps a single select() at 1,000 rows, so page through everything."""
    all_orders, start, page = [], 0, 1000
    while True:
        batch = (sb.table("orders")
                 .select("order_id,distributor_id,product_id,order_date,order_item_quantity")
                 .order("order_id").range(start, start + page - 1).execute().data)
        if not batch:
            break
        all_orders.extend(batch)
        start += page
        print(f"  ... loaded {len(all_orders):,} so far", end="\r")
    print()
    return all_orders


def build_rows(orders, zero_fill=True):
    """Turn raw order lines into weekly feature rows. Pure function (no database)."""
    parsed, max_date = [], None
    for o in orders:
        did, pid, od_str = o.get("distributor_id"), o.get("product_id"), o.get("order_date")
        if not did or not pid or not od_str:
            continue
        try:
            od = date.fromisoformat(str(od_str)[:10])
        except ValueError:
            continue
        parsed.append((did, pid, od, o.get("order_item_quantity") or 0))
        if max_date is None or od > max_date:
            max_date = od
    if max_date is None:
        return [], None

    # last COMPLETE week: the week must have ended (Sunday) on or before the last order date
    this_monday = monday_of(max_date)
    last_week = this_monday if max_date.weekday() == 6 else this_monday - timedelta(days=7)

    weekly = defaultdict(int)
    for did, pid, od, qty in parsed:
        wk = monday_of(od)
        if wk <= last_week:
            weekly[(did, pid, wk)] += qty

    grouped = defaultdict(dict)
    for (did, pid, wk), qty in weekly.items():
        grouped[(did, pid)][wk] = qty

    rows = []
    for (did, pid), weeks in grouped.items():
        first = min(weeks)
        if zero_fill:
            series, wk = [], first
            while wk <= last_week:
                series.append((wk, weeks.get(wk, 0)))
                wk += timedelta(days=7)
        else:
            series = sorted(weeks.items())

        for i, (wk, qty) in enumerate(series):
            lag_1w = series[i - 1][1] if i >= 1 else None
            lag_4w = series[i - 4][1] if i >= 4 else None
            window = [series[j][1] for j in range(max(0, i - 4), i)]
            ma_4w = sum(window) / len(window) if window else None
            next_qty = series[i + 1][1] if i < len(series) - 1 else None
            rows.append({
                "distributor_id": did,
                "product_id": pid,
                "period_start": wk.isoformat(),
                "order_quantity": qty,
                "month": wk.month,
                "is_peak_season": wk.month in PEAK_MONTHS,
                "qty_lag_1w": lag_1w,
                "qty_lag_4w": lag_4w,
                "qty_ma_4w": round(ma_4w, 2) if ma_4w is not None else None,
                "label_next_week_qty": next_qty,
            })
    return rows, last_week


def build_features(zero_fill=True):
    from ingestion.common.client import get_client
    sb = get_client()

    print("Loading orders...")
    orders = load_all_orders(sb)
    print(f"  {len(orders):,} orders loaded")

    rows, last_week = build_rows(orders, zero_fill=zero_fill)
    zero_rows = sum(1 for r in rows if r["order_quantity"] == 0)
    print(f"  Feature rows: {len(rows):,} ({zero_rows:,} are zero-order weeks)")
    print(f"  Last complete week: {last_week}")

    # remove rows from the partial week left by earlier versions
    sb.table("distributor_usage").delete().gt("period_start", last_week.isoformat()).execute()

    written = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        sb.table("distributor_usage").upsert(
            batch, on_conflict="distributor_id,product_id,period_start").execute()
        written += len(batch)
        if (i // BATCH_SIZE) % 20 == 0:
            print(f"  ... {written:,}/{len(rows):,} written", end="\r")
    print(f"\nDone. Written: {written:,}")
    print("Next: python ml/m2_consumption/train.py, then score.py, then cascade/impact.py")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-zero-fill", action="store_true", help="skip filling empty weeks (old behaviour)")
    build_features(zero_fill=not ap.parse_args().no_zero_fill)