"""
RunOut v2 — Cascade / Impact Engine (DataCo), point-in-time version
Location: cascade/impact.py

Simulates "today" (--as-of or RUNOUT_AS_OF) and asks, for every order still in
transit: will the delay cause a stockout at the warehouse, and what does it cost?

An INCIDENT is one PRODUCT at one WAREHOUSE projected to run short. The delayed
orders that cause it are listed underneath in cascade_results.

Logic
  in transit        order_date <= as_of < order_date + days_for_shipping_real
                    (not yet delivered on the as-of date; cancelled/fraud excluded)
  projected arrival order_date + days_for_shipment_scheduled + predicted_delay_days
  weekly demand     SUM of M2 forecasts of every distributor served by the warehouse
  days_of_cover     stock_on_hand / (weekly_demand / 7)
  stockout_date     as_of + days_of_cover
  gap               earliest projected arrival of the SKU's in-transit orders - stockout
  units_short       gap * daily_demand (whole units), shared across the SKU's orders by quantity
  money_at_risk     sum over orders of (units_short * unit margin)
  severity          from the money at risk of the WHOLE stock risk (LOW <100, MEDIUM <500, HIGH)

Writes
  stock_risks       one row per (warehouse, product) assessed   (upserted)
  cascade_results   one row per in-transit order, linked by risk_id
  incidents         one open incident per risk with units_short > 0 (existing incidents are
                    never overwritten; open ones get their severity refreshed, and open ones
                    whose shortage disappeared are set to 'withdrawn')

Prerequisites (run in this order)
  1. db/migrations/002_cascade_point_in_time.sql and 004_stock_risk_incidents.sql
  2. python cascade/build_inventory_snapshot.py
  3. python ml/m2_consumption/score.py
  4. M1 predictions in `predictions`, or use --assumed-delay-days

Usage
    python cascade/impact.py --assumed-delay-days 5     # stub, no M1 needed
    python cascade/impact.py                            # uses M1 predictions
    python cascade/impact.py --no-incidents             # compute only, create no incidents
"""

import os
import sys
import math
import argparse
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from ingestion.common.client import get_client
from cascade.db_utils import fetch_all, chunked, parse_date, default_as_of

RISK_BANDS = ((100, "LOW"), (500, "MEDIUM"), (float("inf"), "HIGH"))
EXCLUDED_STATUSES = {"CANCELED", "SUSPECTED_FRAUD"}
NO_DEMAND_COVER_DAYS = 999
BATCH = 500


def severity(units_short, money):
    if units_short <= 0:
        return "NONE"
    for ceiling, label in RISK_BANDS:
        if money < ceiling:
            return label
    return "HIGH"


def allocate(total_units, weights):
    """Share whole units across orders in proportion to weights (largest remainder),
    so the parts always add up to total_units exactly."""
    total_w = sum(weights.values())
    raw = {k: total_units * w / total_w for k, w in weights.items()}
    base = {k: int(math.floor(v)) for k, v in raw.items()}
    leftover = total_units - sum(base.values())
    for k in sorted(raw, key=lambda k: raw[k] - base[k], reverse=True)[:leftover]:
        base[k] += 1
    return base


def unit_margin(order, product_margin, default_margin):
    """Per-unit margin: the order's own benefit / quantity when positive,
    else the product's catalogue margin, else the default."""
    qty = order.get("order_item_quantity") or 0
    benefit = order.get("benefit_per_order")
    if benefit is not None and float(benefit) > 0 and qty > 0:
        return float(benefit) / qty
    pm = product_margin.get(order["product_id"])
    if pm is not None and float(pm) > 0:
        return float(pm)
    return default_margin


