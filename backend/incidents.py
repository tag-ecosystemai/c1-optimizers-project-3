"""
RunOut v2 - Incident endpoints (role-shaped)
Location: backend/incidents.py

  GET  /api/incidents                       list (scope applied server-side)
  GET  /api/incidents/{incident_id}         detail (shape depends on role)
  POST /api/incidents/{incident_id}/decision  ops decides; warehouse may only acknowledge

Distributor responses never contain money, evidence, SHAP, options, decisions or other distributors.
"""
import os
import json
import datetime as _dt
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.auth import Scope, current_scope, data_client, effective_scope
from cascade.db_utils import fetch_all

router = APIRouter(prefix="/api")

M1_VERSION = os.environ.get("M1_MODEL_VERSION", "m1-gradient_boosting-random_forest-20261008")
SEV_RANK = {"HIGH": 3, "MEDIUM": 2, "LOW": 1, "NONE": 0}
FULL_VIEW = ("ops", "data", "warehouse")      # roles that may see money, evidence, SHAP, options

RISK_COLS = ("risk_id,as_of_date,warehouse_id,product_id,stock_on_hand,weekly_demand,days_of_cover,"
             "stockout_date,first_arrival,gap_days,units_short,money_at_risk_usd,severity,orders_affected,"
             "distributor_ids")
INC_COLS = ("incident_id,risk_id,warehouse_id,product_id,severity,status,probable_cause,cause_confidence,"
            "evidence,recommended_options,briefing_text_ops,briefing_text_warehouse,"
            "briefing_text_distributor,created_at,updated_at")
CR_COLS = ("cascade_id,order_id,distributor_id,product_id,warehouse_id,units_short,money_at_risk_usd,"
           "predicted_delay_days,projected_arrival,delay_risk_score,risk_id")


# ---------------------------------------------------------------- helpers
def _in(sb, table, cols, key, values, page=100):
    vals = list(dict.fromkeys(v for v in values if v is not None))
    out = []
    for i in range(0, len(vals), page):
        out += sb.table(table).select(cols).in_(key, vals[i:i + page]).execute().data
    return out


def resolve_as_of(sb, as_of):
    """Use the date the caller asked for; otherwise the newest date the pipeline has produced."""
    if as_of:
        return as_of
    r = sb.table("stock_risks").select("as_of_date").order("as_of_date", desc=True).limit(1).execute().data
    return r[0]["as_of_date"] if r else None

def own_cascade_rows(sb, distributor_id, as_of=None):
    """This distributor's cascade rows (one per in-transit order), optionally for one date."""
    def apply(qq):
        qq = qq.eq("distributor_id", distributor_id).not_.is_("risk_id", "null")
        return qq.eq("as_of_date", as_of) if as_of else qq
    return fetch_all(sb, "cascade_results", CR_COLS, "cascade_id", apply=apply)


def lookups(sb, product_ids, warehouse_ids):
    prods = {p["product_id"]: p["name"] for p in _in(sb, "products", "product_id,name", "product_id", product_ids)}
    whs = {w["warehouse_id"]: w for w in _in(sb, "warehouses", "warehouse_id,name,market", "warehouse_id", warehouse_ids)}
    return prods, whs


def _briefing(inc, scope):
    if scope.role in ("ops", "data"):
        return inc.get("briefing_text_ops")
    if scope.role == "warehouse":
        return inc.get("briefing_text_warehouse")
    b = inc.get("briefing_text_distributor")
    if isinstance(b, str) and b.strip().startswith("{"):
        try:
            b = json.loads(b)
        except Exception:
            pass
    if isinstance(b, dict):                       # JSON keyed by distributor id
        b = b.get(str(scope.distributor_id))
    return b

