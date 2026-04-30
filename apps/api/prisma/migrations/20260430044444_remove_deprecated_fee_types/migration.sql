-- AUDIT-BILL-08 follow-up: remove deprecated FeeType variants HALF_DAY / HOURLY / CUSTOM.
--
-- Iter 16 added an application-layer guard in ChildController that rejects these
-- variants at enrollment time because the billing pipeline only generates flat
-- monthly invoices (no half-day / hourly / custom rate logic). Now that the
-- application has rejected the deprecated values for a release cycle and zero
-- production rows reference them, we collapse the enum to a single allowed value.
--
-- Data audit (2026-04-30 UTC):
--   staging fee_structures: 8 rows, all FULL_DAY
--   production fee_structures: 8 rows, all FULL_DAY
--   No rows reference HALF_DAY / HOURLY / CUSTOM in either env.
--
-- Postgres enum-swap pattern (idempotent guard included as defence-in-depth).

-- Step 1: Create new enum with only allowed values.
DO $$ BEGIN
  CREATE TYPE "FeeType_new" AS ENUM ('FULL_DAY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Safety guard. Should be a no-op given the data audit, but if any row
-- still references a deprecated value the migration aborts BEFORE the swap so
-- the DB is left in a recoverable state.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "fee_structures"
    WHERE "fee_type"::text IN ('HALF_DAY', 'HOURLY', 'CUSTOM')
  ) THEN
    RAISE EXCEPTION 'Cannot drop FeeType values: rows still reference HALF_DAY/HOURLY/CUSTOM. Migrate those rows first.';
  END IF;
END $$;

-- Step 3: Swap the column over to the new enum. The USING clause re-casts via
-- text; any row with a deprecated value would already have aborted in Step 2.
ALTER TABLE "fee_structures"
  ALTER COLUMN "fee_type" TYPE "FeeType_new"
  USING ("fee_type"::text::"FeeType_new");

-- Step 4: Drop the old enum and rename the new one into its place.
DROP TYPE "FeeType";
ALTER TYPE "FeeType_new" RENAME TO "FeeType";
