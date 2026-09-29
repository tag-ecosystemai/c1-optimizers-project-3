"""
RunOut — Port Congestion Ingestion
Location: ingestion/port_congestion.py

Pulls real daily port activity from IMF PortWatch's Daily_Ports_Data
ArcGIS service for every seaport, writes one idempotent signal per
seaport into `signals`, and attaches seaport_id.

PortWatch names differ from ours (LA + Long Beach are one port; Newark
sits under New York-New Jersey), so PORTWATCH_NAMES maps them. Data
runs several days behind, so we fetch the latest 30 daily rows and
record the lag — stale data is never shown as current.

No API key required.

Usage:
    python ingestion/port_congestion.py   (run from the repo root)
"""

import time
import requests
from datetime import datetime, timezone
from common.client import get_client
from common.db_writer import save_signal

PORTWATCH_QUERY_URL = (
    "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/"
    "Daily_Ports_Data/FeatureServer/0/query"
)
DAYS_TO_FETCH = 30
OUT_FIELDS = (
    "date,portname,country,portcalls,portcalls_container,portcalls_cargo,"
    "import,import_container,export,export_container"
)

PORTWATCH_NAMES = {
    "Yantian, China":       ["Yantian"],
    "Ningbo, China":        ["Ningbo"],
    "Shanghai, China":      ["Shanghai", "Shanghai (Yangshan)"],
    "Port Klang, Malaysia": ["Port Klang"],
    "Valencia, Spain":      ["Valencia"],
    "Long Beach, USA":      ["Los Angeles-Long Beach"],
    "Los Angeles, USA":     ["Los Angeles-Long Beach"],
    "Tacoma, USA":          ["Tacoma"],
    "Norfolk, USA":         ["Norfolk"],
    "Newark, USA":          ["New York-New Jersey"],
}


def fetch_recent_days(portwatch_name, retries=6):
    params = {
        "where": f"portname = '{portwatch_name}'",
        "outFields": OUT_FIELDS,
        "orderByFields": "date DESC",
        "resultRecordCount": min(DAYS_TO_FETCH, 1000),
        "f": "json",
    }
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(PORTWATCH_QUERY_URL, params=params, timeout=90)
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                raise RuntimeError(data["error"])
            return [f["attributes"] for f in data.get("features", [])]
        except Exception as e:
            print(f"    attempt {attempt}/{retries} failed for '{portwatch_name}': "
                  f"{type(e).__name__} {str(e)[:100]}")
            time.sleep(5 * attempt)
    return None


def run():
    sb = get_client()

    ports = sb.table("seaports").select("name,seaport_id").execute().data
    if not ports:
        print("Warning: `seaports` is empty. Run db/seed_seaports.py first.")
        return

    cache = {}
    today = datetime.now(timezone.utc).date()
    saved, skipped, failed = 0, 0, 0

    for port in ports:
        seaport, seaport_id = port["name"], port["seaport_id"]
        pw_names = PORTWATCH_NAMES.get(seaport)
        if not pw_names:
            print(f"No PortWatch mapping for {seaport} — add it to PORTWATCH_NAMES")
            skipped += 1
            continue

        rows = []
        for pw_name in pw_names:
            if pw_name not in cache:
                cache[pw_name] = fetch_recent_days(pw_name)
                time.sleep(1)
            if cache[pw_name] is None:
                print(f"    warning: no data retrieved for '{pw_name}'")
            else:
                rows.extend(cache[pw_name])

        if not rows:
            print(f"No PortWatch data for {seaport}")
            failed += 1
            continue

        data_through = max(r["date"] for r in rows)
        lag_days = (today - datetime.strptime(data_through, "%Y-%m-%d").date()).days

        result = save_signal(
            sb, "port_congestion", "imf-portwatch", seaport,
            {"seaport": seaport, "portwatch_names": pw_names, "data_through": data_through,
             "data_lag_days": lag_days, "days": rows},
            seaport_id=seaport_id,
        )
        if result == "skipped":
            skipped += 1
            print(f"{seaport}: already ingested today ({len(rows)} rows, {lag_days}d behind)")
        else:
            saved += 1
            print(f"{seaport}: {len(rows)} rows, data through {data_through} ({lag_days} days behind)")

    print(f"Done. Saved: {saved}, Skipped: {skipped}, Failed: {failed}")


if __name__ == "__main__":
    run()
