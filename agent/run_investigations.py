"""Investigate open incidents that have no probable_cause yet.
  python agent/run_investigations.py --as-of 2017-09-20 --limit 3
  python agent/run_investigations.py --incident-id 12      (re-run one, even if filled)"""
import os
import sys
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from dotenv import load_dotenv  # noqa: E402

load_dotenv()
from agent import llm  # noqa: E402
from agent.graph import investigate_incident  # noqa: E402
from backend.auth import data_client  # noqa: E402
from backend.incidents import _in  # noqa: E402
from agent import tracing

ap = argparse.ArgumentParser()
ap.add_argument("--as-of", default=os.environ.get("RUNOUT_AS_OF"))
ap.add_argument("--incident-id", type=int)
ap.add_argument("--limit", type=int, default=10)
ap.add_argument("--all", action="store_true", help="also re-run incidents that already have a cause")
a = ap.parse_args()

sb = data_client()
if a.incident_id:
    ids = [a.incident_id]
else:
    risks = sb.table("stock_risks").select("risk_id").eq("as_of_date", a.as_of).execute().data
    incs = _in(sb, "incidents", "incident_id,status,probable_cause,risk_id", "risk_id", [r["risk_id"] for r in risks])
    incs = [i for i in incs if i["status"] == "open" and (a.all or not i["probable_cause"])]
    ids = [i["incident_id"] for i in incs][:a.limit]
print(f"LLM configured: {llm.available()} (without it, deterministic fallback texts are used)")
print(f"Investigating {len(ids)} incident(s)...")
for iid in ids:
    r = investigate_incident(iid, a.as_of)
    print(f"  incident {iid}: {r['status']} | llm calls {r['usage'].get('calls', 0)} | flags {r['flags']} {r['error'] or ''}")

tracing.flush()