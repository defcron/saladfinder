ALTER TABLE jobs ADD COLUMN fee_plan TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE applications ADD COLUMN fee_plan TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE applications ADD COLUMN worker_fee_snapshot TEXT NOT NULL DEFAULT '[]';
ALTER TABLE milestones ADD COLUMN worker_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK(worker_fee_cents >= 0);
ALTER TABLE payment_attempts ADD COLUMN worker_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK(worker_fee_cents >= 0);
CREATE TABLE billing_accounts (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 customer_id TEXT UNIQUE,
 customer_operation TEXT NOT NULL UNIQUE,
 customer_started_at INTEGER NOT NULL,
 subscription_id TEXT UNIQUE,
 plan TEXT NOT NULL DEFAULT 'standard' CHECK(plan IN ('standard','economy','premium')),
 paid_until INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'none',
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
 blocked INTEGER NOT NULL DEFAULT 0,
 sync_lock TEXT,
 sync_until INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE billing_checkouts (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 plan TEXT NOT NULL CHECK(plan IN ('economy','premium')),
 session_id TEXT UNIQUE,
 url TEXT,
 status TEXT NOT NULL DEFAULT 'creating',
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX billing_one_pending ON billing_checkouts(user_id) WHERE status IN ('creating','open');
CREATE INDEX billing_checkout_user ON billing_checkouts(user_id,created_at DESC);
CREATE TABLE billing_risk_events (
 event_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 event_type TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
