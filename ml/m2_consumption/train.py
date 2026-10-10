"""
RunOut v2 — M2 Training (DataCo Distributor Forecasting)
Location: ml/m2_consumption/train.py

Trains forecasting models per distributor to predict next week's order quantity.
Every model is logged to MLflow AND registered as a version of 'runout-m2-distributor-forecast'.
No alias is set: pick the champion yourself in the MLflow UI (Models > runout-m2-distributor-forecast > version > alias).

Usage:
    python ml/m2_consumption/train.py
"""

import os
import sys
import pickle
import pandas as pd

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

try:
    from xgboost import XGBRegressor
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

import dagshub
dagshub.init(repo_owner='RunOut', repo_name='runout-ml', mlflow=True)
import mlflow
import mlflow.sklearn
from mlflow.tracking import MlflowClient
print("MLflow/DagsHub initialized successfully.")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
from ingestion.common.client import get_client

FEATURE_COLUMNS = ["order_quantity", "month", "is_peak_season", "qty_lag_1w", "qty_lag_4w", "qty_ma_4w"]
TARGET = "label_next_week_qty"
REGISTERED_NAME = "runout-m2-distributor-forecast"
TRUSTED = ["sklearn.tree._tree.Tree", "xgboost.core.Booster", "xgboost.sklearn.XGBRegressor"]


def get_models():
    models = {
        "linear_regression": LinearRegression(),
        "random_forest": RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=200, max_depth=5, learning_rate=0.05, random_state=42),
    }
    if XGB_AVAILABLE:
        models["xgboost"] = XGBRegressor(n_estimators=200, max_depth=5, learning_rate=0.05, random_state=42)
    return models


def load_all_usage_rows(sb):
    all_rows = []
    start = 0
    batch_size = 1000   # Supabase caps each request at 1,000 rows regardless of what's requested
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
    return all_rows


def log_model(model):
    try:
        return mlflow.sklearn.log_model(model, name="model", skops_trusted_types=TRUSTED)      # MLflow 3
    except TypeError:
        return mlflow.sklearn.log_model(model, "model", skops_trusted_types=TRUSTED)           # older MLflow


def run():
    mlflow.set_experiment("m2-distributor-forecast-dataco")
    client = MlflowClient()

    sb = get_client()

    print("Loading distributor_usage...")
    all_rows = load_all_usage_rows(sb)
    df = pd.DataFrame(all_rows)
    print(f"Total: {len(df):,} rows")

    # Fill lag/rolling features with this row's own quantity when not
    # enough history exists yet, rather than discarding the row entirely
    df["qty_lag_1w"] = df["qty_lag_1w"].fillna(df["order_quantity"])
    df["qty_lag_4w"] = df["qty_lag_4w"].fillna(df["order_quantity"])
    df["qty_ma_4w"] = df["qty_ma_4w"].fillna(df["order_quantity"])
    df = df.dropna(subset=[TARGET])
    print(f"With valid target: {len(df):,} rows")

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
    best_mae, best_name, best_model = float("inf"), None, None
    results = []

    for name, model in models.items():
        print(f"\nTraining {name}...")
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        mae = mean_absolute_error(y_test, preds)
        rmse = mean_squared_error(y_test, preds) ** 0.5
        print(f"  MAE={mae:.3f}  RMSE={rmse:.3f}")

        with mlflow.start_run(run_name=f"m2-{name}") as run:
            mlflow.log_param("algorithm", name)
            mlflow.log_param("feature_count", len(FEATURE_COLUMNS))
            mlflow.log_param("train_rows", len(train))
            mlflow.log_param("test_rows", len(test))
            mlflow.log_metric("mae", mae)
            mlflow.log_metric("rmse", rmse)
            if hasattr(model, "feature_importances_"):
                for f, imp in zip(FEATURE_COLUMNS, model.feature_importances_):
                    mlflow.log_metric(f"importance_{f}", imp)
            info = log_model(model)
            run_id = run.info.run_id
            model_uri = getattr(info, "model_uri", None) or f"runs:/{run_id}/model"
            print(f"  Logged to MLflow run: {run_id}")

        # Register this model as a new version. No alias: you choose the champion in the MLflow UI.
        try:
            mv = mlflow.register_model(model_uri, REGISTERED_NAME)
            client.set_model_version_tag(REGISTERED_NAME, mv.version, "algorithm", name)
            client.set_model_version_tag(REGISTERED_NAME, mv.version, "mae", f"{mae:.4f}")
            print(f"  Registered {REGISTERED_NAME} version {mv.version}")
        except Exception as e:
            print(f"  (could not register {name}: {type(e).__name__}: {str(e)[:100]}; the run is still logged)")

        results.append((name, mae, rmse))
        if mae < best_mae:
            best_mae, best_name, best_model = mae, name, model

    print("\nResults (lower MAE is better):")
    for name, mae, rmse in sorted(results, key=lambda r: r[1]):
        print(f"  {name:<20} MAE={mae:.3f}  RMSE={rmse:.3f}")
    print(f"\nLowest MAE: {best_name} ({best_mae:.3f}). Set the champion alias yourself in the MLflow UI.")

    # The scoring script still reads this local file (lowest MAE). It is not the registry champion.
    artifact_dir = os.path.join(os.path.dirname(__file__), "artifacts")
    os.makedirs(artifact_dir, exist_ok=True)
    with open(os.path.join(artifact_dir, "model_by_distributor.pkl"), "wb") as f:
        pickle.dump({"regressor": best_model, "feature_names": FEATURE_COLUMNS}, f)
    print(f"Saved lowest-MAE model to {artifact_dir}/model_by_distributor.pkl")
    print("See runs at: https://dagshub.com/RunOut/runout-ml/experiments")


if __name__ == "__main__":
    run()