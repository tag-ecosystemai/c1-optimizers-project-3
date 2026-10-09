"""
RunOut v2 — Oracle check: how good is M1 for the thing that matters (the cascade)?
Location: cascade/oracle_check.py

The cascade is what the business sees, so M1 should be judged by how well the INCIDENTS it
produces match the incidents that real delays would have produced.

It runs cascade/impact.py (as a separate process, so impact.py is not modified) several times
for the same simulated date:
    1. ORACLE : delays are the real ones (days_for_shipping_real - days_for_shipment_scheduled).
                Only possible in a simulation; it is the "perfect foresight" answer key.
    2. STUBS  : a flat assumed delay (default 5 days), what we used before M1 existed.
    3. M1     : the champion model's predictions (the final state left in the database).
and compares each with the oracle: which products-at-warehouses run short (precision, recall,
F1), how severity agrees, and how close the money at risk is.

The oracle run writes temporary rows to `predictions` under model_version 'oracle-actual'.
M1 is run LAST, so the database ends in the M1 state (stock_risks, cascade_results, incidents).

Usage
    python cascade/oracle_check.py --m1-version m1-xgboost-xgboost-20261010
    python cascade/oracle_check.py --m1-version <v> --stub-days 3 5 7 --impact-args "--demand-cap 2"
"""

import os
import sys
import shlex
import argparse
import subprocess
from datetime import date, timedelta

import pandas as pd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
from cascade.db_utils import fetch_all, chunked, default_as_of, parse_date  # noqa: E402

ORACLE_VERSION = "oracle-actual"
EXCLUDED_STATUSES = {"CANCELED", "SUSPECTED_FRAUD"}


def compare(oracle, other):
    """oracle / other: DataFrames of stock_risks (warehouse_id, product_id, units_short,
    money_at_risk_usd, severity). Returns a dict of agreement metrics."""
    key = ["warehouse_id", "product_id"]
    o = oracle[key + ["units_short", "money_at_risk_usd", "severity"]].copy()
    p = other[key + ["units_short", "money_at_risk_usd", "severity"]].copy()
    m = o.merge(p, on=key, how="outer", suffixes=("_o", "_p")).fillna(
        {"units_short_o": 0, "units_short_p": 0, "money_at_risk_usd_o": 0.0,
         "money_at_risk_usd_p": 0.0, "severity_o": "NONE", "severity_p": "NONE"})
    so, sp = m["units_short_o"] > 0, m["units_short_p"] > 0
    tp, fp, fn = int((so & sp).sum()), int((~so & sp).sum()), int((so & ~sp).sum())
    precision = tp / (tp + fp) if tp + fp else float("nan")
    recall = tp / (tp + fn) if tp + fn else float("nan")
    f1 = 2 * precision * recall / (precision + recall) if tp and precision == precision and recall == recall else (0.0 if tp + fp + fn else float("nan"))
    either = so | sp
    return {
        "oracle_incidents": int(so.sum()), "predicted_incidents": int(sp.sum()),
        "tp": tp, "fp": fp, "fn": fn,
        "precision": precision, "recall": recall, "f1": f1,
        "severity_agreement": float((m.loc[either, "severity_o"] == m.loc[either, "severity_p"]).mean()) if either.any() else float("nan"),
        "money_oracle": float(m["money_at_risk_usd_o"].sum()), "money_predicted": float(m["money_at_risk_usd_p"].sum()),
        "money_mae_per_risk": float((m["money_at_risk_usd_o"] - m["money_at_risk_usd_p"]).abs()[either].mean()) if either.any() else float("nan"),
        "table": m,
    }


def read_risks(sb, as_of):
    rows = fetch_all(sb, "stock_risks",
                     "risk_id,warehouse_id,product_id,units_short,money_at_risk_usd,severity",
                     "risk_id", apply=lambda q: q.eq("as_of_date", as_of.isoformat()))
    df = pd.DataFrame(rows, columns=["risk_id", "warehouse_id", "product_id", "units_short",
                                     "money_at_risk_usd", "severity"])
    for c in ("units_short", "money_at_risk_usd"):
        df[c] = pd.to_numeric(df[c])
    return df


def write_oracle_predictions(sb, as_of, window_days):
    lo = as_of - timedelta(days=window_days)
    orders = fetch_all(
        sb, "orders",
        "order_id,order_date,days_for_shipping_real,days_for_shipment_scheduled,order_status", "order_id",
        apply=lambda q: q.gte("order_date", lo.isoformat()).lte("order_date", as_of.isoformat()))
    rows = []
    for o in orders:
        real, sched = o.get("days_for_shipping_real"), o.get("days_for_shipment_scheduled")
        if o.get("order_status") in EXCLUDED_STATUSES or real is None or sched is None:
            continue
        d = real - sched
        rows.append({"order_id": o["order_id"], "model_version": ORACLE_VERSION,
                     "predicted_delay_days": float(d), "delay_risk_score": 1.0 if d > 0 else 0.0,
                     "shap_explanation": None, "as_of_date": str(o["order_date"])[:10]})
    sb.table("predictions").delete().eq("model_version", ORACLE_VERSION).execute()
    for chunk in chunked(rows, 500):
        sb.table("predictions").insert(chunk).execute()
    print(f"  wrote {len(rows):,} oracle predictions (real delays) for orders {lo} to {as_of}")


