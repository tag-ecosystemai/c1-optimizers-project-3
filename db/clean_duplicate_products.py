"""
Clean duplicate products from Supabase.
Retains the 118 products referenced across the database (product_ids 1181 to 1298)
and deletes the 825 unreferenced duplicate rows created by repeated seed runs.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ingestion.common.client import get_client
from cascade.db_utils import fetch_all, chunked

def run():
    sb = get_client()

    print("Fetching all products...")
    all_products = fetch_all(sb, "products", "product_id,category_id,category_name", "product_id")
    print(f"Total products before cleanup: {len(all_products)}")

    # Canonical range referenced across orders, inventory, distributor_usage, ml_order_features, cascade
    to_delete = [p["product_id"] for p in all_products if p["product_id"] < 1181 or p["product_id"] > 1298]
    print(f"Products to delete (unreferenced duplicates): {len(to_delete)}")

    if not to_delete:
        print("No duplicate products to delete. Already clean!")
        return

    # Delete in batches
    deleted_count = 0
    for chunk in chunked(to_delete, 100):
        res = sb.table("products").delete().in_("product_id", chunk).execute()
        deleted_count += len(res.data)
        print(f"  Deleted batch of {len(res.data)} (total deleted: {deleted_count})")

    # Verify final count
    remaining = fetch_all(sb, "products", "product_id,category_id,category_name", "product_id")
    unique_cats = set((p["category_id"], p["category_name"]) for p in remaining)
    print(f"\nFinal products count: {len(remaining)}")
    print(f"Unique (category_id, category_name) count: {len(unique_cats)}")
    assert len(remaining) == 118, f"Expected 118 products, got {len(remaining)}"
    assert len(unique_cats) == 118, f"Expected 118 distinct categories, got {len(unique_cats)}"
    print("SUCCESS: Exactly 118 distinct products remain.")

if __name__ == "__main__":
    run()
