"""
RunOut — Build ml_port_features table for Sherrif's M1 model
Location: ml/build_port_features.py

Reads from:
  - PortWatch CSV (full per-port daily history: portcalls, congestion)
  - signals table (weather: open-meteo, news: wikipedia-current-events)

Writes to ml_port_features table: one row per (origin, dest, week) with
16 real feature columns. Label column (label_delay_days) is NOT set here
— it is added independently by generate_delay_label.py to avoid leakage.

Uses pre-computed weekly aggregations so 72 port pairs × 394 weeks runs
in seconds, not hours.

Usage:
    python ml/build_port_features.py
    python ml/build_port_features.py --weeks 52  (last year only)
"""

import os
import csv
import io
import sys
import argparse
from datetime import datetime, date, timedelta, timezone
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ingestion.common.client import get_client

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTWATCH_CSV = os.environ.get("PORTWATCH_CSV",
                               os.path.join(REPO_ROOT, "data", "raw", "portwatch_daily_ports.csv"))

# PortWatch name -> our seaport name (mirrors port_congestion.py)
PORTWATCH_TO_OUR = {
    "Yantian": "Yantian, China",
    "Ningbo": "Ningbo, China",
    "Shanghai": "Shanghai, China",
    "Shanghai (Yangshan)": "Shanghai, China",
    "Port Klang": "Port Klang, Malaysia",
    "Valencia": "Valencia, Spain",
    "Los Angeles-Long Beach": "Long Beach, USA",
    "Tacoma": "Tacoma, USA",
    "Norfolk": "Norfolk, USA",
    "New York-New Jersey": "Newark, USA",
}

OUR_SEAPORTS = set(PORTWATCH_TO_OUR.values())
PW_NUMERIC = ["portcalls"]

FEATURE_COLUMNS = [
    "origin_congestion_index", "origin_congestion_lag1w", "origin_congestion_lag4w",
    "dest_congestion_index", "dest_congestion_lag1w", "dest_congestion_lag4w",
    "origin_precip_mm", "origin_wind_kph", "dest_precip_mm", "dest_wind_kph",
    "news_severity_score", "month", "is_peak_season",
]


def _to_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    for n, fmt in ((10, "%Y-%m-%d"), (20, "%Y-%m-%dT%H:%M:%SZ"),
                   (16, "%Y%m%dT%H%M%SZ"), (8, "%Y%m%d")):
        try:
            return datetime.strptime(s[:n], fmt).date()
        except ValueError:
            continue
    return None


def monday_of(d):
    return d - timedelta(days=d.weekday())


def load_all_port_pairs(pw_by_port):
    ports = sorted(pw_by_port.keys())
    return [(o, d) for o in ports for d in ports if o != d]


# ---------------------------------------------------------------------------
# PortWatch loader — loads raw daily data
# ---------------------------------------------------------------------------

