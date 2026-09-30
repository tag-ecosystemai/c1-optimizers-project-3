"""
RunOut — Cascade / Impact Engine (Layer 4)
Location: cascade/impact.py

M1 answers "how many days late will this route be?" — a number that means
nothing on its own. The cascade turns that into the question the business
actually asks: does the delay cause a STOCKOUT, and how much MONEY is exposed?

Pure arithmetic — no external data, no model needed to run:

    days_of_cover     = stock_on_hand / daily_usage_rate
    stockout_date     = inventory.as_of_date + days_of_cover
    projected_arrival = planned_arrival + delay_days
    if projected_arrival > stockout_date:
        gap_days      = projected_arrival - stockout_date
        units_short   = gap_days * daily_usage_rate
        money_at_risk = units_short * unit_margin_usd

delay_days comes from the `predictions` table (written by
ml/build_port_features.py and ml/generate_delay_label.py). Until the model is trained, pass
--assumed-delay-days to exercise the pipeline with a stub value.

Two inputs meet here: M1 sets the TIMING (when goods arrive), M2 sets the
MAGNITUDE (how fast stock burns, via inventory.daily_usage_rate).

Writes rows to `cascade_results` (idempotent per shipment+as_of_date).

Usage (from repo root):
    python cascade/impact.py                         # use predictions
    python cascade/impact.py --assumed-delay-days 60
    python cascade/impact.py --live-only --refresh --top 10
"""

import os
import sys
import argparse
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ingestion"))
from common.client import get_client  # noqa: E402

DEFAULT_USAGE = 500.0        # mirrors db/seed_inventory.py fallback
DEFAULT_MARGIN_USD = 5.0     # used when products.unit_margin_usd is NULL
RISK_BANDS = ((10_000, "LOW"), (50_000, "MEDIUM"), (float("inf"), "HIGH"))


def band(money):
    for ceiling, label in RISK_BANDS:
        if money < ceiling:
            return label
    return "HIGH"


def _as_date(v):
    return date.fromisoformat(v) if isinstance(v, str) else v


def load_predictions(sb):
    """shipment_id -> predicted_delay_days (newest as_of_date wins)."""
    out = {}
    for r in sb.table("predictions").select(
        "shipment_id,predicted_delay_days,as_of_date"
    ).execute().data or []:
        sid = r.get("shipment_id")
        if sid is None:
            continue
        cur = out.get(sid)
        if cur is None or (r.get("as_of_date") or "") >= (cur.get("as_of_date") or ""):
            out[sid] = r
    return {sid: r["predicted_delay_days"] for sid, r in out.items()}


def load_inventory(sb):
    """(product_id, depot_id) -> inventory row."""
    out = {}
    for r in sb.table("inventory").select(
        "product_id,depot_id,stock_on_hand,daily_usage_rate,as_of_date"
    ).execute().data or []:
        out[(r.get("product_id"), r.get("depot_id"))] = r
    return out


def load_margins(sb):
    return {p["product_id"]: p.get("unit_margin_usd")
            for p in sb.table("products").select(
                "product_id,unit_margin_usd").execute().data or []}


def compute(planned_arrival, inv_row, margin, delay_days, default_margin):
    """Return {days_of_cover, stockout_date, units_short, money_at_risk} or None."""
    planned = _as_date(planned_arrival)
    if not planned:
        return None

    usage = float(inv_row.get("daily_usage_rate") or DEFAULT_USAGE) or DEFAULT_USAGE
    stock = float(inv_row.get("stock_on_hand") or 0)
    inv_date = _as_date(inv_row.get("as_of_date")) or date.today()

    days_of_cover = stock / usage
    stockout = inv_date + timedelta(days=days_of_cover)
    arrival = planned + timedelta(days=delay_days)

    if arrival <= stockout:
        return {"days_of_cover": round(days_of_cover, 2),
                "stockout_date": stockout, "units_short": 0, "money_at_risk": 0.0}

    gap_days = (arrival - stockout).days
    units_short = int(round(gap_days * usage))
    m = float(margin) if margin is not None else float(default_margin)
    return {"days_of_cover": round(days_of_cover, 2), "stockout_date": stockout,
            "units_short": units_short, "money_at_risk": round(units_short * m, 2)}


