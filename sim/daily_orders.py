"""Add the next day(s) of simulated orders, as if NorthStack's order system had sent them.
  python sim/daily_orders.py                      # day after the newest order, up to today (UTC), max 7 days
  python sim/daily_orders.py --through 2026-10-12 --per-market-day 120
Safe to run every day. Does nothing when orders are already up to date."""
import os
import sys
import argparse
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
from dotenv import load_dotenv  # noqa: E402

load_dotenv()
import simulate_2026 as S  # noqa: E402
from cascade.db_utils import fetch_all  # noqa: E402
from ingestion.common.client import get_client  # noqa: E402
from ml.build_distributor_features import build_rows  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--through", type=date.fromisoformat, default=datetime.now(timezone.utc).date())
    ap.add_argument("--max-days", type=int, default=7)
    ap.add_argument("--per-market-day", type=int, default=80)
    a = ap.parse_args()

    sb = get_client()
    newest = sb.table("orders").select("order_date").order("order_date", desc=True).limit(1).execute().data
    if not newest:
        raise SystemExit("No orders in the database yet. Run sim/simulate_2026.py first.")
    start = date.fromisoformat(str(newest[0]["order_date"])[:10]) + timedelta(days=1)
    end = min(a.through, start + timedelta(days=a.max_days - 1))
    if start > end:
        print(f"Orders are up to date (newest {newest[0]['order_date']}). Nothing to add.")
        return

    wh = {w["market"]: w["warehouse_id"] for w in sb.table("warehouses").select("warehouse_id,market").execute().data}
    pool = S.load_pool(sb)
    # If your generate() asks for heavy_from / heavy_per_market_day, add: heavy_from=None, heavy_per_market_day=0
    orders = S.generate(pool, wh, start, end, a.per_market_day, S.EVENTS, int(start.strftime("%Y%m%d")))

    # generate() numbers orders from SIM_ID_BASE every time, so renumber to avoid overwriting earlier orders.
    top = sb.table("orders").select("data_co_order_id").order("data_co_order_id", desc=True).limit(1).execute().data
    base = max(int(top[0]["data_co_order_id"]) if top else 0, S.SIM_ID_BASE)
    for i, o in enumerate(orders, 1):
        o["data_co_order_id"] = o["order_item_id"] = base + i

    written = 0
    for c in S.chunks(orders, 500):
        saved = sb.table("orders").upsert(c, on_conflict="data_co_order_id,order_item_id").execute().data
        by_key = {(s["data_co_order_id"], s["order_item_id"]): s["order_id"] for s in saved}
        feats = [S.feature_row({**o, "order_id": by_key[(o["data_co_order_id"], o["order_item_id"])]}) for o in c]
        sb.table("ml_order_features").upsert(feats, on_conflict="order_id").execute()
        written += len(c)
    print(f"Added {written:,} orders for {start} to {end}.")

    # Refresh the weekly usage rows (what M2 forecasts from) for the recent weeks.
    since = start - timedelta(weeks=16)
    rows = fetch_all(sb, "orders", "order_id,distributor_id,product_id,order_date,order_item_quantity", "order_id",
                     apply=lambda q: q.gte("order_date", since.isoformat()))
    usage, _ = build_rows([{k: r[k] for k in ("distributor_id", "product_id", "order_date", "order_item_quantity")} for r in rows], zero_fill=True)
    keep = [u for u in usage if str(u["period_start"])[:10] >= (start - timedelta(days=7)).isoformat()]
    for c in S.chunks(keep, 1000):
        sb.table("distributor_usage").upsert(c, on_conflict="distributor_id,product_id,period_start").execute()
    print(f"Refreshed {len(keep):,} weekly usage rows.")
    if os.path.exists(S.CACHE):
        os.remove(S.CACHE)


if __name__ == "__main__":
    main()