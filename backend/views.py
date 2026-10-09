"""
RunOut v2 - Dashboards, decision log, distributor and warehouse views, observability hub
Location: backend/views.py
Money fields appear only in ops/data/warehouse responses. Distributor responses never include them.
"""
import os
import json
import time
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth import Scope, current_scope, data_client, require_roles
from backend.incidents import (RISK_COLS, M1_VERSION, resolve_as_of, _in, lookups, list_incidents)
from cascade.db_utils import fetch_all

router = APIRouter(prefix="/api")
LOW_COVER_DAYS = 5
CR_LITE = "cascade_id,order_id,distributor_id,risk_id,predicted_delay_days,delay_risk_score,units_short"


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
    if score is None:
        return None
    s = float(score)
    return "high" if s >= 0.7 else ("medium" if s >= 0.5 else "low")      # placeholder thresholds


def eta(order_date, scheduled, delay):
    if order_date is None or scheduled is None:
        return None
    d = date.fromisoformat(str(order_date)[:10]) + timedelta(days=int(scheduled))
    return (d + timedelta(days=int(round(float(delay))))).isoformat() if delay is not None else None


# ------------------------------------------------------------------ ops / data
@router.get("/ops/summary")
def ops_summary(as_of: Optional[str] = None, scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    if not as_of:
        return {"as_of_date": None, "open_incidents": 0}
    risks, pairs = open_pairs(sb, as_of)
    prods, whs = lookups(sb, [r["product_id"] for r, _ in pairs], [r["warehouse_id"] for r, _ in pairs])

    by_market, dists = {}, set()
    for r, _ in pairs:
        m = (whs.get(r["warehouse_id"]) or {}).get("market", "Unknown")
        d = by_market.setdefault(m, {"market": m, "money_at_risk_usd": 0.0, "open_incidents": 0})
        d["money_at_risk_usd"] += float(r["money_at_risk_usd"] or 0)
        d["open_incidents"] += 1
        dists.update(r["distributor_ids"] or [])

    top = sorted(pairs, key=lambda p: -float(p[0]["money_at_risk_usd"] or 0))[:5]
    trend = {}
    for _, i in pairs:
        day = str(i["created_at"])[:10]
        trend[day] = trend.get(day, 0) + 1

    cr = fetch_all(sb, "cascade_results", CR_LITE, "cascade_id", apply=lambda q: q.eq("as_of_date", as_of))
    delays = [float(c["predicted_delay_days"]) for c in cr if c["predicted_delay_days"] is not None]
    late = [d for d in delays if round(d) > 0]
    return {
        "as_of_date": as_of,
        "open_incidents": len(pairs),
        "money_at_risk_usd": round(sum(float(r["money_at_risk_usd"] or 0) for r, _ in pairs), 2),
        "distributors_affected": len(dists),
        "units_short": sum(int(r["units_short"] or 0) for r, _ in pairs),
        "products_under_5_days_cover": sum(1 for r in risks if low_cover(r)),
        "orders_in_transit": len(cr),
        "late_risk_rate": round(len(late) / len(delays), 3) if delays else None,   # share with rounded predicted delay > 0
        "avg_predicted_delay_days": round(sum(delays) / len(delays), 2) if delays else None,
        "by_market": sorted(by_market.values(), key=lambda x: -x["money_at_risk_usd"]),
        "top_products": [{"product": {"id": r["product_id"], "name": prods.get(r["product_id"])},
                          "warehouse_market": (whs.get(r["warehouse_id"]) or {}).get("market"),
                          "money_at_risk_usd": r["money_at_risk_usd"], "incident_id": i["incident_id"]}
                         for r, i in top],
        "trend": [{"date": k, "opened": v} for k, v in sorted(trend.items())],
    }


@router.get("/ops/network")
def ops_network(as_of: Optional[str] = None, scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    whs = fetch_all(sb, "warehouses", "warehouse_id,name,market", "warehouse_id")
    dists = fetch_all(sb, "distributors", "distributor_id,name,customer_segment,market", "distributor_id")
    risks, pairs = open_pairs(sb, as_of) if as_of else ([], [])
    out = []
    for w in whs:
        mine = [(r, i) for r, i in pairs if r["warehouse_id"] == w["warehouse_id"]]
        out.append({
            "warehouse": w,
            "open_incidents": len(mine),
            "money_at_risk_usd": round(sum(float(r["money_at_risk_usd"] or 0) for r, _ in mine), 2),
            "low_cover_skus": sum(1 for r in risks if r["warehouse_id"] == w["warehouse_id"] and low_cover(r)),
            "distributors": [{"id": d["distributor_id"], "name": d["name"], "segment": d["customer_segment"],
                              "open_incidents": sum(1 for r, _ in mine if d["distributor_id"] in (r["distributor_ids"] or []))}
                             for d in dists if d["market"] == w["market"]],
        })
    return {"as_of_date": as_of, "warehouses": out}


@router.get("/decisions")
def decisions(action: Optional[str] = None, limit: int = Query(50, ge=1, le=200), cursor: Optional[str] = None,
              scope: Scope = Depends(require_roles("ops", "data"))):
    sb = data_client()
    start = int(cursor) if cursor and cursor.isdigit() else 0
    q = sb.table("incident_decisions").select(
        "decision_id,incident_id,action,selected_option_id,note,decided_at,decided_by")
    if action:
        q = q.eq("action", action.lower())
    rows = q.order("decided_at", desc=True).range(start, start + limit).execute().data
    more = len(rows) > limit
    rows = rows[:limit]
    incs = {i["incident_id"]: i for i in _in(sb, "incidents", "incident_id,product_id,warehouse_id,severity",
                                             "incident_id", [r["incident_id"] for r in rows])}
    prods, whs = lookups(sb, [i["product_id"] for i in incs.values()], [i["warehouse_id"] for i in incs.values()])
    users = {u["user_id"]: u["display_name"] for u in _in(sb, "app_users", "user_id,display_name", "user_id",
                                                           [r["decided_by"] for r in rows])}
    items = []
    for r in rows:
        i = incs.get(r["incident_id"]) or {}
        items.append({**{k: r[k] for k in ("decision_id", "incident_id", "action", "selected_option_id", "note", "decided_at")},
                      "decided_by": users.get(r["decided_by"]), "severity": i.get("severity"),
                      "product": prods.get(i.get("product_id")),
                      "market": (whs.get(i.get("warehouse_id")) or {}).get("market")})
    return {"items": items, "next_cursor": str(start + limit) if more else None}


@router.get("/observability")
def observability(scope: Scope = Depends(require_roles("data"))):
    sb = data_client()
    cnt = lambda t, f=None: ((f(sb.table(t).select("*", count="exact").limit(1)) if f else
                              sb.table(t).select("*", count="exact").limit(1)).execute().count or 0)
    n_orders, n_pred = cnt("orders"), cnt("predictions")
    n_open = cnt("incidents", lambda q: q.eq("status", "open"))
    link = lambda url, label, desc, ok: {"url": url, "label": label, "description": desc,
                                         "status": "connected" if ok else "not_configured"}
    return {
        "status": "all_systems_operational",
        "links": {
            "langfuse": link("https://cloud.langfuse.com", "Agent Traces", "Agent tool calls, cost and latency",
                             os.environ.get("LANGFUSE_PUBLIC_KEY")),
            "dagshub": link("https://dagshub.com/RunOut/runout-ml", "MLflow / Model Registry",
                            "Training runs, model comparison, champion models", True),
            "grafana": link(os.environ.get("GRAFANA_URL", "https://grafana.com"), "Grafana Dashboard",
                            "System health and data drift", os.environ.get("GRAFANA_URL")),
            "supabase": link(os.environ.get("SUPABASE_URL", ""), "Supabase Database",
                             "Orders, inventory, predictions", True),
        },
        "summary": {"total_orders": n_orders, "total_predictions": n_pred, "active_incidents": n_open,
                    "models_trained": {"m1": "active" if n_pred else "pending", "m2": "active"}},
    }


# ------------------------------------------------------------------ distributor
@router.get("/my/overview")
def my_overview(as_of: Optional[str] = None, scope: Scope = Depends(require_roles("distributor"))):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    if not as_of:
        return {"as_of_date": None}
    cr = fetch_all(sb, "cascade_results", CR_LITE, "cascade_id",
                   apply=lambda q: q.eq("as_of_date", as_of).eq("distributor_id", scope.distributor_id))
    top = list_incidents(status=None, severity=None, market=None, warehouse_id=None, product_id=None, q=None,
                         distributor_id=None, as_of=as_of, limit=5, cursor=None, scope=scope)["items"]
    return {
        "as_of_date": as_of,
        "orders_in_transit": len(cr),
        "orders_predicted_late": sum(1 for c in cr if c["predicted_delay_days"] is not None
                                     and round(float(c["predicted_delay_days"])) > 0),
        "products_at_risk": len(top),
        "nearest_stockout_date": min((i["stockout_date"] for i in top if i["stockout_date"]), default=None),
        "needs_attention": top,
    }


@router.get("/my/orders")
def my_orders(status: Optional[str] = None, shipping_mode: Optional[str] = None,
              as_of: Optional[str] = None, limit: int = Query(20, ge=1, le=100), cursor: Optional[str] = None,
              scope: Scope = Depends(require_roles("distributor"))):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    start = int(cursor) if cursor and cursor.isdigit() else 0
    q = sb.table("orders").select("order_id,product_id,order_date,shipping_mode,order_item_quantity,"
                                  "order_status,days_for_shipment_scheduled") \
        .eq("distributor_id", scope.distributor_id)
    if as_of:
        q = q.lt("order_date", (date.fromisoformat(as_of) + timedelta(days=1)).isoformat())
    if status:
        q = q.eq("order_status", status)
    if shipping_mode:
        q = q.eq("shipping_mode", shipping_mode)
    rows = q.order("order_date", desc=True).order("order_id", desc=True).range(start, start + limit).execute().data
    more = len(rows) > limit
    rows = rows[:limit]
    prods, _ = lookups(sb, [o["product_id"] for o in rows], [])
    preds = preds_for(sb, [o["order_id"] for o in rows])
    items = []
    for o in rows:
        p = preds.get(o["order_id"])
        delay = p["predicted_delay_days"] if p else None
        items.append({
            "order_id": o["order_id"], "product": {"id": o["product_id"], "name": prods.get(o["product_id"])},
            "quantity": o["order_item_quantity"], "order_date": str(o["order_date"])[:10],
            "shipping_mode": o["shipping_mode"], "status": o["order_status"],
            "original_eta": eta(o["order_date"], o["days_for_shipment_scheduled"], 0),
            "predicted_delay_days": delay, "predicted_eta": eta(o["order_date"], o["days_for_shipment_scheduled"], delay),
            "risk": risk_label(p["delay_risk_score"]) if p else None,
        })
    return {"items": items, "next_cursor": str(start + limit) if more else None, "as_of_date": as_of}


@router.get("/my/orders/{order_id}")
def my_order(order_id: int, scope: Scope = Depends(require_roles("distributor"))):
    sb = data_client()
    rows = sb.table("orders").select("order_id,product_id,order_date,shipping_mode,order_item_quantity,"
                                     "order_status,days_for_shipment_scheduled") \
        .eq("order_id", order_id).eq("distributor_id", scope.distributor_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Order not found")
    o = rows[0]
    prods, _ = lookups(sb, [o["product_id"]], [])
    p = preds_for(sb, [order_id]).get(order_id)
    delay = p["predicted_delay_days"] if p else None
    link = None
    cr = (sb.table("cascade_results").select("risk_id").eq("order_id", order_id)
          .not_.is_("risk_id", "null").order("as_of_date", desc=True).limit(1).execute().data)
    if cr:
        inc = sb.table("incidents").select("incident_id,status").eq("risk_id", cr[0]["risk_id"]).limit(1).execute().data
        link = inc[0] if inc else None
    orig, pred = eta(o["order_date"], o["days_for_shipment_scheduled"], 0), eta(o["order_date"], o["days_for_shipment_scheduled"], delay)
    return {
        "order_id": order_id, "product": {"id": o["product_id"], "name": prods.get(o["product_id"])},
        "quantity": o["order_item_quantity"], "shipping_mode": o["shipping_mode"], "status": o["order_status"],
        "predicted_delay_days": delay, "risk": risk_label(p["delay_risk_score"]) if p else None,
        "timeline": [{"step": "ordered", "date": str(o["order_date"])[:10]},
                     {"step": "original_eta", "date": orig}, {"step": "predicted_eta", "date": pred}],
        "incident": link,
    }


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
                       scope: Scope = Depends(require_roles("warehouse", "ops", "data"))):
    sb = data_client()
    wid = _wh_id(scope, warehouse_id)
    as_of = resolve_as_of(sb, as_of)
    risks, pairs = open_pairs(sb, as_of, wid) if as_of else ([], [])
    snap, inv = _inventory_snapshot(sb, wid, as_of)
    w = sb.table("warehouses").select("warehouse_id,name,market").eq("warehouse_id", wid).limit(1).execute().data
    dists = fetch_all(sb, "distributors", "distributor_id,name,customer_segment,market", "distributor_id",
                      apply=lambda q: q.eq("market", w[0]["market"])) if w else []
    return {
        "warehouse": w[0] if w else None, "as_of_date": as_of, "inventory_snapshot_date": snap,
        "open_incidents": len(pairs),
        "money_at_risk_usd": round(sum(float(r["money_at_risk_usd"] or 0) for r, _ in pairs), 2),
        "skus_under_5_days_cover": sum(1 for r in risks if low_cover(r)),
        "total_stock_units": sum(int(x["stock_on_hand"] or 0) for x in inv),
        "distributors": [{"id": d["distributor_id"], "name": d["name"], "segment": d["customer_segment"],
                          "open_incidents": sum(1 for r, _ in pairs if d["distributor_id"] in (r["distributor_ids"] or []))}
                         for d in dists],
    }


@router.get("/warehouse/inventory")
def warehouse_inventory(warehouse_id: Optional[int] = None, as_of: Optional[str] = None, q: Optional[str] = None,
                        scope: Scope = Depends(require_roles("warehouse", "ops", "data"))):
    sb = data_client()
    wid = _wh_id(scope, warehouse_id)
    as_of = resolve_as_of(sb, as_of)
    snap, inv = _inventory_snapshot(sb, wid, as_of)
    risks = {r["product_id"]: r for r in (open_pairs(sb, as_of, wid)[0] if as_of else [])}
    prods = {p["product_id"]: p for p in _in(sb, "products", "product_id,name,category_name", "product_id",
                                              [x["product_id"] for x in inv])}
    items = []
    for x in inv:
        p, r = prods.get(x["product_id"]) or {}, risks.get(x["product_id"])
        if q and q.lower() not in (p.get("name") or "").lower():
            continue
        items.append({"product": {"id": x["product_id"], "name": p.get("name"), "category": p.get("category_name")},
                      "stock_on_hand": x["stock_on_hand"],
                      "weekly_demand": r["weekly_demand"] if r else None,
                      "days_of_cover": r["days_of_cover"] if r else None,       # only for products the cascade assessed
                      "severity": r["severity"] if r else None})
    items.sort(key=lambda i: (i["days_of_cover"] is None, i["days_of_cover"] or 0))
    return {"warehouse_id": wid, "inventory_snapshot_date": snap, "as_of_date": as_of, "items": items}

@router.get("/my/stock")
def my_stock(as_of: Optional[str] = None, scope: Scope = Depends(require_roles("distributor"))):
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
                      "severity": r["severity"] if r else None})
    items.sort(key=lambda i: (i["days_of_cover"] is None, i["days_of_cover"] or 0))
    return {"as_of_date": as_of, "items": items}



