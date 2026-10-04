# ============================================================
# 7. tools/fake_customer_system/simulate_customer.py  (NEW FILE)
# ============================================================
"""
Stand-in Customer Inventory System
Location: tools/fake_customer_system/simulate_customer.py

Plays the role of a real customer's inventory system for demo
purposes. NOT part of RunOut itself — pushes to RunOut's real
webhook exactly as a real customer integration eventually would.
Swap this out for a real integration later with zero change to
RunOut's receiving side (backend/routes/inventory_webhook.py).

Usage:
    python tools/fake_customer_system/simulate_customer.py
"""

import requests
import random
from datetime import datetime, timezone

RUNOUT_WEBHOOK_URL = "http://localhost:8000/api/inventory/update"

ACCOUNTS = ["West Coast Distributor", "East Coast Retailer", "Southeast Account"]
PRODUCTS = [
    "Microintensive Duo Mops Duo Plus Microintensive Mop",
    "Gloves",
]


def push_update(account, product, stock):
    response = requests.post(RUNOUT_WEBHOOK_URL, json={
        "account_name": account,
        "product_name": product,
        "stock_on_hand": stock,
        "reported_at": datetime.now(timezone.utc).isoformat(),
        "source": "simulated_standin",
    })
    print(f"{account} / {product}: stock={stock} -> HTTP {response.status_code}")


def run():
    for account in ACCOUNTS:
        for product in PRODUCTS:
            stock = random.randint(5, 80)   # placeholder — refine once M2 per-store rates exist
            push_update(account, product, stock)


if __name__ == "__main__":
    run()