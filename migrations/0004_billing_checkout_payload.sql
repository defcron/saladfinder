-- Preserve the exact Stripe request across ambiguous retries and configuration changes.
ALTER TABLE billing_checkouts ADD COLUMN request_json TEXT;
