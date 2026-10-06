"""Central settings for the RAG layer (Layer 6)."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # python-dotenv is optional
    pass

REPO_ROOT = Path(__file__).resolve().parents[1]

# data/rag_corpus/{public,template_derived,system_generated}/...
CORPUS_DIR = Path(os.getenv("RAG_CORPUS_DIR", REPO_ROOT / "data" / "rag_corpus"))

EMBED_MODEL = os.getenv("RAG_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
# all-MiniLM-L6-v2 -> 384 dims. If you change the model, change vector(384)
# in db/rag_schema.sql and re-ingest everything.
EMBED_DIM = 384

CHUNK_SIZE = 800
CHUNK_OVERLAP = 150


def require_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Use your Supabase Postgres connection string "
            "(see .env.example)."
        )
    return url
