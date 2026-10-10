-- ------------------------------------------------------------
-- WAREHOUSES — one per Market (DataCo markets)
-- ------------------------------------------------------------
CREATE TABLE warehouses (
    warehouse_id    SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    market          TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- PRODUCTS — derived from DataCo product categories
-- ------------------------------------------------------------
CREATE TABLE products (
    product_id      SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    category_id     INTEGER,
    category_name   TEXT,
    department_id   INTEGER,
    department_name TEXT,
    unit_price      NUMERIC(10,2),
    unit_margin     NUMERIC(10,2),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- DISTRIBUTORS — aggregated from DataCo customers
-- ------------------------------------------------------------
CREATE TABLE distributors (
    distributor_id  SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    customer_segment TEXT,          -- Consumer | Corporate | Home Office
    market          TEXT,            -- USCA | Europe | LATAM | Pacific Asia | Africa
    country         TEXT,
    state           TEXT,
    city            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- ORDERS — the core DataCo data, one row per order item
-- ------------------------------------------------------------
CREATE TABLE orders (
    order_id            SERIAL PRIMARY KEY,
    data_co_order_id    INTEGER NOT NULL,
    order_item_id       INTEGER NOT NULL,
    distributor_id      INTEGER REFERENCES distributors(distributor_id),
    product_id          INTEGER REFERENCES products(product_id),
    warehouse_id        INTEGER REFERENCES warehouses(warehouse_id),
    order_date          DATE NOT NULL,
    shipping_date       DATE,
    days_for_shipping_real    INTEGER,
    days_for_shipment_scheduled INTEGER,
    late_delivery_risk  INTEGER,         -- 1 = late, 0 = on time
    delivery_status     TEXT,
    shipping_mode       TEXT,
    order_item_quantity INTEGER,
    order_item_total    NUMERIC(10,2),
    benefit_per_order   NUMERIC(10,2),
    order_profit_per_order NUMERIC(10,2),
    profit_ratio        NUMERIC(6,4),
    order_status        TEXT,
    order_region        TEXT,
    latitude            NUMERIC(9,6),
    longitude           NUMERIC(9,6),
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (data_co_order_id, order_item_id)
);

CREATE INDEX idx_orders_distributor ON orders (distributor_id);
CREATE INDEX idx_orders_product ON orders (product_id);
CREATE INDEX idx_orders_date ON orders (order_date);
CREATE INDEX idx_orders_warehouse ON orders (warehouse_id);

-- ------------------------------------------------------------
-- WAREHOUSE INVENTORY — simulated stock levels
-- ------------------------------------------------------------
CREATE TABLE warehouse_inventory (
    inventory_id    SERIAL PRIMARY KEY,
    warehouse_id    INTEGER REFERENCES warehouses(warehouse_id),
    product_id      INTEGER REFERENCES products(product_id),
    stock_on_hand   INTEGER NOT NULL,
    as_of_date      DATE NOT NULL,
    UNIQUE (warehouse_id, product_id, as_of_date)
);

-- ------------------------------------------------------------
-- SIGNALS — weather, news (keyed to warehouse/distributor locations)
-- ------------------------------------------------------------
CREATE TABLE signals (
    signal_id       SERIAL PRIMARY KEY,
    signal_type     TEXT NOT NULL,
    source          TEXT NOT NULL,
    reference_key   TEXT,
    payload         JSONB NOT NULL,
    as_of_date      TIMESTAMPTZ NOT NULL,
    signal_day      DATE,
    ingested_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX signals_type_day_idx ON signals (signal_type, signal_day);

-- ------------------------------------------------------------
-- ML ORDER FEATURES — training table for M1
-- ------------------------------------------------------------
CREATE TABLE ml_order_features (
    feature_id          SERIAL PRIMARY KEY,
    order_id            INTEGER REFERENCES orders(order_id),
    distributor_id      INTEGER REFERENCES distributors(distributor_id),
    product_id          INTEGER REFERENCES products(product_id),
    warehouse_id        INTEGER REFERENCES warehouses(warehouse_id),
    shipping_mode       TEXT,
    shipping_mode_encoded INTEGER,
    order_item_quantity INTEGER,
    order_item_total    NUMERIC(10,2),
    month               SMALLINT,
    is_peak_season      BOOLEAN,
    order_region        TEXT,
    profit_ratio        NUMERIC(6,4),
    label_delay_days    INTEGER,           -- REAL target: real - scheduled days
    label_late_risk     INTEGER,           -- binary: 1 = late, 0 = on time
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- DISTRIBUTOR USAGE — training table for M2
-- ------------------------------------------------------------
CREATE TABLE distributor_usage (
    usage_id        SERIAL PRIMARY KEY,
    distributor_id  INTEGER REFERENCES distributors(distributor_id),
    product_id      INTEGER REFERENCES products(product_id),
    period_start    DATE NOT NULL,          -- Monday of ISO week
    order_quantity  INTEGER NOT NULL,       -- total units ordered that week
    month           SMALLINT,
    is_peak_season  BOOLEAN,
    qty_lag_1w      INTEGER,
    qty_lag_4w      INTEGER,
    qty_ma_4w       NUMERIC(10,2),
    label_next_week_qty INTEGER,            -- target: next week's order qty
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (distributor_id, product_id, period_start)
);

-- ------------------------------------------------------------
-- PREDICTIONS / CASCADE / INCIDENTS
-- ------------------------------------------------------------
CREATE TABLE predictions (
    prediction_id       SERIAL PRIMARY KEY,
    order_id            INTEGER REFERENCES orders(order_id),
    model_version       TEXT NOT NULL,
    delay_risk_score    NUMERIC(5,4),
    predicted_delay_days NUMERIC(6,2),
    shap_explanation    JSONB,
    scored_at           TIMESTAMPTZ DEFAULT now(),
    as_of_date          DATE NOT NULL
);

CREATE TABLE cascade_results (
    cascade_id          SERIAL PRIMARY KEY,
    order_id            INTEGER REFERENCES orders(order_id),
    distributor_id      INTEGER REFERENCES distributors(distributor_id),
    product_id          INTEGER REFERENCES products(product_id),
    warehouse_id        INTEGER REFERENCES warehouses(warehouse_id),
    days_of_cover       NUMERIC(6,2),
    stockout_date       DATE,
    units_short         INTEGER,
    money_at_risk_usd   NUMERIC(12,2),
    computed_at         TIMESTAMPTZ DEFAULT now(),
    as_of_date          DATE NOT NULL
);

CREATE TABLE incidents (
    incident_id             SERIAL PRIMARY KEY,
    order_id                INTEGER REFERENCES orders(order_id),
    probable_cause          TEXT,
    cause_confidence        NUMERIC(5,4),
    evidence                JSONB,
    recommended_options     JSONB,
    status                  TEXT DEFAULT 'open',
    briefing_text_ops       TEXT,
    created_at              TIMESTAMPTZ DEFAULT now(),
    resolved_at             TIMESTAMPTZ
);

CREATE TABLE knowledge_chunks (
    chunk_id            SERIAL PRIMARY KEY,
    source_title        TEXT NOT NULL,
    source_type         TEXT NOT NULL,
    content             TEXT NOT NULL,
    embedding           vector(1536),
    created_at          TIMESTAMPTZ DEFAULT now()
);