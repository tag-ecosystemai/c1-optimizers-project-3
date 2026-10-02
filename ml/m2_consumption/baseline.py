
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

VAL_DAYS = 28


def time_split(df: pd.DataFrame):
    last = df["date"].max()
    val_start = last - pd.Timedelta(days=VAL_DAYS - 1)
    train = df[df["date"] < val_start]
    val = df[df["date"] >= val_start]
    print(f"train: {train['date'].min().date()} -> {train['date'].max().date()} ({len(train):,} rows)")
    print(f"val  : {val['date'].min().date()} -> {val['date'].max().date()} ({len(val):,} rows)")
    return train, val


def series_weights(train: pd.DataFrame) -> pd.Series:
    """Revenue share per series over the last 28 training days."""
    cutoff = train["date"].max() - pd.Timedelta(days=VAL_DAYS - 1)
    recent = train[train["date"] >= cutoff]
    revenue = (recent["sales"] * recent["sell_price"]).groupby(recent["series"]).sum()
    return revenue / revenue.sum()


def mae(y, pred) -> float:
    return float(np.mean(np.abs(y - pred)))


def wmae(val: pd.DataFrame, pred_col: str, weights: pd.Series) -> float:
    err = (val["sales"] - val[pred_col]).abs()
    per_series = err.groupby(val["series"]).mean()
    w = weights.reindex(per_series.index).fillna(0)
    return float((per_series * w).sum() / w.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inp", type=Path, default=Path("data/processed/m5_features.parquet"))
    args = ap.parse_args()

    df = pd.read_parquet(args.inp)
    train, val = time_split(df)
    weights = series_weights(train)
    val = val.copy()

    baselines = {
        "ma_28 (guide baseline)": "sales_ma_28",
        "ma_7": "sales_ma_7",
        "lag_7": "sales_lag_7",
    }
    print("\nBaseline results on validation:")
    print(f"{'baseline':<26}{'MAE':>10}{'WMAE':>10}")
    for name, col in baselines.items():
        print(f"{name:<26}{mae(val['sales'], val[col]):>10.4f}{wmae(val, col, weights):>10.4f}")

    print(f"\nFor context: mean daily sales in validation = {val['sales'].mean():.3f} units")


if __name__ == "__main__":
    main()