# ------------------------------------------------------------------ observability tabs (data role only)
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


@router.get("/observability/models")
def obs_models(scope: Scope = Depends(require_roles("data"))):
    sb = data_client()
    m1 = {"model_version_scored": M1_VERSION,
          "predictions_for_version": _count(sb, "predictions", lambda q: q.eq("model_version", M1_VERSION)),
          "last_scored_at": _latest(sb, "predictions", "scored_at")}
    try:
        from ml.m1_delay_risk.registry import champion_info, recent_runs
        m1["registry"] = _cached("m1_champion", 300, champion_info)
        m1["recent_runs"] = _cached("m1_runs", 300, recent_runs)
    except Exception as e:                                           # DagsHub down or not configured: say so, do not crash
        m1["registry_error"] = f"{type(e).__name__}: {str(e)[:160]}"
    f = sb.table("distributor_usage_forecast").select("model_version,as_of_date,scored_at").order("scored_at", desc=True).limit(1).execute().data
    m2 = {"latest_forecast": f[0] if f else None, "forecast_rows": _count(sb, "distributor_usage_forecast"),
          "note": "M2 is loaded from a local pickle; it is not in the MLflow registry yet."}
    return {"m1": m1, "m2": m2, "mlflow_url": "https://dagshub.com/RunOut/runout-ml"}


