"""Briefings per RO-COM-001 (ops), RO-COM-003 (warehouse) and RO-COM-002 (distributor), and the guardrail.
Code computes every number and date and assembles the standard formats. The LLM writes only two short sentences of the
ops briefing (the likely-cause wording and the reason for the recommendation). Everything is validated: numbers and dates
must exist in the structured facts, distributor text has no money terms or other customers' names, word limits hold."""
import re
import json
import datetime as dt

from agent import llm

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
_M = "|".join(MONTHS)
NAT1 = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_M})\b(?:,?\s+\d{{4}})?", re.I)
NAT2 = re.compile(rf"\b({_M})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b(?:,?\s+\d{{4}})?", re.I)
ISO_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
DOC_RE = re.compile(r"\bRO-[A-Z]+-\d+\b")
LIST_RE = re.compile(r"\(\d\)")
NUM_RE = re.compile(r"\d[\d,]*\.?\d*")
MONEY_RE = re.compile(r"\$|\busd\b|dollar|money|margin|profit|\bcosts?\b|price|revenue|expens", re.I)
LIMITS = {"ops": 200, "warehouse": 120, "distributor": 120, "sentence": 45}


def nd(iso):
    d = dt.date.fromisoformat(str(iso)[:10])
    return f"{d.day} {d.strftime('%B')}"


# ------------------------------------------------------------------ validation
def _collect(obj, nums, dates):
    if isinstance(obj, bool) or obj is None:
        return
    if isinstance(obj, (int, float)):
        nums.add(float(obj))
    elif isinstance(obj, str):
        dates.update(ISO_RE.findall(obj))
        for t in NUM_RE.findall(DOC_RE.sub(" ", ISO_RE.sub(" ", obj))):
            try:
                nums.add(float(t.replace(",", "").rstrip(".")))
            except ValueError:
                pass
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect(v, nums, dates)
    elif isinstance(obj, list):
        for v in obj:
            _collect(v, nums, dates)


def validate_text(text, facts, kind, forbidden_names=()):
    """Returns a list of problems (empty means the text passes)."""
    nums, dates = set(), set()
    _collect(facts, nums, dates)
    md = {(int(d[5:7]), int(d[8:10])) for d in dates}
    problems = []
    words = len(text.split())
    if words > LIMITS[kind]:
        problems.append(f"{words} words, limit is {LIMITS[kind]}")
    t = ISO_RE.sub(lambda m: m.group(0) if m.group(0) in dates else "<BADDATE>", text)
    if "<BADDATE>" in t:
        problems.append("an ISO date is not in the facts")
    bad_dates = []
    for rx, di, mi in ((NAT1, 1, 2), (NAT2, 2, 1)):
        for m in rx.finditer(t):
            if (MONTHS.index(m.group(mi).lower()) + 1, int(m.group(di))) not in md:
                bad_dates.append(m.group(0))
        t = rx.sub(" ", t)
    if bad_dates:
        problems.append(f"dates not in facts: {bad_dates}")
    t = LIST_RE.sub(" ", DOC_RE.sub(" ", ISO_RE.sub(" ", t)))
    bad = []
    for tok in NUM_RE.findall(t):
        try:
            v = float(tok.replace(",", "").rstrip("."))
        except ValueError:
            continue
        if not any(abs(v - a) < 0.011 or (a != int(a) and v == round(a)) for a in nums):
            bad.append(tok)
    if bad:
        problems.append(f"numbers not in facts: {bad}")
    if kind == "distributor":
        if MONEY_RE.search(text):
            problems.append("contains money terms")
        for n in forbidden_names:
            if n and n.lower() in text.lower():
                problems.append("names another distributor")
    return problems


# ------------------------------------------------------------------ facts
def _whole(x):
    return max(0, int(round(float(x or 0))))


