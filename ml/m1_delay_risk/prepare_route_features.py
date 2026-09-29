"""
RunOut M1 — Build the route-level feature table
Location: ml/m1_delay_risk/prepare_route_features.py

Aggregates the raw `signals` layer into weekly rows in
`ml_route_features`: one row per (origin seaport, destination seaport,
ISO week).

FEATURES = REAL signals (weather, port congestion, news).
LABEL    = SIMULATED (see synthetic_label.py). label_source='synthetic'.

Time-based split only downstream. Never random.

Usage (from repo root):
    python ml/m1_delay_risk/prepare_route_features.py
    python ml/m1_delay_risk/prepare_route_features.py --weeks 104
"""

import os
import sys
import argparse
from datetime import date, datetime, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ingestion"))
from common.client import get_client  # noqa: E402
from synthetic_label import synthetic_delay_days, SYNTHETIC_SOURCE  # noqa: E402

FEATURE_COLUMNS = [
    "origin_congestion_index", "origin_congestion_lag1w",
    "dest_congestion_lag1w", "dest_volume_last_week",
    "origin_precip_mm", "origin_wind_kph", "dest_precip_mm", "dest_wind_kph",
    "news_event_count", "month", "is_peak_season",
]


def monday_of(d):
    return d - timedelta(days=d.weekday())


def load_signals(sb, signal_type):
    rows, start = [], 0
    while True:
        batch = (sb.table("signals")
                 .select("signal_type,seaport_id,reference_key,payload,as_of_date,signal_day")
                 .eq("signal_type", signal_type).range(start, start + 999).execute().data)
        if not batch:
            break
        rows.extend(batch)
        start += 1000
    return rows


# ----------------------------------------------------------------------
# small helpers
# ----------------------------------------------------------------------
def _to_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%SZ", "%Y%m%dT%H%M%SZ", "%Y%m%d"):
        try:
            return datetime.strptime(s[:len(fmt)], fmt).date()
        except ValueError:
            continue
    return None


def _series_agg(days, field, week_start, week_end, agg="mean"):
    vals = []
    for d in days or []:
        dd = _to_date(d.get("date"))
        if dd and week_start <= dd <= week_end and d.get(field) is not None:
            try:
                vals.append(float(d[field]))
            except (TypeError, ValueError):
                pass
    if not vals:
        return None
    return sum(vals) / len(vals) if agg == "mean" else sum(vals)


def _daily_mean(payload, field, wk, wend):
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    vals = daily.get(field) or []
    picked = []
    for t, v in zip(times, vals):
        dd = _to_date(t)
        if v is not None and dd and wk <= dd <= wend:
            picked.append(float(v))
    return sum(picked) / len(picked) if picked else None


def _article_date(article):
    for key in ("seendate", "date", "published"):
        if article.get(key):
            d = _to_date(article[key])
            if d:
                return d
    return None


# ----------------------------------------------------------------------
# loaders (shared with route_resolver so training and inference match)
# ----------------------------------------------------------------------
def load_congestion_by_port(sb):
    """seaport_id -> list of day dicts, DE-DUPLICATED by date.
    The live pull (last 30d) and the backfill (up to 1000d) overlap, so
    merging naively would double-count the recent weeks."""
    by_date = defaultdict(dict)
    for r in load_signals(sb, "port_congestion"):
        sid = r.get("seaport_id")
        if not sid:
            continue
        for d in (r["payload"] or {}).get("days", []):
            if d.get("date"):
                by_date[sid][d["date"]] = d
    return {sid: list(days.values()) for sid, days in by_date.items()}


def load_weather_by_port(sb):
    by_port = defaultdict(list)
    for r in load_signals(sb, "weather"):
        if r.get("seaport_id"):
            by_port[r["seaport_id"]].append(r["payload"] or {})
    return by_port


def load_news_dates(sb):
    """reference_key -> set of article dates (falls back to signal_day)."""
    by_key = defaultdict(set)
    for r in load_signals(sb, "news"):
        payload = r["payload"] or {}
        dates = set()
        for a in payload.get("articles", []) or []:
            d = _article_date(a)
            if d:
                dates.add(d)
        if not dates and r.get("signal_day"):
            d = _to_date(r["signal_day"])
            if d:
                dates.add(d)
        by_key[r["reference_key"]].update(dates)
    return by_key


