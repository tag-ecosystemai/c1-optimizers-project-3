"""
RunOut - PortWatch BULK backfill (full history, all ports at once)
Location: ingestion/portwatch_bulk.py

The per-port ArcGIS query (`where portname = '...'`) scans 3.4M rows and
times out. Instead we download the ENTIRE Daily_Ports_Data table ONCE as
CSV (~90 MB) from the ArcGIS Hub, stream-filter it to the ports we care
about, and write one signal per seaport covering the full daily history.

This is immune to the per-port throttling/timeouts.

Usage (from repo root):
    python ingestion/portwatch_bulk.py            # use cached CSV if present
    python ingestion/portwatch_bulk.py --refresh  # force re-download

Env:
    PORTWATCH_CSV   (default data/raw/portwatch_daily_ports.csv)
"""

import os
import csv
import sys
import time
import argparse
import requests
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from common.client import get_client
from common.db_writer import save_signal
from port_congestion import PORTWATCH_NAMES

ITEM = "83b1bbc7b3354c5fb1f40673bb8f852e"
CSV_URL = (f"https://hub.arcgis.com/api/v3/datasets/{ITEM}_0/"
           "downloads/data?format=csv&spatialRefId=4326")
CSV_PATH = os.environ.get("PORTWATCH_CSV", "data/raw/portwatch_daily_ports.csv")

# columns we keep from each daily row (dates normalised to YYYY-MM-DD)
NUMERIC_FIELDS = [
    "portcalls_container", "portcalls_dry_bulk", "portcalls_general_cargo",
    "portcalls_roro", "portcalls_tanker", "portcalls_cargo", "portcalls",
    "import_container", "import_cargo", "import",
    "export_container", "export_cargo", "export",
]


def _expected_size():
    try:
        with requests.get(CSV_URL, timeout=60, stream=True) as r:
            r.raise_for_status()
            return int(r.headers.get("Content-Length", 0))
    except Exception:
        return 0


def download(refresh):
    if os.path.exists(CSV_PATH) and not refresh:
        print(f"Using cached {CSV_PATH} ({os.path.getsize(CSV_PATH)//1_000_000} MB)")
        return

    os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)
    total = _expected_size()
    print(f"Downloading PortWatch CSV (~{total//1_000_000 or 90} MB) -> {CSV_PATH} ...")
    if refresh and os.path.exists(CSV_PATH):
        os.remove(CSV_PATH)

    # Resumable: the 90 MB transfer often drops mid-stream, so we restart
    # from the byte we reached using HTTP Range, until the file is complete.
    for attempt in range(1, 11):
        done = os.path.getsize(CSV_PATH) if os.path.exists(CSV_PATH) else 0
        if total and done >= total:
            break
        headers = {"Range": f"bytes={done}-"} if done else {}
        try:
            with requests.get(CSV_URL, timeout=300, stream=True, headers=headers) as r:
                r.raise_for_status()
                mode = "wb"
                if done and r.status_code == 200:
                    done = 0  # server ignored Range -> start over cleanly
                elif done:
                    mode = "ab"
                with open(CSV_PATH, mode) as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        f.write(chunk)
                        done += len(chunk)
                        if total:
                            print(f"  {done*100//total}%", end="\r")
        except Exception as e:
            print(f"\n  dropped at {done//1_000_000} MB ({type(e).__name__}); resuming (try {attempt}/10)...")
            time.sleep(3 * attempt)
    final = os.path.getsize(CSV_PATH) if os.path.exists(CSV_PATH) else 0
    print(f"\n  saved {final//1_000_000} MB" + ("" if not total or final >= total else f" (INCOMPLETE, expected {total//1_000_000} MB) — re-run"))


def needed_names():
    return {n for names in PORTWATCH_NAMES.values() for n in names}


def build_rows():
    """portname -> {date_str: day_dict} for the ports we need."""
    want = needed_names()
    by_port = {}
    with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            name = row.get("portname")
            if name not in want:
                continue
            date = (row.get("date") or "").replace("/", "-")
            if len(date) != 10:
                continue
            day = {"date": date}
            for field in NUMERIC_FIELDS:
                v = row.get(field)
                try:
                    day[field] = float(v) if v not in (None, "") else None
                except ValueError:
                    day[field] = None
            by_port.setdefault(name, {})[date] = day
    return by_port


def run():
    download(refresh=FLAGS.refresh)
    by_port = build_rows()
    print(f"Filtered to {len(by_port)} PortWatch ports: "
          + ", ".join(f"{k}({len(v)}d)" for k, v in sorted(by_port.items())))

    sb = get_client()
    seaports = sb.table("seaports").select("name,seaport_id").execute().data
    saved = skipped = failed = 0
    for port in seaports:
        pw_names = PORTWATCH_NAMES.get(port["name"])
        if not pw_names:
            continue
        merged = {}
        for pw in pw_names:
            merged.update(by_port.get(pw, {}))
        if not merged:
            failed += 1
            print(f"  no data for {port['name']} ({pw_names})")
            continue
        days = [merged[d] for d in sorted(merged)]
        data_through = days[-1]["date"]
        result = save_signal(
            sb, "port_congestion", "imf-portwatch", port["name"],
            {"seaport": port["name"], "portwatch_names": pw_names,
             "data_through": data_through, "days": days},
            as_of_date=datetime.strptime(data_through, "%Y-%m-%d"),
            seaport_id=port["seaport_id"],
        )
        saved += result == "saved"
        skipped += result == "skipped"
        print(f"  {port['name']:22s} {len(days):5d} days (through {data_through}) -> {result}")
    print(f"PortWatch bulk: saved={saved}, skipped={skipped}, failed={failed}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="force re-download")
    FLAGS = ap.parse_args()
    run()
