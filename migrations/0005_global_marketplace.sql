-- Historical listings were published in the Ontario marketplace.
ALTER TABLE jobs ADD COLUMN country TEXT NOT NULL DEFAULT 'CA';
CREATE INDEX jobs_country_open ON jobs(country,status,created_at DESC,id DESC);
ALTER TABLE users ADD COLUMN country TEXT;
UPDATE users SET country='CA' WHERE stripe_account_id IS NOT NULL OR id IN (SELECT user_id FROM connect_intents);
ALTER TABLE auth_tokens ADD COLUMN country TEXT;
CREATE TABLE ui_translations (
  language TEXT NOT NULL, message_id TEXT NOT NULL, translation TEXT NOT NULL,
  PRIMARY KEY(language,message_id)
) WITHOUT ROWID;
