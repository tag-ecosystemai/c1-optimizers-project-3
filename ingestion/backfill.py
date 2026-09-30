"""
RunOut - Historical Backfill (training features/labels)
Location: ingestion/backfill.py

The live pollers only capture "today". M1 needs HISTORY: weather,
news and port activity for past periods, written point-in-time so the
model can be trained and backtested without leakage.

Every row is written with as_of_date = the HISTORICAL date, so:
  * signal_day = that date (not today), and
  * re-running the same backfill is idempotent.

Sources (all support date ranges):
  * Weather  -> Open-Meteo Archive API
  * News     -> GDELT DOC 2.0 with startdatetime/enddatetime
  * Ports    -> IMF PortWatch (deeper history than the 30-day live pull)

All three sources rate-limit. This module is deliberately polite:
retries with backoff, spacing between calls, and it never silently
skips a term while rate-limited.

Usage (run from the repo root):
    python ingestion/backfill.py --weather --news --portwatch \
        --start 2023-01-01 --end 2026-09-01

Env:
    PORTWATCH_BACKFILL_DAYS    (default 1000; the service caps at 1000/pull)
    GDELT_SPACING_SECONDS      (default 15)
    OPENMETEO_SPACING_SECONDS  (default 2)
"""

import os
import time
import argparse
import requests
from datetime import datetime, timezone
from common.client import get_client
from common.db_writer import save_signal

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

DISRUPTION_CLAUSE = ('("port congestion" OR strike OR "customs delay" OR '
                     '"shipping delay" OR typhoon OR storm)')


# ----------------------------------------------------------------------
# Weather (Open-Meteo archive) - one row per location covering the range
# ----------------------------------------------------------------------
def backfill_weather(sb, start, end):
    spacing = float(os.environ.get("OPENMETEO_SPACING_SECONDS", "2"))
    targets = (
        [{**r, "kind": "seaport", "fk": r["seaport_id"]}
         for r in sb.table("seaports").select("name,latitude,longitude,seaport_id").execute().data]
        + [{**r, "kind": "supplier", "fk": r["location_id"]}
           for r in sb.table("supplier_locations").select("name,latitude,longitude,location_id").execute().data]
    )
    saved, skipped, failed = 0, 0, 0
    for loc in targets:
        params = {
            "latitude": loc["latitude"], "longitude": loc["longitude"],
            "start_date": start, "end_date": end,
            "daily": "precipitation_sum,wind_speed_10m_max,weather_code",
            "timezone": "UTC",
        }
        try:
            resp = None
            for attempt in range(1, 6):
                resp = requests.get(ARCHIVE_URL, params=params, timeout=90)
                if resp.status_code == 429:
                    wait = 15 * attempt
                    print(f"  weather 429 for {loc['name']} - waiting {wait}s")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                break
            if resp is None or resp.status_code == 429:
                raise RuntimeError("still rate-limited after retries")
            daily = resp.json().get("daily", {})
            result = save_signal(
                sb, "weather", "open-meteo-archive", loc["name"],
                {"location": loc["name"], "start": start, "end": end, "daily": daily},
                as_of_date=datetime.strptime(end, "%Y-%m-%d"),
                seaport_id=loc["fk"] if loc["kind"] == "seaport" else None,
                supplier_location_id=loc["fk"] if loc["kind"] == "supplier" else None,
            )
            saved += result == "saved"
            skipped += result == "skipped"
        except Exception as e:
            failed += 1
            print(f"  weather failed for {loc['name']}: {e}")
        time.sleep(spacing)
    print(f"Weather backfill: saved={saved}, skipped={skipped}, failed={failed}")