def run(assumed_delay, live_only, refresh, top, default_margin):
    sb = get_client()
    ref = date.today()

    q = sb.table("shipments").select(
        "shipment_id,product_id,depot_id,planned_arrival,status")
    if live_only:
        q = q.in_("status", ["in_transit", "delayed", "at_risk"])
    shipments = q.execute().data or []

    preds, inv, margins = load_predictions(sb), load_inventory(sb), load_margins(sb)

    if refresh:
        sb.table("cascade_results").delete().eq(
            "as_of_date", ref.isoformat()).execute()
        existing = set()
    else:
        existing = {r["shipment_id"] for r in sb.table("cascade_results")
                    .select("shipment_id").eq("as_of_date", ref.isoformat())
                    .execute().data or []}

    results, written, skipped = [], 0, 0
    for s in shipments:
        inv_row = inv.get((s.get("product_id"), s.get("depot_id")))
        if not inv_row:
            continue  # nothing in stock for this product/depot -> nothing to cascade

        delay_days = preds.get(s["shipment_id"])
        if delay_days is None:
            delay_days = assumed_delay
            source = "assumed"
        else:
            source = "prediction"

        c = compute(s.get("planned_arrival"), inv_row,
                    margins.get(s.get("product_id")), delay_days, default_margin)
        if c is None:
            continue

        results.append({"shipment_id": s["shipment_id"], "delay_days": delay_days,
                        "source": source, **c})

        if s["shipment_id"] in existing:
            skipped += 1
            continue
        sb.table("cascade_results").insert({
            "shipment_id": s["shipment_id"],
            "days_of_cover": c["days_of_cover"],
            "stockout_date": c["stockout_date"].isoformat(),
            "units_short": c["units_short"],
            "money_at_risk_usd": c["money_at_risk"],
            "as_of_date": ref.isoformat(),
        }).execute()
        written += 1

    results.sort(key=lambda r: r["money_at_risk"], reverse=True)
    total = sum(r["money_at_risk"] for r in results)
    flagged = sum(1 for r in results if r["money_at_risk"] > 0)

    print(f"Cascade @ {ref} — candidates: {len(results)}, flagged: {flagged}, "
          f"written: {written}, skipped: {skipped}")
    print(f"Total money at risk: ${total:,.0f}\n")
    print(f"Top {top} exposures:")
    print(f"  {'ship':>6}  {'delay_d':>7}  {'cover_d':>7}  {'stockout':>10}  "
          f"{'units':>9}  {'$ at risk':>12}  band")
    for r in results[:top]:
        print(f"  {r['shipment_id']:>6}  {r['delay_days']:>7}  {r['days_of_cover']:>7}  "
              f"{r['stockout_date'].isoformat():>10}  {r['units_short']:>9,}  "
              f"{r['money_at_risk']:>12,.0f}  {band(r['money_at_risk'])}")

    print("\nCAVEATS: inventory values are ASSUMED (db/seed_inventory.py); product "
          f"margins default to ${default_margin:,.0f} where unset.")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--assumed-delay-days", type=float, default=0.0,
                   help="Fallback delay when a shipment has no prediction")
    p.add_argument("--live-only", action="store_true",
                   help="Only in-flight shipments (default: all with inventory)")
    p.add_argument("--refresh", action="store_true",
                   help="Delete today's cascade_results rows first")
    p.add_argument("--default-margin-usd", type=float, default=DEFAULT_MARGIN_USD)
    p.add_argument("--top", type=int, default=10)
    a = p.parse_args()
    run(a.assumed_delay_days, a.live_only, a.refresh, a.top, a.default_margin_usd)