def build_route_week(origin_id, dest_id, wk, ports, cong_by_port, weat_by_port, news_by_key):
    """Feature dict for one (route, week). Mirrors inference exactly."""
    wend = wk + timedelta(days=6)
    prev = wk - timedelta(weeks=1)
    prev_end = prev + timedelta(days=6)

    origin = ports.get(origin_id, {})
    o_city = (origin.get("name") or "").split(",")[0]
    o_country = origin.get("country") or ""

    feats = {
        "origin_congestion_index": _series_agg(cong_by_port.get(origin_id), "portcalls_container", wk, wend, "mean"),
        "origin_congestion_lag1w": _series_agg(cong_by_port.get(origin_id), "portcalls_container", prev, prev_end, "mean"),
        "dest_congestion_lag1w": _series_agg(cong_by_port.get(dest_id), "portcalls_container", prev, prev_end, "mean"),
        "dest_volume_last_week": _series_agg(cong_by_port.get(dest_id), "import_container", prev, prev_end, "sum"),
    }

    for payload in weat_by_port.get(origin_id, []):
        v = _daily_mean(payload, "precipitation_sum", wk, wend)
        if v is not None:
            feats["origin_precip_mm"] = v
        v = _daily_mean(payload, "wind_speed_10m_max", wk, wend)
        if v is not None:
            feats["origin_wind_kph"] = v
    for payload in weat_by_port.get(dest_id, []):
        v = _daily_mean(payload, "precipitation_sum", wk, wend)
        if v is not None:
            feats["dest_precip_mm"] = v
        v = _daily_mean(payload, "wind_speed_10m_max", wk, wend)
        if v is not None:
            feats["dest_wind_kph"] = v

    news_count = 0
    for key in (o_city, o_country):
        for d in news_by_key.get(key, set()):
            if wk <= d <= wend:
                news_count += 1
    feats["news_event_count"] = news_count
    feats["month"] = wk.month
    feats["is_peak_season"] = wk.month in (10, 11, 12)
    return feats


def vector_of(feats):
    return [float(feats[c]) if feats.get(c) is not None else float("nan")
            for c in FEATURE_COLUMNS]


def run(weeks):
    sb = get_client()

    ports = {r["seaport_id"]: r
             for r in sb.table("seaports").select("seaport_id,name,country").execute().data}
    shipments = sb.table("shipments").select("origin_seaport_id,destination_seaport_id").execute().data
    routes = sorted({(s["origin_seaport_id"], s["destination_seaport_id"]) for s in shipments
                     if s.get("origin_seaport_id") and s.get("destination_seaport_id")})
    if not routes:
        raise SystemExit("No resolved routes on shipments. Run db/seed_shipments.py first.")
    print(f"Routes: {len(routes)}")

    cong_by_port = load_congestion_by_port(sb)
    weat_by_port = load_weather_by_port(sb)
    news_by_key = load_news_dates(sb)

    today = date.today()
    periods = [monday_of(today) - timedelta(weeks=w) for w in range(weeks, 0, -1)]

    rows = []
    for origin, dest in routes:
        for wk in periods:
            feats = build_route_week(origin, dest, wk, ports, cong_by_port, weat_by_port, news_by_key)
            label = synthetic_delay_days(feats, seed_key=f"{origin}-{dest}-{wk.isoformat()}")
            rows.append({
                "origin_seaport_id": origin,
                "destination_seaport_id": dest,
                "period_start": wk.isoformat(),
                **feats,
                "label_delay_days": label,
                "label_source": SYNTHETIC_SOURCE,
            })

    saved = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        sb.table("ml_route_features").upsert(
            batch, on_conflict="origin_seaport_id,destination_seaport_id,period_start").execute()
        saved += len(batch)

    print(f"Done. Feature rows written: {saved}.")
    print("REMINDER: labels are SIMULATED (label_source='synthetic') — pipeline test, not real-world accuracy.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", type=int, default=104, help="how many past weeks to build")
    run(ap.parse_args().weeks)
