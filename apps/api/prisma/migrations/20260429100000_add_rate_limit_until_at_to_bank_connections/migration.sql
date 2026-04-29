-- DRAFT — awaiting schema-guardian approval before applying to production.
--
-- AUDIT-BANK-01: Persist Xero 429 rate-limit deadline across process restarts.
--
-- Problem: The hourly Xero auto-sync job previously stored the 429 retry
-- deadline in an in-memory Map. This was lost on every Railway redeploy,
-- causing the job to immediately re-hit Xero the next hour even if Xero
-- said "retry after 60s" (and the process restart happened within that window).
--
-- Fix: Add `rate_limit_until_at TIMESTAMPTZ NULL` to `bank_connections`.
-- When a 429 is received the job writes `NOW() + Retry-After` into this column.
-- On startup (or any hour tick) Guard 4a reads the column and skips the tenant
-- if the deadline is still in the future.
-- On a successful sync the column is cleared back to NULL.
--
-- Distinguishing 429 from fatal errors:
--   - 429 → set rate_limit_until_at, leave status unchanged (connection is healthy)
--   - Fatal → set status=ERROR, leave rate_limit_until_at unchanged
--
-- Backward compatibility:
--   - Column is NULL-able; existing rows get NULL automatically.
--   - Application code uses `as any` casts on the Prisma client until the
--     Prisma schema is regenerated (schema-guardian step).
--   - Pre-existing code that queries or updates bank_connections is unaffected
--     because it never touches this column.
--
-- Idempotency: uses IF NOT EXISTS.

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS rate_limit_until_at TIMESTAMPTZ NULL;

-- Index for Guard 4a lookup:
--   WHERE tenant_id = $1 AND rate_limit_until_at > NOW()
-- Without an index this is a seq-scan on a tiny table (1 row/tenant) — acceptable,
-- but a partial index makes the intent explicit.
CREATE INDEX IF NOT EXISTS bank_connections_rate_limit_until_at_idx
  ON bank_connections (tenant_id, rate_limit_until_at)
  WHERE rate_limit_until_at IS NOT NULL;