# ---------------------------------------------------------------- list
@router.get("/incidents")
def list_incidents(
    status: Optional[str] = None, severity: Optional[str] = None, market: Optional[str] = None,
    warehouse_id: Optional[int] = None, product_id: Optional[int] = None, q: Optional[str] = None,
    distributor_id: Optional[int] = None,            # ops/data only; ignored for other roles
    as_of: Optional[str] = None,
    sort: Optional[str] = None,                       # field name, "-" prefix for descending (see SORT_KEYS)
    limit: int = Query(50, ge=1, le=200), cursor: Optional[str] = None,
    scope: Scope = Depends(effective_scope),
):
    sb = data_client()
    as_of = resolve_as_of(sb, as_of)
    empty = {"items": [], "next_cursor": None, "as_of_date": as_of}
    if not as_of:
        return empty

    risks = fetch_all(sb, "stock_risks", RISK_COLS, "risk_id", apply=lambda qq: qq.eq("as_of_date", as_of))
    if scope.role == "warehouse":
        risks = [r for r in risks if r["warehouse_id"] == scope.warehouse_id]
    risk_by_id = {r["risk_id"]: r for r in risks}

    # distributor scope (forced for distributors, optional filter for ops/data)
    own = None
    who = scope.distributor_id if scope.role == "distributor" else (distributor_id if scope.role in ("ops", "data") else None)
    if who is not None:
        own = {}
        for c in own_cascade_rows(sb, who, as_of):
            d = own.setdefault(c["risk_id"], {"orders": 0, "units": 0, "delay": None})
            d["orders"] += 1
            d["units"] += int(c["units_short"] or 0)
            if c["predicted_delay_days"] is not None:
                d["delay"] = max(float(c["predicted_delay_days"]), d["delay"] if d["delay"] is not None else -1e9)
    if scope.role == "distributor" and own is None:
        return empty

    incs = _in(sb, "incidents", INC_COLS, "risk_id", list(risk_by_id))
    if own is not None:
        incs = [i for i in incs if i["risk_id"] in own]
    incs = [i for i in incs if (i["status"] == status)] if status else [i for i in incs if i["status"] != "withdrawn"]
    if severity:
        incs = [i for i in incs if i["severity"] == severity.upper()]
    if warehouse_id and scope.role != "warehouse":
        incs = [i for i in incs if i["warehouse_id"] == warehouse_id]
    if product_id:
        incs = [i for i in incs if i["product_id"] == product_id]

    prods, whs = lookups(sb, [i["product_id"] for i in incs], [i["warehouse_id"] for i in incs])
    if market:
        incs = [i for i in incs if (whs.get(i["warehouse_id"]) or {}).get("market", "").lower() == market.lower()]
    if q:
        incs = [i for i in incs if q.lower() in (prods.get(i["product_id"]) or "").lower()]

    items = []
    for i in incs:
        r = risk_by_id[i["risk_id"]]
        w = whs.get(i["warehouse_id"]) or {}
        item = {
            "incident_id": i["incident_id"], "status": i["status"], "severity": i["severity"],
            "product": {"id": i["product_id"], "name": prods.get(i["product_id"])},
            "stockout_date": r["stockout_date"], "first_arrival": r["first_arrival"],
            "days_of_cover": r["days_of_cover"], "created_at": i["created_at"],
            "investigating": i["status"] == "open" and not i.get("probable_cause"),
        }
        if scope.role == "distributor":
            mine = own[i["risk_id"]]
            item.update({"warehouse": {"market": w.get("market")},
                         "orders_affected": mine["orders"], "units_short": mine["units"],
                         "max_predicted_delay_days": mine["delay"]})
        else:
            item.update({"warehouse": {"id": i["warehouse_id"], "name": w.get("name"), "market": w.get("market")},
                         "orders_affected": r["orders_affected"],
                         "distributors_affected": len(r["distributor_ids"] or []),
                         "units_short": r["units_short"], "money_at_risk_usd": r["money_at_risk_usd"]})
        items.append(item)

    if scope.role != "distributor":
        need_all = (sort or "").lstrip("-") == "predicted_delay_days"       # delay is only needed for every row when sorting by it
        if need_all:
            _add_max_delay(sb, items, incs)
    _sort_items(items, sort, scope.role)
    start = int(cursor) if cursor and cursor.isdigit() else 0
    page = items[start:start + limit]
    if scope.role != "distributor":
        if not (sort or "").lstrip("-") == "predicted_delay_days":
            _add_max_delay(sb, page, incs)
        ids = [x["incident_id"] for x in page]
        acked = {d["incident_id"] for d in _in(sb, "incident_decisions", "incident_id,action", "incident_id", ids)
                 if d["action"] == "acknowledged"}
        for x in page:
            x["acknowledged_by_warehouse"] = x["incident_id"] in acked
    return {"items": page, "next_cursor": str(start + limit) if start + limit < len(items) else None,
            "prev_cursor": str(max(0, start - limit)) if start > 0 else None,
            "total": len(items), "as_of_date": as_of}