def build_facts(ctx, opts, rec, cause, conf):
    r, wh = ctx["risk"], ctx["warehouse"]
    orders = ctx["orders"]
    ops = {
        "incident_id": ctx["incident_id"], "severity": ctx["severity"], "product_name": ctx["product"]["name"],
        "warehouse_name": wh["name"], "market": wh["market"], "orders_affected": len(orders),
        "distributors_affected": len(ctx["distributors"]),
        "max_predicted_delay_days": max((_whole(o["predicted_delay_days"]) for o in orders), default=0),
        "first_arrival": str(r["first_arrival"])[:10], "stockout_date": str(r["stockout_date"])[:10],
        "days_of_cover": round(float(r["days_of_cover"] or 0), 1), "units_short": int(r["units_short"] or 0),
        "money_at_risk_usd": round(float(r["money_at_risk_usd"] or 0), 2),
        "probable_cause": cause, "cause_confidence_pct": int(round(conf * 100)),
        "options": [{"number": i, "type": o["type"], "title": o["title"], "cost_usd": o["cost_usd"],
                     "eta_days": o["eta_days"], "units_covered": o["units_covered"]} for i, o in enumerate(opts, 1)],
        "recommended_number": next(i for i, o in enumerate(opts, 1) if o["recommended"]),
        "recommended_reason": rec.get("rationale", ""),
    }
    names = sorted(d["name"] for d in ctx["distributors"].values())
    status = ctx.get("status", "open")
    wh_f = {
        "warehouse_name": wh["name"], "product_name": ctx["product"]["name"], "stock_on_hand": int(float(r["stock_on_hand"] or 0)),
        "days_of_cover": ops["days_of_cover"], "stockout_date": ops["stockout_date"], "incoming_orders": len(orders),
        "first_arrival": ops["first_arrival"], "units_short": ops["units_short"], "affected_distributors": names,
        "status": status, "requested_action": "Please acknowledge. Operations is reviewing the options.",
    }
    dist = {}
    for did, d in ctx["distributors"].items():
        mine = sorted((o for o in orders if o["distributor_id"] == did), key=lambda o: (o["projected_arrival"], o["order_id"]))
        if not mine:
            continue
        e = mine[0]
        own = sum(int(o["units_short"] or 0) for o in mine)
        dist[str(did)] = {
            "variant": "A" if own > 0 else "B", "distributor_name": d["name"], "product_name": ctx["product"]["name"],
            "orders_affected": len(mine), "order_ids": [o["order_id"] for o in mine],
            "scheduled_arrival": e["scheduled_arrival"], "projected_arrival": e["projected_arrival"],
            "predicted_delay_days": _whole(e["predicted_delay_days"]), "days_of_cover": ops["days_of_cover"],
            "stockout_date": ops["stockout_date"], "units_short": own}
    return ops, wh_f, dist


# ------------------------------------------------------------------ the standard formats
# ------------------------------------------------------------------ the standard formats
def u(n):
    return f"{int(n)} unit" if int(n) == 1 else f"{int(n)} units"


def _sentence(t):
    t = (t or "").strip()
    t = t[:1].upper() + t[1:]
    return t if t.endswith((".", "!", "?")) else t + "."


def ops_text(f, cause_s, reason_s):
    pick = f["options"][f["recommended_number"] - 1]
    lines = [f"({o['number']}) {o['title']}: ${o['cost_usd']:,.2f}, covers {u(o['units_covered'])}" for o in f["options"][:4]]
    reason = (reason_s or "").strip().rstrip(".")
    return (f"**Decision needed:** Approve, dismiss or escalate incident {f['incident_id']} ({f['severity']}).\n\n"
            f"**Situation:** {f['orders_affected']} delayed {'order' if f['orders_affected'] == 1 else 'orders'} from {f['distributors_affected']} {'distributor' if f['distributors_affected'] == 1 else 'distributors'} for {f['product_name']} {'is' if f['orders_affected'] == 1 else 'are'} heading to "
            f"{f['warehouse_name']} ({f['market']}). The longest predicted delay is {f['max_predicted_delay_days']} days, and the first order is projected "
            f"to arrive on {nd(f['first_arrival'])}.\n\n"
            f"**Impact:** {f['warehouse_name']} has {f['days_of_cover']} days of cover and is expected to run out on {nd(f['stockout_date'])}. "
            f"About {u(f['units_short'])} would be short, putting an estimated ${f['money_at_risk_usd']:,.2f} of margin at risk.\n\n"
            f"**Likely cause:** {_sentence(cause_s)}\n\n**Options:** " + "; ".join(lines) + ".\n\n"
            f"**Recommendation:** Option {pick['number']}, because {reason}.")


def warehouse_text(f):
    return (f"**{f['warehouse_name']}: {f['product_name']} projected to run out on {nd(f['stockout_date'])}.**\n"
            f"Stock on hand is {u(f['stock_on_hand'])}, about {f['days_of_cover']} days of cover. {f['incoming_orders']} delayed orders are in "
            f"transit, and the earliest is projected to arrive on {nd(f['first_arrival'])}. About {u(f['units_short'])} could be short. "
            f"Affected distributors: {', '.join(f['affected_distributors'])}. Incident status: {f['status']}. Requested action: {f['requested_action']}")


