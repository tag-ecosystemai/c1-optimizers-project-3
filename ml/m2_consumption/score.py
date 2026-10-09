"""
RunOut v2 — M2 Scoring (distributor weekly usage forecast)
Location: ml/m2_consumption/score.py

Scores the latest complete week for each (distributor, product) and writes the
PREDICTED next-week order quantity to `distributor_usage_forecast`.
The cascade reads this table instead of the real future value
(`label_next_week_qty`), which would be cheating.

Point-in-time: only weeks that were complete on the as-of date are used.

Usage:
    python ml/m2_consumption/score.py --baseline                       # no model: 4-week average
    python ml/m2_consumption/score.py                                  # uses artifacts/model_by_distributor.pkl from train.py
    python ml/m2_consumption/score.py --model-path path/to/other.pkl
    python ml/m2_consumption/score.py --model-uri "models:/runout-m2/champion"
    python ml/m2_consumption/score.py --as-of 2018-01-20 --baseline

The feature list, null handling and model file match ml/m2_consumption/train.py
(train.py saves {'regressor': model, 'feature_names': [...]} with pickle).
"""

import os
import sys
import pickle
import argparse
from datetime import date, datetime, timedelta

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from ingestion.common.client import get_client
from cascade.db_utils import fetch_all, parse_date, default_as_of

FEATURES = [
    "order_quantity",
    "month",
    "is_peak_season",
    "qty_lag_1w",
    "qty_lag_4w",
    "qty_ma_4w",
]
BATCH = 500


DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts", "model_by_distributor.pkl")


def prepare_features(df, feats):
    """Same preprocessing as train.py: a missing lag or average falls back to the
    current week's quantity, and anything still missing becomes 0."""
    X = df[feats].copy()
    X = X.apply(pd.to_numeric, errors="coerce")
    if "is_peak_season" in feats:
        X["is_peak_season"] = df["is_peak_season"].astype(int)
    for col in ("qty_lag_1w", "qty_lag_4w", "qty_ma_4w"):
        if col in X.columns:
            X[col] = X[col].fillna(df["order_quantity"].astype(float))
    return X.fillna(0).astype(float)


def load_model(args):
    """Return (model, feature_names, default_version_label)."""
    if args.baseline:
        return None, FEATURES, "baseline-ma4w"
    if args.model_uri:
        import mlflow
        return mlflow.pyfunc.load_model(args.model_uri), FEATURES, "m2-mlflow"
    path = args.model_path or DEFAULT_MODEL_PATH
    if not os.path.exists(path):
        raise SystemExit(f"Model file not found: {path}\n"
                         "Run ml/m2_consumption/train.py first, or use --baseline.")
    with open(path, "rb") as fh:
        obj = pickle.load(fh)
    stamp = datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y%m%d")
    if isinstance(obj, dict) and "regressor" in obj:
        return obj["regressor"], obj.get("feature_names", FEATURES), f"m2-pkl-{stamp}"
    return obj, FEATURES, f"m2-pkl-{stamp}"


def run(args):
    sb = get_client()
    as_of = args.as_of or default_as_of(sb)
    newest = as_of - timedelta(days=7)                       # last week complete as of today
    oldest = as_of - timedelta(days=7 * (args.max_age_weeks + 1))

    print("=" * 60)
    print("RunOut — M2 scoring")
    print("=" * 60)
    print(f"As-of date:        {as_of}")
    print(f"Usable weeks:      period_start {oldest} to {newest}")

    rows = fetch_all(
        sb, "distributor_usage",
        "usage_id,distributor_id,product_id,period_start," + ",".join(FEATURES),
        "usage_id",
        apply=lambda q: q.gte("period_start", oldest.isoformat()).lte("period_start", newest.isoformat()),
    )
    if not rows:
        raise SystemExit("No distributor_usage rows in range. Run ml/build_distributor_features.py.")

    df = pd.DataFrame(rows)
    df = (df.sort_values("period_start")
            .groupby(["distributor_id", "product_id"], as_index=False)
            .tail(1)
            .reset_index(drop=True))
    print(f"Series to score:   {len(df):,} distributor-product pairs")

    model, feats, auto_version = load_model(args)
    X = prepare_features(df, feats)
    if model is None:
        preds = X["qty_ma_4w"].values
    else:
        preds = model.predict(X)
    version = args.model_version or auto_version

    out = []
    for i, r in df.iterrows():
        out.append({
            "distributor_id": int(r["distributor_id"]),
            "product_id": int(r["product_id"]),
            "forecast_week_start": (parse_date(r["period_start"]) + timedelta(days=7)).isoformat(),
            "predicted_weekly_qty": round(max(0.0, float(preds[i])), 2),
            "model_version": version,
            "as_of_date": as_of.isoformat(),
        })

    for i in range(0, len(out), BATCH):
        sb.table("distributor_usage_forecast").upsert(
            out[i:i + BATCH],
            on_conflict="distributor_id,product_id,as_of_date",
        ).execute()

    vals = [o["predicted_weekly_qty"] for o in out]
    print(f"\nWrote {len(out):,} forecasts (model_version={version})")
    print(f"  mean {sum(vals)/len(vals):.1f} | max {max(vals):.1f} units/week")
    print("Next: python cascade/impact.py")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", type=date.fromisoformat, default=None)
    ap.add_argument("--baseline", action="store_true",
                    help="skip the model; forecast = 4-week rolling average")
    ap.add_argument("--model-path", help="pickle saved by train.py (default: artifacts/model_by_distributor.pkl)")
    ap.add_argument("--model-uri", help="MLflow URI, e.g. models:/runout-m2/champion")
    ap.add_argument("--model-version", help="label stored with the forecasts")
    ap.add_argument("--max-age-weeks", type=int, default=4,
                    help="ignore series whose latest week is older than this")
    run(ap.parse_args())