def run_impact(as_of, extra, extra_user):
    cmd = [sys.executable, os.path.join(ROOT, "cascade", "impact.py"), "--as-of", str(as_of)] + extra + extra_user
    res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout[-1500:], res.stderr[-1500:])
        raise SystemExit(f"impact.py failed for: {' '.join(extra)}")
    return res.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", type=date.fromisoformat, default=None)
    ap.add_argument("--m1-version", required=True, help="model_version of the M1 predictions to test")
    ap.add_argument("--stub-days", type=float, nargs="*", default=[5.0], help="flat delays to compare")
    ap.add_argument("--window-days", type=int, default=14)
    ap.add_argument("--impact-args", default="", help='extra flags passed to impact.py, e.g. "--demand-cap 2"')
    ap.add_argument("--mlflow", action="store_true")
    args = ap.parse_args()

    from ingestion.common.client import get_client
    sb = get_client()
    as_of = args.as_of or default_as_of(sb)
    extra_user = shlex.split(args.impact_args)
    print(f"Oracle check for simulated date {as_of}")

    print("\n[1/3] Oracle (real delays)")
    write_oracle_predictions(sb, as_of, args.window_days)
    run_impact(as_of, ["--model-version", ORACLE_VERSION, "--no-incidents"], extra_user)
    oracle = read_risks(sb, as_of)
    print(f"  oracle: {int((oracle['units_short'] > 0).sum())} products at warehouses run short, "
          f"${oracle['money_at_risk_usd'].sum():,.2f} at risk")

    results = {}
    print("\n[2/3] Flat stub delays")
    for d in args.stub_days:
        run_impact(as_of, ["--assumed-delay-days", str(d), "--no-incidents"], extra_user)
        results[f"stub_{d:g}_days"] = compare(oracle, read_risks(sb, as_of))

    print("\n[3/3] M1 (left as the final database state, incidents created or updated)")
    out = run_impact(as_of, ["--model-version", args.m1_version], extra_user)
    if "No predictions" in out:
        raise SystemExit(f"No predictions for model_version '{args.m1_version}' on this date. "
                         "Did score.py cover it (default start is 2017-09-01)?")
    results["m1"] = compare(oracle, read_risks(sb, as_of))

    print("\n" + "=" * 78)
    print(f"{'Scenario':<16}{'Incidents':>10}{'Precision':>11}{'Recall':>9}{'F1':>7}{'Severity ok':>13}{'$ at risk':>12}{'$ MAE/risk':>12}")
    print(f"{'oracle':<16}{results['m1']['oracle_incidents']:>10}{'':>11}{'':>9}{'':>7}{'':>13}{results['m1']['money_oracle']:>12,.0f}{'':>12}")
    for name, r in results.items():
        nan = lambda v, fmt: "n/a" if v != v else format(v, fmt)
        print(f"{name:<16}{r['predicted_incidents']:>10}{nan(r['precision'], '.2f'):>11}{nan(r['recall'], '.2f'):>9}"
              f"{nan(r['f1'], '.2f'):>7}{nan(r['severity_agreement'], '.2f'):>13}{r['money_predicted']:>12,.0f}"
              f"{nan(r['money_mae_per_risk'], '.1f'):>12}")
    print("=" * 78)
    m1, best_stub = results["m1"], max((v for k, v in results.items() if k != "m1"), key=lambda v: (v["f1"] if v["f1"] == v["f1"] else -1), default=None)
    if best_stub is not None and m1["f1"] == m1["f1"] and best_stub["f1"] == best_stub["f1"]:
        verdict = "BETTER than" if m1["f1"] > best_stub["f1"] else ("EQUAL to" if m1["f1"] == best_stub["f1"] else "WORSE than")
        print(f"M1 incident-detection F1 is {verdict} the best flat stub ({m1['f1']:.2f} vs {best_stub['f1']:.2f}).")

    if args.mlflow:
        import dagshub
        dagshub.init(repo_owner="RunOut", repo_name="runout-ml", mlflow=True)
        import mlflow
        mlflow.set_experiment("m1-vs-oracle-cascade")
        with mlflow.start_run(run_name=f"{args.m1_version}-{as_of}"):
            mlflow.log_params({"as_of": str(as_of), "m1_version": args.m1_version, "impact_args": args.impact_args})
            for name, r in results.items():
                mlflow.log_metrics({f"{name}_{k}": v for k, v in r.items()
                                    if isinstance(v, (int, float)) and v == v})
        print("Logged to DagsHub (experiment m1-vs-oracle-cascade).")


if __name__ == "__main__":
    main()