def distributor_text(f):
    ids = ", ".join(str(i) for i in f["order_ids"])
    n, p, nm = f["orders_affected"], f["product_name"], f["distributor_name"]
    v = "is" if n == 1 else "are"
    if f["predicted_delay_days"] > 0:
        head = (f"Hello {nm}, {n} of your orders for {p} {v} now expected to arrive later than planned. The earliest is expected around "
                f"{nd(f['projected_arrival'])}, about {f['predicted_delay_days']} days later than the {nd(f['scheduled_arrival'])} we planned.")
    else:
        head = f"Hello {nm}, {n} of your orders for {p} {v} expected to arrive around {nd(f['projected_arrival'])}, as planned."
    if f["variant"] == "A":
        return (f"{head} Stock of this product at your warehouse is expected to last about {f['days_of_cover']} days, until around "
                f"{nd(f['stockout_date'])}, so you could be short by roughly {u(f['units_short'])} for a short time. We are reviewing options to "
                f"reduce the gap and will update you when a decision is made. If some units are more urgent than others, please tell your RunOut "
                f"contact. Orders: {ids}.")
    return (f"{head} Based on current estimates your own orders are not expected to be short, but stock of this product at your warehouse is "
            f"tight, so we are monitoring it. We will update you if anything changes. Orders: {ids}.")

# ------------------------------------------------------------------ LLM wording (two sentences only)
SYS = ("You help write an operations briefing for RunOut, a supply-chain company. Use ONLY facts in the JSON; never invent numbers, dates, "
       "causes or actions. Return JSON with two keys. \"cause\": one sentence under 30 words describing the probable cause, with its confidence "
       "as a percentage; if the cause is only a coincidence in time or no evidence was found, say so plainly. \"reason\": one sentence under 30 "
       "words, starting with a lowercase word, giving the single main reason for the recommended option (the one numbered recommended_number). "
       "Write dates as day then month name, for example 26 September. Do not use any number that is not in the facts. Write in plain words: never use option type codes such as notify_only or priority_handling.")


def draft_sentences(ops_f, usage, problems=None):
    fix = f"\nYour previous answer had these problems, fix them: {json.dumps(problems)}" if problems else ""
    j = llm.chat_json([{"role": "system", "content": SYS}, {"role": "user", "content": json.dumps(ops_f) + fix}], usage)
    return {"cause": str(j.get("cause", "")).strip(), "reason": str(j.get("reason", "")).strip()}


def fallback_sentences(ops_f):
    return {"cause": f"{ops_f['probable_cause']} (confidence {ops_f['cause_confidence_pct']}%).",
            "reason": (ops_f["recommended_reason"] or "it is the best available option.").rstrip(".") + "."}


def finalize(facts, drafts, usage, use_llm):
    """Validate; regenerate failed LLM sentences once; fall back to deterministic wording. Returns (texts, flags)."""
    ops_f, wh_f, dist_f = facts
    flags = {"validation_failed": False, "fallback_used": False, "problems": []}
    fb = fallback_sentences(ops_f)
    cur = dict(drafts or {})

    def bad(d):
        out = {}
        for k in ("cause", "reason"):
            p = validate_text(d.get(k, ""), ops_f, "sentence") if d.get(k) else ["empty"]
            if p:
                out[k] = p
        return out

    problems = bad(cur) if use_llm and drafts else {"cause": ["no llm"], "reason": ["no llm"]}
    if use_llm and drafts and problems:
        flags["validation_failed"] = True
        flags["problems"].append(problems)
        try:
            again = draft_sentences(ops_f, usage, problems)
            cur.update({k: v for k, v in again.items() if k in problems})
            problems = bad(cur)
        except Exception:
            pass
    for k in problems:
        cur[k] = fb[k]
        flags["fallback_used"] = True
    texts = {"ops": ops_text(ops_f, cur["cause"], cur["reason"]), "warehouse": warehouse_text(wh_f), "distributors": {}}
    names = {k: v["distributor_name"] for k, v in dist_f.items()}
    template_problems = []
    p = validate_text(texts["ops"], ops_f, "ops")
    if p:
        template_problems.append({"ops": p})
    p = validate_text(texts["warehouse"], wh_f, "warehouse")
    if p:
        template_problems.append({"warehouse": p})
    for did, f in dist_f.items():
        t = distributor_text(f)
        p = validate_text(t, f, "distributor", [n for k, n in names.items() if k != did])
        if p:
            template_problems.append({f"distributor {did}": p})
        texts["distributors"][did] = t
    if template_problems:
        flags["validation_failed"] = True
        flags["problems"].append(template_problems)
    return texts, flags