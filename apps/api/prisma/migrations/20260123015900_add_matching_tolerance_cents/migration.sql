-- AlterTable: Add matching_tolerance_cents field to tenants table
-- TASK-RECON-002: Amount tolerance for transaction matching
ALTER TABLE "tenants" ADD COLUMN "matching_tolerance_cents" INTEGER NOT NULL DEFAULT 0;
