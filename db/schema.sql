-- DisputeDesk schema. Apply with: npm run db:setup
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,            -- PayPal order id
  capture_id    TEXT UNIQUE,                 -- PayPal capture (transaction) id
  status        TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  items         JSONB NOT NULL,
  buyer_email   TEXT,
  shipping      JSONB,
  tracking      JSONB,                       -- {carrier, number, status, delivered_at}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disputes (
  id               TEXT PRIMARY KEY,         -- PayPal dispute id (PP-D-...)
  reason           TEXT,
  status           TEXT,
  stage            TEXT,
  amount           NUMERIC(10,2),
  currency         TEXT,
  capture_id       TEXT,
  respond_by       TIMESTAMPTZ,
  raw              JSONB NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,              -- PayPal event id (idempotency)
  event_type  TEXT NOT NULL,
  verified    BOOLEAN NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id           BIGSERIAL PRIMARY KEY,
  dispute_id   TEXT NOT NULL REFERENCES disputes(id),
  status       TEXT NOT NULL,                -- running | done | error
  verdict      TEXT,                         -- fight | refund | offer
  confidence   INT,
  summary      TEXT,
  draft        JSONB,                        -- proposed PayPal action + evidence
  trace        JSONB NOT NULL DEFAULT '[]',  -- tool calls for the trace view
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- v2
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE disputes   ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders     ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- v3: merchant-approved responses sent to PayPal
CREATE TABLE IF NOT EXISTS dispute_actions (
  id           BIGSERIAL PRIMARY KEY,
  dispute_id   TEXT NOT NULL REFERENCES disputes(id),
  run_id       BIGINT REFERENCES agent_runs(id),
  action       TEXT NOT NULL,                -- fight | refund | offer
  amount       NUMERIC(10,2),                -- refund/offer amount (money given up)
  message      TEXT NOT NULL,
  request      JSONB NOT NULL,
  response     JSONB,
  status       TEXT NOT NULL,                -- sent | simulated | failed
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE disputes   ADD COLUMN IF NOT EXISTS outcome TEXT;   -- local view: responded_fight | refunded | offered | won | lost

CREATE INDEX IF NOT EXISTS agent_runs_dispute_idx ON agent_runs (dispute_id, id DESC);
CREATE INDEX IF NOT EXISTS dispute_actions_dispute_idx ON dispute_actions (dispute_id, id DESC);
CREATE INDEX IF NOT EXISTS orders_buyer_email_idx ON orders (buyer_email);
