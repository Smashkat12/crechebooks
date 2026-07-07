-- Migration: add tenants.statement_schedule_enabled opt-in flag
--
-- Purpose: TASK-STMT-008 wired the monthly statement-generation cron producer
--   (StatementScheduleService) but the per-tenant opt-in gate had no schema
--   backing — isStatementScheduleEnabled() was hardcoded false, so the
--   bootstrap loop enrolled zero tenants. This column supplies the missing
--   flag so tenants can be safely opted in.
--
-- Design (Option A chosen): a single boolean on Tenant, matching the small
--   surface area the processor actually reads (only tenant.name/email — no
--   per-tenant cron override, no autoFinalize/autoDeliver defaults belong on
--   the tenant model). If either need arises later a StatementScheduleConfig
--   model (mirroring ReminderConfig) can be added; for now the flag is
--   sufficient and the migration is a one-column additive change.
--
-- Backwards-compatible: nullable-equivalent — DEFAULT false means every
--   existing row picks up "opt-out" behaviour on apply, which is exactly the
--   safe default the file-header OPT-IN SAFETY note prescribed. No code
--   currently reads or writes this column, so pre-existing callers are
--   unaffected.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS so re-application is a no-op.
--   Follows the same pattern as prior additive tenant migrations
--   (add_vat_category_to_tenants, add_rate_limit_until_at_to_bank_connections).

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "statement_schedule_enabled" BOOLEAN NOT NULL DEFAULT false;
