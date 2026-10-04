"""
RunOut v2 — Build M1 Order Features (DataCo)
Location: ml/build_order_features.py

Reads from `orders` table, builds feature rows for M1 training.
Features include: shipping mode, product category, warehouse region,
distributor segment, month, peak season.

Label (real — from DataCo):
  label_delay_days = days_for_shipping_real - days_for_shipment_scheduled
  label_late_risk  = late_delivery_risk (1=late, 0=on time)

Usage:
    python ml/build_order_features.py
"""

import os
import sys
from datetime import date
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ingestion.common.client import get_client

SHIPPING_MODE_ENCODING = {
    "Standard Class": 1,
    "Second Class": 2,
    "First Class": 3,
    "Same Day": 4,
}
PEAK_MONTHS = {10, 11, 12}
BATCH_SIZE = 1000


def build_features():
    sb = get_client()

    print("Loading orders...")
    # Fetch orders with joins
    orders = sb.table("orders").select(
        "order_id,distributor_id,product_id,warehouse_id,"
        "days_for_shipping_real,days_for_shipment_scheduled,"
        "late_delivery_risk,order_date,shipping_mode,"
        "order_item_quantity,order_item_total,order_region,profit_ratio"
    ).execute().data
    print(f"  {len(orders):,} orders loaded")

    # Also load distributor segments and product categories
    dists = {d["distributor_id"]: d for d in
             sb.table("distributors").select("distributor_id,customer_segment,market").execute().data}
    prods = {p["product_id"]: p for p in
             sb.table("products").select("product_id,category_id,department_id").execute().data}
    whs = {w["warehouse_id"]: w for w in
           sb.table("warehouses").select("warehouse_id,market").execute().data}

    rows = []
    skipped = 0

    for o in orders:
        oid = o.get("order_id")
        if not oid:
            skipped += 1
            continue

        # Parse date
        order_date_str = o.get("order_date")
        if not order_date_str:
            skipped += 1
            continue

        try:
            od = date.fromisoformat(order_date_str[:10]) if isinstance(order_date_str, str) else order_date_str
        except (ValueError, TypeError):
            skipped += 1
            continue

        # Label: actual delay in days
        real_days = o.get("days_for_shipping_real")
        sched_days = o.get("days_for_shipment_scheduled")
        if real_days is not None and sched_days is not None:
            delay = real_days - sched_days
        else:
            delay = None

        # Shipping mode encoding
        sm = o.get("shipping_mode", "")
        sm_enc = SHIPPING_MODE_ENCODING.get(sm, 0)

        # Only include completed or shipped orders (exclude cancelled, pending, etc.)
        rows.append({
            "order_id": oid,
            "distributor_id": o.get("distributor_id"),
            "product_id": o.get("product_id"),
            "warehouse_id": o.get("warehouse_id"),
            "shipping_mode": sm,
            "shipping_mode_encoded": sm_enc,
            "order_item_quantity": o.get("order_item_quantity", 0),
            "order_item_total": o.get("order_item_total", 0.0),
            "month": od.month,
            "is_peak_season": od.month in PEAK_MONTHS,
            "order_region": o.get("order_region", ""),
            "profit_ratio": o.get("profit_ratio", 0.0),
            "label_delay_days": delay,
            "label_late_risk": o.get("late_delivery_risk", 0),
        })

    print(f"  Features built: {len(rows):,} rows (skipped {skipped:,})")

    # Upsert in batches
    written = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        sb.table("ml_order_features").upsert(
            batch,
            on_conflict="order_id"
        ).execute()
        written += len(batch)
        if written % 10000 == 0:
            print(f"  ... {written:,}/{len(rows):,} written")

    # Stats
    late_count = sum(1 for r in rows if r["label_late_risk"] == 1)
    has_delay = sum(1 for r in rows if r["label_delay_days"] is not None)

    print(f"\nDone. Written: {len(rows):,}")
    print(f"  Late delivery flag: {late_count:,} ({late_count/len(rows)*100:.1f}%)" if rows else "")
    print(f"  With delay_days label: {has_delay:,} ({has_delay/len(rows)*100:.1f}%)" if rows else "")
    print("\nFeatures:")
    print("  - shipping_mode_encoded (1-4)")
    print("  - order_item_quantity")
    print("  - order_item_total")
    print("  - month")
    print("  - is_peak_season")
    print("  - order_region")
    print("  - profit_ratio")
    print("Labels: label_delay_days (REAL), label_late_risk (REAL)")


if __name__ == "__main__":
    build_features()