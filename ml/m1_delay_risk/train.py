"""
RunOut v2 — M1 Training (DataCo)
Location: ml/m1_delay_risk/train.py

Trains regression model on REAL delay labels from DataCo orders.
Target: label_delay_days (days_for_shipping_real - days_for_shipment_scheduled).

Compares: linear regression, random forest, gradient boosting, XGBoost.
Logs to DagsHub/MLflow. Saves best model per run.

Usage:
    python ml/m1_delay_risk/train.py
    python ml/m1_delay_risk/train.py --no-mlflow
"""

import os
import sys
import pickle
import argparse
import numpy as np
import pandas as pd
from datetime import date

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

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

FEATURE_COLUMNS = [
    "shipping_mode_encoded", "order_item_quantity", "order_item_total",
    "month", "is_peak_season", "profit_ratio",
]
TARGET = "label_delay_days"
TEST_START_DATE = "2017-07-01"  # time-based split


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
        mlflow.set_experiment("m1-delay-regression-dataco")

    sb = get_client()

    print("Loading ml_order_features...")
    all_rows = []
    start = 0
    batch_size = 10000
    while True:
        batch = sb.table("ml_order_features").select("*").range(start, start + batch_size - 1).order("order_id").execute().data
        if not batch:
            break
        all_rows.extend(batch)
        start += batch_size
        print(f"  fetched {len(batch):,} rows (total {len(all_rows):,})")

    df = pd.DataFrame(all_rows)
    print(f"Total: {len(df):,} rows")

    # Filter to rows with valid delay label
    df = df.dropna(subset=[TARGET])
    print(f"With valid {TARGET}: {len(df):,} rows")

    # Remove outliers (delay > 30 days is probably data error)
    df = df[df[TARGET] <= 30]
    print(f"After removing outliers (>30 days): {len(df):,} rows")

    # Time-based split
    df["order_id_str"] = df["order_id"].astype(str)
    train = df[df["order_id"] <= 50000]  # approximate time split by order_id progression
    test = df[df["order_id"] > 50000]
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
        r2 = r2_score(y_test, preds)
        print(f"  MAE={mae:.3f}  R²={r2:.3f}")

        if use_mlflow:
            with mlflow.start_run(run_name=f"m1-{name}") as run:
                mlflow.log_param("algorithm", name)
                mlflow.log_param("feature_count", len(FEATURE_COLUMNS))
                mlflow.log_metric("mae", mae)
                mlflow.log_metric("r2", r2)
                if hasattr(model, "feature_importances_"):
                    for f, imp in zip(FEATURE_COLUMNS, model.feature_importances_):
                        mlflow.log_metric(f"importance_{f}", imp)
                mlflow.sklearn.log_model(model, "model")

        if mae < best_mae:
            best_mae = mae
            best_name = name
            best_model = model

    print(f"\nBest model: {best_name} (MAE={best_mae:.3f})")

    # Save locally
    artifact_dir = os.path.join(os.path.dirname(__file__), "artifacts")
    os.makedirs(artifact_dir, exist_ok=True)
    with open(os.path.join(artifact_dir, "model.pkl"), "wb") as f:
        pickle.dump({"regressor": best_model, "feature_names": FEATURE_COLUMNS, "model_version": "m1-dataco-v1"}, f)
    print(f"Saved to {artifact_dir}/model.pkl")

    if use_mlflow:
        print(f"See runs at: https://dagshub.com/RunOut/runout-ml")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-mlflow", action="store_true")
    FLAGS = ap.parse_args()
    run()