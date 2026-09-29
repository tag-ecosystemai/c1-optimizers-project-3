"""
RunOut M1 — Explain a route prediction (SHAP)
Location: ml/m1_delay_risk/shap_explain.py

Produces per-prediction driver contributions so the agent can say WHY
a route looks risky ("origin congestion + weather pushed the estimate
up"). Uses SHAP when available; falls back to tree feature importances.

Usage (from repo root):
    python ml/m1_delay_risk/shap_explain.py --sample 1
"""

import os
import sys
import json
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ingestion"))
sys.path.insert(0, os.path.dirname(__file__))
from common.client import get_client  # noqa: E402
from prepare_route_features import FEATURE_COLUMNS  # noqa: E402
from route_resolver import load_model, build_features  # noqa: E402


def explain(model, vector):
    try:
        import shap
        explainer = shap.TreeExplainer(model["regressor"])
        values = explainer.shap_values([vector])[0]
        return {f: round(float(v), 4) for f, v in zip(FEATURE_COLUMNS, values)}, "shap"
    except ImportError:
        imp = getattr(model["regressor"], "feature_importances_", None)
        if imp is None:
            return {}, "unavailable"
        return {f: round(float(v), 4) for f, v in zip(FEATURE_COLUMNS, imp)}, "importance"


def run(sample):
    sb = get_client()
    model = load_model()
    shipments = (sb.table("shipments")
                 .select("shipment_id,origin_seaport_id,destination_seaport_id")
                 .execute().data)

    done, seen = 0, set()
    for s in shipments:
        key = (s["origin_seaport_id"], s["destination_seaport_id"])
        if not all(key) or key in seen:
            continue
        seen.add(key)
        feats, vector = build_features(sb, *key)
        contributions, method = explain(model, vector)
        top = sorted(contributions.items(), key=lambda kv: abs(kv[1]), reverse=True)[:5]
        print(json.dumps({"route": key, "method": method,
                          "top_drivers": dict(top), "features": feats}, indent=2, default=str))
        done += 1
        if done >= sample:
            break

    if not done:
        print("No routes to explain.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=1, help="how many routes to explain")
    run(ap.parse_args().sample)
