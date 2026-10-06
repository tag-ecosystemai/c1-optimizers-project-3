"""Layer 6 - embeds chunks locally (HuggingFace) and upserts them into pgvector.

Run from the repo root:
    python -m rag.embed --init-only            # create table/indexes
    python -m rag.embed                        # ingest data/rag_corpus
    python -m rag.embed --rebuild              # wipe corpus rows (NOT system_generated) first
    python -m rag.embed --query "demurrage free time"
"""
from __future__ import annotations

import argparse
import sys
import warnings
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import numpy as np
from tqdm import tqdm

warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=UserWarning)

from rag.config import CORPUS_DIR, EMBED_DIM, EMBED_MODEL


@lru_cache(maxsize=1)
def get_embedder(model_name: str = EMBED_MODEL):
    """Local HuggingFace embedder (cached). Normalized -> cosine similarity."""
    from langchain_huggingface import HuggingFaceEmbeddings
    print(f" Loading embedding model '{model_name}'...")
    return HuggingFaceEmbeddings(
        model_name=model_name,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True, "batch_size": 32},
    )


def embed_texts(texts: List[str], batch_size: int = 64) -> np.ndarray:
    emb = get_embedder()
    vecs: List[List[float]] = []
    batches = range(0, len(texts), batch_size)
    for i in tqdm(batches, desc="Embedding", unit="batch", disable=len(texts) <= batch_size):
        vecs.extend(emb.embed_documents(texts[i:i + batch_size]))
    arr = np.asarray(vecs, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] != EMBED_DIM:
        raise ValueError(f"Embedding dim {arr.shape} != EMBED_DIM={EMBED_DIM}; "
                         "update config.py and db/rag_schema.sql together.")
    return arr


def embed_query(text: str) -> np.ndarray:
    return np.asarray(get_embedder().embed_query(text), dtype=np.float32)


def ingest(folder: Optional[Path] = None, rebuild: bool = False) -> int:
    """Chunk -> embed -> upsert. Re-ingesting a file replaces its old chunks."""
    from rag import store
    from rag.chunk import get_document_chunks

    folder = Path(folder) if folder else CORPUS_DIR
    store.ensure_schema()

    chunks = get_document_chunks(folder)
    if not chunks:
        print(" Nothing to ingest.")
        return 0

    vectors = embed_texts([c.page_content for c in chunks])
    rows = [store.chunk_to_row(c, v) for c, v in zip(chunks, vectors)]

    with store.get_conn() as conn:
        if rebuild:
            store.delete_non_system(conn)
        store.delete_by_source_paths(conn, {c.metadata["source_path"] for c in chunks})
        n = store.upsert_rows(conn, rows)

    print(f"\n Ingested {n} chunks into pgvector. Totals: {store.stats()}")
    return n


def _sanity_check(query: str) -> None:
    from rag.retrieve import search_knowledge
    print(f"\n Sanity check: '{query}'")
    for h in search_knowledge(query, k=3):
        print(f"  {h.score:.4f} cos={h.cosine:.2f}  {h.citation}")
        print(f"     {h.content[:160]!r}")


def main(argv: Optional[list] = None) -> int:
    ap = argparse.ArgumentParser(description="Ingest RAG corpus into pgvector")
    ap.add_argument("--folder", type=Path, default=CORPUS_DIR)
    ap.add_argument("--rebuild", action="store_true",
                    help="delete public/template_derived rows first (system_generated is kept)")
    ap.add_argument("--init-only", action="store_true", help="only create schema")
    ap.add_argument("--query", help="run a retrieval sanity check after ingesting")
    args = ap.parse_args(argv)

    if args.init_only:
        from rag import store
        store.ensure_schema()
        print(" Schema ready.")
        return 0

    if not args.folder.exists():
        print(f" Corpus folder '{args.folder}' does not exist.")
        return 1

    ingest(args.folder, rebuild=args.rebuild)
    _sanity_check(args.query or "MSC bill of lading demurrage")
    return 0


if __name__ == "__main__":
    sys.exit(main())
