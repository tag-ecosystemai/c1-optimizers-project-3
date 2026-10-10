-- Run once in the Supabase SQL Editor (after 002).
-- pgvector is already enabled in your project; this line is harmless if re-run.
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Document registry: one row per document version
CREATE TABLE IF NOT EXISTS knowledge_documents (
    doc_id           SERIAL PRIMARY KEY,
    doc_code         TEXT NOT NULL,                     -- e.g. RO-OPS-001
    slug             TEXT NOT NULL,
    title            TEXT NOT NULL,
    doc_type         TEXT NOT NULL,                     -- policy | procedure | standard | reference | glossary | regional_profile | case | external_reference
    classification   TEXT,                              -- Internal | Distributor-facing
    audience         TEXT[] NOT NULL,                   -- subset of {ops, warehouse, distributor, data}
    market           TEXT NOT NULL DEFAULT 'all',       -- all | USCA | Europe | LATAM | Pacific Asia | Africa
    version          TEXT NOT NULL,
    source           TEXT NOT NULL DEFAULT 'repo',      -- repo | upload
    source_path      TEXT,
    content_hash     TEXT,                              -- skip re-embedding unchanged documents
    status           TEXT NOT NULL DEFAULT 'published', -- draft | published | retired
    embedding_model  TEXT,
    uploaded_by      UUID,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (doc_code, version)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status ON knowledge_documents (status);

-- 2. Extend the existing chunks table
ALTER TABLE knowledge_chunks
    ADD COLUMN IF NOT EXISTS doc_id          INTEGER REFERENCES knowledge_documents(doc_id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS chunk_index     INTEGER,
    ADD COLUMN IF NOT EXISTS section         TEXT,
    ADD COLUMN IF NOT EXISTS audience        TEXT[],
    ADD COLUMN IF NOT EXISTS doc_type        TEXT,
    ADD COLUMN IF NOT EXISTS market          TEXT DEFAULT 'all',
    ADD COLUMN IF NOT EXISTS token_count     INTEGER,
    ADD COLUMN IF NOT EXISTS embedding_model TEXT;

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
    ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS knowledge_chunks_audience_idx ON knowledge_chunks USING gin (audience);
CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx      ON knowledge_chunks (doc_id);

-- 3. Search function. The access filter (caller_role = ANY(audience)) runs
--    INSIDE the query, before ranking, so restricted text is never returned.
CREATE OR REPLACE FUNCTION match_knowledge(
    query_embedding vector(1536),
    caller_role     text,
    match_count     int     DEFAULT 5,
    filter_types    text[]  DEFAULT NULL,
    filter_market   text    DEFAULT NULL,
    min_similarity  float   DEFAULT 0.30
)
RETURNS TABLE (
    chunk_id   int,
    doc_id     int,
    doc_code   text,
    title      text,
    version    text,
    section    text,
    content    text,
    doc_type   text,
    similarity float
)
LANGUAGE sql STABLE AS $$
    SELECT c.chunk_id, d.doc_id, d.doc_code, d.title, d.version, c.section, c.content, c.doc_type,
           (1 - (c.embedding <=> query_embedding))::float AS similarity
    FROM knowledge_chunks c
    JOIN knowledge_documents d ON d.doc_id = c.doc_id
    WHERE d.status = 'published'
      AND caller_role = ANY (c.audience)
      AND (filter_types  IS NULL OR c.doc_type = ANY (filter_types))
      AND (filter_market IS NULL OR c.market IN ('all', filter_market))
      AND 1 - (c.embedding <=> query_embedding) >= min_similarity
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- 4. Lock the knowledge tables and the function to the backend (service key) only.
--    Without this, anyone holding the public anon key could read restricted documents directly.
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks    ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION match_knowledge(vector, text, int, text[], text, float) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION match_knowledge(vector, text, int, text[], text, float) TO service_role;