def load_portwatch_daily():
    if not os.path.exists(PORTWATCH_CSV):
        raise FileNotFoundError(
            f"PortWatch CSV not found at {PORTWATCH_CSV}. "
            "Run `python ingestion/portwatch_bulk.py --refresh` first."
        )
    by_port = defaultdict(list)
    with open(PORTWATCH_CSV, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            pw_name = row.get("portname", "")
            our_name = PORTWATCH_TO_OUR.get(pw_name)
            if not our_name:
                continue
            d = {"date": (row.get("date") or "").replace("/", "-")}
            if len(d["date"]) != 10:
                continue
            v = row.get("portcalls")
            try:
                d["portcalls"] = float(v) if v not in (None, "") else 0.0
            except ValueError:
                d["portcalls"] = 0.0
            by_port[our_name].append(d)
    return dict(by_port)


# ---------------------------------------------------------------------------
# Weather loader
# ---------------------------------------------------------------------------

def load_weather(sb):
    rows = (sb.table("signals")
            .select("reference_key,payload,as_of_date")
            .filter("signal_type", "eq", "weather")
            .filter("source", "in", '("open-meteo","open-meteo-archive")')
            .execute().data)
    by_port = defaultdict(list)
    for r in rows:
        name = r["reference_key"]
        if name not in OUR_SEAPORTS:
            continue
        daily = (r["payload"] or {}).get("daily", {})
        times = daily.get("time", [])
        precip = daily.get("precipitation_sum", [])
        wind = daily.get("wind_speed_10m_max", [])
        for t, p, w in zip(times, precip, wind):
            dd = _to_date(t)
            if dd:
                try:
                    by_port[name].append({
                        "date": dd,
                        "precip_mm": float(p) if p not in (None, "") else 0.0,
                        "wind_kph": float(w) if w not in (None, "") else 0.0,
                    })
                except (ValueError, TypeError):
                    pass
    # Dedupe by date, keeping non-zero values
    result = {}
    for port, items in by_port.items():
        deduped = {}
        for item in items:
            key = item["date"]
            if key not in deduped or item["precip_mm"] != 0.0:
                deduped[key] = item
        result[port] = sorted(deduped.values(), key=lambda x: x["date"])
    return result


# ---------------------------------------------------------------------------
# News loader (from signals table)
# ---------------------------------------------------------------------------

def load_news(sb):
    rows = (sb.table("signals")
            .select("payload,reference_key")
            .eq("signal_type", "news")
            .eq("source", "wikipedia-current-events")
            .execute().data)

    term_to_port = {}
    for pw_name, our_name in PORTWATCH_TO_OUR.items():
        term_to_port[pw_name] = our_name
        if our_name == "Yantian, China":
            term_to_port["China"] = our_name
        elif our_name == "Port Klang, Malaysia":
            term_to_port["Malaysia"] = our_name
        elif our_name == "Valencia, Spain":
            term_to_port["Spain"] = our_name
        elif "Long Beach" in our_name or "Los Angeles" in our_name:
            term_to_port["Long Beach"] = "Long Beach, USA"
            term_to_port["Los Angeles"] = "Long Beach, USA"
        elif "Newark" in our_name:
            term_to_port["Newark"] = our_name
            term_to_port["New York"] = our_name
            term_to_port["New Jersey"] = our_name

    by_port_month = defaultdict(dict)
    for r in rows:
        payload = r["payload"] or {}
        term = r["reference_key"]
        our_port = term_to_port.get(term)
        if not our_port:
            continue
        year = payload.get("year")
        month = payload.get("month")
        severity = payload.get("severity_score", 0.0)
        if year and month:
            key = f"{year}-{month:02d}"
            existing = by_port_month[our_port].get(key, 0.0)
            by_port_month[our_port][key] = max(existing, severity)
    return dict(by_port_month)


# ---------------------------------------------------------------------------
# Pre-compute weekly aggregations (single pass per port)
# ---------------------------------------------------------------------------

def precompute_weekly_calls(daily_list, periods):
    """{port: {period_iso: sum_portcalls}} — single pass per port."""
    # Build date->value map
    d_map = {}
    for d in daily_list:
        dd = d["date"] if isinstance(d["date"], date) else _to_date(d["date"])
        if dd:
            d_map[dd] = d.get("portcalls", 0.0)

    result = {}
    for wk in periods:
        wend = wk + timedelta(days=6)
        total = 0.0
        d = wk
        while d <= wend:
            total += d_map.get(d, 0.0)
            d += timedelta(days=1)
        result[wk.isoformat()] = total
    return result


def precompute_weekly_weather(daily_list, field, periods, agg="sum"):
    d_map = {}
    for d in daily_list:
        dd = d["date"] if isinstance(d["date"], date) else _to_date(d["date"])
        if dd:
            d_map[dd] = d.get(field, 0.0)

    result = {}
    for wk in periods:
        wend = wk + timedelta(days=6)
        total = 0.0
        count = 0
        d = wk
        while d <= wend:
            v = d_map.get(d, 0.0)
            total += v
            if v != 0.0:
                count += 1
            d += timedelta(days=1)
        if agg == "sum":
            result[wk.isoformat()] = total
        else:
            result[wk.isoformat()] = total / max(count, 1)
    return result


def median_of(values):
    if not values:
        return None
    s = sorted(values)
    return s[len(s) // 2]


# ---------------------------------------------------------------------------
# Build one row (fast — uses pre-computed dicts)
# ---------------------------------------------------------------------------

def build_row(origin, dest, wk_str, pw_calls, wea_precip, wea_wind,
              o_median, d_median, news_by_port):
    row = {}

    o_calls = pw_calls[origin].get(wk_str, 0.0)
    d_calls = pw_calls[dest].get(wk_str, 0.0)

    row["origin_congestion_index"] = round(o_calls / o_median, 3) if o_median and o_median > 0 else round(o_calls, 3)
    row["dest_congestion_index"] = round(d_calls / d_median, 3) if d_median and d_median > 0 else round(d_calls, 3)

    wk_date = datetime.strptime(wk_str, "%Y-%m-%d").date()
    wk1 = (wk_date - timedelta(weeks=1)).isoformat()
    wk4 = (wk_date - timedelta(weeks=4)).isoformat()

    o1 = pw_calls[origin].get(wk1, 0.0)
    o4 = pw_calls[origin].get(wk4, 0.0)
    d1 = pw_calls[dest].get(wk1, 0.0)
    d4 = pw_calls[dest].get(wk4, 0.0)

    row["origin_congestion_lag1w"] = round(o1 / o_median, 3) if o_median else round(o1, 3)
    row["origin_congestion_lag4w"] = round(o4 / o_median, 3) if o_median else round(o4, 3)
    row["dest_congestion_lag1w"] = round(d1 / d_median, 3) if d_median else round(d1, 3)
    row["dest_congestion_lag4w"] = round(d4 / d_median, 3) if d_median else round(d4, 3)

    row["origin_precip_mm"] = round(wea_precip[origin].get(wk_str, 0.0), 2)
    row["origin_wind_kph"] = round(wea_wind[origin].get(wk_str, 0.0), 2)
    row["dest_precip_mm"] = round(wea_precip[dest].get(wk_str, 0.0), 2)
    row["dest_wind_kph"] = round(wea_wind[dest].get(wk_str, 0.0), 2)

    month_key = wk_str[:7]
    o_news = news_by_port.get(origin, {})
    d_news = news_by_port.get(dest, {})
    row["news_severity_score"] = round(max(
        o_news.get(month_key, 0.0),
        d_news.get(month_key, 0.0),
    ), 3)

    row["month"] = wk_date.month
    row["is_peak_season"] = wk_date.month in (10, 11, 12)
    return row


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run():
    sb = get_client()

    print("Loading PortWatch daily data...")
    pw_by_port = load_portwatch_daily()
    print(f"  {len(pw_by_port)} ports")

    print("Loading weather data...")
    wea_by_port = load_weather(sb)
    print(f"  {len(wea_by_port)} ports with weather")

    print("Loading news data...")
    news_by_port = load_news(sb)
    print(f"  {len(news_by_port)} ports with news")

    print("Generating all port pairs...")
    routes = load_all_port_pairs(pw_by_port)
    print(f"  {len(routes)} pairs")

    # Determine date range and periods
    all_dates = []
    for port_days in pw_by_port.values():
        for d in port_days:
            dd = _to_date(d["date"])
            if dd:
                all_dates.append(dd)
    if not all_dates:
        print("ERROR: No dates in PortWatch data.")
        return

    data_end = max(all_dates)
    weeks = FLAGS.weeks or 394
    last_monday = monday_of(data_end)
    periods = [last_monday - timedelta(weeks=w) for w in range(weeks, 0, -1)]
    period_strs = [p.isoformat() for p in periods]
    print(f"Data range through {data_end}, {weeks} weeks")

    # Pre-compute ALL weekly aggregates once
    print("Pre-computing weekly aggregations...")
    pw_calls = {}       # port -> {period_iso: sum}
    wea_precip = {}     # port -> {period_iso: sum}
    wea_wind = {}       # port -> {period_iso: mean}
    o_medians = {}      # port -> median weekly calls (trailing 52w)
    d_medians = {}

    for port in pw_by_port:
        pw_calls[port] = precompute_weekly_calls(pw_by_port[port], periods)
        # Median of all weekly sums for this port
        all_weekly = [v for v in pw_calls[port].values() if v and v > 0]
        o_medians[port] = median_of(all_weekly) if all_weekly else None

    for port in wea_by_port:
        wea_precip[port] = precompute_weekly_weather(wea_by_port[port], "precip_mm", periods, "sum")
        wea_wind[port] = precompute_weekly_weather(wea_by_port[port], "wind_kph", periods, "mean")

    # Build rows
    rows = []
    count = 0
    total = len(routes) * len(periods)
    for origin, dest in routes:
        o_med = o_medians.get(origin)
        d_med = o_medians.get(dest)  # same port baseline for dest
        for wk_str in period_strs:
            feats = build_row(origin, dest, wk_str, pw_calls, wea_precip, wea_wind,
                              o_med, d_med, news_by_port)
            rows.append({
                "origin_portname": origin,
                "dest_portname": dest,
                "period_start": wk_str,
                **feats,
                "label_source": None,
            })
            count += 1
            if count % 5000 == 0:
                print(f"  ... {count}/{total} rows built")

    print(f"Built {len(rows)} rows. Writing to DB...")

    # Upsert in batches with retry
    import time as _time
    batch_size = 500
    written = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        for attempt in range(1, 4):
            try:
                sb.table("ml_port_features").upsert(
                    batch,
                    on_conflict="origin_portname,dest_portname,period_start"
                ).execute()
                written += len(batch)
                print(f"  written {written}/{len(rows)}")
                break
            except Exception as e:
                if attempt < 3:
                    print(f"  retry {attempt}/3 after error: {type(e).__name__}")
                    _time.sleep(3 * attempt)
                else:
                    print(f"  FAILED batch at row {i}: {type(e).__name__}")
                    raise

    null_count = sum(1 for r in rows if r.get("origin_congestion_index") is None)
    print(f"\nDone. Feature rows written: {len(rows)}")
    print(f"Rows with null congestion: {null_count}")
    print("\nNOTE: label_delay_days is NOT set yet.")
    print("      Run `python ml/generate_delay_label.py` to populate labels.")
    print("\nFeatures:")
    for c in FEATURE_COLUMNS:
        print(f"  - {c}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", type=int, default=None,
                    help="how many past weeks (default: 394)")
    FLAGS = ap.parse_args()
    run()