-- Migration: add IT3(a) employment type + staff.it3a_reason_code column
--
-- Purpose: SARS IT3(a) certificate generation in EMP501 (real compliance gap).
--   1. INDEPENDENT_CONTRACTOR added to EmploymentType — staff who fall under
--      the IT3(a) reporting category (independent contractors / commission
--      earners not subject to PAYE on the same basis as employees).
--   2. it3a_reason_code (nullable INT) — SARS IT3(a) reason code applied
--      when issuing an IT3(a) certificate (reasons 02–13 per SARS BRS, e.g.
--      04 = Independent Contractor, 06 = Director's fees, 11 = Pension fund).
--      Nullable because most staff don't need a reason code; only those for
--      whom an IT3(a) certificate is issued in EMP501 export.
--
-- Backwards-compatible: both changes are purely additive.
--   - Existing code paths read/write neither column nor the new enum value.
--   - All current Staff rows continue to satisfy the EmploymentType enum
--     (PERMANENT, CONTRACT, PART_TIME, CASUAL — unchanged).
-- Idempotent: ADD VALUE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.

-- AlterEnum: add INDEPENDENT_CONTRACTOR to EmploymentType (idempotent)
ALTER TYPE "EmploymentType" ADD VALUE IF NOT EXISTS 'INDEPENDENT_CONTRACTOR';

-- AlterTable: add it3a_reason_code on staff (idempotent, nullable)
ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "it3a_reason_code" INTEGER;
