"""
RunOut v2 — Seed DataCo Supply Chain Dataset
Location: db/seed_data_co.py

Loads the DataCoSupplyChainDataset.csv into the RunOut schema.
Limits to 12 illustrative distributors (not 65k real customers).

Usage:
    python db/seed_data_co.py

Expects:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY
    DATACO_CSV_PATH  (optional)
"""

import os
import csv
import sys
from datetime import datetime, date
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ingestion.common.client import get_client

from cascade.db_utils import fetch_all

DEFAULT_CSV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "raw", "DataCoSupplyChainDataset.csv")

WAREHOUSE_NAMES = {
    "USCA": "USCA Distribution Center",
    "Europe": "European Distribution Hub",
    "LATAM": "LATAM Logistics Center",
    "Pacific Asia": "Asia-Pacific Warehouse",
    "Africa": "Africa Regional Depot",
}

# 15 illustrative distributors covering ALL 5 markets × 3 segments
ILLUSTRATIVE_DISTRIBUTORS = [
    {"name": "West Coast Consumer Supply", "segment": "Consumer",   "market": "USCA"},
    {"name": "East Coast Wholesale Corp",  "segment": "Corporate",  "market": "USCA"},
    {"name": "Central US Home Office",     "segment": "Home Office","market": "USCA"},
    {"name": "Nordic Consumer Goods",      "segment": "Consumer",   "market": "Europe"},
    {"name": "German Industrial Supply",   "segment": "Corporate",  "market": "Europe"},
    {"name": "Iberian Home Office",        "segment": "Home Office","market": "Europe"},
    {"name": "Brazil Consumer Dist",       "segment": "Consumer",   "market": "LATAM"},
    {"name": "Mexico Corporate Logistics", "segment": "Corporate",  "market": "LATAM"},
    {"name": "Andean Home Office Supply",  "segment": "Home Office","market": "LATAM"},
    {"name": "Asia Consumer Hub",          "segment": "Consumer",   "market": "Pacific Asia"},
    {"name": "Pacific Corporate Trading",  "segment": "Corporate",  "market": "Pacific Asia"},
    {"name": "Oceania Home Office",        "segment": "Home Office","market": "Pacific Asia"},
    {"name": "Africa Consumer Dist",       "segment": "Consumer",   "market": "Africa"},
    {"name": "Africa Corporate Logistics", "segment": "Corporate",  "market": "Africa"},
    {"name": "Africa Home Office Supply",  "segment": "Home Office","market": "Africa"},
]