SORT_KEYS = {"money_at_risk_usd", "predicted_delay_days", "stockout_date", "units_short", "created_at", "severity"}


def max_delays(sb, risk_ids):
    """Largest predicted delay (days) among the orders of each risk."""
    out, ids = {}, list(dict.fromkeys(risk_ids))
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        for c in fetch_all(sb, "cascade_results", "cascade_id,risk_id,predicted_delay_days", "cascade_id",
                           apply=lambda qq, ch=chunk: qq.in_("risk_id", ch)):
            if c["predicted_delay_days"] is not None:
                v = float(c["predicted_delay_days"])
                out[c["risk_id"]] = max(v, out.get(c["risk_id"], -1e9))
    return out


def _add_max_delay(sb, items, incs):
    risk_of = {i["incident_id"]: i["risk_id"] for i in incs}
    md = max_delays(sb, [risk_of[x["incident_id"]] for x in items])
    for x in items:
        x["max_predicted_delay_days"] = md.get(risk_of[x["incident_id"]])


def _sort_items(items, sort, role):
    key, desc = (sort or "").lstrip("-"), (sort or "").startswith("-")
    if key not in SORT_KEYS or (role == "distributor" and key == "money_at_risk_usd"):
        if role == "distributor":
            items.sort(key=lambda x: (x["stockout_date"] or "9999", -SEV_RANK.get(x["severity"], 0)))
        else:
            items.sort(key=lambda x: (-float(x["money_at_risk_usd"] or 0), x["incident_id"]))
        return
    field = "max_predicted_delay_days" if key == "predicted_delay_days" else key

    def val(x):
        v = x.get(field)
        if v is None:
            return None
        if key == "severity":
            return SEV_RANK.get(v, 0)
        if key in ("stockout_date", "created_at"):
            return str(v)
        return float(v)
    present = [x for x in items if val(x) is not None]
    missing = [x for x in items if val(x) is None]
    present.sort(key=lambda x: (val(x), x["incident_id"]), reverse=desc)
    items[:] = present + missing

# ---------------------------------------------------------------- detail
FEATURE_LABELS = {"shipping_mode_encoded": "Shipping mode", "order_item_quantity": "Order quantity", "order_item_total": "Order value",
                  "month": "Month of year", "is_peak_season": "Peak season (October to December)", "profit_ratio": "Profit ratio",
                  "order_region": "Order region"}


def shap_display(items):
    out = []
    for f in items or []:
        c = float(f.get("contribution", f.get("contribution_days", 0)) or 0)
        out.append({"feature": f["feature"], "label": FEATURE_LABELS.get(f["feature"], f["feature"]), "contribution": round(c, 3), "contribution_days": round(c, 3),
                    "impact": "increases predicted delay" if c > 0 else "decreases predicted delay"})
    return out

