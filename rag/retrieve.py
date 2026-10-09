"""
RunOut v2 — RAG retrieval
Location: rag/retrieve.py

search_knowledge() embeds the question and asks the database for the closest
chunks. The caller's ROLE is applied inside the database query, so a
distributor can never receive an internal document.

IMPORTANT FOR THE AGENT / BACKEND
  The role must come from the logged-in user (backend), never from the model.
  Use knowledge_tool_for(role) to build the tool the agent sees; it exposes only
  (query, doc_types, market) and has the role locked in.

Usage (command line test)
    python rag/retrieve.py "who approves a $800 expedite?" --role ops
    python rag/retrieve.py "how do I make a claim?" --role distributor
"""

import os
import sys
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

ROLES = {"ops", "warehouse", "distributor", "data"}
DEFAULT_K = 5
DEFAULT_MIN_SIMILARITY = 0.30


def search_knowledge(query, caller_role, doc_types=None, market=None,
                     k=DEFAULT_K, min_similarity=DEFAULT_MIN_SIMILARITY, sb=None):
    """Return a list of dicts: doc_code, title, version, section, content, doc_type, similarity.
    An empty list means nothing relevant was found; the agent must say so and not guess."""
    if caller_role not in ROLES:
        raise ValueError(f"caller_role must be one of {sorted(ROLES)}")
    if not query or not query.strip():
        return []
    from rag.embeddings import embed
    if sb is None:
        from rag.db import get_service_client
        sb = get_service_client()
    vector = embed([query.strip()])[0]
    rows = sb.rpc("match_knowledge", {
        "query_embedding": vector,
        "caller_role": caller_role,
        "match_count": k,
        "filter_types": doc_types,
        "filter_market": market,
        "min_similarity": min_similarity,
    }).execute().data
    return [{
        "doc_code": r["doc_code"], "title": r["title"], "version": r["version"],
        "section": r["section"], "content": r["content"], "doc_type": r["doc_type"],
        "similarity": round(r["similarity"], 4),
    } for r in rows]


def knowledge_tool_for(caller_role, sb=None):
    """Build the function the agent calls. The role is fixed here, not chosen by the model."""
    def search_knowledge_tool(query: str, doc_types: list = None, market: str = None):
        """Search RunOut's internal policies, procedures, standards and glossaries.
        Use for questions about what to do, who may approve something, definitions and
        regional background. Do NOT use for order, stock or forecast numbers (use SQL tools).
        Returns passages with doc_code and version; cite them. Empty result means no guidance found."""
        return search_knowledge(query, caller_role, doc_types=doc_types, market=market, sb=sb)
    return search_knowledge_tool


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("--role", required=True, choices=sorted(ROLES))
    ap.add_argument("--k", type=int, default=DEFAULT_K)
    args = ap.parse_args()
    hits = search_knowledge(args.query, args.role, k=args.k)
    if not hits:
        print("No relevant guidance found.")
    for h in hits:
        print(f"\n[{h['similarity']:.3f}] {h['doc_code']} v{h['version']}  |  {h['section']}")
        print(h["content"][:300].replace("\n", " ") + " ...")