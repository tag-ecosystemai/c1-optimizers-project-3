-- Run once in the Supabase SQL Editor (after 002 and 003).
-- An INCIDENT is now one PRODUCT at one WAREHOUSE projected to run short.
-- The delayed orders that cause it are listed in cascade_results.

-- 1. One row per (warehouse, product) assessed by the cascade on a given simulated date
CREATE TABLE IF NOT EXISTS stock_risks (
    risk_id                 SERIAL PRIMARY KEY,
    as_of_date              DATE NOT NULL,
    warehouse_id            INTEGER NOT NULL REFERENCES warehouses(warehouse_id),
    product_id              INTEGER NOT NULL REFERENCES products(product_id),
    stock_on_hand           INTEGER,
    weekly_demand           NUMERIC(10,2),          -- sum of M2 forecasts of the warehouse's distributors
    days_of_cover           NUMERIC(6,2),           -- 999 = no forecast demand
    stockout_date           DATE,
    first_arrival           DATE,                   -- earliest projected arrival of the in-transit orders
    gap_days                INTEGER,
    units_short             INTEGER NOT NULL DEFAULT 0,
    money_at_risk_usd       NUMERIC(12,2) NOT NULL DEFAULT 0,
    severity                TEXT NOT NULL DEFAULT 'NONE',   -- NONE | LOW | MEDIUM | HIGH
    orders_affected         INTEGER NOT NULL DEFAULT 0,
    distributor_ids         INTEGER[],
    avg_predicted_delay_days NUMERIC(6,2),
    max_predicted_delay_days NUMERIC(6,2),
    avg_delay_risk_score    NUMERIC(5,4),
    computed_at             TIMESTAMPTZ DEFAULT now(),
    UNIQUE (as_of_date, warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_risks_severity  ON stock_risks (as_of_date, severity);
CREATE INDEX IF NOT EXISTS idx_stock_risks_warehouse ON stock_risks (warehouse_id);

-- 2. Each per-order cascade row points at the stock risk it belongs to
ALTER TABLE cascade_results
    ADD COLUMN IF NOT EXISTS risk_id INTEGER REFERENCES stock_risks(risk_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cascade_risk ON cascade_results (risk_id);

-- 3. Incidents hang off a stock risk, not a single order
ALTER TABLE incidents
    ADD COLUMN IF NOT EXISTS risk_id                    INTEGER REFERENCES stock_risks(risk_id),
    ADD COLUMN IF NOT EXISTS warehouse_id               INTEGER REFERENCES warehouses(warehouse_id),
    ADD COLUMN IF NOT EXISTS product_id                 INTEGER REFERENCES products(product_id),
    ADD COLUMN IF NOT EXISTS severity                   TEXT,
    ADD COLUMN IF NOT EXISTS briefing_text_distributor  TEXT,
    ADD COLUMN IF NOT EXISTS briefing_text_warehouse    TEXT,
    ADD COLUMN IF NOT EXISTS updated_at                 TIMESTAMPTZ DEFAULT now();

-- one incident per stock risk (needed so the cascade can re-run without duplicating incidents)
CREATE UNIQUE INDEX IF NOT EXISTS incidents_risk_unique ON incidents (risk_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status    ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_warehouse ON incidents (warehouse_id);

-- Status values used by the app:
--   open | approved | dismissed | escalated | resolved | withdrawn
-- 'withdrawn' = the cascade re-ran and no longer projects a shortage for an open incident.