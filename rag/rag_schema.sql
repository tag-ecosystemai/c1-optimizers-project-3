-- RAG knowledge base (Layer 6). Lives in the same Supabase Postgres as ops data.
-- NOTE: vector(384) matches all-MiniLM-L6-v2. Change it if you change the model.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_chunks (
    chunk_id     text PRIMARY KEY,
    content      text NOT NULL,
    embedding    vector(384) NOT NULL,
    provenance   text NOT NULL
                 CHECK (provenance IN ('public', 'template_derived', 'system_generated')),
    source       text NOT NULL,          -- file name or 'incident:<id>'
    source_path  text NOT NULL,          -- path relative to corpus root
    source_org   text,                   -- MSC, Expeditors, US CBP, ...
    page         int,
    section      text,
    chunk_index  int,
    metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw
    ON rag_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS rag_chunks_tsv_gin        ON rag_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS rag_chunks_provenance_idx ON rag_chunks (provenance);
CREATE INDEX IF NOT EXISTS rag_chunks_source_path_idx ON rag_chunks (source_path);
CREATE INDEX IF NOT EXISTS rag_chunks_source_org_idx  ON rag_chunks (source_org);
