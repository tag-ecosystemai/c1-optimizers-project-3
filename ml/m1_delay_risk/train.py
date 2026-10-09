"""
RunOut v2 — M1 Training (delay prediction)
Location: ml/m1_delay_risk/train.py

Trains two heads on ml_order_features:
  - REGRESSOR  : label_delay_days  (actual days minus scheduled days)  -> predicted_delay_days
  - CLASSIFIER : label_late_risk   (1 = late)                          -> delay_risk_score

Time-based split on order_date (never random):
    train       order_date <= 2017-05-31
    validation  2017-06-01 .. 2017-08-31   (used to choose the champion and the F1 threshold)
    test        2017-09-01 onwards         (reported, never used for any choice)
NOTE: DataCo's markets are active in different months, so the TEST period contains only
Europe and Pacific Asia. Per-market results are reported; do not generalise beyond them.

Baselines are always run: the mean predictor and a shipping-mode-only model
(shipping mode is by far the strongest signal in DataCo). A model only counts as useful
if it beats the shipping-mode baseline.

Everything is logged to DagsHub MLflow (experiment "m1-delay-dataco"). Like train.py for M2,
if DagsHub cannot be initialised the script fails loudly. Use --no-mlflow to run without it.

Outputs
    ml/m1_delay_risk/artifacts/m1_champions.pkl   models + feature list used by score.py
    ml/m1_delay_risk/artifacts/m1_report.md       write-up (metrics, baselines, ablation, per-group)

Usage
    python ml/m1_delay_risk/train.py
    python ml/m1_delay_risk/train.py --fast --cache ml/m1_delay_risk/artifacts/frame.pkl
"""

import os
import sys
import json
import pickle
import argparse
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import (GradientBoostingClassifier, GradientBoostingRegressor,
                              RandomForestClassifier, RandomForestRegressor)
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix, f1_score,
                             mean_absolute_error, mean_squared_error, r2_score, roc_auc_score)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

try:
    from xgboost import XGBClassifier, XGBRegressor
    XGB = True
except ImportError:
    XGB = False

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from ml.m1_delay_risk.features import (ABLATION_COLUMNS, EXCLUDED_STATUSES, NUMERIC, TARGET_CLF,  # noqa: E402
                                       TARGET_REG, load_frame, make_matrix, region_levels_from)

HERE = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS = os.path.join(HERE, "artifacts")
EXPERIMENT = "m1-delay-dataco"
SKOPS_TRUSTED = [
    "sklearn.tree._tree.Tree", "xgboost.core.Booster",
    "xgboost.sklearn.XGBRegressor", "xgboost.sklearn.XGBClassifier",
]


# ----------------------------------------------------------------------
# Metrics
# ----------------------------------------------------------------------
def reg_metrics(y, p):
    return {"mae": float(mean_absolute_error(y, p)),
            "rmse": float(np.sqrt(mean_squared_error(y, p))),
            "r2": float(r2_score(y, p))}


def best_threshold(y, proba):
    grid = np.arange(0.05, 0.951, 0.01)
    scores = [f1_score(y, (proba >= t).astype(int), zero_division=0) for t in grid]
    return float(grid[int(np.argmax(scores))])


def clf_metrics(y, proba, thr):
    y = np.asarray(y)
    out = {"threshold": float(thr), "brier": float(brier_score_loss(y, proba))}
    both = len(np.unique(y)) == 2
    out["roc_auc"] = float(roc_auc_score(y, proba)) if both else float("nan")
    out["pr_auc"] = float(average_precision_score(y, proba)) if both else float("nan")
    pred = (proba >= thr).astype(int)
    out["f1"] = float(f1_score(y, pred, zero_division=0))
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    out.update({"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)})
    return out


# ----------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------
def regressors(fast):
    n = 60 if fast else 200
    d = {
        "linear_regression": LinearRegression(),
        "random_forest": RandomForestRegressor(n_estimators=n, max_depth=12, min_samples_leaf=20,
                                               n_jobs=-1, random_state=42),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=n, max_depth=4, learning_rate=0.05,
                                                       subsample=0.8, random_state=42,
                                                       loss="absolute_error"),
    }
    if XGB:
        d["xgboost"] = XGBRegressor(n_estimators=int(n * 1.5), max_depth=5, learning_rate=0.05,
                                    subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1,
                                    objective="reg:absoluteerror")
    return d


def classifiers(fast):
    n = 60 if fast else 200
    d = {
        "logistic_regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
        "random_forest": RandomForestClassifier(n_estimators=n, max_depth=12, min_samples_leaf=20,
                                                n_jobs=-1, random_state=42),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=n, max_depth=4, learning_rate=0.05,
                                                        subsample=0.8, random_state=42),
    }
    if XGB:
        d["xgboost"] = XGBClassifier(n_estimators=int(n * 1.5), max_depth=5, learning_rate=0.05,
                                     subsample=0.8, colsample_bytree=0.8, random_state=42, n_jobs=-1,
                                     eval_metric="logloss")
    return d


