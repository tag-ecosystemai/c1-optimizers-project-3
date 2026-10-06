"""Layer 6 - hybrid retrieval: pgvector cosine search + Postgres full-text search,
merged with Reciprocal Rank Fusion (RRF). Every hit carries its provenance label."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import List, Optional, Sequence

from psycopg.rows import dict_row

from rag.embed import embed_query
from rag.provenance import citation_label
from rag.store import get_conn

RRF_K = 60

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from",
    "how", "i", "if", "in", "is", "it", "of", "on", "or", "our", "the", "to", "what",
    "when", "which", "who", "will", "with", "we", "my", "this", "that", "there",
}


@dataclass
class RetrievedChunk:
    chunk_id: str
    content: str
    score: float            # RRF score (higher = better)
    cosine: float           # raw semantic similarity, useful for "no good evidence" checks
    source: str
    source_path: str
    source_org: Optional[str]
    page: Optional[int]
    section: Optional[str]
    provenance: str
    vector_rank: Optional[int]
    text_rank: Optional[int]

    @property
    def citation(self) -> str:
        return citation_label(self.source, self.provenance, self.page, self.source_org)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["citation"] = self.citation
        return d


def _or_tsquery(query: str) -> str:
    """'what is demurrage free time' -> 'demurrage | free | time' (alnum only => injection-safe)."""
    toks = [t for t in re.findall(r"[a-z0-9]+", query.lower()) if t not in _STOPWORDS and len(t) > 1]
    return " | ".join(dict.fromkeys(toks))


_FILTER = ("(%(prov)s::text[] IS NULL OR provenance = ANY(%(prov)s::text[])) "
           "AND (%(org)s::text IS NULL OR source_org = %(org)s::text)")

_SQL = f"""
WITH v AS (
    SELECT chunk_id, ROW_NUMBER() OVER (ORDER BY embedding <=> %(qv)s) AS rnk
    FROM rag_chunks
    WHERE {_FILTER}
    ORDER BY embedding <=> %(qv)s
    LIMIT %(cand)s
),
f AS (
    SELECT chunk_id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, q) DESC) AS rnk
    FROM rag_chunks, to_tsquery('english', %(tsq)s) AS q
    WHERE tsv @@ q AND {_FILTER}
    ORDER BY ts_rank_cd(tsv, q) DESC
    LIMIT %(cand)s
)
SELECT c.chunk_id, c.content, c.source, c.source_path, c.source_org, c.page, c.section,
       c.provenance,
       1 - (c.embedding <=> %(qv)s) AS cosine,
       COALESCE(1.0 / (%(rrf)s::int + v.rnk), 0) + COALESCE(1.0 / (%(rrf)s::int + f.rnk), 0) AS score,
       v.rnk AS vrank, f.rnk AS frank
FROM v
FULL OUTER JOIN f ON v.chunk_id = f.chunk_id
JOIN rag_chunks c ON c.chunk_id = COALESCE(v.chunk_id, f.chunk_id)
ORDER BY score DESC
LIMIT %(k)s
"""


def search_knowledge(query: str,
                     k: int = 5,
                     provenance: Optional[Sequence[str]] = None,
                     source_org: Optional[str] = None,
                     candidates: int = 30,
                     min_cosine: Optional[float] = None) -> List[RetrievedChunk]:
    """Hybrid search.

    provenance : restrict to e.g. ["public"] or ["system_generated"]
    source_org : restrict to e.g. "MSC", "Expeditors", "US CBP"
    min_cosine : drop hits whose semantic similarity is below this (e.g. 0.25)
    """
    if not query.strip():
        return []
    params = {
        "qv": embed_query(query),
        "tsq": _or_tsquery(query),
        "prov": list(provenance) if provenance else None,
        "org": source_org,
        "cand": candidates,
        "rrf": RRF_K,
        "k": k,
    }
    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            rows = cur.execute(_SQL, params).fetchall()

    hits = [RetrievedChunk(
        chunk_id=r["chunk_id"], content=r["content"], score=float(r["score"]),
        cosine=float(r["cosine"]), source=r["source"], source_path=r["source_path"],
        source_org=r["source_org"], page=r["page"], section=r["section"],
        provenance=r["provenance"], vector_rank=r["vrank"], text_rank=r["frank"],
    ) for r in rows]
    if min_cosine is not None:
        hits = [h for h in hits if h.cosine >= min_cosine]
    return hits


def format_for_prompt(hits: List[RetrievedChunk]) -> str:
    """Numbered, provenance-labelled context block for LLM prompts."""
    return "\n\n".join(f"[{i}] {h.citation}\n{h.content}" for i, h in enumerate(hits, 1))


if __name__ == "__main__":
    import sys
    q = " ".join(sys.argv[1:]) or "demurrage and detention charges"
    for h in search_knowledge(q):
        print(f"{h.score:.4f} cos={h.cosine:.2f} {h.citation}\n   {h.content[:200]!r}\n")
