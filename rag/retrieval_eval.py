"""Retrieval evaluation: question -> expected source pairs.

    python -m evaluation.retrieval_eval [path/to/eval_set.json] [--k 5]

Each item: {"question": "...", "expected_sources": ["msc", "bill_of_lading"]}
A hit = any expected substring appears (case-insensitive) in the retrieved
chunk's file name or source_org. Reports hit@k and MRR.
"""
import argparse
import json
from pathlib import Path

from rag.retrieve import search_knowledge

DEFAULT_SET = Path(__file__).parent / "retrieval_eval_set.json"


def _matches(hit, expected) -> bool:
    hay = f"{hit.source} {hit.source_org or ''}".lower()
    return any(e.lower() in hay for e in expected)


def run(eval_path: Path, k: int) -> None:
    items = json.loads(eval_path.read_text())
    hits_at_k, rr_sum = 0, 0.0
    for item in items:
        results = search_knowledge(item["question"], k=k)
        rank = next((i for i, h in enumerate(results, 1)
                     if _matches(h, item["expected_sources"])), None)
        hits_at_k += rank is not None
        rr_sum += 1 / rank if rank else 0.0
        status = f"rank {rank}" if rank else "MISS"
        print(f"[{status:>7}] {item['question']}")
    n = len(items)
    print(f"\nhit@{k}: {hits_at_k}/{n} = {hits_at_k / n:.2%}   MRR: {rr_sum / n:.3f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("eval_set", nargs="?", type=Path, default=DEFAULT_SET)
    ap.add_argument("--k", type=int, default=5)
    a = ap.parse_args()
    run(a.eval_set, a.k)