# ----------------------------------------------------------------------
# Experiment tracking (DagsHub MLflow)
# ----------------------------------------------------------------------
class Tracker:
    def __init__(self, enabled):
        self.enabled = enabled
        self.mlflow = None
        if enabled:
            import dagshub
            dagshub.init(repo_owner="RunOut", repo_name="runout-ml", mlflow=True)
            import mlflow
            import mlflow.sklearn  # noqa: F401
            self.mlflow = mlflow
            mlflow.set_experiment(EXPERIMENT)
            print("MLflow/DagsHub initialised.")

    def log(self, run_name, params, metrics, model=None, artifact=None):
        if not self.enabled:
            return None
        ml = self.mlflow
        clean = {k: float(v) for k, v in metrics.items()
                 if isinstance(v, (int, float, np.floating)) and not np.isnan(v)}
        with ml.start_run(run_name=run_name) as run:
            ml.log_params({k: str(v) for k, v in params.items()})
            ml.log_metrics(clean)
            if model is not None:
                try:
                    try:
                        info = ml.sklearn.log_model(model, name="model", skops_trusted_types=SKOPS_TRUSTED)         # MLflow 3
                    except TypeError:
                        info = ml.sklearn.log_model(model, "model", skops_trusted_types=SKOPS_TRUSTED)              # older MLflow
                    self.model_uris = getattr(self, "model_uris", {})
                    self.model_uris[run.info.run_id] = info.model_uri
                except Exception as e:   # the pickle artifact below is the source of truth for score.py
                    print(f"  (could not log sklearn model for {run_name}: {str(e)[:80]})")
            if artifact and os.path.exists(artifact):
                ml.log_artifact(artifact)
            return run.info.run_id

    def register(self, run_id, name, tags=None):
        if not (self.enabled and run_id):
            return
        try:
            from mlflow.tracking import MlflowClient
            uri = getattr(self, "model_uris", {}).get(run_id) or f"runs:/{run_id}/model"
            mv = self.mlflow.register_model(uri, name)
            client = MlflowClient()
            client.set_registered_model_alias(name, "champion", mv.version)
            for k, v in (tags or {}).items():
                client.set_model_version_tag(name, mv.version, k, str(v))
            print(f"  registered {name} v{mv.version} with alias 'champion'")
        except Exception as e:
            print(f"  (model registry step skipped for {name}: {str(e)[:100]})")


# ----------------------------------------------------------------------
# Reporting helpers
# ----------------------------------------------------------------------
def md_table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def f(x, nd=3):
    return "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{nd}f}"


def group_table(test, reg_pred, mode_reg_pred, proba, by):
    rows = []
    t = test.reset_index(drop=True)
    for g in sorted(t[by].unique()):
        m = (t[by] == g).to_numpy()
        y_reg, y_clf = t.loc[m, TARGET_REG].to_numpy(), t.loc[m, TARGET_CLF].to_numpy()
        auc = roc_auc_score(y_clf, proba[m]) if len(np.unique(y_clf)) == 2 else float("nan")
        rows.append([g, int(m.sum()), f(y_clf.mean(), 3),
                     f(mean_absolute_error(y_reg, reg_pred[m])),
                     f(mean_absolute_error(y_reg, mode_reg_pred[m])), f(auc)])
    return rows


