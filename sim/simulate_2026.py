"""
RunOut v2 - Simulate recent orders (default 2026-07-01 to 2026-10-09)
Location: sim/simulate_2026.py

WHY: the DataCo history ends in January 2018. The demo is clearer with recent dates, so this script creates NEW SIMULATED orders.
HOW: for each market and day it resamples real historical orders of that market (so product mix, shipping modes, quantities,
prices and delay patterns stay realistic), gives them new ids and the new date, and adds SIMULATED disruption events
(table sim_events) that lengthen the real delays of orders in their market, window and shipping modes.
From --heavy-from on, each market gets many more orders a day and each order's quantity and money are multiplied by a skewed
factor (1x to 35x), so that some stock risks are large (HIGH severity) and others small.
It also writes the M1 feature rows (ml_order_features) and M2 weekly usage rows (distributor_usage) for the new orders.

Everything created has data_co_order_id >= 9,000,000, so it is recognisable and replaced on every run. These orders are SIMULATED
and must be described as simulated wherever they are shown.

Usage
    python sim/simulate_2026.py --dry-run                # build and summarise in memory, write nothing
    python sim/simulate_2026.py                          # write (replaces any earlier simulated orders)
    python sim/simulate_2026.py --heavy-per-market-day 600
Then:
    python pipeline/run_all.py --as-of 2026-10-09 --min-cover 0.2 --max-cover 3 --investigate --limit 40
"""
import os
import sys
import pickle
import random
import argparse
from datetime import date, timedelta

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)

SIM_ID_BASE = 9_000_000
EXCLUDED = {"CANCELED", "SUSPECTED_FRAUD"}
MODE_ENC = {"Standard Class": 1, "Second Class": 2, "First Class": 3, "Same Day": 4}
PEAK_MONTHS = {10, 11, 12}
POOL_COLS = ("order_id,distributor_id,product_id,warehouse_id,days_for_shipping_real,days_for_shipment_scheduled,shipping_mode,"
             "order_item_quantity,order_item_total,benefit_per_order,order_profit_per_order,profit_ratio,order_status,"
             "order_region,latitude,longitude")
CACHE = os.path.join(ROOT, "ml", "m1_delay_risk", "artifacts", "frame.pkl")
POOL_CACHE = os.path.join(ROOT, "sim", "pool.pkl")

# Simulated disruptions. They change the REAL delays only; M1 cannot see them (a realistic limitation).
EVENTS = [
    {"market": "Europe", "event_type": "port_congestion", "title": "Port congestion at Rotterdam",
     "description": "Container backlog at the port is slowing ground and sea freight into northern Europe",
     "start_date": date(2026, 9, 24), "end_date": date(2026, 10, 9), "shipping_modes": ["Standard Class", "Second Class"], "extra_delay_days": 5},
    {"market": "Pacific Asia", "event_type": "typhoon", "title": "Typhoon near Singapore and the South China Sea",
     "description": "Severe winds and rain closed ports and grounded flights for several days",
     "start_date": date(2026, 9, 30), "end_date": date(2026, 10, 7), "shipping_modes": None, "extra_delay_days": 6},
    {"market": "USCA", "event_type": "strike", "title": "Dockworker strike on the US West Coast",
     "description": "A walkout at several container terminals is delaying unloading and onward trucking",
     "start_date": date(2026, 9, 25), "end_date": date(2026, 10, 9), "shipping_modes": ["Standard Class", "Second Class"], "extra_delay_days": 5},
    {"market": "LATAM", "event_type": "storm", "title": "Severe storms across southern Brazil",
     "description": "Flooding and landslides closed highways and slowed port operations at Santos",
     "start_date": date(2026, 9, 28), "end_date": date(2026, 10, 8), "shipping_modes": None, "extra_delay_days": 5},
    {"market": "Africa", "event_type": "strike", "title": "Port workers' strike at Lagos",
     "description": "A labour dispute is halting container handling and delaying inland distribution",
     "start_date": date(2026, 9, 26), "end_date": date(2026, 10, 9), "shipping_modes": ["Standard Class", "Second Class", "First Class"], "extra_delay_days": 6},
]


def delivery_status(real, sched):
    return "Late delivery" if real > sched else ("Advance shipping" if real < sched else "Shipping on time")


