"""
RunOut M1 — Train the route-level delay model (REGRESSION)
Location: ml/m1_delay_risk/train.py

Label = SIMULATED delay days (see synthetic_label.py). This model
reproduces the simulator, so it is a PIPELINE test, not a claim about the
real world. Say so in the report.

Regression only: features -> estimated days late. Time-based split
(never random). Reports MAE and the signal importances.

Requires: scikit-learn (pip install scikit-learn). MLflow logging is
optional and skipped if mlflow is not installed.

Usage (from repo root):
    python ml/m1_delay_risk/train.py
    python ml/m1_delay_risk/train.py --test-frac 0.25
"""

import os
import sys
import json
import pickle
import argparse
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ingestion"))
sys.path.insert(0, os.path.dirname(__file__))
from common.client import get_client  # noqa: E402
from prepare_route_features import FEATURE_COLUMNS  # noqa: E402

ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "artifacts")
MODEL_VERSION = "m1-route-v1"


def load_rows(sb):
    rows, start = [], 0
    while True:
        batch = sb.table("ml_route_features").select("*").range(start, start + 999).execute().data
        if not batch:
            break
        rows.extend(batch)
        start += 1000
    return [r for r in rows if r.get("label_delay_days") is not None]


def build_xy(rows):
    X, y = [], []
    for r in rows:
        X.append([float(r.get(c)) if r.get(c) is not None else float("nan") for c in FEATURE_COLUMNS])
        y.append(float(r["label_delay_days"]))
    return X, y


def run(test_frac):
    try:
        from sklearn.ensemble import GradientBoostingRegressor
        from sklearn.metrics import mean_absolute_error
    except ImportError:
        raise SystemExit("scikit-learn not installed. Run: pip install scikit-learn")

    sb = get_client()
    rows = load_rows(sb)
    if len(rows) < 20:
        raise SystemExit(f"Only {len(rows)} labelled rows — run the backfill + "
                         "prepare_route_features.py first.")
    rows.sort(key=lambda r: r["period_start"])

    cut = int(len(rows) * (1 - test_frac))
    train, test = rows[:cut], rows[cut:]
    Xtr, ytr = build_xy(train)
    Xte, yte = build_xy(test)

    reg = GradientBoostingRegressor(random_state=42).fit(Xtr, ytr)
    pred = reg.predict(Xte)

    metrics = {
        "model_version": MODEL_VERSION,
        "label_source": "synthetic",
        "n_train": len(train),
        "n_test": len(test),
        "mae_delay_days": round(mean_absolute_error(yte, pred), 3),
        "mean_label": round(sum(yte) / len(yte), 3),
        "feature_importance": {c: round(float(v), 4)
                               for c, v in zip(FEATURE_COLUMNS, reg.feature_importances_)},
        "trained_on": date.today().isoformat(),
    }

    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    with open(os.path.join(ARTIFACT_DIR, "model.pkl"), "wb") as f:
        pickle.dump({"regressor": reg, "features": FEATURE_COLUMNS, "version": MODEL_VERSION}, f)
    with open(os.path.join(ARTIFACT_DIR, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    _maybe_mlflow(metrics, reg)

    print(json.dumps(metrics, indent=2))
    print(f"Saved model -> {ARTIFACT_DIR}/model.pkl")
    print("TRAINED ON SIMULATED DATA. Route-level metrics only — this shows the "
          "pipeline works, NOT real-world accuracy. Do not report as shipment-level.")


def _maybe_mlflow(metrics, model):
    try:
        import mlflow
    except ImportError:
        return
    try:
        mlflow.set_experiment("runout-m1-route")
        with mlflow.start_run(run_name=MODEL_VERSION):
            mlflow.log_params({"features": ",".join(FEATURE_COLUMNS), "label_source": "synthetic"})
            mlflow.log_metrics({k: v for k, v in metrics.items() if isinstance(v, (int, float))})
            mlflow.sklearn.log_model(model, "model")
    except Exception as e:
        print(f"(mlflow logging skipped: {e})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--test-frac", type=float, default=0.25)
    run(ap.parse_args().test_frac)
