PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('worker','poster','both')),
  bio TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', skills TEXT NOT NULL DEFAULT '[]',
  stripe_account_id TEXT UNIQUE,
  suspended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  consent_at TEXT NOT NULL,
  terms_version TEXT NOT NULL DEFAULT '2026-11-04'
);
CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX auth_tokens_expiry ON auth_tokens(expires_at);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, poster_id TEXT NOT NULL REFERENCES users(id), worker_id TEXT REFERENCES users(id),
  title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('Cleaning','Yard work','Moving help','Assembly','General help')),
  city TEXT NOT NULL, area TEXT NOT NULL DEFAULT '', start_date TEXT NOT NULL,
  estimated_hours REAL NOT NULL CHECK(estimated_hours > 0 AND estimated_hours <= 80),
  budget_cents INTEGER NOT NULL CHECK(budget_cents BETWEEN 2500 AND 500000),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','completed','cancelled','disputed')),
  payment_schedule TEXT NOT NULL CHECK(payment_schedule IN ('completion','milestones')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(poster_id <> worker_id)
);
CREATE INDEX jobs_browse ON jobs(status,created_at DESC);
CREATE INDEX jobs_city ON jobs(city,status,created_at DESC);
CREATE INDEX jobs_category ON jobs(category,status,created_at DESC);
CREATE INDEX jobs_poster ON jobs(poster_id,created_at DESC);
CREATE INDEX jobs_worker ON jobs(worker_id,created_at DESC);
CREATE TABLE applications (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), worker_id TEXT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','withdrawn')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(job_id,worker_id)
);
CREATE INDEX applications_worker ON applications(worker_id,created_at DESC);
CREATE INDEX applications_job ON applications(job_id,status);
CREATE TABLE milestones (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents BETWEEN 2500 AND 500000), position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','approved','checkout_pending','paid','refunded')),
  submitted_at TEXT, approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(job_id,position)
);
CREATE INDEX milestones_job ON milestones(job_id,status);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), sender_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX messages_job ON messages(job_id,created_at);
CREATE TABLE reviews (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), author_id TEXT NOT NULL REFERENCES users(id), subject_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(job_id,author_id), CHECK(author_id <> subject_id)
);
CREATE INDEX reviews_subject ON reviews(subject_id,created_at DESC);
CREATE TABLE reports (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), reporter_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  prior_status TEXT NOT NULL, resolution TEXT, resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX reports_open_unique ON reports(job_id,reporter_id) WHERE status='open';
CREATE INDEX reports_queue ON reports(status,created_at);
CREATE TABLE waitlist (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, city TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('worker','poster','both')),
  consent_at TEXT NOT NULL, consent_version TEXT NOT NULL DEFAULT '2026-11-04', deletion_token_hash TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_entity ON audit_log(entity_id,created_at);
