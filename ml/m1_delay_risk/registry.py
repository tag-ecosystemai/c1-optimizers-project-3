"""Load the M1 champion from the DagsHub MLflow registry (alias 'champion').
The registered model versions carry two tags set by the registration script: `bundle_run_id` (the run that stores the full
bundle m1_champions.pkl: models + region_levels + feature_names) and `model_version`. The registry is the source of truth;
a copy of the last good download is kept locally so scoring still works if DagsHub is unreachable."""
import os
import time
import pickle

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "artifacts", "registry_cache")
REG_NAME, CLF_NAME, ALIAS = "runout-m1-delay-regressor", "runout-m1-late-classifier", "champion"
EXPERIMENT = "m1-delay-dataco"
_state = {"init": False, "art": None}


def _client():
    import dagshub
    import mlflow
    from mlflow.tracking import MlflowClient
    if not _state["init"]:
        dagshub.init(repo_owner="RunOut", repo_name="runout-ml", mlflow=True)
        _state["init"] = True
    return mlflow, MlflowClient()


def champion_info():
    """Which registered versions currently hold the 'champion' alias."""
    _, c = _client()
    out = {}
    for key, name in (("regressor", REG_NAME), ("classifier", CLF_NAME)):
        mv = c.get_model_version_by_alias(name, ALIAS)
        out[key] = {"registered_model": name, "version": mv.version, "run_id": mv.run_id, "tags": dict(mv.tags or {})}
    return out


def recent_runs(n=20):
    """Latest runs of the M1 experiment with their metrics (for the observability page)."""
    import datetime as dt
    _, c = _client()
    exp = c.get_experiment_by_name(EXPERIMENT)
    if not exp:
        return []
    rows = c.search_runs([exp.experiment_id], order_by=["attributes.start_time DESC"], max_results=n)
    return [{"run_id": r.info.run_id, "name": r.data.tags.get("mlflow.runName"), "status": r.info.status,
             "started_at": dt.datetime.fromtimestamp(r.info.start_time / 1000, dt.timezone.utc).isoformat(),
             "metrics": {k: round(v, 4) for k, v in r.data.metrics.items()},
             "url": f"https://dagshub.com/RunOut/runout-ml.mlflow/#/experiments/{exp.experiment_id}/runs/{r.info.run_id}"}
            for r in rows]


def load_registry_artifact(refresh=False):
    """The same dict train.py saves (regressor, classifier, region_levels, feature_names, model_version, split...),
    plus art['registry'] describing where it came from. Cached in memory after the first call."""
    if _state["art"] is not None and not refresh:
        return _state["art"]
    marker = os.path.join(CACHE_DIR, "LAST_GOOD")
    try:
        mlflow, c = _client()
        mv = c.get_model_version_by_alias(REG_NAME, ALIAS)
        run_id = (mv.tags or {}).get("bundle_run_id")
        if not run_id:
            raise RuntimeError("the champion version has no bundle_run_id tag")
        dst = os.path.join(CACHE_DIR, run_id)
        os.makedirs(dst, exist_ok=True)
        path = mlflow.artifacts.download_artifacts(run_id=run_id, artifact_path="m1_champions.pkl", dst_path=dst)
        with open(path, "rb") as fh:
            art = pickle.load(fh)
        art["registry"] = {"source": "mlflow registry", "registered_model": REG_NAME, "alias": ALIAS, "version": mv.version,
                           "bundle_run_id": run_id, "loaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        with open(marker, "w") as fh:
            fh.write(path)
    except Exception as e:
        if not os.path.exists(marker):
            raise
        path = open(marker).read().strip()
        with open(path, "rb") as fh:
            art = pickle.load(fh)
        art["registry"] = {"source": "local cache of the last registry download", "error": f"{type(e).__name__}: {str(e)[:120]}"}
    _state["art"] = art
    return art