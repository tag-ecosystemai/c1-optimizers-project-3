"""Thin Postgres/pgvector access layer shared by ingestion, retrieval and write-back."""
from __future__ import annotations

import contextlib
from typing import Iterable, List

import numpy as np
import psycopg
from pgvector.psycopg import register_vector
from psycopg.types.json import Jsonb

from rag.config import REPO_ROOT, require_database_url

SCHEMA_FILE = REPO_ROOT / "db" / "rag_schema.sql"

_UPSERT_SQL = """
INSERT INTO rag_chunks
    (chunk_id, content, embedding, provenance, source, source_path,
     source_org, page, section, chunk_index, metadata)
VALUES
    (%(chunk_id)s, %(content)s, %(embedding)s, %(provenance)s, %(source)s, %(source_path)s,
     %(source_org)s, %(page)s, %(section)s, %(chunk_index)s, %(metadata)s)
ON CONFLICT (chunk_id) DO UPDATE SET
    content = EXCLUDED.content,
    embedding = EXCLUDED.embedding,
    provenance = EXCLUDED.provenance,
    source = EXCLUDED.source,
    source_path = EXCLUDED.source_path,
    source_org = EXCLUDED.source_org,
    page = EXCLUDED.page,
    section = EXCLUDED.section,
    chunk_index = EXCLUDED.chunk_index,
    metadata = EXCLUDED.metadata
"""


def _connect(register: bool = True) -> psycopg.Connection:
    # prepare_threshold=None -> safe with Supabase's transaction pooler (port 6543)
    conn = psycopg.connect(require_database_url(), prepare_threshold=None)
    if register:
        register_vector(conn)
    return conn


@contextlib.contextmanager
def get_conn():
    """Commits on success, rolls back on error, always closes."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ensure_schema() -> None:
    """Idempotently create the extension, table and indexes."""
    conn = _connect(register=False)   # extension may not exist yet
    try:
        conn.execute(SCHEMA_FILE.read_text())
        conn.commit()
    finally:
        conn.close()


def chunk_to_row(doc, vector: np.ndarray) -> dict:
    m = doc.metadata
    return {
        "chunk_id": m["chunk_id"],
        "content": doc.page_content,
        "embedding": vector,
        "provenance": m["provenance"],
        "source": m["source"],
        "source_path": m["source_path"],
        "source_org": m.get("source_org"),
        "page": m.get("page"),
        "section": m.get("section"),
        "chunk_index": m.get("chunk_index"),
        "metadata": Jsonb({"ocr_used": m.get("ocr_used", False)}),
    }


def upsert_rows(conn, rows: List[dict]) -> int:
    with conn.cursor() as cur:
        cur.executemany(_UPSERT_SQL, rows)
    return len(rows)


def delete_by_source_paths(conn, source_paths: Iterable[str]) -> None:
    paths = list(source_paths)
    if paths:
        conn.execute("DELETE FROM rag_chunks WHERE source_path = ANY(%s)", (paths,))


def delete_non_system(conn) -> None:
    """Wipe corpus-derived rows. NEVER touches system_generated (write-back history)."""
    conn.execute("DELETE FROM rag_chunks WHERE provenance <> 'system_generated'")


def stats() -> List[tuple]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT provenance, count(*) FROM rag_chunks GROUP BY provenance ORDER BY 1"
        ).fetchall()


if __name__ == "__main__":
    import sys
    if "--init" in sys.argv:
        ensure_schema()
        print("Schema ready.")
    print("Chunk counts:", stats())