# ----------------------------------------------------------------------
# Main training routine (takes a DataFrame so it can be tested without a database)
# ----------------------------------------------------------------------
def run_training(df, args, tracker):
    df = df.dropna(subset=[TARGET_REG, TARGET_CLF])
    df = df[~df["order_status"].isin(EXCLUDED_STATUSES)].reset_index(drop=True)
    if args.sample and args.sample < len(df):
        df = df.sample(args.sample, random_state=42).reset_index(drop=True)

    t_end, v_end = pd.Timestamp(args.train_end), pd.Timestamp(args.val_end)
    train = df[df["order_date"] <= t_end].reset_index(drop=True)
    val = df[(df["order_date"] > t_end) & (df["order_date"] <= v_end)].reset_index(drop=True)
    test = df[df["order_date"] > v_end].reset_index(drop=True)
    if min(len(train), len(val), len(test)) == 0:
        raise SystemExit(f"Empty split: train={len(train)} val={len(val)} test={len(test)}. Check the cut-off dates.")
    print(f"\nSplit: train {len(train):,} (to {args.train_end}) | validation {len(val):,} "
          f"(to {args.val_end}) | test {len(test):,}")
    print("Test markets:", test["market"].value_counts().to_dict())

    levels = region_levels_from(train)
    Xtr, Xva, Xte = (make_matrix(d, levels) for d in (train, val, test))
    cols = list(Xtr.columns)
    split_info = {"train_end": args.train_end, "val_end": args.val_end,
                  "train_rows": len(train), "val_rows": len(val), "test_rows": len(test)}
    base_params = {"feature_count": len(cols), **split_info}

    ytr_r, yva_r, yte_r = train[TARGET_REG].to_numpy(), val[TARGET_REG].to_numpy(), test[TARGET_REG].to_numpy()
    ytr_c, yva_c, yte_c = train[TARGET_CLF].to_numpy(), val[TARGET_CLF].to_numpy(), test[TARGET_CLF].to_numpy()

    results = {"regression": {}, "classification": {}, "baselines": {}}

    # ---------------- baselines ----------------
    mode_mean = train.groupby("shipping_mode_encoded")[TARGET_REG].mean()
    mode_late = train.groupby("shipping_mode_encoded")[TARGET_CLF].mean()
    mean_delay, base_rate = float(ytr_r.mean()), float(ytr_c.mean())

    def mode_reg(d): return d["shipping_mode_encoded"].map(mode_mean).fillna(mean_delay).to_numpy()
    def mode_clf(d): return d["shipping_mode_encoded"].map(mode_late).fillna(base_rate).to_numpy()

    baselines = {
        "mean_predictor": (lambda d: np.full(len(d), mean_delay), lambda d: np.full(len(d), base_rate)),
        "shipping_mode_only": (mode_reg, mode_clf),
    }
    print("\n--- Baselines ---")
    for name, (rf, cf) in baselines.items():
        thr = best_threshold(yva_c, cf(val))
        r = {"val": reg_metrics(yva_r, rf(val)), "test": reg_metrics(yte_r, rf(test))}
        c = {"val": clf_metrics(yva_c, cf(val), thr), "test": clf_metrics(yte_c, cf(test), thr)}
        results["baselines"][name] = {"regression": r, "classification": c}
        print(f"  {name:<20} reg val MAE {r['val']['mae']:.3f} | test MAE {r['test']['mae']:.3f} "
              f"| clf val AUC {f(c['val']['roc_auc'])} | test AUC {f(c['test']['roc_auc'])}")
        flat = {**{f"val_{k}": v for k, v in {**r['val'], **{'auc': c['val']['roc_auc']}}.items()},
                **{f"test_{k}": v for k, v in {**r['test'], **{'auc': c['test']['roc_auc']}}.items()}}
        tracker.log(f"m1-baseline-{name}", {"algorithm": name, **base_params}, flat)

    # ---------------- regressors ----------------
    print("\n--- Regressors (delay in days) ---")
    fitted_reg = {}
    for name, model in regressors(args.fast).items():
        print(f"Training {name}...")
        model.fit(Xtr, ytr_r)
        v, t = reg_metrics(yva_r, model.predict(Xva)), reg_metrics(yte_r, model.predict(Xte))
        results["regression"][name] = {"val": v, "test": t}
        fitted_reg[name] = model
        print(f"  val MAE {v['mae']:.3f} | test MAE {t['mae']:.3f} | test R2 {t['r2']:.3f}")
        tracker.log(f"m1-reg-{name}", {"algorithm": name, "task": "regression", **base_params},
                    {**{f"val_{k}": x for k, x in v.items()}, **{f"test_{k}": x for k, x in t.items()}}, model)
    best_reg_name = min(results["regression"], key=lambda n: results["regression"][n]["val"]["mae"])

    # ---------------- classifiers ----------------
    print("\n--- Classifiers (late or not) ---")
    fitted_clf = {}
    for name, model in classifiers(args.fast).items():
        print(f"Training {name}...")
        model.fit(Xtr, ytr_c)
        pv, pt = model.predict_proba(Xva)[:, 1], model.predict_proba(Xte)[:, 1]
        thr = best_threshold(yva_c, pv)
        v, t = clf_metrics(yva_c, pv, thr), clf_metrics(yte_c, pt, thr)
        results["classification"][name] = {"val": v, "test": t}
        fitted_clf[name] = model
        print(f"  val AUC {f(v['roc_auc'])} | test AUC {f(t['roc_auc'])} | test PR-AUC {f(t['pr_auc'])} "
              f"| F1@{thr:.2f} {f(t['f1'])}")
        tracker.log(f"m1-clf-{name}", {"algorithm": name, "task": "classification", **base_params},
                    {**{f"val_{k}": x for k, x in v.items()}, **{f"test_{k}": x for k, x in t.items()}}, model)
    best_clf_name = max(results["classification"],
                        key=lambda n: np.nan_to_num(results["classification"][n]["val"]["roc_auc"], nan=-1))

    reg, clf = fitted_reg[best_reg_name], fitted_clf[best_clf_name]
    thr = results["classification"][best_clf_name]["test"]["threshold"]
    print(f"\nChampions (chosen on VALIDATION): regressor = {best_reg_name}, classifier = {best_clf_name}")

    # ---------------- ablation ----------------
    keep = [c for c in cols if c not in ABLATION_COLUMNS]
    ra = clone(reg).fit(Xtr[keep], ytr_r)
    ca = clone(clf).fit(Xtr[keep], ytr_c)
    abl = {
        "removed": ABLATION_COLUMNS,
        "regression_test_mae": float(mean_absolute_error(yte_r, ra.predict(Xte[keep]))),
        "classification_test_auc": float(roc_auc_score(yte_c, ca.predict_proba(Xte[keep])[:, 1])),
    }
    results["ablation"] = abl
    champ_mae = results["regression"][best_reg_name]["test"]["mae"]
    champ_auc = results["classification"][best_clf_name]["test"]["roc_auc"]
    print(f"Ablation without {ABLATION_COLUMNS}: test MAE {abl['regression_test_mae']:.3f} "
          f"(with: {champ_mae:.3f}) | test AUC {abl['classification_test_auc']:.3f} (with: {champ_auc:.3f})")
    tracker.log("m1-ablation-no-total-no-profit", {"removed": ",".join(ABLATION_COLUMNS), **base_params},
                {"test_mae": abl["regression_test_mae"], "test_auc": abl["classification_test_auc"]})

    # ---------------- per-group breakdown on TEST ----------------
    reg_te = reg.predict(Xte)
    proba_te = clf.predict_proba(Xte)[:, 1]
    mode_te = mode_reg(test)
    by_mode = group_table(test, reg_te, mode_te, proba_te, "shipping_mode")
    by_market = group_table(test, reg_te, mode_te, proba_te, "market")

    # ---------------- save artifact ----------------
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    model_version = f"m1-{best_reg_name}-{best_clf_name}-{stamp}"
    os.makedirs(ARTIFACTS, exist_ok=True)
    art_path = os.path.join(ARTIFACTS, "m1_champions.pkl")
    with open(art_path, "wb") as fh:
        pickle.dump({
            "model_version": model_version,
            "regressor": reg, "regressor_name": best_reg_name,
            "classifier": clf, "classifier_name": best_clf_name,
            "feature_names": cols, "region_levels": levels, "threshold": thr,
            "trained_at": datetime.now(timezone.utc).isoformat(), "split": split_info,
        }, fh)
    print(f"\nSaved champions to {art_path}  (model_version = {model_version})")

    report = build_report(model_version, split_info, test, results, best_reg_name, best_clf_name,
                          by_mode, by_market)
    rep_path = os.path.join(ARTIFACTS, "m1_report.md")
    with open(rep_path, "w", encoding="utf-8") as fh:
        fh.write(report)
    with open(os.path.join(ARTIFACTS, "m1_metrics.json"), "w") as fh:
        json.dump(results, fh, indent=2, default=float)
    print(f"Wrote {rep_path}")

    champ_params = {"model_version": model_version, "regressor": best_reg_name,
                    "classifier": best_clf_name, **base_params}
    run_id = tracker.log("m1-champions", champ_params,
                         {"test_mae": champ_mae, "test_auc": champ_auc,
                          "baseline_mode_test_mae": results["baselines"]["shipping_mode_only"]["regression"]["test"]["mae"],
                          "baseline_mode_test_auc": results["baselines"]["shipping_mode_only"]["classification"]["test"]["roc_auc"]},
                         artifact=art_path)
    if args.register:
        r1 = tracker.log(f"m1-champion-regressor-{best_reg_name}", {"algorithm": best_reg_name}, {}, reg)
        r2 = tracker.log(f"m1-champion-classifier-{best_clf_name}", {"algorithm": best_clf_name}, {}, clf)
        tracker.register(r1, "runout-m1-delay-regressor", {"model_version": model_version, "bundle_run_id": run_id})
        tracker.register(r2, "runout-m1-late-classifier", {"model_version": model_version, "bundle_run_id": run_id})
    return results, model_version


