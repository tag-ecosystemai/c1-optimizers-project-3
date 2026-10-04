"""
RunOut v2 — M2 Training (DataCo Distributor Forecasting)
Location: ml/m2_consumption/train.py

Trains forecasting models per distributor to predict next week's
order quantity. Uses lagged quantities, rolling averages, calendar.

Target: label_next_week_qty (real — from historical DataCo data).

Usage:
    python ml/m2_consumption/train.py
    python ml/m2_consumption/train.py --no-mlflow
"""

import os
import sys
import pickle
import argparse
import numpy as np
import pandas as pd

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

try:
    from xgboost import XGBRegressor
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

try:
    import dagshub
    dagshub.init(repo_owner='RunOut', repo_name='runout-ml', mlflow=True)
    import mlflow
    import mlflow.sklearn
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
from ingestion.common.client import get_client

FEATURE_COLUMNS = ["order_quantity", "month", "is_peak_season", "qty_lag_1w", "qty_lag_4w", "qty_ma_4w"]
TARGET = "label_next_week_qty"


def get_models():
    models = {
        "linear_regression": LinearRegression(),
        "random_forest": RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=200, max_depth=5, learning_rate=0.05, random_state=42),
    }
    if XGB_AVAILABLE:
        models["xgboost"] = XGBRegressor(n_estimators=200, max_depth=5, learning_rate=0.05, random_state=42)
    return models


def run():
    use_mlflow = MLFLOW_AVAILABLE and not FLAGS.no_mlflow
    if use_mlflow:
        mlflow.set_experiment("m2-distributor-forecast-dataco")

    sb = get_client()

    print("Loading distributor_usage...")
    all_rows = []
    start = 0
    batch_size = 10000
    while True:
        batch = (sb.table("distributor_usage")
                 .select("*")
                 .range(start, start + batch_size - 1)
                 .order("usage_id")
                 .execute().data)
        if not batch:
            break
        all_rows.extend(batch)
        start += batch_size
        print(f"  fetched {len(batch):,} rows (total {len(all_rows):,})")

    df = pd.DataFrame(all_rows)
    print(f"Total: {len(df):,} rows")

    # Filter to rows with valid target
    df = df.dropna(subset=[TARGET] + FEATURE_COLUMNS)
    print(f"With valid features + target: {len(df):,} rows")

    # Time-based split (80/20 by period_start)
    sorted_dates = sorted(df["period_start"].unique())
    split_idx = int(len(sorted_dates) * 0.8)
    train_dates = set(sorted_dates[:split_idx])
    test_dates = set(sorted_dates[split_idx:])
    train = df[df["period_start"].isin(train_dates)]
    test = df[df["period_start"].isin(test_dates)]
    print(f"Train: {len(train):,}  Test: {len(test):,}")

    X_train = train[FEATURE_COLUMNS].fillna(0)
    y_train = train[TARGET]
    X_test = test[FEATURE_COLUMNS].fillna(0)
    y_test = test[TARGET]

    models = get_models()
    best_mae = float("inf")
    best_name = None
    best_model = None

    for name, model in models.items():
        print(f"\nTraining {name}...")
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        mae = mean_absolute_error(y_test, preds)
        print(f"  MAE={mae:.3f}")

        if use_mlflow:
            with mlflow.start_run(run_name=f"m2-{name}") as run:
                mlflow.log_param("algorithm", name)
                mlflow.log_param("feature_count", len(FEATURE_COLUMNS))
                mlflow.log_metric("mae", mae)
                if hasattr(model, "feature_importances_"):
                    for f, imp in zip(FEATURE_COLUMNS, model.feature_importances_):
                        mlflow.log_metric(f"importance_{f}", imp)
                mlflow.sklearn.log_model(model, "model")

        if mae < best_mae:
            best_mae = mae
            best_name = name
            best_model = model

    print(f"\nBest model: {best_name} (MAE={best_mae:.3f})")

    artifact_dir = os.path.join(os.path.dirname(__file__), "artifacts")
    os.makedirs(artifact_dir, exist_ok=True)
    with open(os.path.join(artifact_dir, "model_by_distributor.pkl"), "wb") as f:
        pickle.dump({"regressor": best_model, "feature_names": FEATURE_COLUMNS}, f)
    print(f"Saved to {artifact_dir}/model_by_distributor.pkl")

    if use_mlflow:
        print(f"See runs at: https://dagshub.com/RunOut/runout-ml")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-mlflow", action="store_true")
    FLAGS = ap.parse_args()
    run()