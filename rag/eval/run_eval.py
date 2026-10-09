"""
RunOut v2 — RAG evaluation
Location: rag/eval/run_eval.py

Runs every question in questions.jsonl through search_knowledge() and reports:
  - hit@k  : share of questions whose expected document is in the top k results
  - MRR    : mean reciprocal rank of the first expected document
  - ACCESS VIOLATIONS: any result the asking role is NOT allowed to read.
    This must be 0. The script exits with an error if it is not.

The allowed audience of each document is read from the front matter of the
Markdown files in rag/docs/, independently of the database, so this test
catches a broken filter.

Usage
    python rag/eval/run_eval.py
    python rag/eval/run_eval.py --k 5 --min-similarity 0.25
    python rag/eval/run_eval.py --mlflow        # also log metrics to MLflow on DagsHub

DagsHub: logs in exactly like ml/m2_consumption/train.py does, with
dagshub.init(repo_owner='RunOut', repo_name='runout-ml', mlflow=True).
So whatever DagsHub username/token setup works for train.py works here.
"""

import os
import re
import sys
import json
import glob
import argparse

import yaml

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))

from rag.retrieve import search_knowledge, DEFAULT_MIN_SIMILARITY  # noqa: E402

FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)


def audience_map(docs_dir):
    out = {}
    for path in glob.glob(os.path.join(docs_dir, "**", "*.md"), recursive=True):
        m = FM_RE.match(open(path, encoding="utf-8").read())
        if m:
            meta = yaml.safe_load(m.group(1)) or {}
            if meta.get("doc_id"):
                out[meta["doc_id"]] = meta.get("audience", [])
    return out


def init_mlflow():
    import dagshub
    dagshub.init(repo_owner="RunOut", repo_name="runout-ml", mlflow=True)
    import mlflow
    return mlflow


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--questions", default=os.path.join(HERE, "questions.jsonl"))
    ap.add_argument("--docs", default=os.path.join(HERE, "..", "docs"))
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--min-similarity", type=float, default=DEFAULT_MIN_SIMILARITY)
    ap.add_argument("--mlflow", action="store_true")
    args = ap.parse_args()

    from rag.db import get_service_client
    sb = get_service_client()
    aud = audience_map(args.docs)
    questions = [json.loads(line) for line in open(args.questions) if line.strip()]

    scored, hits, rr_sum = 0, 0, 0.0
    violations, misses = [], []

    for q in questions:
        results = search_knowledge(q["q"], q["role"], k=args.k,
                                   min_similarity=args.min_similarity, sb=sb)
        codes = [r["doc_code"] for r in results]

        for c in codes:
            if c in aud and q["role"] not in aud[c]:
                violations.append((q["role"], q["q"], c))

        expected = q.get("expected_any") or []
        if expected:
            scored += 1
            rank = next((i for i, c in enumerate(codes) if c in expected), None)
            if rank is not None:
                hits += 1
                rr_sum += 1.0 / (rank + 1)
            else:
                misses.append((q["role"], q["q"], expected, codes))

    hit_rate = hits / scored if scored else 0.0
    mrr = rr_sum / scored if scored else 0.0

    print("=" * 60)
    print(f"Questions: {len(questions)} ({scored} with expected documents, "
          f"{len(questions) - scored} access-only)")
    print(f"hit@{args.k}: {hit_rate:.1%}   (target 85% or better)")
    print(f"MRR:    {mrr:.3f}")
    print(f"Access violations: {len(violations)}   (must be 0)")
    print("=" * 60)

    if misses:
        print("\nMISSES (expected document not in results):")
        for role, q, exp, got in misses:
            print(f"  [{role}] {q}\n      expected {exp}  got {got}")
    if violations:
        print("\nACCESS VIOLATIONS:")
        for role, q, code in violations:
            print(f"  [{role}] '{q}' returned {code}, which this role may not read")

    if args.mlflow:
        mlflow = init_mlflow()
        mlflow.set_experiment("rag-eval")
        with mlflow.start_run():
            mlflow.log_params({"k": args.k, "min_similarity": args.min_similarity,
                               "questions": len(questions)})
            mlflow.log_metrics({"hit_rate": hit_rate, "mrr": mrr,
                                "access_violations": len(violations)})

    if violations:
        sys.exit(1)


if __name__ == "__main__":
    main()