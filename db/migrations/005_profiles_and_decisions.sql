-- Migration 005: Profiles, Decisions, and Ask Messages
-- Location: db/migrations/005_profiles_and_decisions.sql

-- 1. Profiles: Who is each user and what can they see
CREATE TABLE IF NOT EXISTS profiles (
    user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('ops','warehouse','distributor','data')),
    display_name    TEXT,
    distributor_id  INTEGER REFERENCES distributors(distributor_id),
    warehouse_id    INTEGER REFERENCES warehouses(warehouse_id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    CHECK (role <> 'distributor' OR distributor_id IS NOT NULL),
    CHECK (role <> 'warehouse'   OR warehouse_id   IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_distributor ON profiles (distributor_id);
CREATE INDEX IF NOT EXISTS idx_profiles_warehouse ON profiles (warehouse_id);

-- 2. Incident Decisions: Audit trail for decisions
CREATE TABLE IF NOT EXISTS incident_decisions (
    decision_id         SERIAL PRIMARY KEY,
    incident_id         INTEGER REFERENCES incidents(incident_id),
    decided_by          UUID REFERENCES auth.users(id),
    action              TEXT NOT NULL,        -- approved | dismissed | escalated | acknowledged
    selected_option_id  TEXT,
    note                TEXT,
    decided_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_incident ON incident_decisions (incident_id);

-- 3. Ask Messages: Chat history for Ask agent
CREATE TABLE IF NOT EXISTS ask_messages (
    message_id   SERIAL PRIMARY KEY,
    session_id   UUID NOT NULL,
    user_id      UUID REFERENCES auth.users(id),
    role         TEXT NOT NULL,               -- user | assistant
    content      TEXT NOT NULL,
    tool_calls   JSONB,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ask_session ON ask_messages (session_id);