def build_report(mv, split, test, res, rname, cname, by_mode, by_market):
    b = res["baselines"]
    lines = [f"# M1 Delay Model Report\n", f"Model version: `{mv}`\n",
             "## Setup",
             f"Time-based split on order date. Train to {split['train_end']} ({split['train_rows']:,} rows), "
             f"validation to {split['val_end']} ({split['val_rows']:,}), test after that ({split['test_rows']:,}). "
             "Champions were chosen on validation only. Cancelled and suspected-fraud orders are excluded.\n",
             "**Limitation:** the test period only contains these markets: "
             + ", ".join(f"{k} ({v:,})" for k, v in test['market'].value_counts().items())
             + ". Results say nothing about the other markets.\n",
             "## Regression (days of delay)"]
    rows = [[n, f(b[n]["regression"]["val"]["mae"]), f(b[n]["regression"]["test"]["mae"]),
             f(b[n]["regression"]["test"]["rmse"]), f(b[n]["regression"]["test"]["r2"]), "baseline"] for n in b]
    for n, r in res["regression"].items():
        rows.append([n + (" (champion)" if n == rname else ""), f(r["val"]["mae"]), f(r["test"]["mae"]),
                     f(r["test"]["rmse"]), f(r["test"]["r2"]), "model"])
    lines += [md_table(["Model", "Val MAE", "Test MAE", "Test RMSE", "Test R2", "Type"], rows), "",
              "## Classification (late or not)"]
    rows = [[n, f(b[n]["classification"]["val"]["roc_auc"]), f(b[n]["classification"]["test"]["roc_auc"]),
             f(b[n]["classification"]["test"]["pr_auc"]), f(b[n]["classification"]["test"]["f1"]), "baseline"] for n in b]
    for n, r in res["classification"].items():
        rows.append([n + (" (champion)" if n == cname else ""), f(r["val"]["roc_auc"]), f(r["test"]["roc_auc"]),
                     f(r["test"]["pr_auc"]), f(r["test"]["f1"]), "model"])
    lines += [md_table(["Model", "Val AUC", "Test AUC", "Test PR-AUC", "Test F1", "Type"], rows), ""]
    c = res["classification"][cname]["test"]
    lines += [f"Champion classifier at threshold {c['threshold']:.2f}: TN {c['tn']:,}, FP {c['fp']:,}, "
              f"FN {c['fn']:,}, TP {c['tp']:,}; Brier score {f(c['brier'])}.\n",
              "## Does the model beat the shipping-mode-only baseline?"]
    gain_mae = b["shipping_mode_only"]["regression"]["test"]["mae"] - res["regression"][rname]["test"]["mae"]
    gain_auc = res["classification"][cname]["test"]["roc_auc"] - b["shipping_mode_only"]["classification"]["test"]["roc_auc"]
    lines += [f"Test MAE improvement over the baseline: {gain_mae:+.3f} days. "
              f"Test AUC improvement: {gain_auc:+.3f}. "
              "If these are close to zero, say so plainly: the other features add little beyond shipping mode.\n",
              "## Ablation",
              f"Without {', '.join(res['ablation']['removed'])}: test MAE {f(res['ablation']['regression_test_mae'])}, "
              f"test AUC {f(res['ablation']['classification_test_auc'])}. "
              "If these barely change, those two features are not carrying the model.\n",
              "## Test results by shipping mode",
              md_table(["Shipping mode", "Orders", "Actual late rate", "Model MAE", "Mode-baseline MAE", "AUC"], by_mode), "",
              "## Test results by market",
              md_table(["Market", "Orders", "Actual late rate", "Model MAE", "Mode-baseline MAE", "AUC"], by_market), ""]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train-end", default="2017-05-31")
    ap.add_argument("--val-end", default="2017-08-31")
    ap.add_argument("--fast", action="store_true", help="fewer trees, for quick checks")
    ap.add_argument("--sample", type=int, default=0, help="use only N random rows (debugging)")
    ap.add_argument("--cache", default=None, help="pickle file to cache the loaded data")
    ap.add_argument("--no-mlflow", action="store_true")
    ap.add_argument("--register", action="store_true", help="also try the MLflow model registry")
    args = ap.parse_args()

    tracker = Tracker(enabled=not args.no_mlflow)
    from ingestion.common.client import get_client
    df = load_frame(get_client(), cache=args.cache)
    print(f"Total rows: {len(df):,} | order dates {df['order_date'].min().date()} to {df['order_date'].max().date()}")
    run_training(df, args, tracker)
    print("\nNext: python ml/m1_delay_risk/score.py")


if __name__ == "__main__":
    main()