# ----------------------------------------------------------------------
# News (GDELT date range) - retries the SAME term while rate-limited
# ----------------------------------------------------------------------
def backfill_news(sb, start, end):
    from news import get_watch_terms  # reuse the live term list
    terms = get_watch_terms(sb)
    start_dt = datetime.strptime(start, "%Y-%m-%d").strftime("%Y%m%d000000")
    end_dt = datetime.strptime(end, "%Y-%m-%d").strftime("%Y%m%d235959")
    spacing = float(os.environ.get("GDELT_SPACING_SECONDS", "15"))

    saved, skipped, empty, failed = 0, 0, 0, 0
    day = datetime.strptime(end, "%Y-%m-%d").date().isoformat()
    for term in terms:
        # Skip BEFORE calling GDELT: re-runs must only chase the gaps, not
        # burn a rate-limited request on a term we already stored today.
        already = (sb.table("signals").select("signal_id")
                   .eq("signal_type", "news").eq("source", "gdelt-backfill")
                   .eq("reference_key", term).eq("signal_day", day)
                   .limit(1).execute().data)
        if already:
            skipped += 1
            continue

        params = {
            "query": f'"{term}" {DISRUPTION_CLAUSE}',
            "mode": "artlist", "maxrecords": 250,
            "startdatetime": start_dt, "enddatetime": end_dt, "format": "json",
        }
        handled = False
        for attempt in range(1, 6):
            try:
                r = requests.get(GDELT_URL, params=params, timeout=90)
                text = r.text.strip()
                if r.status_code == 429 or "5 seconds" in text or "too many" in text.lower():
                    wait = 30 * attempt
                    print(f"  rate limited on '{term}' - backoff {wait}s (attempt {attempt}/5)")
                    time.sleep(wait)
                    continue
                if not text.startswith("{"):
                    empty += 1
                else:
                    data = r.json()
                    if not data.get("articles"):
                        empty += 1
                    else:
                        result = save_signal(
                            sb, "news", "gdelt-backfill", term,
                            {"query": params["query"], "start": start, "end": end, **data},
                            as_of_date=datetime.strptime(end, "%Y-%m-%d"),
                        )
                        saved += result == "saved"
                handled = True
                break
            except Exception as e:
                print(f"  news error for '{term}': {type(e).__name__} {str(e)[:90]}")
                time.sleep(15 * attempt)
        if not handled:
            failed += 1
            print(f"  gave up on '{term}' after retries")
        time.sleep(spacing)
    print(f"News backfill: saved={saved}, skipped={skipped}, empty={empty}, failed={failed}")


# ----------------------------------------------------------------------
# PortWatch (deeper history) - service caps at 1000 rows per pull
# ----------------------------------------------------------------------
def backfill_portwatch(sb):
    import port_congestion as pc  # reuse the verified PortWatch fetch
    days = min(int(os.environ.get("PORTWATCH_BACKFILL_DAYS", "1000")), 1000)
    pc.DAYS_TO_FETCH = days
    ports = sb.table("seaports").select("name,seaport_id").execute().data
    cache, saved, skipped, failed = {}, 0, 0, 0
    for port in ports:
        pw_names = pc.PORTWATCH_NAMES.get(port["name"])
        if not pw_names:
            continue
        rows = []
        for pw in pw_names:
            if pw not in cache:
                cache[pw] = pc.fetch_recent_days(pw)
                time.sleep(3)
            if cache[pw]:
                rows.extend(cache[pw])
        if not rows:
            failed += 1
            print(f"  PortWatch: no data for {port['name']} (service flaky - re-run to fill gaps)")
            continue
        data_through = max(r["date"] for r in rows)
        result = save_signal(
            sb, "port_congestion", "imf-portwatch", port["name"],
            {"seaport": port["name"], "portwatch_names": pw_names,
             "data_through": data_through, "days": rows},
            as_of_date=datetime.strptime(data_through, "%Y-%m-%d"),
            seaport_id=port["seaport_id"],
        )
        saved += result == "saved"
        skipped += result == "skipped"
        time.sleep(3)
    print(f"PortWatch backfill ({days}d): saved={saved}, skipped={skipped}, failed={failed}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--weather", action="store_true")
    p.add_argument("--news", action="store_true")
    p.add_argument("--portwatch", action="store_true")
    p.add_argument("--start", default="2023-01-01")
    p.add_argument("--end", default=datetime.now(timezone.utc).date().isoformat())
    a = p.parse_args()
    if not (a.weather or a.news or a.portwatch):
        raise SystemExit("Pick at least one of --weather --news --portwatch")

    sb = get_client()
    if a.weather:
        backfill_weather(sb, a.start, a.end)
    if a.news:
        backfill_news(sb, a.start, a.end)
    if a.portwatch:
        backfill_portwatch(sb)
