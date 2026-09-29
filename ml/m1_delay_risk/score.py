"""
RunOut M1 — Nightly scoring
Location: ml/m1_delay_risk/score.py

Scores every in-flight shipment's route for the current week and writes
rows to `predictions` (which the cascade then consumes). Also stamps
`shipments.predicted_arrival` = planned_arrival + predicted delay.

Run after ingest + backfill + train.

Usage (from repo root):
    python ml/m1_delay_risk/score.py
"""

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ingestion"))
sys.path.insert(0, os.path.dirname(__file__))
from common.client import get_client  # noqa: E402
from route_resolver import load_model, predict_route  # noqa: E402


def run():
    sb = get_client()
    model = load_model()

    shipments = (sb.table("shipments")
                 .select("shipment_id,origin_seaport_id,destination_seaport_id,planned_arrival,mode")
                 .execute().data)
    if not shipments:
        raise SystemExit("No shipments to score.")

    cache, scored, skipped = {}, 0, 0
    today = date.today().isoformat()

    for s in shipments:
        o, d = s.get("origin_seaport_id"), s.get("destination_seaport_id")
        if not (o and d):
            skipped += 1
            continue
        if (o, d) not in cache:
            cache[(o, d)] = predict_route(sb, o, d, model=model)
        pred = cache[(o, d)]

        delay = pred["predicted_delay_days"]
        # risk score: map delay onto 0..1 against the model's late threshold
        threshold = max(model.get("threshold", 2.0), 0.01)
        risk = min(1.0, max(0.0, delay / (threshold * 2)))

        sb.table("predictions").insert({
            "shipment_id": s["shipment_id"],
            "model_version": pred["model_version"],
            "delay_risk_score": round(risk, 4),
            "predicted_delay_days": int(round(delay)),
            "shap_explanation": pred["features"],
            "as_of_date": today,
        }).execute()

        if s.get("planned_arrival"):
            eta = (date.fromisoformat(s["planned_arrival"]) + timedelta(days=round(delay))).isoformat()
            sb.table("shipments").update({"predicted_arrival": eta}).eq("shipment_id", s["shipment_id"]).execute()
        scored += 1

    print(f"Done. Scored: {scored}, Skipped (no route): {skipped}")


if __name__ == "__main__":
    run()
