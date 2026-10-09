"""
RunOut v2 — M1 shared feature code
Location: ml/m1_delay_risk/features.py

Used by BOTH train.py and score.py so the model sees identical inputs at
training time and scoring time.

Rows come from ml_order_features (built by ml/build_order_features.py) joined to
orders (for order_date, which ml_order_features does not store) and warehouses
(for the market name, used only for reporting, never as a model input).
"""

import os
import sys

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

NUMERIC = [
    "shipping_mode_encoded",   # 1 Standard, 2 Second, 3 First, 4 Same Day
    "order_item_quantity",
    "order_item_total",
    "month",
    "is_peak_season",          # Oct to Dec
    "profit_ratio",
]
# Columns removed in the ablation run (they may be borderline: see M1_HANDOFF.md section 4)
ABLATION_COLUMNS = ["order_item_total", "profit_ratio"]

SHIPPING_MODE_NAME = {1: "Standard Class", 2: "Second Class", 3: "First Class", 4: "Same Day"}
EXCLUDED_STATUSES = {"CANCELED", "SUSPECTED_FRAUD"}
TARGET_REG = "label_delay_days"
TARGET_CLF = "label_late_risk"

_FEATURE_COLS_DB = ("order_id,warehouse_id,shipping_mode_encoded,order_item_quantity,order_item_total,"
                    "month,is_peak_season,order_region,profit_ratio,label_delay_days,label_late_risk")


def load_frame(sb, cache=None):
    """Load every order's features + labels + order_date + status + market.
    Pass cache='path.pkl' to save/reuse the result (loading takes a couple of minutes)."""
    if cache and os.path.exists(cache):
        print(f"Using cached frame {cache}")
        return pd.read_pickle(cache)

    from cascade.db_utils import fetch_all
    print("Loading ml_order_features...")
    feats = pd.DataFrame(fetch_all(sb, "ml_order_features", _FEATURE_COLS_DB, "order_id"))
    print(f"  {len(feats):,} rows")
    print("Loading orders (dates and status)...")
    orders = pd.DataFrame(fetch_all(sb, "orders", "order_id,order_date,order_status", "order_id"))
    print(f"  {len(orders):,} rows")
    wh = pd.DataFrame(fetch_all(sb, "warehouses", "warehouse_id,market", "warehouse_id"))

    feats = feats.drop_duplicates("order_id", keep="last")
    df = feats.merge(orders, on="order_id", how="inner").merge(wh, on="warehouse_id", how="left")
    df = clean(df)
    if cache:
        os.makedirs(os.path.dirname(cache) or ".", exist_ok=True)
        df.to_pickle(cache)
    return df


def clean(df):
    df = df.copy()
    df["order_date"] = pd.to_datetime(df["order_date"])
    df["is_peak_season"] = df["is_peak_season"].fillna(False).astype(float)
    df["order_region"] = df["order_region"].fillna("Unknown").astype(str)
    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df["market"] = df["market"].fillna("Unknown")
    df["shipping_mode"] = df["shipping_mode_encoded"].round().astype(int).map(SHIPPING_MODE_NAME).fillna("Unknown")
    return df


def region_levels_from(df):
    return sorted(df["order_region"].dropna().unique().tolist())


def make_matrix(df, region_levels):
    """Numeric features + one 0/1 column per known order region."""
    X = df[NUMERIC].astype(float).copy()
    for r in region_levels:
        X[f"region_{r}"] = (df["order_region"] == r).astype(float)
    return X


def align(X, feature_names):
    """Make a matrix have exactly the training columns, in the training order
    (a region never seen in training becomes all zeros)."""
    return X.reindex(columns=feature_names, fill_value=0.0)


def base_feature(col):
    """Map an encoded column back to the human feature name (all region_* columns -> order_region)."""
    return "order_region" if col.startswith("region_") else col