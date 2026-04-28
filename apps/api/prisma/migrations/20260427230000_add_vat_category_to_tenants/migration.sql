-- Migration: add VatCategory enum + tenants.vat_category column
--
-- Purpose: Track each VAT-registered tenant's SARS VAT Category (A–F per
--   VAT Act 89 of 1991). Determines VAT201 filing cadence:
--     A = bi-monthly (odd months),  B = bi-monthly (even months)
--     C = monthly (turnover ≥ R30M or SARS-directed)
--     D = bi-annual (farming + select industries)
--     E = annual (small-scale specific)
--     F = 4-monthly (small business path)
--
-- Nullable on purpose: only meaningful for VAT-registered vendors
-- (tax_status = REGISTERED and vat_number IS NOT NULL).
-- For NOT_REGISTERED tenants the column stays NULL.
--
-- Backwards-compatible: existing code reads/writes none of these columns yet.
-- Idempotent: safe to re-apply via ADD COLUMN IF NOT EXISTS + DO $$ guard on enum.

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "VatCategory" AS ENUM ('A', 'B', 'C', 'D', 'E', 'F');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable (idempotent)
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "vat_category" "VatCategory";

-- Safe-default backfill for already VAT-registered vendors.
-- Idempotent (only fills NULLs where vat_number is set). For Elle Elephant this
-- is a no-op because vat_number is NULL. Category A is the SARS default for
-- bi-monthly filers; admins can correct via the VAT settings UI once exposed.
UPDATE "tenants"
   SET "vat_category" = 'A'
 WHERE "vat_number" IS NOT NULL
   AND "vat_category" IS NULL;
