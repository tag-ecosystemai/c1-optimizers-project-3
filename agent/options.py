"""build_options: deterministic recovery options for one incident. Pure code, no LLM.
Rules come from RO-OPS-002 (choosing a response), RO-OPS-004 (transfers) and RO-OPS-005 (upgrades). All figures are
estimates under the documents' own assumptions (see agent/config/policy.py)."""
import math
import datetime as dt

from agent.config import policy as P


def _d(s):
    return dt.date.fromisoformat(str(s)[:10])


def find_donors(sb, as_of, product_id, receiving_wh):
    """Other warehouses that may give stock (RO-OPS-004 section 5): after giving, the donor keeps 14 days of cover at its own
    demand, and a donor with its own shortage for the product gives nothing. Only warehouses the cascade assessed for this
    product on this date are known (limitation)."""
    rows = (sb.table("stock_risks").select("warehouse_id,stock_on_hand,weekly_demand,units_short")
            .eq("as_of_date", as_of).eq("product_id", product_id).neq("warehouse_id", receiving_wh).execute().data)
    whs = {w["warehouse_id"]: w for w in sb.table("warehouses").select("warehouse_id,name,market").execute().data}
    out = []
    for r in rows:
        if int(r["units_short"] or 0) > 0:
            continue
        daily = float(r["weekly_demand"] or 0) / 7
        avail = int(math.floor(float(r["stock_on_hand"] or 0) - P.TRANSFER["donor_min_cover_days"] * daily))
        w = whs.get(r["warehouse_id"]) or {}
        if avail >= 1:
            out.append({"warehouse_id": r["warehouse_id"], "name": w.get("name"), "market": w.get("market"), "available": avail})
    return sorted(out, key=lambda x: -x["available"])


def _gap_band(eff_gap):
    if eff_gap <= 2:
        return {"priority_handling", "expedite"}
    if eff_gap <= 5:
        return {"expedite", "split_shipment", "priority_handling"}
    if eff_gap <= 10:
        return {"split_shipment", "expedite", "transfer"}
    return {"transfer"}


