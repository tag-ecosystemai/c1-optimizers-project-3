
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

HORIZON = 7  # forecast one week ahead


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["item_id", "store_id", "date"]).reset_index(drop=True)

    # One integer id per (item, store) series so groupby is fast
    df["series"] = df.groupby(["item_id", "store_id"], sort=False).ngroup().astype("int32")
    g_sales = df.groupby("series", sort=False)["sales"]
    g_price = df.groupby("series", sort=False)["sell_price"]

    # --- Lags (same weekday, 1 and 4 weeks back) ---
    df["sales_lag_7"] = g_sales.shift(HORIZON).astype("float32")
    df["sales_lag_28"] = g_sales.shift(28).astype("float32")

    # --- Rolling averages, computed on data already >= 7 days old ---
    shifted = g_sales.shift(HORIZON)
    shifted_g = shifted.groupby(df["series"], sort=False)
    df["sales_ma_7"] = shifted_g.transform(lambda x: x.rolling(7).mean()).astype("float32")
    df["sales_ma_28"] = shifted_g.transform(lambda x: x.rolling(28).mean()).astype("float32")

    # --- Price features (price is known in advance, so no leakage) ---
    df["price_change_vs_prev"] = (
        df["sell_price"] - g_price.shift(7)
    ).astype("float32")

    # --- Calendar ---
    df["weekday"] = df["wday"]  # M5: 1=Saturday ... 7=Friday
    df["is_peak_season"] = df["month"].isin([10, 11, 12]).astype("int8")
    # is_holiday and snap come from prepare_m5.py
    df["is_snap_week"] = df["snap"]

    # Rows without a full 28-day history can't be used for training/eval
    needed = ["sales_lag_7", "sales_lag_28", "sales_ma_7", "sales_ma_28"]
    before = len(df)
    df = df.dropna(subset=needed)
    print(f"dropped {before - len(df):,} rows without enough history")

    df["price_change_vs_prev"] = df["price_change_vs_prev"].fillna(0)
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inp", type=Path, default=Path("data/processed/m5_household.parquet"))
    ap.add_argument("--out", type=Path, default=Path("data/processed/m5_features.parquet"))
    args = ap.parse_args()

    print(f"Reading {args.inp} ...")
    df = pd.read_parquet(args.inp)
    df = build_features(df)

    keep = [
        "series", "item_id", "store_id", "dept_id", "date", "sales",
        "sales_lag_7", "sales_lag_28", "sales_ma_7", "sales_ma_28",
        "sell_price", "price_change_vs_prev",
        "weekday", "month", "is_holiday", "is_snap_week", "is_peak_season",
    ]
    df = df[keep]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(args.out, index=False)
    print(f"Saved {len(df):,} rows -> {args.out}")
    print(df.head())


if __name__ == "__main__":
    main()