"""Run the whole pipeline only when new orders have arrived since the last check. Cheap when nothing is new.
  python pipeline/trigger_if_new.py           # normal
  python pipeline/trigger_if_new.py --force   # run anyway
Each successful check is recorded in pipeline_runs (stage 'watch_check', rows = order count at that time)."""
import os
import sys
import argparse
import subprocess
import datetime as dt

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
from dotenv import load_dotenv  # noqa: E402

load_dotenv()
from backend.auth import data_client  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--force", action="store_true")
ap.add_argument("--limit", type=int, default=60, help="how many incidents the agent analyses per run")
a = ap.parse_args()

sb = data_client()
now_count = sb.table("orders").select("order_id", count="exact").limit(1).execute().count
latest = sb.table("orders").select("order_date").order("order_date", desc=True).limit(1).execute().data
if not latest:
    raise SystemExit("No orders yet.")
as_of = str(latest[0]["order_date"])[:10]

last = (sb.table("pipeline_runs").select("rows").eq("stage", "watch_check").eq("status", "ok")
        .order("started_at", desc=True).limit(1).execute().data)
seen = last[0]["rows"] if last else None

if not a.force and seen is not None and now_count <= seen:
    print(f"No new orders ({now_count:,} orders, same as last run). Nothing to do.")
    raise SystemExit(0)

print(f"New orders detected: {now_count:,} now vs {seen if seen is not None else 'first run'} before. Running the pipeline for {as_of}...")
started = dt.datetime.now(dt.timezone.utc)
cmd = [sys.executable, os.path.join(ROOT, "pipeline", "run_all.py"), "--as-of", as_of,
       "--min-cover", "0.2", "--max-cover", "3", "--investigate", "--limit", str(a.limit)]
code = subprocess.run(cmd, cwd=ROOT).returncode
if code != 0:
    raise SystemExit("Pipeline failed. The order count was not recorded, so the next check will try again.")
sb.table("pipeline_runs").insert({"as_of_date": as_of, "stage": "watch_check", "status": "ok", "started_at": started.isoformat(),
                                  "ended_at": dt.datetime.now(dt.timezone.utc).isoformat(), "rows": now_count,
                                  "detail": f"orders {seen} -> {now_count}"}).execute()
print("Done.")