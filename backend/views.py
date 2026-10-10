"""
RunOut v2 - Dashboards, decision log, distributor and warehouse views, observability
Location: backend/views.py
Response shapes follow the frontend types (src/types/api.ts). Money fields appear only in ops/data/warehouse responses.
Distributor responses never include them. Ops/data "View as" uses effective_scope (header X-View-As + ?distributor_id= / ?warehouse_id=).
"""
import os
import time
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import Scope, current_scope, data_client, require_roles, require_view
from backend.incidents import (RISK_COLS, M1_VERSION, SEV_RANK, resolve_as_of, _in, _briefing, lookups, list_incidents)
from cascade.db_utils import fetch_all
import hashlib, re
from fastapi import UploadFile, File, Form

router = APIRouter(prefix="/api")
LOW_COVER_DAYS = 5
CR_LITE = "cascade_id,order_id,distributor_id,risk_id,predicted_delay_days,delay_risk_score,units_short"
ORDER_COLS = "order_id,product_id,order_date,shipping_mode,order_item_quantity,order_status,days_for_shipment_scheduled"
WIDE = 500                      # rows fetched when a filter has to be applied in Python

def _supabase_dashboard() -> str:
    # https://<ref>.supabase.co  ->  dashboard for that project
    import re
    m = re.match(r"https?://([^.]+)\.supabase\.co", os.environ.get("SUPABASE_URL", ""))
    return f"https://supabase.com/dashboard/project/{m.group(1)}/editor" if m else "https://supabase.com/dashboard"

# ------------------------------------------------------------------ helpers
def open_pairs(sb, as_of, warehouse_id=None):
    """All stock risks for the date, and (risk, incident) pairs for the incidents that are still open."""
    risks = fetch_all(sb, "stock_risks", RISK_COLS, "risk_id", apply=lambda q: q.eq("as_of_date", as_of))
    if warehouse_id is not None:
        risks = [r for r in risks if r["warehouse_id"] == warehouse_id]
    by = {r["risk_id"]: r for r in risks}
    incs = _in(sb, "incidents", "incident_id,risk_id,status,created_at", "risk_id", list(by))
    return risks, [(by[i["risk_id"]], i) for i in incs if i["status"] == "open"]


def low_cover(r):
    return float(r["days_of_cover"] if r["days_of_cover"] is not None else 999) < LOW_COVER_DAYS


def preds_for(sb, order_ids):
    out = {}
    ids = list(dict.fromkeys(order_ids))
    for i in range(0, len(ids), 100):
        for p in (sb.table("predictions").select("order_id,predicted_delay_days,delay_risk_score")
                  .eq("model_version", M1_VERSION).in_("order_id", ids[i:i + 100]).execute().data):
            out[p["order_id"]] = p
    return out


def risk_label(score):
    """Severity word for a delay-risk score. Placeholder thresholds."""
    if score is None:
        return "NONE"
    s = float(score)
    return "HIGH" if s >= 0.7 else ("MEDIUM" if s >= 0.5 else ("LOW" if s >= 0.3 else "NONE"))


def order_status(raw):
    s = (raw or "").lower()
    if any(k in s for k in ("complete", "closed", "deliver")):
        return "delivered"
    if any(k in s for k in ("pending", "process", "hold", "review", "payment")):
        return "processing"
    return "in_transit"


def eta(order_date, scheduled, delay):
    if order_date is None or scheduled is None:
        return None
    d = date.fromisoformat(str(order_date)[:10]) + timedelta(days=int(scheduled))
    return (d + timedelta(days=int(round(float(delay))))).isoformat() if delay is not None else None


def worst(a, b):
    return a if SEV_RANK.get(a, 0) >= SEV_RANK.get(b, 0) else b


def paged(items, limit, cursor):
    start = int(cursor) if cursor and cursor.isdigit() else 0
    return {"items": items[start:start + limit],
            "next_cursor": str(start + limit) if start + limit < len(items) else None,
            "prev_cursor": str(max(0, start - limit)) if start > 0 else None, "total": len(items)}


def order_incidents(sb, order_ids):
    """order_id -> incident_id (latest cascade date, not withdrawn)."""
    ids = list(dict.fromkeys(order_ids))
    latest = {}
    for i in range(0, len(ids), 100):
        for c in (sb.table("cascade_results").select("order_id,risk_id,as_of_date").in_("order_id", ids[i:i + 100])
                  .not_.is_("risk_id", "null").execute().data):
            if c["order_id"] not in latest or str(c["as_of_date"]) > str(latest[c["order_id"]]["as_of_date"]):
                latest[c["order_id"]] = c
    incs = {i["risk_id"]: i for i in _in(sb, "incidents", "incident_id,risk_id,status", "risk_id",
                                         [c["risk_id"] for c in latest.values()]) if i["status"] != "withdrawn"}
    return {oid: incs[c["risk_id"]]["incident_id"] for oid, c in latest.items() if c["risk_id"] in incs}


def _kpis(risks, pairs, cr):
    delays = [float(c["predicted_delay_days"]) for c in cr if c["predicted_delay_days"] is not None]
    late = [d for d in delays if round(d) > 0]
    return {"open_incidents": len(pairs),
            "money_at_risk_usd": round(sum(float(r["money_at_risk_usd"] or 0) for r, _ in pairs), 2),
            "late_risk_rate": round(len(late) / len(delays), 3) if delays else 0,
            "units_short": sum(int(r["units_short"] or 0) for r, _ in pairs),
            "avg_predicted_delay_days": round(sum(delays) / len(delays), 1) if delays else 0}


