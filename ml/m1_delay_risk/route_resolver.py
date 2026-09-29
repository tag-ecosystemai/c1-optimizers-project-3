"""
RunOut M1 — Resolve a shipment to a route and predict its delay
Location: ml/m1_delay_risk/route_resolver.py

The inference adapter. Turns a route (origin_seaport_id /
destination_seaport_id, already resolved by route_rules) into the
current week's feature vector from the live `signals` layer, and returns
a predicted delay in days.

It reuses the EXACT feature-building code from prepare_route_features so
training and inference can never drift apart.

IMPORTANT: this is a ROUTE-level prediction applied to a shipment.
It is not a shipment-level model, and must not be reported as one.
Also: the model was trained on SIMULATED labels.
"""

import os
import sys
import pickle
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ingestion"))
sys.path.insert(0, os.path.dirname(__file__))
from common.client import get_client  # noqa: E402
from prepare_route_features import (  # noqa: E402
    FEATURE_COLUMNS, monday_of, vector_of, build_route_week,
    load_congestion_by_port, load_weather_by_port, load_news_dates,
)

ARTIFACT = os.path.join(os.path.dirname(__file__), "artifacts", "model.pkl")


def load_model(path=ARTIFACT):
    if not os.path.exists(path):
        raise SystemExit(f"No trained model at {path}. Run train.py first.")
    with open(path, "rb") as f:
        return pickle.load(f)


def build_features(sb, origin_id, dest_id, wk=None):
    """Feature vector for one route in one week, from the live signals layer."""
    wk = wk or monday_of(date.today())
    ports = {r["seaport_id"]: r
             for r in sb.table("seaports").select("seaport_id,name,country").execute().data}
    feats = build_route_week(
        origin_id, dest_id, wk, ports,
        load_congestion_by_port(sb), load_weather_by_port(sb), load_news_dates(sb),
    )
    return feats, vector_of(feats)


def predict_route(sb, origin_id, dest_id, model=None, wk=None):
    model = model or load_model()
    feats, vector = build_features(sb, origin_id, dest_id, wk=wk)
    delay = float(model["regressor"].predict([vector])[0])
    return {"origin_seaport_id": origin_id, "destination_seaport_id": dest_id,
            "predicted_delay_days": round(delay, 2), "features": feats,
            "model_version": model["version"]}


if __name__ == "__main__":
    sb = get_client()
    s = sb.table("shipments").select("shipment_id,origin_seaport_id,destination_seaport_id").execute().data
    if not s:
        raise SystemExit("No shipments.")
    r = predict_route(sb, s[0]["origin_seaport_id"], s[0]["destination_seaport_id"])
    print(r)
