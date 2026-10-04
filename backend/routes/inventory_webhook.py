# ============================================================
# 6. backend/routes/inventory_webhook.py  (NEW FILE)
# ============================================================
"""
RunOut — Customer Inventory Webhook
Location: backend/routes/inventory_webhook.py

Real, permanent endpoint. In production this is what a customer's
actual inventory system (ERP/WMS/EDI feed) would call to report
stock levels. Nothing here is simulation-specific — the stand-in
system in tools/fake_customer_system/ calls this exact endpoint.

Register in backend/main.py with:
    from backend.routes.inventory_webhook import router as inventory_router
    app.include_router(inventory_router)
"""

import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from supabase import create_client

router = APIRouter()


class InventoryUpdate(BaseModel):
    account_name: str
    product_name: str
    stock_on_hand: int
    reported_at: datetime
    source: str = "customer_system"   # stand-in sets this to "simulated_standin"


def get_client():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


@router.post("/api/inventory/update")
def receive_inventory_update(update: InventoryUpdate):
    sb = get_client()

    account = sb.table("downstream_accounts").select("account_id") \
        .eq("name", update.account_name).execute()
    if not account.data:
        raise HTTPException(status_code=404, detail=f"Unknown account: {update.account_name}")
    account_id = account.data[0]["account_id"]

    product = sb.table("products").select("product_id") \
        .eq("name", update.product_name).execute()
    if not product.data:
        raise HTTPException(status_code=404, detail=f"Unknown product: {update.product_name}")
    product_id = product.data[0]["product_id"]

    sb.table("account_inventory").insert({
        "account_id": account_id,
        "product_id": product_id,
        "stock_on_hand": update.stock_on_hand,
        "source": update.source,
        "as_of_date": update.reported_at.date().isoformat(),
    }).execute()

    return {"status": "received", "account_id": account_id, "product_id": product_id}