@router.get("/incidents/{incident_id}")
def get_incident(incident_id: int, scope: Scope = Depends(effective_scope)):
    sb = data_client()
    rows = sb.table("incidents").select(INC_COLS).eq("incident_id", incident_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Incident not found")
    inc = rows[0]
    if scope.role == "warehouse" and inc["warehouse_id"] != scope.warehouse_id:
        raise HTTPException(404, "Incident not found")
    risk = sb.table("stock_risks").select(RISK_COLS).eq("risk_id", inc["risk_id"]).limit(1).execute().data
    if not risk:
        raise HTTPException(404, "Incident not found")
    risk = risk[0]

    cr = fetch_all(sb, "cascade_results", CR_COLS, "cascade_id", apply=lambda qq: qq.eq("risk_id", inc["risk_id"]))
    if scope.role == "distributor":
        cr = [c for c in cr if c["distributor_id"] == scope.distributor_id]
        if not cr:
            raise HTTPException(404, "Incident not found")      # 404, not 403: do not reveal it exists
    cr.sort(key=lambda c: (str(c["projected_arrival"]), c["order_id"]))

    prods, whs = lookups(sb, [inc["product_id"]], [inc["warehouse_id"]])
    w = whs.get(inc["warehouse_id"]) or {}
    qty = {o["order_id"]: o["order_item_quantity"]
           for o in _in(sb, "orders", "order_id,order_item_quantity", "order_id", [c["order_id"] for c in cr])}
    dnames = {d["distributor_id"]: d["name"]
              for d in _in(sb, "distributors", "distributor_id,name", "distributor_id", [c["distributor_id"] for c in cr])}

    orders = []
    for c in cr:
        o = {"order_id": c["order_id"], "quantity": qty.get(c["order_id"]),
             "projected_arrival": c["projected_arrival"], "predicted_delay_days": c["predicted_delay_days"],
             "units_short": c["units_short"]}
        if scope.role != "distributor":
            o["distributor"] = {"id": c["distributor_id"], "name": dnames.get(c["distributor_id"])}
        orders.append(o)

    out = {
        "incident_id": inc["incident_id"], "status": inc["status"], "severity": inc["severity"],
        "created_at": inc["created_at"], "as_of_date": risk["as_of_date"],
        "product": {"id": inc["product_id"], "name": prods.get(inc["product_id"])},
        "affected_orders": orders,
        "briefing_text": _briefing(inc, scope),
    }

    if scope.role == "distributor":
        out["warehouse"] = {"market": w.get("market")}
        out["impact"] = {"days_of_cover": risk["days_of_cover"], "stockout_date": risk["stockout_date"],
                         "first_arrival": risk["first_arrival"], "gap_days": risk["gap_days"],
                         "units_short": sum(int(c["units_short"] or 0) for c in cr)}   # their own share
        return out

    # ---- full view: ops, data, warehouse
    out["warehouse"] = {"id": inc["warehouse_id"], "name": w.get("name"), "market": w.get("market")}
    out["impact"] = {k: risk[k] for k in ("stock_on_hand", "weekly_demand", "days_of_cover", "stockout_date",
                                          "first_arrival", "gap_days", "units_short", "money_at_risk_usd")}
    by_d = {}
    for c in cr:
        d = by_d.setdefault(c["distributor_id"], {"id": c["distributor_id"], "name": dnames.get(c["distributor_id"]),
                                                  "orders": 0, "units_short": 0})
        d["orders"] += 1
        d["units_short"] += int(c["units_short"] or 0)
    out["distributors"] = list(by_d.values())
    out["probable_cause"] = inc["probable_cause"]
    out["cause_confidence"] = inc["cause_confidence"]
    out["evidence"] = inc["evidence"]
    out["recommended_options"] = inc["recommended_options"]

    shap = None
    if cr:
        top = max(cr, key=lambda c: float(c["predicted_delay_days"] or 0))
        p = (sb.table("predictions").select("shap_explanation").eq("order_id", top["order_id"])
             .eq("model_version", M1_VERSION).limit(1).execute().data)
        if p and p[0]["shap_explanation"]:
            shap = {"order_id": top["order_id"], "delay_risk_score": top["delay_risk_score"],
                    "top_features": shap_display(p[0]["shap_explanation"]),
                    "note": "Contributions are in days, relative to the average predicted delay. Shipping mode dominates because the model barely uses the other inputs."}
    out["shap"] = shap

    decs = (sb.table("incident_decisions").select("decision_id,action,selected_option_id,note,decided_at,decided_by")
            .eq("incident_id", incident_id).order("decided_at", desc=True).execute().data)
    names = {u["user_id"]: u["display_name"]
             for u in _in(sb, "app_users", "user_id,display_name", "user_id", [d["decided_by"] for d in decs])}
    out["response_targets"] = RESPONSE_TARGETS.get(inc["severity"])
    out["decisions"] = [{"decision_id": d["decision_id"], "action": d["action"], "by": names.get(d["decided_by"]),
                         "note": d["note"], "selected_option_id": d["selected_option_id"], "decided_at": d["decided_at"]}
                        for d in decs]
    out["acknowledged_by_warehouse"] = any(d["action"] == "acknowledged" for d in decs)
    out["investigating"] = inc["status"] == "open" and not inc.get("probable_cause")
    
    return out


# ---------------------------------------------------------------- decision
class DecisionRequest(BaseModel):
    action: str                                   # approved | dismissed | escalated | acknowledged
    selected_option_id: Optional[str] = None
    note: Optional[str] = None


ACTIONS = {"approve": "approved", "approved": "approved", "dismiss": "dismissed", "dismissed": "dismissed",
           "escalate": "escalated", "escalated": "escalated", "acknowledge": "acknowledged",
           "acknowledged": "acknowledged"}


SPEND_TYPES = {"expedite", "priority_handling", "split_shipment"}
WEEKLY_BUDGET_USD = 5000.0         # RO-OPS-005 section 8
NOTE_FROM_USD = 250.0              # RO-OPS-001 sections 6 and 11
HEAD_OPS_OVER_USD = 1000.0         # RO-OPS-001 section 6
RESPONSE_TARGETS = {               # RO-OPS-001 section 5 (business hours; shown to the user, not enforced)
    "HIGH": {"warehouse_acknowledges": "within 2 hours", "distributor_notified": "within 2 hours", "decision": "within 4 hours"},
    "MEDIUM": {"warehouse_acknowledges": "within 4 hours", "distributor_notified": "within 2 hours", "decision": "within 1 business day"},
    "LOW": {"warehouse_acknowledges": "next business day", "distributor_notified": "within 1 business day", "decision": "within 2 business days"},
}


def week_spend(sb, as_of, market, exclude_incident):
    """Approved spend (expedite, priority handling, split shipment) for this market in the same ISO week (RO-OPS-005 section 8)."""
    year, week = _dt.date.fromisoformat(str(as_of)[:10]).isocalendar()[:2]
    decs = sb.table("incident_decisions").select("incident_id,selected_option_id").eq("action", "approved").execute().data
    decs = [d for d in decs if d["incident_id"] != exclude_incident and d["selected_option_id"]]
    if not decs:
        return 0.0
    incs = {i["incident_id"]: i for i in _in(sb, "incidents", "incident_id,risk_id,warehouse_id,recommended_options",
                                              "incident_id", [d["incident_id"] for d in decs])}
    risks = {r["risk_id"]: r for r in _in(sb, "stock_risks", "risk_id,as_of_date", "risk_id", [i["risk_id"] for i in incs.values()])}
    mk = {x["warehouse_id"]: x["market"] for x in _in(sb, "warehouses", "warehouse_id,market", "warehouse_id",
                                                        [i["warehouse_id"] for i in incs.values()])}
    total = 0.0
    for d in decs:
        i = incs.get(d["incident_id"])
        if not i or mk.get(i["warehouse_id"]) != market:
            continue
        r = risks.get(i["risk_id"])
        if not r or _dt.date.fromisoformat(str(r["as_of_date"])[:10]).isocalendar()[:2] != (year, week):
            continue
        for o in (i.get("recommended_options") or []):
            if o.get("option_id") == d["selected_option_id"] and o.get("type") in SPEND_TYPES:
                total += float(o.get("cost_usd") or 0)
    return total


def must_escalate(sb, inc, risk, options, opt):
    """Situations where the Operations Manager may only escalate (RO-OPS-001 sections 6 and 8)."""
    why = []
    short = int(risk.get("units_short") or 0)
    best = max((int(o.get("units_covered") or 0) for o in options), default=0)
    if inc.get("severity") == "HIGH" and short > 0 and best <= short / 2:
        why.append("severity is HIGH and no option covers more than half of the units short (RO-OPS-001 section 8)")
    if opt and float(opt.get("cost_usd") or 0) > HEAD_OPS_OVER_USD:
        why.append("the action costs more than $1,000, which needs the Head of Operations (RO-OPS-001 section 6)")
    dids = set(risk.get("distributor_ids") or [])
    if dids:
        open_ = sb.table("incidents").select("incident_id,risk_id").eq("status", "open").execute().data
        peers = _in(sb, "stock_risks", "risk_id,as_of_date,distributor_ids", "risk_id", [i["risk_id"] for i in open_])
        day = str(risk.get("as_of_date"))[:10]
        for did in dids:
            if sum(1 for r in peers if str(r["as_of_date"])[:10] == day and did in (r.get("distributor_ids") or [])) >= 3:
                why.append("three or more incidents are open for the same distributor (RO-OPS-001 section 8)")
                break
    return why


def approval_notes(sb, inc, opt, risk):
    """Reasons a written note is required to approve this option (RO-OPS-001 sections 6, 7 and 11; RO-OPS-005 section 8)."""
    why = []
    cost = float(opt.get("cost_usd") or 0)
    if cost >= NOTE_FROM_USD:
        why.append("an approval of $250 or more needs a written note (RO-OPS-001 sections 6 and 11)")
    if opt.get("cost_exceeds_money_at_risk"):
        why.append("the action costs more than the money at risk, so the reason must be recorded (RO-OPS-001 section 7)")
    if opt.get("type") in SPEND_TYPES:
        wh = sb.table("warehouses").select("market").eq("warehouse_id", inc["warehouse_id"]).limit(1).execute().data
        if wh and risk.get("as_of_date"):
            if week_spend(sb, risk["as_of_date"], wh[0]["market"], inc["incident_id"]) + cost > WEEKLY_BUDGET_USD:
                why.append("the weekly expedite budget of $5,000 for this market would be exceeded; "
                           "Head of Operations approval is required (RO-OPS-005 section 8)")
    return why


@router.post("/incidents/{incident_id}/decision")
def decide(incident_id: int, req: DecisionRequest, scope: Scope = Depends(current_scope)):
    action = ACTIONS.get(req.action.strip().lower())
    if not action:
        raise HTTPException(422, "action must be approved, dismissed, escalated or acknowledged")
    if scope.role == "ops":
        pass
    elif scope.role == "warehouse" and action == "acknowledged":
        pass
    else:
        raise HTTPException(403, "Not allowed for your role")

    sb = data_client()
    rows = sb.table("incidents").select("incident_id,status,warehouse_id,risk_id,severity,recommended_options") \
        .eq("incident_id", incident_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, "Incident not found")
    inc = rows[0]
    if scope.role == "warehouse" and inc["warehouse_id"] != scope.warehouse_id:
        raise HTTPException(404, "Incident not found")

    note = (req.note or "").strip()
    if action in ("dismissed", "escalated") and not note:
        raise HTTPException(422, f"A note is required to {'dismiss' if action == 'dismissed' else 'escalate'} (RO-OPS-001 section 11)")
    options = inc.get("recommended_options") or []
    opt = None
    if action == "approved":
        opt = next((o for o in options if o.get("option_id") == req.selected_option_id), None)
        if options and opt is None:
            raise HTTPException(422, "Select one of the recommended options to approve")
    risk = {}
    if scope.role == "ops" and action in ("approved", "dismissed"):
        r = sb.table("stock_risks").select("as_of_date,units_short,distributor_ids").eq("risk_id", inc["risk_id"]).limit(1).execute().data
        risk = r[0] if r else {}
        trig = must_escalate(sb, inc, risk, options, opt)
        if trig:
            raise HTTPException(422, f"This incident must be escalated, not {action}: " + "; ".join(trig) +
                                ". Escalate it with a note that includes your recommendation.")
    if action == "approved" and opt:
        why = approval_notes(sb, inc, opt, risk)
        if why and not note:
            raise HTTPException(422, "A note is required because " + "; ".join(why) + ".")

    now = datetime.now(timezone.utc).isoformat()
    if action == "acknowledged":
        if inc["status"] == "withdrawn":
            raise HTTPException(409, "Incident is no longer at risk")
    else:
        done = sb.table("incidents").update({"status": action, "updated_at": now}) \
            .eq("incident_id", incident_id).eq("status", "open").execute().data
        if not done:
            raise HTTPException(409, f"Incident is already {inc['status']}")

    sb.table("incident_decisions").insert({
        "incident_id": incident_id, "decided_by": scope.user_id, "action": action,
        "selected_option_id": req.selected_option_id, "note": note or None}).execute()
    return {"incident_id": incident_id, "action": action,
            "status": inc["status"] if action == "acknowledged" else action, "decided_at": now}