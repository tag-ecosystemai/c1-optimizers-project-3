"""
RunOut v2 — M1 Scoring
Location: ml/m1_delay_risk/score.py

Scores orders with the champion models saved by train.py and writes one row per
order to the `predictions` table, which the cascade (cascade/impact.py) reads.

Columns written (the contract with the cascade, frontend and agent):
    order_id, model_version, predicted_delay_days, delay_risk_score,
    shap_explanation (top 5 features, in DAYS, positive = later), as_of_date (= the order date)

Scope: every order with order_date >= --from-date (default 2017-09-01, the start of the
test period, so the predictions are out-of-sample). Rows already stored under the same
model_version are deleted first, so re-running is safe.

NOTE ON DATES: orders before the end of the training period (2017-05-31) are IN-SAMPLE.
Scoring them (for example to demo another market on an earlier date) is allowed, but
anything shown from those dates must be labelled as in-sample.

Usage
    python ml/m1_delay_risk/score.py
    python ml/m1_delay_risk/score.py --from-date 2017-06-01 --to-date 2017-08-31
    python ml/m1_delay_risk/score.py --no-shap          # faster, leaves shap_explanation empty
"""

import os
import sys
import pickle
import argparse

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from ml.m1_delay_risk.features import align, base_feature, load_frame, make_matrix  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ARTIFACT = os.path.join(HERE, "artifacts", "m1_champions.pkl")
BATCH = 500


def load_artifact(path):
    if not os.path.exists(path):
        raise SystemExit(f"{path} not found. Run: python ml/m1_delay_risk/train.py")
    with open(path, "rb") as fh:
        return pickle.load(fh)


def shap_top_features(model, X, feature_names, top_k=5):
    """Per-row top features by absolute contribution, with one-hot region columns merged back into
    'order_region'. Contributions are in days (the regressor's unit)."""
    import shap
    name = type(model).__name__
    if name in ("LinearRegression", "Ridge", "Lasso"):
        explainer = shap.LinearExplainer(model, X.sample(min(len(X), 500), random_state=0))
    else:
        explainer = shap.TreeExplainer(model)
    values = np.asarray(explainer.shap_values(X))
    if values.ndim == 3:            # some explainers return (rows, features, outputs)
        values = values[:, :, 0]
    groups = {}
    for i, col in enumerate(feature_names):
        groups.setdefault(base_feature(col), []).append(i)
    merged = {g: values[:, idx].sum(axis=1) for g, idx in groups.items()}
    names = list(merged)
    matrix = np.column_stack([merged[g] for g in names])
    out = []
    for r in range(matrix.shape[0]):
        order = np.argsort(-np.abs(matrix[r]))[:top_k]
        out.append([{"feature": names[j], "contribution": round(float(matrix[r, j]), 3)} for j in order])
    return out


def score_frame(df, art, use_shap=True, top_k=5):
    """Return the list of prediction rows for the orders in df. No database access."""
    X = align(make_matrix(df, art["region_levels"]), art["feature_names"])
    delay = art["regressor"].predict(X)
    risk = art["classifier"].predict_proba(X)[:, 1]
    shap_rows = shap_top_features(art["regressor"], X, art["feature_names"], top_k) if use_shap else [None] * len(df)
    rows = []
    for i, (oid, od) in enumerate(zip(df["order_id"].to_numpy(), df["order_date"])):
        rows.append({
            "order_id": int(oid),
            "model_version": art["model_version"],
            "predicted_delay_days": round(float(delay[i]), 2),
            "delay_risk_score": round(float(np.clip(risk[i], 0, 1)), 4),
            "shap_explanation": shap_rows[i],
            "as_of_date": pd.Timestamp(od).date().isoformat(),
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact", default=DEFAULT_ARTIFACT)
    ap.add_argument("--from-date", default="2017-09-01")
    ap.add_argument("--to-date", default=None)
    ap.add_argument("--no-shap", action="store_true")
    ap.add_argument("--cache", default=None, help="pickle file caching the loaded data (see train.py)")
    ap.add_argument("--registry", action="store_true", help="load the champion from the DagsHub MLflow registry instead of the local pickle")
    args = ap.parse_args()

    if args.registry:
        from ml.m1_delay_risk.registry import load_registry_artifact
        art = load_registry_artifact()
        print("Loaded champion from registry:", art.get("registry"))
    else:
        art = load_artifact(args.artifact)
    split_end = art["split"]["train_end"]
    print(f"Model version: {art['model_version']}  (regressor {art['regressor_name']}, "
          f"classifier {art['classifier_name']}; trained on orders up to {split_end})")

    from ingestion.common.client import get_client
    sb = get_client()
    df = load_frame(sb, cache=args.cache)
    df = df[df["order_date"] >= pd.Timestamp(args.from_date)]
    if args.to_date:
        df = df[df["order_date"] <= pd.Timestamp(args.to_date)]
    df = df.reset_index(drop=True)
    if df.empty:
        raise SystemExit("No orders in that date range.")
    in_sample = int((df["order_date"] <= pd.Timestamp(split_end)).sum())
    print(f"Scoring {len(df):,} orders from {df['order_date'].min().date()} to {df['order_date'].max().date()}")
    if in_sample:
        print(f"WARNING: {in_sample:,} of these orders are on or before the training cut-off ({split_end}): "
              "their predictions are in-sample and must be labelled as such.")

    rows = score_frame(df, art, use_shap=not args.no_shap)

    print("Deleting earlier predictions with this model_version...")
    
    lo_d, hi_d = df["order_date"].min().date().isoformat(), df["order_date"].max().date().isoformat()
    sb.table("predictions").delete().eq("model_version", art["model_version"]) \
        .gte("as_of_date", lo_d).lte("as_of_date", hi_d).execute()    
    
    for i in range(0, len(rows), BATCH):
        sb.table("predictions").insert(rows[i:i + BATCH]).execute()
        if (i // BATCH) % 10 == 0:
            print(f"  ... {min(i + BATCH, len(rows)):,}/{len(rows):,} written", end="\r")
    delays = [r["predicted_delay_days"] for r in rows]
    risks = [r["delay_risk_score"] for r in rows]
    print(f"\nWrote {len(rows):,} predictions. delay days: min {min(delays):.2f}, mean {np.mean(delays):.2f}, "
          f"max {max(delays):.2f} | mean risk score {np.mean(risks):.3f}")
    print(f"Next: python cascade/impact.py --model-version {art['model_version']}")


if __name__ == "__main__":
    main()