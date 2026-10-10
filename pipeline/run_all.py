"""One command per simulation date:  python pipeline/run_all.py --as-of 2017-12-15 [--investigate] [--limit 5]
Stages: inventory snapshot -> M2 forecast -> M1 predictions (scored if missing) -> cascade (+ incident shells) -> agent (optional).
Child scripts read RUNOUT_AS_OF from the environment. Each stage is logged to pipeline_runs."""
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

M1_VERSION = os.environ.get("M1_MODEL_VERSION", "m1-gradient_boosting-random_forest-20261008")
PY = sys.executable
sb = data_client()


def log(as_of, stage, status, t0, rows=None, detail=""):
    try:
        sb.table("pipeline_runs").insert({"as_of_date": as_of, "stage": stage, "status": status, "started_at": t0.isoformat(),
                                          "ended_at": dt.datetime.now(dt.timezone.utc).isoformat(), "rows": rows, "detail": detail[-500:]}).execute()
    except Exception as e:
        print(f"  (pipeline_runs write skipped: {str(e)[:80]})")


def run(script, args, env):
    r = subprocess.run([PY, os.path.join(ROOT, script)] + args, cwd=ROOT, env=env, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr)


def stage(as_of, name, script, args, env):
    t0 = dt.datetime.now(dt.timezone.utc)
    print(f"[{name}] running...")
    code, out = run(script, args, env)
    log(as_of, name, "ok" if code == 0 else "failed", t0, detail=out)
    if code != 0:
        print(out[-1500:])
        raise SystemExit(f"Stage '{name}' failed. Fix it and re-run (all stages are safe to repeat).")
    print(f"[{name}] ok. last lines: {out.strip()[-200:]!r}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--as-of", required=True)
    ap.add_argument("--investigate", action="store_true")
    ap.add_argument("--limit", type=int, default=5)
    ap.add_argument("--min-cover", type=float, default=0.5)
    ap.add_argument("--max-cover", type=float, default=4.0)
    
    a = ap.parse_args()
    d = dt.date.fromisoformat(a.as_of)
    env = {**os.environ, "RUNOUT_AS_OF": a.as_of}
    if a.as_of <= "2017-06-12":
        print("NOTE: this date is inside the M1/M2 training period; predictions there are IN-SAMPLE and must be labelled so.")

    stage(a.as_of, "inventory_snapshot", "cascade/build_inventory_snapshot.py",
         ["--min-cover", str(a.min_cover), "--max-cover", str(a.max_cover)], env)
    stage(a.as_of, "m2_forecast", "ml/m2_consumption/score.py", [], env)

    lo = (d - dt.timedelta(days=30)).isoformat()
    t0 = dt.datetime.now(dt.timezone.utc)
        # Skip scoring only if EVERY order in the 14-day window already has a prediction (a count > 0 is not enough:
    # an earlier run for a previous date leaves a partial window, which made the cascade see almost no orders).
    win_lo = (d - dt.timedelta(days=14)).isoformat()
    day_after = (d + dt.timedelta(days=1)).isoformat()
    n_orders = (sb.table("orders").select("order_id", count="exact").gte("order_date", win_lo).lt("order_date", day_after)
                .limit(1).execute().count or 0)
    have = (sb.table("predictions").select("prediction_id", count="exact").eq("model_version", M1_VERSION)
            .gte("as_of_date", win_lo).lte("as_of_date", a.as_of).limit(1).execute().count or 0)
    if n_orders and have >= n_orders:
        print(f"[m1_predictions] {have:,} predictions cover all {n_orders:,} orders in the window; skipping")
        log(a.as_of, "m1_predictions", "skipped", t0, rows=have)
    else:
        print(f"[m1_predictions] {have:,} predictions for {n_orders:,} orders in the window; scoring")
        cache = os.path.join(ROOT, "ml", "m1_delay_risk", "artifacts", "frame.pkl")
        extra = ["--cache", cache]
        stage(a.as_of, "m1_predictions", "ml/m1_delay_risk/score.py", ["--from-date", lo, "--to-date", a.as_of] + extra, env)
    stage(a.as_of, "cascade", "cascade/impact.py", ["--as-of", a.as_of, "--model-version", M1_VERSION], env)
    n_risk = sb.table("stock_risks").select("risk_id", count="exact").eq("as_of_date", a.as_of).limit(1).execute().count
    print(f"  stock risks for {a.as_of}: {n_risk}")

    if a.investigate:
        stage(a.as_of, "agent", "agent/run_investigations.py", ["--as-of", a.as_of, "--limit", str(a.limit)], env)
    print(f"\nDone for {a.as_of}.")


if __name__ == "__main__":
    main()