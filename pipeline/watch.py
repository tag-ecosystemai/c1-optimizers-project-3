"""Watches the orders table. When new orders arrive, runs the whole pipeline for the latest order date.
Usage:  python pipeline/watch.py                  (checks every 60s)
        python pipeline/watch.py --run-now        (also runs once at start)
        python pipeline/watch.py --as-of 2026-10-09 --interval 30"""
import os
import sys
import time
import argparse
import subprocess
import datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, ROOT)
from backend.auth import data_client          # noqa: E402
from cascade.db_utils import default_as_of    # noqa: E402


def order_count():
    return data_client().table("orders").select("order_id", count="exact").limit(1).execute().count or 0


def run_pipeline(as_of, limit):
    print(f"[{dt.datetime.now():%H:%M:%S}] running pipeline for {as_of} ...", flush=True)
    r = subprocess.run([sys.executable, os.path.join("pipeline", "run_all.py"), "--as-of", as_of, "--limit", str(limit)], cwd=ROOT)
    print(f"[{dt.datetime.now():%H:%M:%S}] pipeline finished (exit {r.returncode})", flush=True)


ap = argparse.ArgumentParser()
ap.add_argument("--interval", type=int, default=60)
ap.add_argument("--as-of")
ap.add_argument("--limit", type=int, default=200, help="how many incidents the agent analyses per run")
ap.add_argument("--run-now", action="store_true")
a = ap.parse_args()

last = order_count()
print(f"Watching orders (now {last:,}). Ctrl+C to stop.", flush=True)
if a.run_now:
    run_pipeline(a.as_of or str(default_as_of(data_client())), a.limit)
while True:
    time.sleep(a.interval)
    try:
        n = order_count()
        if n != last:
            print(f"New orders detected: {last:,} -> {n:,}", flush=True)
            last = n
            run_pipeline(a.as_of or str(default_as_of(data_client())), a.limit)
    except Exception as e:                     # a dropped connection must not stop the watcher
        print(f"(check failed, will retry: {type(e).__name__})", flush=True)