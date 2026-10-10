-- Run once in the Supabase SQL Editor.

-- 1. Extra columns the UI and incidents need on cascade_results
ALTER TABLE cascade_results
    ADD COLUMN IF NOT EXISTS predicted_delay_days NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS projected_arrival    DATE,
    ADD COLUMN IF NOT EXISTS delay_risk_score     NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS severity             TEXT;   -- NONE | LOW | MEDIUM | HIGH

CREATE INDEX IF NOT EXISTS idx_cascade_as_of   ON cascade_results (as_of_date);
CREATE INDEX IF NOT EXISTS idx_cascade_order   ON cascade_results (order_id);

-- 2. M2 scored forecasts (predicted next-week order quantity per distributor-product)
CREATE TABLE IF NOT EXISTS distributor_usage_forecast (
    forecast_id           SERIAL PRIMARY KEY,
    distributor_id        INTEGER REFERENCES distributors(distributor_id),
    product_id            INTEGER REFERENCES products(product_id),
    forecast_week_start   DATE NOT NULL,        -- the week being forecast
    predicted_weekly_qty  NUMERIC(10,2) NOT NULL,
    model_version         TEXT,
    as_of_date            DATE NOT NULL,        -- simulated "today" the forecast was made on
    scored_at             TIMESTAMPTZ DEFAULT now(),
    UNIQUE (distributor_id, product_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_forecast_asof ON distributor_usage_forecast (as_of_date);