@router.get("/observability/pipeline")
def obs_pipeline(scope: Scope = Depends(require_roles("data"))):
    sb = data_client()
    runs = sb.table("pipeline_runs").select("run_id,as_of_date,stage,status,started_at,ended_at,rows,detail") \
        .order("run_id", desc=True).limit(200).execute().data
    latest = {}
    for r in runs:
        latest.setdefault((str(r["as_of_date"]), r["stage"]), r)
    by_date = {}
    for (d, stage), r in latest.items():
        by_date.setdefault(d, {})[stage] = {"status": r["status"], "ended_at": r["ended_at"], "rows": r["rows"]}
    failed = [{**{k: r[k] for k in ("run_id", "as_of_date", "stage", "started_at")}, "detail": (r["detail"] or "")[-200:]}
              for r in runs if r["status"] == "failed"][:10]
    return {
        "freshness": {"latest_order_date": _latest(sb, "orders", "order_date"), "latest_cascade_date": _latest(sb, "stock_risks", "as_of_date"),
                      "latest_prediction_scored_at": _latest(sb, "predictions", "scored_at"),
                      "latest_pipeline_run": runs[0]["ended_at"] if runs else None},
        "counts": {"orders": _count(sb, "orders"), "predictions": _count(sb, "predictions"), "stock_risks": _count(sb, "stock_risks"),
                   "incidents_open": _count(sb, "incidents", lambda q: q.eq("status", "open")),
                   "incidents_total": _count(sb, "incidents")},
        "runs_by_date": [{"as_of_date": d, "stages": s} for d, s in sorted(by_date.items(), reverse=True)],
        "failed_runs": failed,
    }


