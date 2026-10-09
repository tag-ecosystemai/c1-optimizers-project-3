"""LangGraph investigation: load_context -> investigate -> build_options -> recommend -> write_briefings -> validate -> persist.
Code computes numbers, options and the briefing formats; the LLM only chooses among generated options and words two
sentences of the ops briefing. It never sets incident status (only the decision endpoint can)."""
import os
import sys
import json
import time
import datetime as dt
from typing import Any, TypedDict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from agent import llm, tools, briefings, tracing  # noqa: E402
from agent.options import build_options, find_donors  # noqa: E402
from backend.auth import data_client  # noqa: E402
from backend.incidents import CR_COLS, _in  # noqa: E402
from cascade.db_utils import fetch_all  # noqa: E402


class State(TypedDict, total=False):
    incident_id: int
    ctx: dict
    evidence: list
    cause: str
    confidence: float
    option_list: list
    drafts: dict
    facts: Any
    texts: dict
    flags: dict
    usage: dict
    use_llm: bool


def n_load(s):
    sb = data_client()
    inc = sb.table("incidents").select("incident_id,risk_id,warehouse_id,product_id,severity,status").eq("incident_id", s["incident_id"]).limit(1).execute().data[0]
    risk = sb.table("stock_risks").select("*").eq("risk_id", inc["risk_id"]).limit(1).execute().data[0]
    cr = fetch_all(sb, "cascade_results", CR_COLS, "cascade_id", apply=lambda q: q.eq("risk_id", inc["risk_id"]))
    orders = {o["order_id"]: o for o in _in(sb, "orders", "order_id,order_date,shipping_mode,order_item_quantity,order_item_total,days_for_shipment_scheduled",
                                             "order_id", [c["order_id"] for c in cr])}
    names = {d["distributor_id"]: {"name": d["name"]} for d in _in(sb, "distributors", "distributor_id,name", "distributor_id", [c["distributor_id"] for c in cr])}
    prod = sb.table("products").select("name,unit_price").eq("product_id", inc["product_id"]).limit(1).execute().data
    wh = sb.table("warehouses").select("warehouse_id,name,market").eq("warehouse_id", inc["warehouse_id"]).limit(1).execute().data[0]
    olist = []
    for c in cr:
        o = orders.get(c["order_id"]) or {}
        od = str(o.get("order_date"))[:10]
        sched = o.get("days_for_shipment_scheduled")
        sched_arrival = (dt.date.fromisoformat(od) + dt.timedelta(days=int(sched))).isoformat() if od != "None" and sched is not None else str(c["projected_arrival"])[:10]
        olist.append({"order_id": c["order_id"], "distributor_id": c["distributor_id"], "units_short": int(c["units_short"] or 0),
                      "projected_arrival": str(c["projected_arrival"])[:10], "scheduled_arrival": sched_arrival,
                      "predicted_delay_days": c["predicted_delay_days"], "quantity": o.get("order_item_quantity"),
                      "order_date": od if od != "None" else str(risk["as_of_date"])[:10], "shipping_mode": o.get("shipping_mode"),
                      "order_total": float(o.get("order_item_total") or 0)})
    olist.sort(key=lambda o: (o["projected_arrival"], o["order_id"]))
    ctx = {"incident_id": inc["incident_id"], "as_of": str(risk["as_of_date"])[:10], "severity": inc["severity"], "status": inc["status"],
           "product": {"id": inc["product_id"], "name": prod[0]["name"] if prod else str(inc["product_id"]),
                       "unit_price": prod[0].get("unit_price") if prod else None},
           "warehouse": wh, "risk": risk, "orders": olist, "distributors": names,
           "modes": sorted({o["shipping_mode"] for o in olist if o["shipping_mode"]})}
    return {"ctx": ctx}


def n_investigate(s):
    c = s["ctx"]
    end = c["as_of"]                                           # nothing after the simulated date is known
    first = min((o["order_date"] for o in c["orders"]), default=end)
    start = (dt.date.fromisoformat(first) - dt.timedelta(days=3)).isoformat()
    market = c["warehouse"]["market"]
    w = tools.get_weather(market, start, end, c["as_of"])
    severe = [i for i in w if i.get("_severe")]
    for i in w:
        i.pop("_severe", None)
    news = tools.search_news(market, start, end, c["as_of"])
    data = tools.delay_evidence(tools.get_delay_stats(c["warehouse"]["warehouse_id"], c["as_of"], c["modes"] or None), c["as_of"])
    evidence = w + news + data
    modes = ", ".join(c["modes"]) or "the shipping modes involved"
    if severe:
        cause, conf = f"Severe weather near the {market} hubs in the days before the shipments", 0.5
    elif news:
        cause, conf = "Possible regional disruption reported in the news (a coincidence in time, not an established cause)", 0.3
    else:
        cause, conf = f"No external evidence found; the delay is consistent with the usual lateness of {modes}", 0.2
    
    if any(str(i.get("source", "")).startswith("SIMULATED") for i in evidence):
        cause += " (this is a simulated event in the demo data)"
    return {"evidence": evidence, "cause": cause, "confidence": conf}


