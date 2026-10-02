import argparse
from pathlib import Path

import joblib
import pandas as pd

from baseline import time_split
from train_m2 import FEATURES


def predict_series_rates(df: pd.DataFrame, model) -> pd.DataFrame:
    """Average predicted daily sales per series over the last 28 days."""
    df["dept_id"] = df["dept_id"].astype("category")
    df["store_id"] = df["store_id"].astype("category")
    _, recent = time_split(df)
    recent = recent.copy()
    recent["pred"] = model.predict(recent[FEATURES]).clip(min=0)
    return (
        recent.groupby(["series", "dept_id"], observed=True)["pred"]
        .mean()
        .rename("rate")
        .reset_index()
    )


def sql_quote(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features", type=Path, default=Path("data/processed/m5_features.parquet"))
    ap.add_argument("--model", type=Path, default=Path("models/m2_model.joblib"))
    ap.add_argument("--out-dir", type=Path, default=Path("outputs"))
    ap.add_argument("--mapping", type=Path, default=None,
                    help="CSV with columns: product_id,dept_id")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--stat", choices=["mean", "median"], default="mean")
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_parquet(args.features)
    model = joblib.load(args.model)

    series_rates = predict_series_rates(df, model)

    dept = (
        series_rates.groupby("dept_id", observed=True)["rate"]
        .agg(mean_rate="mean", median_rate="median", n_series="count")
        .reset_index()
    )
    dept["daily_usage_rate"] = dept[f"{args.stat}_rate"] * args.scale
    dept_path = args.out_dir / "rates_by_dept.csv"
    dept.to_csv(dept_path, index=False)
    print(dept.to_string(index=False))
    print(f"\nSaved {dept_path}")

    if args.mapping is None:
        print("\nNo --mapping given, so no SQL written. Provide a CSV with "
              "product_id,dept_id to generate the UPDATE statements.")
        return

    mapping = pd.read_csv(args.mapping)
    merged = mapping.merge(dept[["dept_id", "daily_usage_rate"]], on="dept_id", how="left")
    missing = merged["daily_usage_rate"].isna().sum()
    if missing:
        print(f"WARNING: {missing} products have a dept_id not found in M5; skipped.")
        merged = merged.dropna(subset=["daily_usage_rate"])

    sql_path = args.out_dir / "update_inventory.sql"
    with open(sql_path, "w") as f:
        for _, r in merged.iterrows():
            f.write(
                "UPDATE inventory SET daily_usage_rate = "
                f"{r['daily_usage_rate']:.4f}, label_source = 'm5-derived' "
                f"WHERE product_id = {sql_quote(r['product_id'])};\n"
            )
    print(f"Saved {sql_path} ({len(merged)} UPDATE statements)")


if __name__ == "__main__":
    main()