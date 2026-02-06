-- AddColumn
-- Add missing bank_fee_config column to tenants table.
-- This column exists in the Prisma schema but was never migrated
-- (it was applied locally via `prisma db push` only).

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "bank_fee_config" JSONB;