def n_options(s):
    c = s["ctx"]
    donors = find_donors(data_client(), c["as_of"], c["product"]["id"], c["warehouse"]["warehouse_id"])
    opts, notes = build_options(c, donors)
    ev = list(s["evidence"]) + [{"type": "data", "source": "RunOut policy documents (RO-OPS-002, RO-OPS-004, RO-OPS-005)", "summary": n,
                                 "url": None, "timestamp": f"{c['as_of']}T00:00:00Z"} for n in notes]
    return {"option_list": opts, "evidence": ev}


def n_recommend(s):
    """The LLM may re-pick among the generated options; the deterministic default stands if it fails or invents an id."""
    c, opts, usage = s["ctx"], s["option_list"], s["usage"]
    if s.get("use_llm"):
        try:
            clean = [{k: v for k, v in o.items() if k not in ("recommended", "rationale")} for o in opts]
            j = llm.chat_json([{"role": "system", "content": "You help an operations manager. Choose exactly ONE option_id from the list for this "
                                "stock-shortage incident. Follow these rules: use notify_only when the gap is 2 days or less and money at risk is under 100 "
                                "dollars; otherwise prefer the lowest cost_per_unit_covered among options covering at least 80% of units short; if none do, "
                                "pick the best partial one. Return JSON: {\"option_id\": \"...\", \"reason\": \"one sentence under 25 words, plain words only (never write codes like notify_only), no new numbers\"}."},
                               {"role": "user", "content": json.dumps({"units_short": c["risk"]["units_short"], "gap_days": c["risk"]["gap_days"],
                                                                      "money_at_risk_usd": c["risk"]["money_at_risk_usd"], "options": clean})}], usage)
            if j.get("option_id") in [o["option_id"] for o in opts]:
                for o in opts:
                    o["recommended"] = o["option_id"] == j["option_id"]
                    if o["recommended"] and j.get("reason"):
                        o["rationale"] = str(j["reason"])[:240]
        except Exception as e:
            print(f"    (recommend step kept the default: {str(e)[:80]})")
    return {"option_list": opts}


def n_write(s):
    opts = s["option_list"]
    rec = next(o for o in opts if o["recommended"])
    facts = briefings.build_facts(s["ctx"], opts, rec, s["cause"], s["confidence"])
    drafts = {}
    if s.get("use_llm"):
        try:
            drafts = briefings.draft_sentences(facts[0], s["usage"])
        except Exception as e:
            print(f"    (wording step failed, using fallback sentences: {str(e)[:80]})")
    return {"facts": facts, "drafts": drafts}


def n_validate(s):
    texts, flags = briefings.finalize(s["facts"], s["drafts"], s["usage"], bool(s.get("use_llm")))
    if flags["problems"]:
        print("    validation:", json.dumps(flags["problems"])[:600])
    return {"texts": texts, "flags": flags}


def n_persist(s):
    t = s["texts"]
    data_client().table("incidents").update({
        "probable_cause": s["cause"], "cause_confidence": round(s["confidence"], 2), "evidence": s["evidence"],
        "recommended_options": s["option_list"], "briefing_text_ops": t["ops"], "briefing_text_warehouse": t["warehouse"],
        "briefing_text_distributor": json.dumps(t["distributors"]),
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}).eq("incident_id", s["incident_id"]).execute()    # never touches status
    return {}


def build_graph():
    from langgraph.graph import StateGraph, START, END
    g = StateGraph(State)
    steps = [("load_context", n_load), ("investigate", n_investigate), ("build_options", n_options), ("recommend", n_recommend),
             ("write_briefings", n_write), ("validate", n_validate), ("persist", n_persist)]
    for name, fn in steps:
        g.add_node(name, tracing.observe(name=name)(fn))
    g.add_edge(START, steps[0][0])
    for (a, _), (b, _) in zip(steps, steps[1:]):
        g.add_edge(a, b)
    g.add_edge(steps[-1][0], END)
    return g.compile()


_GRAPH = None

@tracing.observe(name="investigate_incident")
def investigate_incident(incident_id: int, as_of=None):
    """Run the graph for one incident and record an agent_runs row. Returns a short result dict."""
    global _GRAPH
    _GRAPH = _GRAPH or build_graph()
    sb = data_client()
    t0 = time.time()
    usage, status, err, flags = {}, "ok", None, {}
    try:
        out = _GRAPH.invoke({"incident_id": incident_id, "usage": usage, "use_llm": llm.available()})
        flags = out.get("flags", {})
    except Exception as e:
        status, err = "error", f"{type(e).__name__}: {str(e)[:300]}"
    try:
        sb.table("agent_runs").insert({"incident_id": incident_id, "as_of_date": as_of, "status": status,
                                       "ended_at": dt.datetime.now(dt.timezone.utc).isoformat(), "duration_s": round(time.time() - t0, 1),
                                       "llm_calls": usage.get("calls", 0), "prompt_tokens": usage.get("prompt_tokens", 0),
                                       "completion_tokens": usage.get("completion_tokens", 0),
                                       "validation_failed": flags.get("validation_failed", False),
                                       "fallback_used": flags.get("fallback_used", False), "error": err}).execute()
    except Exception as e:
        print(f"    (agent_runs write skipped: {str(e)[:80]})")
    return {"incident_id": incident_id, "status": status, "error": err, "usage": usage, "flags": {k: v for k, v in flags.items() if k != "problems"}}