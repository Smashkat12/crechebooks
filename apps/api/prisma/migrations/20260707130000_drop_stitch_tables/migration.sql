-- Drop dormant Stitch open-banking integration surface (TASK-INT-101).
--
-- Stitch has been dormant in production since 2026-04-30. BANK_API_ENABLED is
-- unset in prod/staging so every StitchBankingService method throws
-- "Bank API integration is not enabled". `linked_bank_accounts` has zero rows
-- in prod and staging. Real bank features come from Xero/Stub adapters and
-- the Mailgun FNB statement pipeline — none of which touch these tables.
--
-- The only FK relationships were: linked_bank_sync_events -> linked_bank_accounts
-- (both being dropped) and linked_bank_accounts -> tenants (parent side, no
-- referrers to worry about).
--
-- Idempotent: uses IF EXISTS on both tables and the enum type.

DROP TABLE IF EXISTS "linked_bank_sync_events" CASCADE;
DROP TABLE IF EXISTS "linked_bank_accounts" CASCADE;
DROP TYPE IF EXISTS "LinkedBankAccountStatus";
