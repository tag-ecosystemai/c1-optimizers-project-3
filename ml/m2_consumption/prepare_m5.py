
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ID_COLS = ["item_id", "dept_id", "cat_id", "store_id", "state_id"]


def load_sales(raw_dir: Path, categories: list[str]) -> pd.DataFrame:
    path = raw_dir / "sales_train_evaluation.csv"
    if not path.exists():
        path = raw_dir / "sales_train_validation.csv"
    print(f"Reading {path.name} ...")
    sales = pd.read_csv(path)
    sales = sales[sales["cat_id"].isin(categories)].reset_index(drop=True)
    print(f"  kept {len(sales):,} series in {categories}")

    # Shrink before melting: day columns -> int16, ids -> category
    day_cols = [c for c in sales.columns if c.startswith("d_")]
    sales[day_cols] = sales[day_cols].astype("int16")
    for c in ID_COLS:
        sales[c] = sales[c].astype("category")
    return sales


def melt_sales(sales: pd.DataFrame) -> pd.DataFrame:
    day_cols = [c for c in sales.columns if c.startswith("d_")]
    long = sales.melt(
        id_vars=ID_COLS,
        value_vars=day_cols,
        var_name="d",
        value_name="sales",
    )
    long["d"] = long["d"].astype("category")
    long["sales"] = long["sales"].astype("int16")
    print(f"  melted to {len(long):,} rows")
    return long


def load_calendar(raw_dir: Path) -> pd.DataFrame:
    cal = pd.read_csv(raw_dir / "calendar.csv", parse_dates=["date"])
    cal["is_holiday"] = cal["event_name_1"].notna().astype("int8")
    cal["event_type_1"] = cal["event_type_1"].fillna("none")
    keep = [
        "d", "date", "wm_yr_wk", "wday", "month", "year",
        "is_holiday", "event_type_1", "snap_CA", "snap_TX", "snap_WI",
    ]
    cal = cal[keep].copy()
    cal["d"] = cal["d"].astype("category")
    for c in ["wday", "month"]:
        cal[c] = cal[c].astype("int8")
    cal["year"] = cal["year"].astype("int16")
    cal["event_type_1"] = cal["event_type_1"].astype("category")
    return cal


def load_prices(raw_dir: Path, items: pd.Series) -> pd.DataFrame:
    prices = pd.read_csv(raw_dir / "sell_prices.csv")
    prices = prices[prices["item_id"].isin(items.unique())].copy()
    prices["sell_price"] = prices["sell_price"].astype("float32")
    prices["wm_yr_wk"] = prices["wm_yr_wk"].astype("int16")
    return prices


def build(raw_dir: Path, categories: list[str]) -> pd.DataFrame:
    sales = load_sales(raw_dir, categories)
    items = sales["item_id"].astype(str)
    long = melt_sales(sales)
    del sales

    cal = load_calendar(raw_dir)
    df = long.merge(cal, on="d", how="left")
    del long

    # Pick the SNAP flag that matches each row's state
    state = df["state_id"].astype(str)
    df["snap"] = np.select(
        [state == "CA", state == "TX", state == "WI"],
        [df["snap_CA"], df["snap_TX"], df["snap_WI"]],
        default=0,
    ).astype("int8")
    df = df.drop(columns=["snap_CA", "snap_TX", "snap_WI"])

    prices = load_prices(raw_dir, items)
    df = df.merge(prices, on=["store_id", "item_id", "wm_yr_wk"], how="left")

    # No price = item not on shelf yet. Those zeros are not real demand, so drop.
    before = len(df)
    df = df.dropna(subset=["sell_price"])
    print(f"  dropped {before - len(df):,} pre-launch rows (no price)")

    df = df.sort_values(["item_id", "store_id", "date"]).reset_index(drop=True)
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    ap.add_argument("--out", type=Path, default=Path("data/processed/m5_household.parquet"))
    ap.add_argument("--categories", nargs="+", default=["HOUSEHOLD"])
    args = ap.parse_args()

    df = build(args.raw_dir, args.categories)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(args.out, index=False)
    print(f"Saved {len(df):,} rows -> {args.out}")
    print(df.head())
    print(df.dtypes)


if __name__ == "__main__":
    main()