def run(args):
    sb = get_client()
    as_of = args.as_of or default_as_of(sb)
    now_iso = datetime.now(timezone.utc).isoformat()

    print("=" * 60)
    print("RunOut Cascade — Impact Engine (point-in-time)")
    print("=" * 60)
    print(f"Simulated today: {as_of}")

    # ------------------------------------------------------------------
    # 1. Orders in transit on the as-of date
    # ------------------------------------------------------------------
    lo = as_of - timedelta(days=args.window_days)
    raw = fetch_all(
        sb, "orders",
        "order_id,distributor_id,product_id,warehouse_id,order_date,"
        "days_for_shipping_real,days_for_shipment_scheduled,"
        "order_item_quantity,benefit_per_order,order_status",
        "order_id",
        apply=lambda q: q.gte("order_date", lo.isoformat()).lte("order_date", as_of.isoformat()),
    )
    orders = {}
    for o in raw:
        if o.get("order_status") in EXCLUDED_STATUSES:
            continue
        od = parse_date(o.get("order_date"))
        real = o.get("days_for_shipping_real")
        sched = o.get("days_for_shipment_scheduled")
        if od is None or real is None or sched is None:
            continue
        if od + timedelta(days=real) <= as_of:      # already delivered
            continue
        o["_od"], o["_sched"] = od, sched
        orders[o["order_id"]] = o
    print(f"\nOrders in window: {len(raw):,} | still in transit: {len(orders):,}")
    if not orders:
        print("Nothing in transit on that date. Try a different --as-of.")
        return

    # ------------------------------------------------------------------
    # 2. M1 predictions (or the stub)
    # ------------------------------------------------------------------
    if args.assumed_delay_days is not None:
        print(f"Using ASSUMED delay of {args.assumed_delay_days} days for every order (M1 stub)")
        preds = {oid: {"delay": args.assumed_delay_days, "risk": None} for oid in orders}
    else:
        preds = {}
        for chunk in chunked(list(orders), 100):
            def add_filters(q, c=chunk):
                q = q.in_("order_id", c)
                return q.eq("model_version", args.model_version) if args.model_version else q
            rows = fetch_all(
                sb, "predictions",
                "prediction_id,order_id,predicted_delay_days,delay_risk_score",
                "prediction_id", apply=add_filters,
            )
            for p in rows:                           # ascending id: latest wins
                if p.get("predicted_delay_days") is not None:
                    preds[p["order_id"]] = {
                        "delay": float(p["predicted_delay_days"]),
                        "risk": p.get("delay_risk_score"),
                    }
        print(f"M1 predictions found for {len(preds):,} of {len(orders):,} in-transit orders")
        if not preds:
            print("No predictions. Wait for M1, or pass --assumed-delay-days N.")
            return

    # ------------------------------------------------------------------
    # 3. Inventory snapshot as of the same date
    # ------------------------------------------------------------------
    inv_rows = fetch_all(
        sb, "warehouse_inventory", "inventory_id,warehouse_id,product_id,stock_on_hand",
        "inventory_id", apply=lambda q: q.eq("as_of_date", as_of.isoformat()),
    )
    if not inv_rows:
        raise SystemExit(f"No inventory snapshot for {as_of}. "
                         f"Run: python cascade/build_inventory_snapshot.py --as-of {as_of}")
    inventory = {(r["warehouse_id"], r["product_id"]): r for r in inv_rows}
    print(f"Inventory snapshot rows: {len(inventory):,}")

    # ------------------------------------------------------------------
    # 4. M2 forecasts -> weekly demand per (warehouse, product)
    # ------------------------------------------------------------------
    fc_rows = fetch_all(
        sb, "distributor_usage_forecast", "forecast_id,distributor_id,product_id,predicted_weekly_qty",
        "forecast_id", apply=lambda q: q.eq("as_of_date", as_of.isoformat()),
    )
    if not fc_rows:
        raise SystemExit(f"No M2 forecasts for {as_of}. "
                         f"Run: python ml/m2_consumption/score.py --as-of {as_of}")

    dist_market = {d["distributor_id"]: d["market"] for d in
                   fetch_all(sb, "distributors", "distributor_id,market", "distributor_id")}
    warehouses = fetch_all(sb, "warehouses", "warehouse_id,market", "warehouse_id")
    wh_by_market = {w["market"]: w["warehouse_id"] for w in warehouses}
    market_by_wh = {w["warehouse_id"]: w["market"] for w in warehouses}
    products = fetch_all(sb, "products", "product_id,name,unit_margin", "product_id")
    product_margin = {p["product_id"]: p["unit_margin"] for p in products}
    product_name = {p["product_id"]: p["name"] for p in products}

    weekly_demand = defaultdict(float)
    for f in fc_rows:
        wid = wh_by_market.get(dist_market.get(f["distributor_id"]))
        if wid is not None:
            weekly_demand[(wid, f["product_id"])] += float(f["predicted_weekly_qty"] or 0)
    print(f"M2 forecasts: {len(fc_rows):,} -> demand for {len(weekly_demand):,} warehouse-product pairs")

    # Demand guardrail (WS0): cap M2 forecast at k * trailing 8-week average
    capped_count = 0
    if args.demand_cap is not None and args.demand_cap > 0:
        lo_8w = as_of - timedelta(days=56)
        trailing_rows = fetch_all(
            sb, "orders",
            "order_id,warehouse_id,product_id,order_item_quantity,order_status",
            "order_id",
            apply=lambda q: q.gte("order_date", lo_8w.isoformat()).lt("order_date", as_of.isoformat()),
        )
        trailing_units = defaultdict(float)
        for o in trailing_rows:
            if o.get("order_status") in EXCLUDED_STATUSES:
                continue
            trailing_units[(o["warehouse_id"], o["product_id"])] += float(o.get("order_item_quantity") or 0)

        for key, forecast_qty in list(weekly_demand.items()):
            avg_8w = trailing_units.get(key, 0.0) / 8.0
            if avg_8w > 0:
                cap = args.demand_cap * avg_8w
                if forecast_qty > cap:
                    weekly_demand[key] = cap
                    capped_count += 1
        print(f"Demand guardrail (cap={args.demand_cap}x 8w-avg): {capped_count} warehouse-product pairs capped")

    # ------------------------------------------------------------------
    # 5. Cascade, one SKU (warehouse + product) at a time
    # ------------------------------------------------------------------
    groups = defaultdict(list)
    no_pred = 0
    for oid, o in orders.items():
        if oid not in preds:
            no_pred += 1
            continue
        groups[(o["warehouse_id"], o["product_id"])].append(oid)

    risk_rows, order_rows, no_inv = [], [], 0
    for (wid, pid), oids in groups.items():
        inv = inventory.get((wid, pid))
        if inv is None:
            no_inv += len(oids)
            continue

        stock = float(inv["stock_on_hand"])
        weekly = weekly_demand.get((wid, pid), 0.0)
        daily = weekly / 7.0
        cover = min(stock / daily, NO_DEMAND_COVER_DAYS) if daily > 0 else NO_DEMAND_COVER_DAYS
        stockout = as_of + timedelta(days=int(cover))

        arrivals = {}
        for oid in oids:
            o = orders[oid]
            arrivals[oid] = o["_od"] + timedelta(days=o["_sched"] + int(round(preds[oid]["delay"])))

        first_arrival = min(arrivals.values())
        gap_days = max(0, (first_arrival - stockout).days)
        group_short = int(round(gap_days * daily))
        weights = {oid: max(orders[oid].get("order_item_quantity") or 0, 1) for oid in oids}
        alloc = allocate(group_short, weights) if group_short > 0 else {oid: 0 for oid in oids}

        rows = []
        for oid in oids:
            o = orders[oid]
            units = alloc[oid]
            money = round(units * unit_margin(o, product_margin, args.default_margin_usd), 2)
            rows.append({
                "_key": (wid, pid),
                "order_id": oid,
                "distributor_id": o["distributor_id"],
                "product_id": pid,
                "warehouse_id": wid,
                "days_of_cover": round(cover, 2),
                "stockout_date": stockout.isoformat() if cover < NO_DEMAND_COVER_DAYS else None,
                "units_short": units,
                "money_at_risk_usd": money,
                "predicted_delay_days": round(preds[oid]["delay"], 2),
                "projected_arrival": arrivals[oid].isoformat(),
                "delay_risk_score": preds[oid]["risk"],
                "as_of_date": as_of.isoformat(),
            })

        risk_units = sum(r["units_short"] for r in rows)
        risk_money = round(sum(r["money_at_risk_usd"] for r in rows), 2)
        sev = severity(risk_units, risk_money)
        for r in rows:
            r["severity"] = sev
        order_rows.extend(rows)

        delays = [preds[oid]["delay"] for oid in oids]
        scores = [float(preds[oid]["risk"]) for oid in oids if preds[oid]["risk"] is not None]
        risk_rows.append({
            "as_of_date": as_of.isoformat(),
            "warehouse_id": wid,
            "product_id": pid,
            "stock_on_hand": int(stock),
            "weekly_demand": round(weekly, 2),
            "days_of_cover": round(cover, 2),
            "stockout_date": stockout.isoformat() if cover < NO_DEMAND_COVER_DAYS else None,
            "first_arrival": first_arrival.isoformat(),
            "gap_days": gap_days,
            "units_short": risk_units,
            "money_at_risk_usd": risk_money,
            "severity": sev,
            "orders_affected": len(oids) if risk_units > 0 else 0,
            "distributor_ids": sorted({orders[oid]["distributor_id"] for oid in oids}),
            "avg_predicted_delay_days": round(sum(delays) / len(delays), 2),
            "max_predicted_delay_days": round(max(delays), 2),
            "avg_delay_risk_score": round(sum(scores) / len(scores), 4) if scores else None,
        })

    print(f"\nAssessed {len(risk_rows):,} warehouse-product pairs covering {len(order_rows):,} orders "
          f"(skipped: {no_pred:,} without prediction, {no_inv:,} without inventory)")

    # ------------------------------------------------------------------
    # 6. Write: stock_risks -> cascade_results -> incidents
    # ------------------------------------------------------------------
    id_by_key = {}
    for batch in chunked(risk_rows, BATCH):
        data = sb.table("stock_risks").upsert(
            batch, on_conflict="as_of_date,warehouse_id,product_id").execute().data
        for r in data:
            id_by_key[(r["warehouse_id"], r["product_id"])] = r["risk_id"]
    for r in order_rows:
        r["risk_id"] = id_by_key[r.pop("_key")]

    if args.refresh:
        sb.table("cascade_results").delete().neq("cascade_id", 0).execute()
    else:
        sb.table("cascade_results").delete().eq("as_of_date", as_of.isoformat()).execute()
    for batch in chunked(order_rows, BATCH):
        sb.table("cascade_results").insert(batch).execute()
    print(f"Written: {len(risk_rows):,} stock_risks, {len(order_rows):,} cascade_results (as_of_date={as_of})")

    created = withdrawn = 0
    if not args.no_incidents:
        short = [r for r in risk_rows if r["units_short"] > 0]
        shells = [{
            "risk_id": id_by_key[(r["warehouse_id"], r["product_id"])],
            "warehouse_id": r["warehouse_id"], "product_id": r["product_id"],
            "severity": r["severity"], "status": "open",
        } for r in short]
        for batch in chunked(shells, BATCH):
            res = sb.table("incidents").upsert(batch, on_conflict="risk_id",
                                               ignore_duplicates=True).execute().data
            created += len(res or [])
        for r in short:       # keep severity current on incidents still open
            sb.table("incidents").update({"severity": r["severity"], "updated_at": now_iso}) \
                .eq("risk_id", id_by_key[(r["warehouse_id"], r["product_id"])]).eq("status", "open").execute()
        cleared = [id_by_key[(r["warehouse_id"], r["product_id"])] for r in risk_rows if r["units_short"] == 0]
        for chunk in chunked(cleared, 100):
            res = sb.table("incidents").update({"status": "withdrawn", "updated_at": now_iso}) \
                .in_("risk_id", chunk).eq("status", "open").execute().data
            withdrawn += len(res or [])
        print(f"Incidents: {created} new, {withdrawn} withdrawn (shortage no longer projected)")

    # ------------------------------------------------------------------
    # 7. Summary
    # ------------------------------------------------------------------
    by_sev = defaultdict(int)
    for r in risk_rows:
        by_sev[r["severity"]] += 1
    total_risk = sum(r["money_at_risk_usd"] for r in risk_rows)
    print(f"\nStock risks by severity: " +
          " | ".join(f"{k} {by_sev.get(k, 0)}" for k in ("HIGH", "MEDIUM", "LOW", "NONE")))
    print(f"Total money at risk: ${total_risk:,.2f}")

    ranked = sorted(risk_rows, key=lambda r: r["money_at_risk_usd"], reverse=True)
    print(f"\nTop {args.top} incidents (product at warehouse):")
    print(f"{'Market':<13} {'Product':<28} {'Stockout':<11} {'1st arrival':<12} {'Cover':<6} {'Short':<6} {'Orders':<7} {'$ Risk':<10} Sev")
    print("-" * 105)
    for r in ranked[:args.top]:
        if r["units_short"] <= 0:
            break
        print(f"{market_by_wh.get(r['warehouse_id'], '?'):<13} {str(product_name.get(r['product_id'], r['product_id']))[:27]:<28} "
              f"{str(r['stockout_date']):<11} {r['first_arrival']:<12} {r['days_of_cover']:<6.1f} "
              f"{r['units_short']:<6} {r['orders_affected']:<7} ${r['money_at_risk_usd']:<9,.2f} {r['severity']}")

    print("\nNOTE: inventory is simulated from historical DataCo demand; demand is the M2 forecast.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", type=date.fromisoformat, default=None,
                    help="simulated today, YYYY-MM-DD (default: RUNOUT_AS_OF, else last order date minus 7 days)")
    ap.add_argument("--assumed-delay-days", type=float, default=None,
                    help="stub delay in days for every order (use before M1 exists)")
    ap.add_argument("--model-version", default=None,
                    help="only use predictions from this model_version")
    ap.add_argument("--refresh", action="store_true",
                    help="wipe ALL cascade_results first (default: only this as-of date)")
    ap.add_argument("--no-incidents", action="store_true",
                    help="compute and store risks but do not create or update incidents")
    ap.add_argument("--default-margin-usd", type=float, default=5.0,
                    help="fallback per-unit margin")
    ap.add_argument("--demand-cap", type=float, default=2.0,
                    help="cap M2 weekly demand at k * trailing 8-week average (default 2.0; 0 to disable)")
    ap.add_argument("--window-days", type=int, default=14,
                    help="how far back to look for in-transit orders")
    ap.add_argument("--top", type=int, default=10)
    run(ap.parse_args())