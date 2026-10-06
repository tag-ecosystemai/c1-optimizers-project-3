"""Agent tool: search_knowledge. Thin wrapper over rag.retrieve so the LangGraph
agents get a plain JSON-serialisable result with provenance-labelled citations.
Queries the DB only - no live calls."""
from typing import List, Optional

from rag.retrieve import search_knowledge as _search


def search_knowledge(query: str,
                     k: int = 5,
                     provenance: Optional[List[str]] = None,
                     source_org: Optional[str] = None) -> dict:
    hits = _search(query, k=k, provenance=provenance, source_org=source_org, min_cosine=0.2)
    return {
        "query": query,
        "n_results": len(hits),
        "results": [h.to_dict() for h in hits],
        "note": None if hits else "No relevant knowledge found. Do not invent an answer.",
    }