def build_options(ctx, donors):
    """Returns (options, notes). Exactly one option is marked recommended (the deterministic default; the LLM may
    re-pick among these, never add to them)."""
    r = ctx["risk"]
    as_of, stockout, first = _d(ctx["as_of"]), _d(r["stockout_date"]), _d(r["first_arrival"])
    short, gap0 = int(r["units_short"] or 0), int(r["gap_days"] or 0)
    daily = float(r["weekly_demand"] or 0) / 7
    money = float(r["money_at_risk_usd"] or 0)
    price = float(ctx["product"].get("unit_price") or 0)
    sev = ctx["severity"]
    peak = as_of.month in P.PEAK_MONTHS
    eff_gap = gap0 + 1 if (peak and gap0 == 2) else gap0          # RO-OPS-002 section 5: peak season rule
    notes = []
    if peak and gap0 == 2:
        notes.append("Peak season (October to December): a gap of 2 days is treated as 3 days (RO-OPS-002 section 5).")
    score = r.get("avg_delay_risk_score")
    if score is not None and float(score) < P.LOW_CONFIDENCE_SCORE and short < P.LOW_CONFIDENCE_UNITS:
        notes.append("Low-confidence incident: average delay risk score is under 0.40 and fewer than 50 units are short, "
                     "so it may be held to the next daily scoring run (RO-OPS-002 section 3).")

    orders = sorted(ctx["orders"], key=lambda o: (o["projected_arrival"], o["order_id"]))
    arr = {o["order_id"]: _d(o["projected_arrival"]) for o in orders}
    shipped = [o for o in orders if _d(o["order_date"]) < as_of]      # ASSUMPTION: placed before the as-of date = already shipped
    unshipped = [o for o in orders if _d(o["order_date"]) >= as_of]

    def closing(days_by):
        f = min(a - dt.timedelta(days=days_by.get(oid, 0)) for oid, a in arr.items())
        return f, max(0, (f - stockout).days)

    def best_prefix(elig, days_of):
        """Smallest set of earliest-arriving orders that closes the most gap."""
        best = None
        for k in range(1, len(elig) + 1):
            days_by = {o["order_id"]: days_of(o) for o in elig[:k]}
            f, g = closing(days_by)
            if gap0 - g > 0 and (best is None or gap0 - g > best[0]):
                best = (gap0 - g, k, f, g)
        return best

    def covered_units(reduction):
        return max(0, min(short, int(round(reduction * daily))))

    opts = [{"option_id": "opt_1", "type": "notify_only", "title": "Notify distributors and monitor",
             "description": "No action on the shipments. Affected distributors are told and the incident is re-checked at each daily scoring run.",
             "cost_usd": 0.0, "eta_days": 0, "units_covered": 0, "order_ids": [], "recommended": False}]

    # carrier priority handling: shipped orders, gap 3 days or less (RO-OPS-005 section 6)
    if shipped and eff_gap <= P.PRIORITY["max_gap_days"]:
        b = best_prefix(shipped, lambda o: P.PRIORITY["days_recovered"])
        if b and covered_units(b[0]) > 0:
            S = shipped[:b[1]]
            opts.append({"type": "priority_handling", "title": f"Carrier priority handling for {len(S)} order(s)",
                         "description": f"Asks the carrier to prioritise the {len(S)} earliest order(s); assumed to recover up to {P.PRIORITY['days_recovered']} day.",
                         "cost_usd": round(P.PRIORITY["cost_share"] * sum(float(o.get("order_total") or 0) for o in S), 2),
                         "eta_days": (b[2] - as_of).days, "units_covered": covered_units(b[0]),
                         "order_ids": [o["order_id"] for o in S], "recommended": False})

    # expedite: orders not yet shipped, cheapest permitted upgrade (RO-OPS-005 sections 3 to 5)
    def upgrade(o):
        c = [(to, share) for (frm, to), share in P.UPGRADE_COST_SHARE.items() if frm == o.get("shipping_mode")]
        if not c:
            return None
        to, share = min(c, key=lambda x: x[1])
        return to, share, int(P.UPGRADE_DAYS_SAVED[(o["shipping_mode"], to)])

    elig_u = [o for o in unshipped if upgrade(o) and upgrade(o)[2] >= 1]
    if elig_u:
        b = best_prefix(elig_u, lambda o: upgrade(o)[2])
        if b and covered_units(b[0]) > 0:
            S = elig_u[:b[1]]
            cost = sum(upgrade(o)[1] * float(o.get("order_total") or 0) for o in S)
            kinds = sorted({f"{o['shipping_mode']} to {upgrade(o)[0]}" for o in S})
            opts.append({"type": "expedite", "title": f"Expedite {len(S)} order(s) by upgrading shipping mode",
                         "description": f"Upgrades {', '.join(kinds)}; cost is a share of the order totals (RO-OPS-005).",
                         "cost_usd": round(cost, 2), "eta_days": (b[2] - as_of).days, "units_covered": covered_units(b[0]),
                         "order_ids": [o["order_id"] for o in S], "recommended": False})

    # split shipment: only the units needed travel faster (RO-OPS-005 section 7)
    if unshipped:
        b = best_prefix(unshipped, lambda o: P.SPLIT["days_recovered"])
        if b:
            moved = min(covered_units(b[0]), sum(int(o.get("quantity") or 0) for o in unshipped))
            if moved > 0:
                opts.append({"type": "split_shipment", "title": f"Split shipment: send {moved} units by a faster mode",
                             "description": "Only the urgent units travel faster; the rest follow the original plan.",
                             "cost_usd": round(P.SPLIT["cost_share"] * moved * price, 2), "eta_days": (b[2] - as_of).days,
                             "units_covered": moved, "order_ids": [o["order_id"] for o in unshipped], "recommended": False})

    # transfers (RO-OPS-004): must arrive at least 1 day before the delayed shipment
    T = P.TRANSFER
    latest = first - dt.timedelta(days=T["arrive_before_days"])
    recv = ctx["warehouse"]["market"]
    for kind in (["standard", "air"] if sev == "HIGH" else ["standard"]):
        for d in donors:
            lead = T["air_days"] if kind == "air" else P.TRANSFER_DAYS.get(frozenset((recv, d.get("market"))))
            qty = min(d["available"], int(math.ceil(short * (1 + T["request_buffer"]))))
            if not lead or qty < 1 or as_of + dt.timedelta(days=lead) > latest:
                continue
            value = qty * price
            cost = (T["air_flat"] + T["air_share"] * value) if kind == "air" else (T["standard_flat"] + T["standard_share"] * value)
            opts.append({"type": "transfer", "title": f"{'Priority air' if kind == 'air' else 'Standard'} transfer of {qty} units from {d['name']}",
                         "description": f"Donor keeps at least {T['donor_min_cover_days']} days of cover. Request is units short plus a {int(T['request_buffer'] * 100)}% buffer.",
                         "cost_usd": round(cost, 2), "eta_days": lead, "units_covered": min(short, qty), "order_ids": [],
                         "recommended": False})
            break

    for i, o in enumerate(opts, 1):
        o["option_id"] = f"opt_{i}"
        o["cost_per_unit_covered"] = round(o["cost_usd"] / o["units_covered"], 2) if o["units_covered"] else None
        o["cost_exceeds_money_at_risk"] = o["cost_usd"] > money and o["type"] != "notify_only"
    if sev == "HIGH" and eff_gap > 10:
        notes.append("Gap is over 10 days and severity is HIGH: escalate (RO-OPS-002 section 5).")

    # default recommendation (RO-OPS-002 sections 5 and 6)
    pick, why = opts[0], "the gap is small and the money at risk is under $100, so notifying is enough (RO-OPS-002)"
    if not (eff_gap <= 2 and money < P.NOTIFY_ONLY_BELOW_USD):
        cands = [o for o in opts[1:] if o["units_covered"] > 0]
        pool = [o for o in cands if o["type"] in _gap_band(eff_gap)] or cands
        full = [o for o in pool if o["units_covered"] >= P.COVERAGE_TARGET * short]
        if full:
            pick = min(full, key=lambda o: (o["cost_per_unit_covered"], o["cost_usd"]))
            why = "it has the lowest cost per unit among options covering at least 80% of the units short (RO-OPS-002)"
        elif pool:
            pick = max(pool, key=lambda o: (o["units_covered"], -o["cost_usd"]))
            why = "no option covers 80% of the units short, so this is the best partial option and the incident may escalate (RO-OPS-002)"
            notes.append("No option covers 80% of units short; the incident is likely to escalate (RO-OPS-002 section 6).")
        else:
            why = "no recovery option closes the gap in time, so the incident is notified and monitored"
            notes.append("No recovery option closes the gap in time; consider escalation.")
    pick["recommended"] = True
    pick["rationale"] = why
    return opts, notes