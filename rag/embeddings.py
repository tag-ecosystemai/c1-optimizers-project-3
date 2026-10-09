"""
RunOut v2 — Embeddings
Location: rag/embeddings.py

One function, embed(), used by both ingestion and retrieval. The provider is
chosen with an environment variable so we can switch without touching code.

The database column is vector(1536). text-embedding-3-small returns 1536
numbers by default, so no extra settings are needed. Vectors from different
models cannot be compared, so the model name is stored with every chunk and
ingest.py re-embeds everything if the model changes.
"""

import os
import time

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

EMBED_DIM = 1536
BATCH = 16


def provider():
    return os.environ.get("EMBEDDING_PROVIDER", "azure").strip().lower()


def _need(name):
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Missing environment variable {name}. See the header of rag/embeddings.py.")
    return val


def model_name():
    """Identifier stored with each chunk, e.g. 'azure:text-embedding-3-small'."""
    if provider() == "azure":
        return "azure:" + os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", "<unset>")
    return "openai:" + os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")


_cached = None


def _client():
    global _cached
    if _cached is not None:
        return _cached
    p = provider()
    if p == "azure":
        from openai import AzureOpenAI
        client = AzureOpenAI(
            azure_endpoint=_need("AZURE_OPENAI_ENDPOINT"),
            api_key=_need("AZURE_OPENAI_API_KEY"),
            api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21"),
        )
        model = _need("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")      # deployment name, not model name
    elif p == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=_need("OPENAI_API_KEY"))
        model = os.environ.get("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    else:
        raise RuntimeError(f"EMBEDDING_PROVIDER must be 'azure' or 'openai', got '{p}'")
    _cached = (client, model)
    return _cached


def embed(texts):
    """Return one 1536-number vector per input text, in the same order."""
    import openai
    retryable = (openai.RateLimitError, openai.APIConnectionError,
                 openai.APITimeoutError, openai.InternalServerError)
    client, model = _client()
    out = []
    for i in range(0, len(texts), BATCH):
        batch = texts[i:i + BATCH]
        for attempt in range(5):
            try:
                resp = client.embeddings.create(model=model, input=batch)
                break
            except retryable:
                if attempt == 4:
                    raise
                time.sleep(2 ** attempt)
        for item in sorted(resp.data, key=lambda d: d.index):
            if len(item.embedding) != EMBED_DIM:
                raise ValueError(
                    f"Embedding has {len(item.embedding)} dimensions but the database column is "
                    f"vector({EMBED_DIM}). Use text-embedding-3-small or change the column.")
            out.append(item.embedding)
    return out