# ------------------------------------------------------------------ ops / data
@router.get("/ops/summary")
def ops_summary(as_of: Optional[str] = None, scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    if not as_of:
        return {"as_of_date": None, "open_incidents": 0, "money_at_risk_usd": 0, "late_risk_rate": 0, "units_short": 0,
                "avg_predicted_delay_days": 0, "by_market": [], "top_products": [], "trend": []}
    risks, pairs = open_pairs(sb, as_of)
    cr = fetch_all(sb, "cascade_results", CR_LITE, "cascade_id", apply=lambda q: q.eq("as_of_date", as_of))
    prods, whs = lookups(sb, [r["product_id"] for r, _ in pairs], [r["warehouse_id"] for r, _ in pairs])

    by_market, by_product, dists = {}, {}, set()
    for r, _ in pairs:
        m = (whs.get(r["warehouse_id"]) or {}).get("market", "Unknown")
        d = by_market.setdefault(m, {"market": m, "money_at_risk_usd": 0.0, "open_incidents": 0})
        d["money_at_risk_usd"] += float(r["money_at_risk_usd"] or 0)
        d["open_incidents"] += 1
        p = by_product.setdefault(r["product_id"], {"product": {"id": r["product_id"], "name": prods.get(r["product_id"])},
                                                    "money_at_risk_usd": 0.0, "open_incidents": 0})
        p["money_at_risk_usd"] += float(r["money_at_risk_usd"] or 0)
        p["open_incidents"] += 1
        dists.update(r["distributor_ids"] or [])

    day0 = date.fromisoformat(as_of[:10])
    created = {}
    for _, i in pairs:
        created[str(i["created_at"])[:10]] = created.get(str(i["created_at"])[:10], 0) + 1
    trend = [{"date": (day0 - timedelta(days=13 - k)).isoformat(),
              "opened": created.get((day0 - timedelta(days=13 - k)).isoformat(), 0)} for k in range(14)]

    out = {
        "as_of_date": as_of, **_kpis(risks, pairs, cr),
        "distributors_affected": len(dists),
        "products_under_5_days_cover": sum(1 for r in risks if low_cover(r)),
        "orders_in_transit": len(cr),
        "by_market": sorted(by_market.values(), key=lambda x: -x["money_at_risk_usd"]),
        "top_products": sorted(by_product.values(), key=lambda x: -x["money_at_risk_usd"])[:5],
        "trend": trend,
    }
    prev = (day0 - timedelta(days=1)).isoformat()                    # "vs. yesterday" only when that date was processed
    prisks, ppairs = open_pairs(sb, prev)
    if prisks:
        pcr = fetch_all(sb, "cascade_results", CR_LITE, "cascade_id", apply=lambda q: q.eq("as_of_date", prev))
        out["yesterday"] = _kpis(prisks, ppairs, pcr)
    return out


@router.get("/ops/network")
def ops_network(as_of: Optional[str] = None, scope: Scope = Depends(require_roles("ops", "data"))):
    """Array of warehouses (frontend type NetworkWarehouse[])."""
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    whs = fetch_all(sb, "warehouses", "warehouse_id,name,market", "warehouse_id")
    dists = fetch_all(sb, "distributors", "distributor_id,name,customer_segment,market", "distributor_id")
    risks, pairs = open_pairs(sb, as_of) if as_of else ([], [])
    open_risk = {r["risk_id"] for r, _ in pairs}
    money = {}
    if open_risk:
        for c in fetch_all(sb, "cascade_results", "cascade_id,risk_id,distributor_id,money_at_risk_usd", "cascade_id",
                           apply=lambda q: q.eq("as_of_date", as_of)):
            if c["risk_id"] in open_risk:
                money[c["distributor_id"]] = money.get(c["distributor_id"], 0.0) + float(c["money_at_risk_usd"] or 0)
    out = []
    for w in whs:
        mine = [(r, i) for r, i in pairs if r["warehouse_id"] == w["warehouse_id"]]
        out.append({
            "warehouse": {"id": w["warehouse_id"], "name": w["name"], "market": w["market"]},
            "open_incidents": len(mine),
            "money_at_risk_usd": round(sum(float(r["money_at_risk_usd"] or 0) for r, _ in mine), 2),
            "low_cover_skus": sum(1 for r in risks if r["warehouse_id"] == w["warehouse_id"] and low_cover(r)),
            "distributors": [{"id": d["distributor_id"], "name": d["name"], "segment": d["customer_segment"],
                              "open_incidents": sum(1 for r, _ in mine if d["distributor_id"] in (r["distributor_ids"] or [])),
                              "money_at_risk_usd": round(money.get(d["distributor_id"], 0.0), 2)}
                             for d in dists if d["market"] == w["market"]],
        })
    return out


@router.get("/decisions")
def decisions(action: Optional[str] = None, date_from: Optional[str] = Query(None, alias="from"),
              date_to: Optional[str] = Query(None, alias="to"),
              limit: int = Query(50, ge=1, le=200), cursor: Optional[str] = None,
              scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    start = int(cursor) if cursor and cursor.isdigit() else 0
    q = sb.table("incident_decisions").select(
        "decision_id,incident_id,action,selected_option_id,note,decided_at,decided_by", count="exact")
    if action:
        q = q.eq("action", action.lower())
    if date_from:
        q = q.gte("decided_at", date_from[:10])
    if date_to:
        q = q.lt("decided_at", (date.fromisoformat(date_to[:10]) + timedelta(days=1)).isoformat())
    res = q.order("decided_at", desc=True).range(start, start + limit).execute()
    rows, total = res.data, res.count
    more = len(rows) > limit
    rows = rows[:limit]
    incs = {i["incident_id"]: i for i in _in(sb, "incidents", "incident_id,product_id,warehouse_id,severity,status,recommended_options",
                                             "incident_id", [r["incident_id"] for r in rows])}
    prods, whs = lookups(sb, [i["product_id"] for i in incs.values()], [i["warehouse_id"] for i in incs.values()])
    users = {u["user_id"]: u["display_name"] for u in _in(sb, "app_users", "user_id,display_name", "user_id",
                                                           [r["decided_by"] for r in rows])}
    items = []
    for r in rows:
        i = incs.get(r["incident_id"]) or {}
        title = next((o.get("title") for o in (i.get("recommended_options") or [])
                      if o.get("option_id") == r["selected_option_id"]), None) if r["selected_option_id"] else None
        items.append({**{k: r[k] for k in ("decision_id", "incident_id", "action", "selected_option_id", "note", "decided_at")},
                      "by": users.get(r["decided_by"]) or "Unknown", "option_title": title, "outcome": i.get("status"),
                      "severity": i.get("severity"),
                      "product": {"id": i.get("product_id"), "name": prods.get(i.get("product_id"))},
                      "market": (whs.get(i.get("warehouse_id")) or {}).get("market")})
    return {"items": items, "next_cursor": str(start + limit) if more else None,
            "prev_cursor": str(max(0, start - limit)) if start > 0 else None, "total": total}


# ------------------------------------------------------------------ distributor
def _order_items(sb, rows):
    prods, _ = lookups(sb, [o["product_id"] for o in rows], [])
    ids = [o["order_id"] for o in rows]
    preds, incs = preds_for(sb, ids), order_incidents(sb, ids)
    items = []
    for o in rows:
        p = preds.get(o["order_id"])
        delay = float(p["predicted_delay_days"]) if p and p["predicted_delay_days"] is not None else 0.0
        od = str(o["order_date"])[:10]
        sched = o["days_for_shipment_scheduled"]
        items.append({
            "order_id": o["order_id"], "product": {"id": o["product_id"], "name": prods.get(o["product_id"])},
            "quantity": o["order_item_quantity"], "order_date": od, "shipping_mode": o["shipping_mode"],
            "status": "in_transit" if incs.get(o["order_id"]) and order_status(o["order_status"]) != "delivered" else order_status(o["order_status"]),
            "original_eta": eta(od, sched, 0) or od, "predicted_eta": eta(od, sched, delay) or od,
            "predicted_delay_days": delay, "risk": risk_label(p["delay_risk_score"]) if p else "NONE",
            "incident_id": incs.get(o["order_id"]),
        })
    return items


@router.get("/my/overview")
def my_overview(as_of: Optional[str] = None, scope: Scope = Depends(require_view("distributor"))):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    empty = {"as_of_date": None, "kpis": {"orders_in_transit": 0, "orders_predicted_late": 0, "products_at_risk": 0,
                                          "nearest_stockout_date": None}, "needs_attention": [], "recent_activity": []}
    if not as_of:
        return empty
    cr = fetch_all(sb, "cascade_results", CR_LITE, "cascade_id",
                   apply=lambda q: q.eq("as_of_date", as_of).eq("distributor_id", scope.distributor_id))
    inc = list_incidents(status=None, severity=None, market=None, warehouse_id=None, product_id=None, q=None,
                         distributor_id=None, as_of=as_of, sort=None, limit=200, cursor=None, scope=scope)
    late = sorted((c for c in cr if c["predicted_delay_days"] is not None and round(float(c["predicted_delay_days"])) > 0),
                  key=lambda c: -float(c["predicted_delay_days"]))
    return {
        "as_of_date": as_of,
        "kpis": {"orders_in_transit": len(cr), "orders_predicted_late": len(late), "products_at_risk": inc["total"],
                 "nearest_stockout_date": min((i["stockout_date"] for i in inc["items"] if i["stockout_date"]), default=None)},
        "needs_attention": inc["items"][:5],
        "recent_activity": [{"date": as_of, "order_id": c["order_id"],
                             "text": f"Order #{c['order_id']} is predicted to arrive {int(round(float(c['predicted_delay_days'])))} "
                                     f"day{'s' if round(float(c['predicted_delay_days'])) != 1 else ''} late."}
                            for c in late[:5]],
    }


@router.get("/my/orders")
def my_orders(status: Optional[str] = None, risk: Optional[str] = None, shipping_mode: Optional[str] = None,
              date_from: Optional[str] = Query(None, alias="from"), date_to: Optional[str] = Query(None, alias="to"),
              q: Optional[str] = None, as_of: Optional[str] = None,
              limit: int = Query(20, ge=1, le=100), cursor: Optional[str] = None,
              scope: Scope = Depends(require_view("distributor"))):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    start = int(cursor) if cursor and cursor.isdigit() else 0
    qq = sb.table("orders").select(ORDER_COLS).eq("distributor_id", scope.distributor_id)
    upper = date_to[:10] if date_to else None
    if as_of and (not upper or as_of < upper):
        upper = as_of[:10]
    if upper:
        qq = qq.lt("order_date", (date.fromisoformat(upper) + timedelta(days=1)).isoformat())
    if date_from:
        qq = qq.gte("order_date", date_from[:10])
    if shipping_mode:
        qq = qq.eq("shipping_mode", shipping_mode)
    qq = qq.order("order_date", desc=True).order("order_id", desc=True)

    if status or risk or q:                                  # these are computed values, so filter in Python on a wider slice
        items = _order_items(sb, qq.range(0, WIDE - 1).execute().data)
        if status:
            items = [i for i in items if i["status"] == status.lower()]
        if risk:
            items = [i for i in items if i["risk"] == risk.upper()]
        if q:
            items = [i for i in items if q.lower() in (i["product"]["name"] or "").lower() or q in str(i["order_id"])]
        return {**paged(items, limit, cursor), "as_of_date": as_of}

    rows = qq.range(start, start + limit).execute().data
    more = len(rows) > limit
    return {"items": _order_items(sb, rows[:limit]), "next_cursor": str(start + limit) if more else None,
            "prev_cursor": str(max(0, start - limit)) if start > 0 else None, "as_of_date": as_of}


@router.get("/my/orders/{order_id}")
def my_order(order_id: int, scope: Scope = Depends(require_view("distributor"))):
    sb = data_client()
    rows = sb.table("orders").select(ORDER_COLS).eq("order_id", order_id).eq("distributor_id", scope.distributor_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Order not found")
    item = _order_items(sb, rows)[0]
    as_of = resolve_as_of(sb, None) or item["order_date"]
    cr = (sb.table("cascade_results").select("risk_id,as_of_date,projected_arrival,predicted_delay_days,units_short")
          .eq("order_id", order_id).not_.is_("risk_id", "null").order("as_of_date", desc=True).limit(1).execute().data)
    cover, briefing = None, None
    if cr:
        risk = sb.table("stock_risks").select("days_of_cover,stockout_date").eq("risk_id", cr[0]["risk_id"]).limit(1).execute().data
        if risk:
            cover = {"days_of_cover": risk[0]["days_of_cover"], "stockout_date": risk[0]["stockout_date"],
                     "projected_arrival": cr[0]["projected_arrival"], "predicted_delay_days": cr[0]["predicted_delay_days"],
                     "units_short": cr[0]["units_short"]}
        inc = (sb.table("incidents").select("incident_id,status,briefing_text_distributor").eq("risk_id", cr[0]["risk_id"])
               .limit(1).execute().data)
        if inc and inc[0]["status"] != "withdrawn":
            briefing = _briefing(inc[0], scope)

    def state(d, problem=False):
        return "warning" if problem else ("done" if str(d) <= str(as_of)[:10] else "upcoming")
    late = item["predicted_delay_days"] > 0
    tl = [{"key": "ordered", "label": "Order placed", "date": item["order_date"], "state": state(item["order_date"])},
          {"key": "shipped", "label": "Shipped", "date": item["order_date"], "state": state(item["order_date"])},
          {"key": "original_eta", "label": "Original arrival date", "date": item["original_eta"], "state": state(item["original_eta"])},
          {"key": "predicted_eta", "label": "Predicted arrival date", "date": item["predicted_eta"],
           "state": state(item["predicted_eta"], late)}]
    if cover and cover["stockout_date"]:
        tl.append({"key": "stockout", "label": "Projected stockout", "date": str(cover["stockout_date"])[:10], "state": "warning"})
    tl.sort(key=lambda e: e["date"])
    return {**item, "shipping_date": item["order_date"], "timeline": tl, "cover": cover, "briefing_text": briefing}


@router.get("/my/stock")
def my_stock(as_of: Optional[str] = None, scope: Scope = Depends(require_view("distributor"))):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    if not as_of:
        return {"as_of_date": None, "items": []}
    fc = fetch_all(sb, "distributor_usage_forecast", "product_id,predicted_weekly_qty,forecast_week_start", "forecast_id",
                   apply=lambda q: q.eq("as_of_date", as_of).eq("distributor_id", scope.distributor_id))
    d = sb.table("distributors").select("market").eq("distributor_id", scope.distributor_id).limit(1).execute().data
    w = sb.table("warehouses").select("warehouse_id").eq("market", d[0]["market"]).limit(1).execute().data if d else []
    risks = {r["product_id"]: r for r in (open_pairs(sb, as_of, w[0]["warehouse_id"])[0] if w else [])}
    prods, _ = lookups(sb, [f["product_id"] for f in fc], [])
    items = []
    for f in fc:
        r = risks.get(f["product_id"])      # cover only exists for products the cascade assessed; no money fields here
        items.append({"product": {"id": f["product_id"], "name": prods.get(f["product_id"])},
                      "weekly_usage_forecast": float(f["predicted_weekly_qty"]),
                      "days_of_cover": r["days_of_cover"] if r else None,
                      "stockout_date": r["stockout_date"] if r else None,
                      "severity": r["severity"] if r else "NONE"})
    items.sort(key=lambda i: (i["days_of_cover"] is None, i["days_of_cover"] or 0))
    return {"as_of_date": as_of, "items": items}


# ------------------------------------------------------------------ warehouse
def _wh_id(scope, warehouse_id):
    wid = scope.warehouse_id if scope.role == "warehouse" else warehouse_id
    if wid is None:
        raise HTTPException(422, "warehouse_id is required")
    return wid


def _inventory_snapshot(sb, wid, as_of):
    q = sb.table("warehouse_inventory").select("as_of_date").eq("warehouse_id", wid)
    if as_of:
        q = q.lte("as_of_date", as_of)
    d = q.order("as_of_date", desc=True).limit(1).execute().data
    if not d:
        return None, []
    snap = d[0]["as_of_date"]
    rows = fetch_all(sb, "warehouse_inventory", "product_id,stock_on_hand", "inventory_id",
                     apply=lambda qq: qq.eq("warehouse_id", wid).eq("as_of_date", snap))
    return snap, rows


@router.get("/warehouse/overview")
def warehouse_overview(warehouse_id: Optional[int] = None, as_of: Optional[str] = None,
                       scope: Scope = Depends(require_view("warehouse", "ops", "data"))):
    sb = data_client()
    wid = _wh_id(scope, warehouse_id)
    as_of = resolve_as_of(sb, as_of)
    risks, pairs = open_pairs(sb, as_of, wid) if as_of else ([], [])
    snap, inv = _inventory_snapshot(sb, wid, as_of)
    w = sb.table("warehouses").select("warehouse_id,name,market").eq("warehouse_id", wid).limit(1).execute().data
    if not w:
        raise HTTPException(404, "Warehouse not found")
    dists = fetch_all(sb, "distributors", "distributor_id,name,customer_segment,market", "distributor_id",
                      apply=lambda q: q.eq("market", w[0]["market"]))
    affected = set()
    for r, _ in pairs:
        affected.update(r["distributor_ids"] or [])
    out_d = []
    for d in dists:
        mine = [r for r, _ in pairs if d["distributor_id"] in (r["distributor_ids"] or [])]
        sev = "NONE"
        for r in mine:
            sev = worst(sev, r["severity"])
        out_d.append({"id": d["distributor_id"], "name": d["name"], "segment": d["customer_segment"],
                      "open_incidents": len(mine), "status": sev})
    return {
        "as_of_date": as_of, "inventory_snapshot_date": snap,
        "warehouse": {"id": w[0]["warehouse_id"], "name": w[0]["name"], "market": w[0]["market"]},
        "kpis": {"open_incidents": len(pairs), "low_cover_skus": sum(1 for r in risks if low_cover(r)),
                 "low_cover_threshold_days": LOW_COVER_DAYS,
                 "stock_units": sum(int(x["stock_on_hand"] or 0) for x in inv), "distributors_affected": len(affected),
                 "money_at_risk_usd": round(sum(float(r["money_at_risk_usd"] or 0) for r, _ in pairs), 2)},
        "distributors": out_d,
    }


@router.get("/warehouse/inventory")
def warehouse_inventory(warehouse_id: Optional[int] = None, as_of: Optional[str] = None, q: Optional[str] = None,
                        category: Optional[str] = None, severity: Optional[str] = None, sort: Optional[str] = None,
                        limit: int = Query(50, ge=1, le=200), cursor: Optional[str] = None,
                        scope: Scope = Depends(require_view("warehouse", "ops", "data"))):
    sb = data_client()
    wid = _wh_id(scope, warehouse_id)
    as_of = resolve_as_of(sb, as_of)
    snap, inv = _inventory_snapshot(sb, wid, as_of)
    w = sb.table("warehouses").select("warehouse_id,name").eq("warehouse_id", wid).limit(1).execute().data
    risks = {r["product_id"]: r for r in (open_pairs(sb, as_of, wid)[0] if as_of else [])}
    prods = {p["product_id"]: p for p in _in(sb, "products", "product_id,name,category_name", "product_id",
                                              [x["product_id"] for x in inv])}
    items = []
    for x in inv:
        p, r = prods.get(x["product_id"]) or {}, risks.get(x["product_id"])
        if q and q.lower() not in (p.get("name") or "").lower():
            continue
        if category and (p.get("category_name") or "").lower() != category.lower():
            continue
        sev = r["severity"] if r else "NONE"
        if severity and sev != severity.upper():
            continue
        items.append({"product": {"id": x["product_id"], "name": p.get("name"), "category": p.get("category_name")},
                      "warehouse": {"id": wid, "name": w[0]["name"] if w else None},
                      "stock_on_hand": x["stock_on_hand"], "as_of_date": snap,
                      "weekly_usage": r["weekly_demand"] if r else None,           # only for products the cascade assessed
                      "days_of_cover": r["days_of_cover"] if r else None,
                      "stockout_date": r["stockout_date"] if r else None, "severity": sev})
    key, desc = (sort or "days_of_cover").lstrip("-"), (sort or "").startswith("-")
    if key not in ("days_of_cover", "stock_on_hand"):
        key, desc = "days_of_cover", False
    present = [i for i in items if i[key] is not None]
    present.sort(key=lambda i: float(i[key]), reverse=desc)
    items = present + [i for i in items if i[key] is None]
    return {**paged(items, limit, cursor), "warehouse_id": wid, "inventory_snapshot_date": snap, "as_of_date": as_of}


# ------------------------------------------------------------------ observability (data role only)
_cache = {}


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


def _count(sb, table, f=None):
    q = sb.table(table).select("*", count="exact").limit(1)
    return (f(q) if f else q).execute().count or 0


def _latest(sb, table, col):
    r = sb.table(table).select(col).order(col, desc=True).limit(1).execute().data
    return r[0][col] if r else None


@router.get("/observability")
def observability(scope: Scope = Depends(require_roles("data"))):
    sb = data_client()
    n_orders, n_pred = _count(sb, "orders"), _count(sb, "predictions")
    n_open = _count(sb, "incidents", lambda q: q.eq("status", "open"))
    link = lambda url, label, desc, ok: {"url": url, "label": label, "description": desc,
                                         "status": "connected" if ok else "not_configured"}
    last = _latest(sb, "pipeline_runs", "ended_at")
    return {
        "status": "all_systems_operational",
        "last_updated": str(last)[:10] if last else date.today().isoformat(),
        "links": {
            "langfuse": link("https://cloud.langfuse.com/project/cmuzxcx1c03v2ad0h1b63ubfo", "Agent Traces", "Agent tool calls, cost and latency", os.environ.get("LANGFUSE_PUBLIC_KEY")),
            "dagshub": link("https://dagshub.com/RunOut/runout-ml.mlflow/", "MLflow / Model Registry", "Training runs, model comparison, champion models", True),
            "supabase": link(_supabase_dashboard(), "Supabase Database", "Orders, inventory, predictions", True),
        },
        "summary": {"total_orders": n_orders, "total_predictions": n_pred, "active_incidents": n_open,
                    "models_trained": {"m1": "active" if n_pred else "pending", "m2": "active"}},
    }


def _metric(metrics, name):
    for k, v in (metrics or {}).items():
        if name in k.lower():
            return v
    return None


@router.get("/observability/models")
def obs_models(scope: Scope = Depends(require_roles("data"))):
    """Array of two ModelSummary objects (m1, m2)."""
    sb = data_client()
    champ_ids, runs, note = set(), [], None
    try:
        from ml.m1_delay_risk.registry import champion_info, recent_runs
        info = _cached("m1_champion", 300, champion_info)
        for v in info.values():
            champ_ids.add(v.get("run_id"))
            champ_ids.add((v.get("tags") or {}).get("bundle_run_id"))
        raw = _cached("m1_runs", 300, recent_runs)
        for r in raw:
            m = r.get("metrics") or {}
            runs.append({"run_id": r["run_id"], "version": r.get("name") or r["run_id"][:8], "algorithm": r.get("name") or "M1",
                         "mae": _metric(m, "mae"), "rmse": _metric(m, "rmse"), "r2": _metric(m, "r2"),
                         "trained_at": r["started_at"], "mlflow_url": r.get("url"),
                         "status": "failed" if r["status"] == "FAILED" else ("champion" if r["run_id"] in champ_ids else "archived")})
    except Exception as e:                                           # DagsHub down or not configured: say so, do not crash
        note = f"Registry unavailable: {type(e).__name__}: {str(e)[:120]}"
    f = sb.table("distributor_usage_forecast").select("model_version,as_of_date,scored_at").order("scored_at", desc=True).limit(1).execute().data
    m2_note = "M2 is loaded from a local pickle; it is not in the MLflow registry yet." + (f" Latest forecast: {f[0]['model_version']}." if f else "")
    return [
        {"key": "m1", "name": "M1 Delivery delay", "target": "How many days late an order will arrive, and whether it will be late",
         "champion": next((r for r in runs if r["status"] == "champion"), None), "runs": runs, "note": note},
        {"key": "m2", "name": "M2 Consumption forecast", "target": "Units each distributor will use per week",
         "champion": None, "runs": [], "note": m2_note},
    ]


STAGES = [("inventory_snapshot", "Inventory snapshot"), ("m2_forecast", "Consumption forecast"),
          ("m1_predictions", "Delay scoring"), ("cascade", "Stock-out cascade"), ("agent", "Agent investigations")]


def _secs(a, b):
    try:
        from datetime import datetime
        return round((datetime.fromisoformat(str(b).replace("Z", "+00:00")) - datetime.fromisoformat(str(a).replace("Z", "+00:00"))).total_seconds(), 1)
    except Exception:
        return None


@router.get("/observability/pipeline")
def obs_pipeline(scope: Scope = Depends(require_roles("data"))):
    sb = data_client()
    runs = sb.table("pipeline_runs").select("run_id,as_of_date,stage,status,started_at,ended_at,rows,detail") \
        .order("run_id", desc=True).limit(200).execute().data
    latest_date = str(runs[0]["as_of_date"]) if runs else None
    by_stage = {}
    for r in runs:
        if str(r["as_of_date"]) == latest_date:
            by_stage.setdefault(r["stage"], r)
    stages = []
    for key, name in STAGES:
        r = by_stage.get(key)
        stages.append({"key": key, "name": name,
                       "status": "pending" if not r else ("failed" if r["status"] == "failed" else "ok"),
                       "last_run_at": r["ended_at"] if r else None, "rows": int((r or {}).get("rows") or 0),
                       "duration_s": _secs(r["started_at"], r["ended_at"]) if r else None})
    failed = [{"run_id": str(r["run_id"]), "stage": r["stage"], "failed_at": r["ended_at"], "error": (r["detail"] or "")[-200:]}
              for r in runs if r["status"] == "failed"][:10]
    return {
        "as_of_date": latest_date,
        "last_run_at": runs[0]["ended_at"] if runs else None,
        "status": "failed" if any(s["status"] == "failed" for s in stages) else "ok",
        "stages": stages,
        "freshness": {"max_order_date": _latest(sb, "orders", "order_date"), "max_scored_at": _latest(sb, "predictions", "scored_at"),
                      "latest_cascade_date": _latest(sb, "stock_risks", "as_of_date")},
        "failed_runs": failed,
        "drift_flags": [],
        "counts": {"orders": _count(sb, "orders"), "predictions": _count(sb, "predictions"), "stock_risks": _count(sb, "stock_risks"),
                   "incidents_open": _count(sb, "incidents", lambda q: q.eq("status", "open")),
                   "incidents_total": _count(sb, "incidents")},
    }


@router.get("/observability/agent")
def obs_agent(scope: Scope = Depends(require_roles("data"))):
    sb = data_client()
    rows = fetch_all(sb, "agent_runs", "run_id,incident_id,as_of_date,status,started_at,duration_s,llm_calls,prompt_tokens,"
                     "completion_tokens,validation_failed,fallback_used,error", "run_id")
    n = len(rows)
    p_in = float(os.environ.get("LLM_USD_PER_1K_PROMPT", "0.00015"))       # estimate; set to your Azure price
    p_out = float(os.environ.get("LLM_USD_PER_1K_COMPLETION", "0.0006"))
    cost = lambda r: (float(r["prompt_tokens"] or 0) * p_in + float(r["completion_tokens"] or 0) * p_out) / 1000
    avg = lambda f: round(sum(f(r) for r in rows) / n, 4) if n else 0
    recent = sorted(rows, key=lambda r: -r["run_id"])[:10]
    causes = {i["incident_id"]: i["probable_cause"] for i in _in(sb, "incidents", "incident_id,probable_cause", "incident_id",
                                                                 [r["incident_id"] for r in recent])}
    return {
        "period": "All runs", "runs": n,
        "avg_latency_s": avg(lambda r: float(r["duration_s"] or 0)),
        "avg_cost_usd": avg(cost),
        "error_rate": round(sum(1 for r in rows if r["status"] == "error") / n, 3) if n else 0,
        "tool_calls": [{"name": "llm_calls", "label": "Model calls", "count": sum(int(r["llm_calls"] or 0) for r in rows)},
                       {"name": "ask_retrievals", "label": "Knowledge searches (Ask)", "count": _count(sb, "retrieval_logs")}],
        "traces_url": "https://cloud.langfuse.com/project/cmuzxcx1c03v2ad0h1b63ubfo" if os.environ.get("LANGFUSE_PUBLIC_KEY") else None,
        "recent": [{"incident_id": r["incident_id"], "investigated_at": r["started_at"], "latency_s": float(r["duration_s"] or 0),
                    "cost_usd": round(cost(r), 4), "status": "error" if r["status"] == "error" else "ok",
                    "probable_cause": causes.get(r["incident_id"])} for r in recent],
        "total_prompt_tokens": sum(int(r["prompt_tokens"] or 0) for r in rows),
        "total_completion_tokens": sum(int(r["completion_tokens"] or 0) for r in rows),
        "validation_failure_rate": round(sum(1 for r in rows if r["validation_failed"]) / n, 3) if n else 0,
        "fallback_rate": round(sum(1 for r in rows if r["fallback_used"]) / n, 3) if n else 0,
    }


@router.get("/dates")
def available_dates(scope: Scope = Depends(current_scope)):
    """Simulation dates that have cascade results. in_sample means the date is inside M1's or M2's training period."""
    sb = data_client()
    rows = fetch_all(sb, "stock_risks", "risk_id,as_of_date,warehouse_id", "risk_id")
    whs = {w["warehouse_id"]: w["market"] for w in fetch_all(sb, "warehouses", "warehouse_id,market", "warehouse_id")}
    by = {}
    for r in rows:
        d = by.setdefault(str(r["as_of_date"])[:10], {"risks": 0, "markets": set()})
        d["risks"] += 1
        d["markets"].add(whs.get(r["warehouse_id"]))
    items = [{"as_of_date": k, "risks": v["risks"],
              **({} if scope.role == "distributor" else {"markets": sorted(m for m in v["markets"] if m)}),
              "in_sample": k <= "2017-06-12"} for k, v in sorted(by.items())]
    return {"default": resolve_as_of(sb, None), "dates": items}

# ---------- Knowledge (RAG) uploads: ops only ----------
@router.get("/knowledge")
def knowledge_list(scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    rows = sb.table("knowledge_documents").select("doc_id,doc_code,title,doc_type,audience,market,version,source,status,updated_at") \
        .eq("status", "published").order("updated_at", desc=True).execute().data
    return {"items": rows}


@router.post("/knowledge/upload")
def knowledge_upload(file: UploadFile = File(...), title: str = Form(...), audience: str = Form("ops,warehouse,distributor"),
                     market: str = Form("all"), doc_type: str = Form("reference"),
                     scope: Scope = Depends(require_roles("ops"))):
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from rag.ingest import make_chunks, validate, FM_RE
    from rag.embeddings import embed, model_name
    if not (file.filename or "").lower().endswith((".md", ".txt")):
        raise HTTPException(400, "Upload a .md or .txt file")
    text = file.file.read().decode("utf-8", errors="ignore")
    m = FM_RE.match(text)
    body = text[m.end():] if m else text
    if not re.search(r"^##\s", body, re.M):
        body = "## Overview\n\n" + body                    # chunking needs '##' sections
    code = "UP-" + hashlib.sha256(text.encode()).hexdigest()[:8].upper()
    meta = {"doc_id": code, "slug": code.lower(), "title": title.strip(), "doc_type": doc_type, "version": "1",
            "audience": [a.strip() for a in audience.split(",") if a.strip()], "market": market}
    errs = validate(meta)
    if errs:
        raise HTTPException(400, "; ".join(errs))
    chunks = make_chunks(meta, body)
    if not chunks:
        raise HTTPException(400, "The file has no usable text")
    sb, model = data_client(), model_name()
    if sb.table("knowledge_documents").select("doc_id").eq("doc_code", code).eq("status", "published").execute().data:
        raise HTTPException(409, "This document is already uploaded")
    vectors = embed([c["content"] for c in chunks])
    doc_id = sb.table("knowledge_documents").insert({
        "doc_code": code, "slug": meta["slug"], "title": meta["title"], "doc_type": doc_type, "audience": meta["audience"],
        "market": market, "version": "1", "source": "upload", "source_path": file.filename,
        "content_hash": hashlib.sha256(text.encode()).hexdigest(), "status": "published", "embedding_model": model,
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}).execute().data[0]["doc_id"]
    sb.table("knowledge_chunks").insert([{
        "doc_id": doc_id, "source_title": meta["title"], "source_type": doc_type, "chunk_index": c["chunk_index"],
        "section": c["section"], "content": c["content"], "embedding": v, "audience": meta["audience"], "doc_type": doc_type,
        "market": market, "token_count": c["token_count"], "embedding_model": model} for c, v in zip(chunks, vectors)]).execute()
    return {"doc_code": code, "title": meta["title"], "chunks": len(chunks)}


# ---------- Info pages (ops/data) ----------
def _profile_doc(sb, market):
    r = sb.table("knowledge_documents").select("doc_code,title").eq("doc_type", "regional_profile") \
        .eq("market", market).eq("status", "published").limit(1).execute().data
    return r[0] if r else None


@router.get("/ops/distributors/{distributor_id}")
def ops_distributor(distributor_id: int, as_of: Optional[str] = None,
                    scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    d = sb.table("distributors").select("distributor_id,name,customer_segment,market").eq("distributor_id", distributor_id).limit(1).execute().data
    if not d:
        raise HTTPException(404, "Distributor not found")
    d = d[0]
    as_of = resolve_as_of(sb, as_of)
    _, pairs = open_pairs(sb, as_of) if as_of else ([], [])
    mine = [r for r, _ in pairs if distributor_id in (r["distributor_ids"] or [])]
    whs = sb.table("warehouses").select("warehouse_id,name,market").eq("market", d["market"]).execute().data
    orders = sb.table("orders").select("order_id", count="exact").eq("distributor_id", distributor_id).limit(1).execute().count
    return {"id": d["distributor_id"], "name": d["name"], "segment": d["customer_segment"], "market": d["market"],
            "serves": f"{d['customer_segment']} customers in {d['market']}",
            "supplied_by": [{"id": w["warehouse_id"], "name": w["name"]} for w in whs],
            "total_orders": orders, "open_incidents": len(mine),
            "profile_doc": _profile_doc(sb, d["market"])}


@router.get("/ops/warehouses/{warehouse_id}")
def ops_warehouse(warehouse_id: int, as_of: Optional[str] = None,
                  scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    w = sb.table("warehouses").select("warehouse_id,name,market").eq("warehouse_id", warehouse_id).limit(1).execute().data
    if not w:
        raise HTTPException(404, "Warehouse not found")
    w = w[0]
    as_of = resolve_as_of(sb, as_of)
    _, pairs = open_pairs(sb, as_of, warehouse_id) if as_of else ([], [])
    dists = sb.table("distributors").select("distributor_id,name,customer_segment").eq("market", w["market"]).execute().data
    others = sb.table("warehouses").select("warehouse_id,name,market").neq("warehouse_id", warehouse_id).execute().data
    return {"id": w["warehouse_id"], "name": w["name"], "market": w["market"], "open_incidents": len(pairs),
            "serves": [{"id": d["distributor_id"], "name": d["name"], "segment": d["customer_segment"]} for d in dists],
            "sources": {"note": "Stock is replenished from upstream supply and, in a shortage, by transfers from other warehouses (RO-OPS-004).",
                        "transfer_donors": [{"id": o["warehouse_id"], "name": o["name"], "market": o["market"]} for o in others]},
            "profile_doc": _profile_doc(sb, w["market"])}

@router.get("/ops/incidents/{incident_id}/guidance")
def incident_guidance(incident_id: int, scope: Scope = Depends(require_roles("ops"))):
    """Policy passages (RAG) relevant to this incident, for the ops detail page."""
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    from rag.retrieve import search_knowledge
    sb = data_client()
    inc = sb.table("incidents").select("incident_id,warehouse_id,severity,recommended_options") \
        .eq("incident_id", incident_id).limit(1).execute().data
    if not inc:
        raise HTTPException(404, "Incident not found")
    inc = inc[0]
    w = sb.table("warehouses").select("market").eq("warehouse_id", inc["warehouse_id"]).limit(1).execute().data
    market = w[0]["market"] if w else None
    types = sorted({o.get("type") for o in (inc.get("recommended_options") or []) if o.get("type")})
    queries = [
        f"how to respond to a {inc['severity']} severity stock shortage and who approves the decision",
        "when to expedite, split a shipment or transfer stock between warehouses",
        "what the ops briefing and distributor communication must include",
    ]
    if types:
        queries.append("rules and approval limits for " + ", ".join(t.replace("_", " ") for t in types))
    seen, out = set(), []
    for q in queries:
        try:
            hits = search_knowledge(q, "ops", market=market, k=3, sb=sb)
        except Exception:
            hits = []
        for h in hits:
            key = (h["doc_code"], h.get("section"))
            if key in seen:
                continue
            seen.add(key)
            text = (h.get("content") or "").split("\n\n", 1)[-1].strip()
            out.append({"doc_code": h["doc_code"], "title": h["title"], "section": h.get("section"),
                        "snippet": text[:420] + ("…" if len(text) > 420 else ""),
                        "similarity": round(float(h.get("similarity") or 0), 2)})
    out.sort(key=lambda x: -x["similarity"])
    return {"items": out[:6]}