def run():
    csv_path = os.environ.get("DATACO_CSV_PATH", DEFAULT_CSV)
    sb = get_client()

    print(f"Loading {csv_path} ...")
    with open(csv_path, "r", encoding="latin-1", newline="") as f:
        rows = list(csv.DictReader(f))
    print(f"  {len(rows):,} rows loaded")

    # ------------------------------------------------------------------
    # 1. Warehouses
    # ------------------------------------------------------------------
    print("\n=== Warehouses ===")
    wh_map = {}
    for market, name in WAREHOUSE_NAMES.items():
        existing = sb.table("warehouses").select("warehouse_id").eq("market", market).execute()
        if existing.data:
            wh_map[market] = existing.data[0]["warehouse_id"]
            print(f"  Exists: {name}")
        else:
            r = sb.table("warehouses").insert({"name": name, "market": market}).execute()
            wh_map[market] = r.data[0]["warehouse_id"]
            print(f"  Created: {name}")

    # ------------------------------------------------------------------
    # 2. Products
    # ------------------------------------------------------------------
    print("\n=== Products ===")
    seen = {}
    for r in rows:
        key = (int(float(r["Product Card Id"])), r["Category Name"])
        if key not in seen:
            seen[key] = {
                "name": r["Product Name"],
                "category_id": int(float(r["Product Card Id"])),
                "category_name": r["Category Name"],
                "department_id": int(r["Department Id"]),
                "department_name": r["Department Name"],
                "unit_price": round(float(r["Product Price"]), 2),
                "unit_margin": round(abs(float(r["Order Item Profit Ratio"])) * float(r["Product Price"]), 2),
            }

    existing = fetch_all(sb, "products", "product_id,category_id,category_name", "product_id")
    existing_map = {(e["category_id"], e["category_name"]): e["product_id"] for e in existing}
    prod_map = {}
    to_insert = [v for k, v in seen.items() if k not in existing_map]
    for item in to_insert:
        r = sb.table("products").insert(item).execute()
        prod_map[(item["category_id"], item["category_name"])] = r.data[0]["product_id"]
    for k, v in existing_map.items():
        prod_map[k] = v
    print(f"  {len(prod_map)} products ({len(to_insert)} new)")

    # ------------------------------------------------------------------
    # 3. Distributors — just the 12 illustrative ones
    # ------------------------------------------------------------------
    print("\n=== Distributors ===")
    dist_map = {}
    for d in ILLUSTRATIVE_DISTRIBUTORS:
        existing = sb.table("distributors").select("distributor_id").eq("name", d["name"]).execute()
        if existing.data:
            dist_map[d["name"]] = existing.data[0]["distributor_id"]
            print(f"  Exists: {d['name']}")
        else:
            r = sb.table("distributors").insert({
                "name": d["name"],
                "customer_segment": d["segment"],
                "market": d["market"],
            }).execute()
            dist_map[d["name"]] = r.data[0]["distributor_id"]
            print(f"  Created: {d['name']} (id={r.data[0]['distributor_id']})")
    print(f"  Total: {len(dist_map)} distributors")

    # ------------------------------------------------------------------
    # 4. Orders — filter to only our 12 distributors
    # ------------------------------------------------------------------
    print("\n=== Orders ===")

    orders_batch = []
    inserted = 0
    skipped = 0

    print("  Building and inserting orders in batches...")
    dist_list = ILLUSTRATIVE_DISTRIBUTORS

    for idx, r in enumerate(rows):
        # Get distributor by market+segment round-robin
        oid = r["Order Id"]
        mkt = r["Market"].strip()
        seg = r["Customer Segment"].strip()
        matching = [d for d in dist_list if d["market"] == mkt and d["segment"] == seg]
        if not matching:
            skipped += 1
            continue
        chosen = matching[int(float(oid)) % len(matching)]
        did = dist_map.get(chosen["name"])
        if not did:
            skipped += 1
            continue

        # Get product
        product_key = (int(float(r["Product Card Id"])), r["Category Name"])
        pid = prod_map.get(product_key)
        if not pid:
            skipped += 1
            continue

        wid = wh_map.get(mkt)
        if not wid:
            skipped += 1
            continue

        try:
            order_date = datetime.strptime(r["order date (DateOrders)"], "%m/%d/%Y %H:%M").date().isoformat()
        except ValueError:
            order_date = None
        try:
            ship_date = datetime.strptime(r["shipping date (DateOrders)"], "%m/%d/%Y %H:%M").date().isoformat()
        except ValueError:
            ship_date = None

        orders_batch.append({
            "data_co_order_id": int(float(r["Order Id"])),
            "order_item_id": int(float(r["Order Item Id"])),
            "distributor_id": did,
            "product_id": pid,
            "warehouse_id": wid,
            "order_date": order_date,
            "shipping_date": ship_date,
            "days_for_shipping_real": int(float(r["Days for shipping (real)"])),
            "days_for_shipment_scheduled": int(float(r["Days for shipment (scheduled)"])),
            "late_delivery_risk": int(float(r["Late_delivery_risk"])),
            "delivery_status": r["Delivery Status"],
            "shipping_mode": r["Shipping Mode"],
            "order_item_quantity": int(float(r["Order Item Quantity"])),
            "order_item_total": round(float(r["Order Item Total"]), 2),
            "benefit_per_order": round(float(r["Benefit per order"]), 2),
            "order_profit_per_order": round(float(r["Order Profit Per Order"]), 2),
            "profit_ratio": round(float(r["Order Item Profit Ratio"]), 4),
            "order_status": r["Order Status"],
            "order_region": r.get("Order Region", ""),
            "latitude": float(r["Latitude"]) if r.get("Latitude") else None,
            "longitude": float(r["Longitude"]) if r.get("Longitude") else None,
        })

        if len(orders_batch) >= 500:
            try:
                sb.table("orders").upsert(orders_batch, on_conflict="data_co_order_id,order_item_id").execute()
                inserted += len(orders_batch)
                print(f"  ... {inserted:,}/{len(rows):,} orders", end="\r")
            except Exception as e:
                print(f"\n  Batch failed at row {idx}: {e}")
            orders_batch = []

    if orders_batch:
        try:
            sb.table("orders").upsert(orders_batch, on_conflict="data_co_order_id,order_item_id").execute()
            inserted += len(orders_batch)
        except Exception as e:
            print(f"  Final batch failed: {e}")

    print(f"\n  Orders: {inserted:,} inserted, {skipped:,} skipped")

    # ------------------------------------------------------------------
    # 5. Warehouse Inventory
    # ------------------------------------------------------------------
    print("\n=== Warehouse Inventory ===")
    orders_data = sb.table("orders").select("warehouse_id,product_id,order_item_quantity").execute().data
    agg = defaultdict(int)
    for o in orders_data:
        agg[(o["warehouse_id"], o["product_id"])] += (o.get("order_item_quantity") or 0)

    inv_batch = [{"warehouse_id": wid, "product_id": pid, "stock_on_hand": qty * 3, "as_of_date": "2015-01-01"}
                  for (wid, pid), qty in agg.items()]
    for i in range(0, len(inv_batch), 500):
        batch = inv_batch[i:i + 500]
        sb.table("warehouse_inventory").upsert(batch, on_conflict="warehouse_id,product_id,as_of_date").execute()
    print(f"  {len(inv_batch)} inventory rows")

    print("\n=== Done ===")


if __name__ == "__main__":
    run()