def generate(pool, wh_by_market, start, end, per_market_day, events, seed, heavy_from=None, heavy_per_market_day=0):
    """Pure function. pool: {warehouse_id: [historical order dicts]}. Returns the list of new order dicts (no order_id yet).
    From heavy_from on, each market gets heavy_per_market_day orders a day, and each order's quantity and money are multiplied
    by a skewed factor (1x to 35x) so that some stock risks are large."""
    rng = random.Random(seed)
    orders, counter, day = [], SIM_ID_BASE, start
    SCALES, WEIGHTS = [1, 2, 3, 5, 8, 12, 20, 35], [30, 20, 15, 12, 9, 7, 5, 2]
    while day <= end:
        heavy = heavy_from is not None and day >= heavy_from
        n = heavy_per_market_day if heavy else per_market_day
        jitter = max(5, n // 16)
        for market, wid in wh_by_market.items():
            rows = pool.get(wid)
            if not rows:
                continue
            for _ in range(max(1, n + rng.randint(-jitter, jitter))):
                b = rng.choice(rows)
                k = rng.choices(SCALES, WEIGHTS)[0] if heavy else 1
                real, sched, mode = int(b["days_for_shipping_real"]), int(b["days_for_shipment_scheduled"]), b["shipping_mode"]
                for ev in events:
                    if ev["market"] == market and ev["start_date"] <= day <= ev["end_date"] and (not ev["shipping_modes"] or mode in ev["shipping_modes"]):
                        real += rng.randint(1, ev["extra_delay_days"])
                        break
                counter += 1
                fl = lambda v: float(v) if v is not None else None
                sc = lambda v: float(v) * k if v is not None else None
                orders.append({
                    "data_co_order_id": counter, "order_item_id": counter, "distributor_id": b["distributor_id"], "product_id": b["product_id"],
                    "warehouse_id": wid, "order_date": day.isoformat(), "shipping_date": (day + timedelta(days=real)).isoformat(),
                    "days_for_shipping_real": real, "days_for_shipment_scheduled": sched, "late_delivery_risk": 1 if real > sched else 0,
                    "delivery_status": delivery_status(real, sched), "shipping_mode": mode, "order_item_quantity": int(b["order_item_quantity"]) * k,
                    "order_item_total": sc(b["order_item_total"]), "benefit_per_order": sc(b["benefit_per_order"]),
                    "order_profit_per_order": sc(b["order_profit_per_order"]), "profit_ratio": fl(b["profit_ratio"]),
                    "order_status": b["order_status"], "order_region": b["order_region"],
                    "latitude": fl(b["latitude"]), "longitude": fl(b["longitude"])})
        day += timedelta(days=1)
    return orders


def feature_row(o):
    """Same fields as ml/build_order_features.py. `o` must carry the database order_id."""
    d = date.fromisoformat(str(o["order_date"])[:10])
    return {"order_id": o["order_id"], "distributor_id": o["distributor_id"], "product_id": o["product_id"], "warehouse_id": o["warehouse_id"],
            "shipping_mode": o["shipping_mode"], "shipping_mode_encoded": MODE_ENC.get(o["shipping_mode"], 0),
            "order_item_quantity": o["order_item_quantity"], "order_item_total": o["order_item_total"], "month": d.month,
            "is_peak_season": d.month in PEAK_MONTHS, "order_region": o["order_region"], "profit_ratio": o["profit_ratio"],
            "label_delay_days": o["days_for_shipping_real"] - o["days_for_shipment_scheduled"], "label_late_risk": o["late_delivery_risk"]}


def load_pool(sb, cache=POOL_CACHE):
    if cache and os.path.exists(cache):
        print(f"Using cached historical pool {cache}")
        return pickle.load(open(cache, "rb"))
    from cascade.db_utils import fetch_all
    print("Loading historical orders to resample (takes a couple of minutes)...")
    rows = fetch_all(sb, "orders", POOL_COLS, "order_id", apply=lambda q: q.lt("data_co_order_id", SIM_ID_BASE))
    pool = {}
    for r in rows:
        if r["order_status"] in EXCLUDED or r["days_for_shipping_real"] is None or r["days_for_shipment_scheduled"] is None:
            continue
        pool.setdefault(r["warehouse_id"], []).append(r)
    print(f"  {sum(len(v) for v in pool.values()):,} usable orders across {len(pool)} warehouses")
    if cache:
        pickle.dump(pool, open(cache, "wb"))
    return pool


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def remove_previous(sb, start):
    """Delete earlier simulated orders, their feature rows and the usage rows of the simulated window."""
    from cascade.db_utils import fetch_all
    ids = [r["order_id"] for r in fetch_all(sb, "orders", "order_id", "order_id", apply=lambda q: q.gte("data_co_order_id", SIM_ID_BASE))]
    if not ids:
        print("No earlier simulated orders to remove.")
    for c in chunks(ids, 200):
        sb.table("predictions").delete().in_("order_id", c).execute()
        sb.table("ml_order_features").delete().in_("order_id", c).execute()
        sb.table("cascade_results").delete().in_("order_id", c).execute()
        sb.table("orders").delete().in_("order_id", c).execute()
    if ids:
        print(f"Removed {len(ids):,} earlier simulated orders (and their features, predictions and cascade rows).")
    sb.table("distributor_usage").delete().gte("period_start", start.isoformat()).execute()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=date.fromisoformat, default=date(2026, 7, 1))
    ap.add_argument("--end", type=date.fromisoformat, default=date(2026, 10, 9))
    ap.add_argument("--per-market-day", type=int, default=80)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--heavy-from", type=date.fromisoformat, default=date(2026, 9, 25))
    ap.add_argument("--heavy-per-market-day", type=int, default=800)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    from ingestion.common.client import get_client
    from ml.build_distributor_features import build_rows
    sb = get_client()
    wh = {w["market"]: w["warehouse_id"] for w in sb.table("warehouses").select("warehouse_id,market").execute().data}
    pool = load_pool(sb)
    orders = generate(pool, wh, a.start, a.end, a.per_market_day, EVENTS, a.seed, a.heavy_from, a.heavy_per_market_day)
    late = sum(o["late_delivery_risk"] for o in orders)
    print(f"\nGenerated {len(orders):,} simulated orders, {a.start} to {a.end}, {late / len(orders):.1%} late")
    for ev in EVENTS:
        n = sum(1 for o in orders if o["warehouse_id"] == wh[ev["market"]] and ev["start_date"].isoformat() <= o["order_date"] <= ev["end_date"].isoformat())
        print(f"  event: {ev['market']:<13} {ev['title']} ({ev['start_date']} to {ev['end_date']}): {n:,} orders in its window")
    usage, last_week = build_rows([{"distributor_id": o["distributor_id"], "product_id": o["product_id"], "order_date": o["order_date"],
                                    "order_item_quantity": o["order_item_quantity"]} for o in orders], zero_fill=True)
    print(f"  M2 weekly usage rows: {len(usage):,} (last complete week {last_week})")
    if a.dry_run:
        print("\nDry run: nothing written.")
        return

    remove_previous(sb, a.start)
    sb.table("sim_events").delete().gte("event_id", 0).execute()
    sb.table("sim_events").insert([{**e, "start_date": e["start_date"].isoformat(), "end_date": e["end_date"].isoformat()} for e in EVENTS]).execute()
    written = 0
    for c in chunks(orders, 500):
        saved = sb.table("orders").upsert(c, on_conflict="data_co_order_id,order_item_id").execute().data
        by_key = {(s["data_co_order_id"], s["order_item_id"]): s["order_id"] for s in saved}
        feats = [feature_row({**o, "order_id": by_key[(o["data_co_order_id"], o["order_item_id"])]}) for o in c]
        sb.table("ml_order_features").upsert(feats, on_conflict="order_id").execute()
        written += len(c)
        print(f"  ... {written:,}/{len(orders):,} orders written", end="\r")
    print()
    for c in chunks(usage, 1000):
        sb.table("distributor_usage").upsert(c, on_conflict="distributor_id,product_id,period_start").execute()
    print(f"Wrote {len(usage):,} usage rows.")
    if os.path.exists(CACHE):
        os.remove(CACHE)
        print("Deleted the stale M1 frame cache (it is rebuilt on the next scoring run).")
    print("\nDone. Next: python pipeline/run_all.py --as-of 2026-10-09 --min-cover 0.2 --max-cover 3 --investigate --limit 40")


if __name__ == "__main__":
    main()