
import argparse
import os
from pathlib import Path

import joblib
import mlflow
import mlflow.sklearn
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from baseline import mae, series_weights, time_split, wmae

FEATURES = [
    "sales_lag_7", "sales_lag_28", "sales_ma_7", "sales_ma_28",
    "sell_price", "price_change_vs_prev",
    "weekday", "month", "is_holiday", "is_snap_week", "is_peak_season",
    "dept_id", "store_id",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inp", type=Path, default=Path("data/processed/m5_features.parquet"))
    ap.add_argument("--model-out", type=Path, default=Path("models/m2_model.joblib"))
    ap.add_argument("--train-days", type=int, default=730,
                    help="use only the most recent N days of training data (speed)")
    ap.add_argument("--max-iter", type=int, default=200)
    ap.add_argument("--max-depth", type=int, default=5)
    ap.add_argument("--learning-rate", type=float, default=0.05)
    ap.add_argument("--loss", default="poisson", choices=["poisson", "squared_error"],
                    help="poisson suits non-negative count data like unit sales")
    args = ap.parse_args()

    df = pd.read_parquet(args.inp)
    df["dept_id"] = df["dept_id"].astype("category")
    df["store_id"] = df["store_id"].astype("category")

    train, val = time_split(df)
    weights = series_weights(train)

    if args.train_days:
        cutoff = train["date"].max() - pd.Timedelta(days=args.train_days)
        train = train[train["date"] >= cutoff]
        print(f"using last {args.train_days} days of train: {len(train):,} rows")

    model = HistGradientBoostingRegressor(
        loss=args.loss,
        max_iter=args.max_iter,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        categorical_features="from_dtype",
        early_stopping=False,
        random_state=42,
    )

    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "sqlite:///mlflow.db"))
    mlflow.set_experiment("m2-consumption")

    with mlflow.start_run():
        print("Training ...")
        model.fit(train[FEATURES], train["sales"])

        val = val.copy()
        val["pred"] = model.predict(val[FEATURES]).clip(min=0)

        m_mae = mae(val["sales"], val["pred"])
        m_wmae = wmae(val, "pred", weights)
        b_mae = mae(val["sales"], val["sales_ma_28"])
        b_wmae = wmae(val, "sales_ma_28", weights)

        mlflow.log_param("model_type", "hist_gradient_boosting")
        mlflow.log_param("loss", args.loss)
        mlflow.log_param("max_iter", args.max_iter)
        mlflow.log_param("max_depth", args.max_depth)
        mlflow.log_param("learning_rate", args.learning_rate)
        mlflow.log_param("lags", "7_28")
        mlflow.log_param("train_days", args.train_days)
        mlflow.log_param("val_days", 28)
        mlflow.log_param("categories", "HOUSEHOLD")
        mlflow.log_metric("mae", m_mae)
        mlflow.log_metric("wmae", m_wmae)
        mlflow.log_metric("baseline_mae", b_mae)
        mlflow.log_metric("baseline_wmae", b_wmae)
       
      
        mlflow.sklearn.log_model(
            model,
            name="model",
            skops_trusted_types=[
                "functools.partial",
                "sklearn.ensemble._hist_gradient_boosting.predictor.TreePredictor",
                "sklearn.utils.validation.check_array",
            ],
        )

        print(f"\n{'':<22}{'MAE':>10}{'WMAE':>10}")
        print(f"{'baseline (ma_28)':<22}{b_mae:>10.4f}{b_wmae:>10.4f}")
        print(f"{'gradient boosting':<22}{m_mae:>10.4f}{m_wmae:>10.4f}")
        print(f"WMAE improvement vs baseline: {100 * (b_wmae - m_wmae) / b_wmae:.1f}%")

    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.model_out)
    print(f"Saved model -> {args.model_out}")


if __name__ == "__main__":
    main()