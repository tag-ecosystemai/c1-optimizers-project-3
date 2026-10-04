"""
RunOut v2 — Cascade / Impact Engine (DataCo)
Location: cascade/impact.py

Reads M1 predictions + warehouse inventory + M2 usage forecasts,
computes stockout risk and money-at-risk per order.

Logic:
  days_of_cover = stock_on_hand / distributor_weekly_usage
  stockout_date = inventory.as_of_date + days_of_cover
  projected_arrival = order.shipping_date + predicted_delay_days
  if projected_arrival > stockout_date:
      gap_days, units_short, money_at_risk = gap * usage * unit_margin

Usage:
    python cascade/impact.py
    python cascade/impact.py --refresh  (recompute all)
    python cascade/impact.py --assumed-delay-days 7  (stub without M1)
"""

import os
import sys
import argparse
from datetime import date, timedelta, datetime
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ingestion.common.client import get_client

DEFAULT_USAGE = 50.0
DEFAULT_MARGIN = 5.0
DEFAULT_ASSUMED_DELAY = 5.0

RISK_BANDS = ((100, "LOW"), (500, "MEDIUM"), (float("inf"), "HIGH"))


def band(money):
    for ceiling, label in RISK_BANDS:
        if money < ceiling:
            return label
    return "HIGH"


def run():
    sb = get_client()
    refresh = FLAGS.refresh
    assumed_delay = FLAGS.assumed_delay_days
    default_margin = FLAGS.default_margin_usd

    print("=" * 60)
    print("RunOut Cascade — Impact Engine")
    print("=" * 60)

    # 1. Load predictions or use assumed delay
    if assumed_delay > 0:
        print(f"\nUsing assumed delay: {assumed_delay} days (M1 not yet trained)")
        predictions = defaultdict(lambda: assumed_delay)
    else:
        print("\nLoading M1 predictions...")
        preds = sb.table("predictions").select(
            "order_id,predicted_delay_days"
        ).order("scored_at", desc=True).execute().data
        predictions = {}
        for p in preds:
            oid = p["order_id"]
            if oid not in predictions:
                predictions[oid] = p["predicted_delay_days"]
        print(f"  {len(predictions):,} predictions loaded")

    if not predictions:
        print("No predictions. Pass --assumed-delay-days N to use stub.")
        return

    # 2. Load orders with delay predictions
    order_ids = list(predictions.keys())
    order_data = {}
    for i in range(0, len(order_ids), 100):
        batch = order_ids[i:i + 100]
        orders = (sb.table("orders")
                  .select("order_id,distributor_id,product_id,warehouse_id,"
                          "shipping_date,order_item_quantity,benefit_per_order")
                  .in_("order_id", batch)
                  .execute().data)
        for o in orders:
            order_data[o["order_id"]] = o
    print(f"  {len(order_data):,} orders matched")

    # 3. Load inventory per (warehouse, product)
    inventory = {}
    inv_rows = sb.table("warehouse_inventory").select(
        "warehouse_id,product_id,stock_on_hand,as_of_date"
    ).execute().data
    for i in inv_rows:
        inv_key = (i["warehouse_id"], i["product_id"])
        if inv_key not in inventory or i["as_of_date"] > inventory[inv_key]["as_of_date"]:
            inventory[inv_key] = i
    print(f"  {len(inventory):,} inventory records")

    # 4. Load M2 usage forecast per distributor per product
    usage = {}
    usage_rows = sb.table("distributor_usage").select(
        "distributor_id,product_id,label_next_week_qty,period_start"
    ).order("period_start", desc=True).execute().data
    for u in usage_rows:
        key = (u["distributor_id"], u["product_id"])
        if key not in usage:
            usage[key] = u["label_next_week_qty"] or DEFAULT_USAGE
    print(f"  {len(usage):,} usage forecasts")

    # 5. Compute cascade
    results = []
    today = date.today()

    for oid, delay_days in predictions.items():
        o = order_data.get(oid)
        if not o:
            continue

        wid = o.get("warehouse_id")
        pid = o.get("product_id")
        did = o.get("distributor_id")
        inv_key = (wid, pid)
        usage_key = (did, pid)
        inv = inventory.get(inv_key)

        if not inv:
            continue

        stock = float(inv["stock_on_hand"])
        inv_date = date.fromisoformat(str(inv["as_of_date"])[:10]) if isinstance(inv["as_of_date"], str) else inv["as_of_date"]
        daily_usage = float(usage.get(usage_key, DEFAULT_USAGE))

        days_of_cover = stock / daily_usage if daily_usage > 0 else 999
        stockout = inv_date + timedelta(days=int(days_of_cover))

        # Projected arrival = shipping_date + delay
        ship_str = o.get("shipping_date")
        if ship_str:
            ship_date = date.fromisoformat(str(ship_str)[:10]) if isinstance(ship_str, str) else ship_str
            arrival = ship_date + timedelta(days=int(delay_days))
        else:
            arrival = today + timedelta(days=int(delay_days))

        if arrival <= stockout:
            units_short = 0
            money_at_risk = 0.0
        else:
            gap = (arrival - stockout).days
            units_short = int(gap * daily_usage)
            margin = float(o.get("benefit_per_order") or default_margin)
            money_at_risk = round(units_short * margin, 2)

        results.append({
            "order_id": oid,
            "distributor_id": did,
            "product_id": pid,
            "warehouse_id": wid,
            "days_of_cover": round(days_of_cover, 2),
            "stockout_date": stockout.isoformat(),
            "units_short": units_short,
            "money_at_risk_usd": money_at_risk,
        })

    # 6. Write results
    if refresh:
        sb.table("cascade_results").delete().neq("cascade_id", 0).execute()

    batch_size = 500
    for i in range(0, len(results), batch_size):
        batch = results[i:i + batch_size]
        for r in batch:
            r["as_of_date"] = today.isoformat()
        sb.table("cascade_results").insert(batch).execute()

    print(f"\nResults: {len(results):,} computed, written to cascade_results")

    # 7. Print top exposures
    results.sort(key=lambda x: x["money_at_risk_usd"], reverse=True)
    print(f"\n{'='*60}")
    print(f"Top {FLAGS.top} exposures:")
    print(f"{'Order':<10} {'Stockout':<14} {'Cover':<8} {'Short':<8} {'$ Risk':<12} {'Band':<8}")
    print(f"{'-'*10} {'-'*14} {'-'*8} {'-'*8} {'-'*12} {'-'*8}")
    for r in results[:FLAGS.top]:
        print(f"{r['order_id']:<10} {r['stockout_date']:<14} "
              f"{r['days_of_cover']:<8.1f} {r['units_short']:<8} "
              f"${r['money_at_risk_usd']:<10,.2f} {band(r['money_at_risk_usd']):<8}")

    print(f"\nNOTE: Inventory values are simulated from historical DataCo orders.")
    print(f"      Margins default to ${default_margin} where benefit_per_order is unset.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--assumed-delay-days", type=float, default=0.0,
                    help="stub delay in days (use when M1 not yet trained)")
    ap.add_argument("--refresh", action="store_true",
                    help="recompute all cascade results")
    ap.add_argument("--default-margin-usd", type=float, default=5.0,
                    help="fallback margin per unit")
    ap.add_argument("--top", type=int, default=10,
                    help="number of top exposures to print")
    FLAGS = ap.parse_args()
    run()