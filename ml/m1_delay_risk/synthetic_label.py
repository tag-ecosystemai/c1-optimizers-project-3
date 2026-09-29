"""
RunOut M1 — Synthetic label simulator
Location: ml/m1_delay_risk/synthetic_label.py

THE ANSWER KEY for M1 is SIMULATED.

No free, reachable data source gives real per-port delay days (BTS is
blocked, IMF PortWatch has no wait-time field). So instead of chasing
data forever, we generate the label ourselves from a documented formula
driven by the REAL signals we already ingest.

Read this as a simulator / digital-twin of a port week:

    delay_days = 0.5                              # normal wobble
               + 1.5 if peak season (Oct-Dec)     # holiday congestion
               + 2.0 * congestion_surge           # origin port busier than last week
               + 0.04 * origin_rain_mm
               + 0.015 * origin_wind_kph
               + 0.03 * dest_rain_mm
               + 0.010 * dest_wind_kph
               + 0.7 * min(news_events, 5)        # strike / typhoon / delay headlines
               + N(0, 0.6)                        # noise

The noise is what makes the model's job non-trivial (it can't recover
the label perfectly). The label is deterministic per (route, week) so
re-running prepare_route_features.py does not change history.

HONESTY: a model trained on this measures whether the PIPELINE works,
NOT whether it predicts the real world. Say so in the report.
"""

import random

SYNTHETIC_SOURCE = "synthetic"


def _num(value, default=0.0):
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def synthetic_delay_days(feats, seed_key=None):
    """Deterministic synthetic delay for one route-week.
    seed_key must be stable (e.g. '<origin>-<dest>-<period>') so re-runs match."""
    rng = random.Random(seed_key)

    idx = _num(feats.get("origin_congestion_index"))
    lag = _num(feats.get("origin_congestion_lag1w"))
    congestion_surge = 0.0
    if lag > 0 and idx > 0:
        congestion_surge = min(2.0, max(0.0, idx / lag - 1.0))

    delay = 0.5
    if feats.get("is_peak_season"):
        delay += 1.5
    delay += 2.0 * congestion_surge
    delay += 0.04 * _num(feats.get("origin_precip_mm"))
    delay += 0.015 * _num(feats.get("origin_wind_kph"))
    delay += 0.03 * _num(feats.get("dest_precip_mm"))
    delay += 0.010 * _num(feats.get("dest_wind_kph"))
    delay += 0.7 * min(_num(feats.get("news_event_count")), 5.0)
    delay += rng.gauss(0.0, 0.6)

    return round(max(0.0, delay), 2)
