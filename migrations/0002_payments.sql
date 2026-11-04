ALTER TABLE milestones ADD COLUMN fee_cents INTEGER;
ALTER TABLE milestones ADD COLUMN checkout_session_id TEXT;
ALTER TABLE milestones ADD COLUMN payment_intent_id TEXT;
ALTER TABLE milestones ADD COLUMN paid_at TEXT;

CREATE TABLE connect_intents (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  operation_id TEXT NOT NULL UNIQUE,
  account_id TEXT,
  request_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id),
  attempt INTEGER NOT NULL,
  poster_id TEXT NOT NULL REFERENCES users(id),
  worker_id TEXT NOT NULL REFERENCES users(id),
  account_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  fee_cents INTEGER NOT NULL CHECK(fee_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'cad',
  status TEXT NOT NULL DEFAULT 'creating',
  checkout_session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  checkout_url TEXT,
  request_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(milestone_id, attempt)
);
CREATE INDEX payment_attempts_worker ON payment_attempts(worker_id, status);

CREATE TABLE payout_intents (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  account_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('standard','instant')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  destination TEXT,
  payout_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'creating',
  arrival_date INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX payout_intents_user ON payout_intents(user_id, created_at);
CREATE UNIQUE INDEX payout_intents_one_pending ON payout_intents(user_id) WHERE status = 'creating';

CREATE TABLE refund_intents (
  payment_attempt_id TEXT PRIMARY KEY REFERENCES payment_attempts(id),
  operation_id TEXT NOT NULL UNIQUE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  refund_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'creating',
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  account_id TEXT,
  created INTEGER NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE payment_incidents (
  id TEXT PRIMARY KEY,
  event_id TEXT UNIQUE,
  payment_attempt_id TEXT REFERENCES payment_attempts(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
