"""
RunOut — Wikipedia Current Events news fetcher (v2)
Location: ingestion/news_wikipedia.py

Fetches Wikipedia Current Events daily pages (which DO exist for each
day going back to ~2005), scans for mentions of our ports/terms,
scores severity via keyword matching, and writes structured news
signals to the DB.

Daily pages URL format:
  https://en.wikipedia.org/wiki/Portal:Current_events/YYYY_Month_DD
  e.g. February 1 2024 = Portal:Current_events/2024_February_1

No API key needed. Very generous rate limits in practice.

Severity keywords:
  0.9 — strike, closure, shutdown, accident, collision, fire, explosion
  0.7 — congestion, delay, disruption, backlog, shortage
  0.5 — protest, labour, storm, typhoon, hurricane, flood, earthquake
  0.3 — slowdown, maintenance, upgrade
 -0.2 — record, surge, growth, investment

Usage:
    python ingestion/news_wikipedia.py
    python ingestion/news_wikipedia.py --start 2023-01 --end 2026-09

Dependencies: urllib (stdlib)
"""

import os
import re
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
from datetime import datetime, date, timezone, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from common.client import get_client
from common.db_writer import save_signal

MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]

WATCH_TERMS = [
    "Yantian", "Shenzhen", "China",
    "Port Klang", "Malaysia",
    "Valencia", "Spain",
    "Long Beach", "Los Angeles",
    "Newark", "New York", "New Jersey",
    "Shanghai", "Ningbo",
    "Tacoma", "Norfolk",
]

SEVERITY_KEYWORDS = [
    (0.9, ["strike", "closure", "shutdown", "accident", "collision", "fire", "explosion",
           "lockdown", "quarantine", "bankrupt", "collapse"]),
    (0.7, ["congestion", "delay", "disruption", "backlog", "shortage", "bottleneck",
           "shortfall", "crisis"]),
    (0.5, ["protest", "labour", "storm", "typhoon", "hurricane", "flood", "earthquake",
           "tsunami", "volcano", "wildfire"]),
    (0.3, ["slowdown", "maintenance", "upgrade", "expansion", "renovation",
           "inspection", "regulation"]),
    (-0.2, ["record", "surge", "growth", "investment", "expansion", "modernisation"]),
]


def fetch_day_text(year, month, day, retries=2):
    """Fetch raw wikitext of one day's current events page."""
    month_name = MONTH_NAMES[month]
    page = f"Portal:Current_events/{year}_{month_name}_{day}"
    url = f"https://en.wikipedia.org/w/index.php?title={page}&action=raw"
    req = urllib.request.Request(url, headers={"User-Agent": "RunOut/1.0"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode("utf-8")
                # If it's a redirect, follow it once
                if text.startswith("#REDIRECT"):
                    m = re.search(r"\[\[(.+?)\]\]", text)
                    if m:
                        redirect = m.group(1).replace(" ", "_")
                        url2 = f"https://en.wikipedia.org/w/index.php?title={redirect}&action=raw"
                        req2 = urllib.request.Request(url2, headers={"User-Agent": "RunOut/1.0"})
                        with urllib.request.urlopen(req2, timeout=15) as resp2:
                            text = resp2.read().decode("utf-8")
                return text
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ""
            if e.code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            return ""
        except Exception:
            time.sleep(2)
            continue
    return ""


def score_severity(text):
    """Score text 0-1 for disruption severity."""
    text_lower = text.lower()
    max_score = 0.0
    for score, keywords in SEVERITY_KEYWORDS:
        for kw in keywords:
            if kw in text_lower:
                max_score = max(max_score, score)
    return max_score


def run():
    sb = get_client()

    # Parse date range
    now = datetime.now(timezone.utc)
    if FLAGS.start:
        sy, sm = FLAGS.start.split("-")
        start_y, start_m = int(sy), int(sm)
    else:
        start_y, start_m = 2023, 1
    if FLAGS.end:
        ey, em = FLAGS.end.split("-")
        end_y, end_m = int(ey), int(em)
    else:
        end_y, end_m = now.year, now.month

    # Scan day by day (but batch signals per month for dedupe)
    saved, skipped, failed = 0, 0, 0
    d = date(start_y, start_m, 1)
    end_date = date(end_y, end_m, 1)

    # Track per month: {port_term: {events: [], severity: max}}
    monthly = defaultdict(lambda: {"events": [], "severity": 0.0})

    while d <= end_date:
        # Only scan one day per week — that's enough for current events coverage
        # We pick: 1st, 7th, 14th, 21st of each month
        if d.day in (1, 7, 14, 21):
            print(f"  {d.isoformat()} ...", end=" ")
            text = fetch_day_text(d.year, d.month, d.day)
            if text:
                print(f"{len(text)} chars")
                events_raw = re.split(r"\n\s*\n", text)
                for event in events_raw:
                    event = event.strip()
                    if len(event) < 30:
                        continue
                    event_lower = event.lower()
                    for term in WATCH_TERMS:
                        if term.lower() in event_lower:
                            key = f"{d.year}-{d.month:02d}|{term}"
                            monthly[key]["events"].append(event[:200])
                            monthly[key]["severity"] = max(
                                monthly[key]["severity"], score_severity(event))
            else:
                print("empty")
        d += timedelta(days=1)

    # Write one signal per (month, term)
    for key, data in monthly.items():
        ym, term = key.split("|", 1)
        year, month = ym.split("-")
        yr, mo = int(year), int(month)
        if not data["events"]:
            continue
        payload = {
            "source": "wikipedia-current-events",
            "term": term,
            "year": yr,
            "month": mo,
            "events": data["events"][:10],
            "event_count": len(data["events"]),
            "severity_score": round(data["severity"], 3),
        }
        signal_date = datetime(yr, mo, 1, tzinfo=timezone.utc)
        result = save_signal(
            sb, "news", "wikipedia-current-events", term, payload,
            as_of_date=signal_date,
        )
        if result == "saved":
            saved += 1
        else:
            skipped += 1

    print(f"\nDone. Signals saved: {saved}, skipped: {skipped}, failed: {failed}")
    if saved:
        print(f"Events collected for {len(monthly)} term-months")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=None, help="YYYY-MM start month (default 2023-01)")
    ap.add_argument("--end", default=None, help="YYYY-MM end month (default current)")
    FLAGS = ap.parse_args()
    run()