@router.get("/observability/agent")
def obs_agent(scope: Scope = Depends(require_roles("data"))):
    sb = data_client()
    rows = fetch_all(sb, "agent_runs", "run_id,incident_id,as_of_date,status,started_at,duration_s,llm_calls,prompt_tokens,"
                     "completion_tokens,validation_failed,fallback_used,error", "run_id")
    n = len(rows)
    avg = lambda k: round(sum(float(r[k] or 0) for r in rows) / n, 2) if n else None
    rate = lambda f: round(sum(1 for r in rows if f(r)) / n, 3) if n else None
    return {
        "runs": n, "avg_duration_s": avg("duration_s"), "avg_llm_calls": avg("llm_calls"),
        "total_prompt_tokens": sum(int(r["prompt_tokens"] or 0) for r in rows),
        "total_completion_tokens": sum(int(r["completion_tokens"] or 0) for r in rows),
        "error_rate": rate(lambda r: r["status"] == "error"), "validation_failure_rate": rate(lambda r: r["validation_failed"]),
        "fallback_rate": rate(lambda r: r["fallback_used"]),
        "ask_retrievals": _count(sb, "retrieval_logs"),
        "recent": sorted(rows, key=lambda r: -r["run_id"])[:10],
        "traces_url": "https://cloud.langfuse.com", "traces_configured": bool(os.environ.get("LANGFUSE_PUBLIC_KEY")),
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