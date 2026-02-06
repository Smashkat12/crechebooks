-- FixEnumValues
-- Align "OnboardingStep" enum values with current Prisma schema.
-- The original migration (20260205210000) created enum values that were
-- subsequently renamed in the schema without a corresponding migration.
--
-- This migration is idempotent: it only renames values that still have
-- the old labels, so it is safe to run on databases that were already
-- synced via `prisma db push`.

DO $$
BEGIN
  -- POPIA_CONSENT -> CONSENT
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'POPIA_CONSENT'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'POPIA_CONSENT' TO 'CONSENT';
  END IF;

  -- PARENT_FIRST_NAME -> PARENT_NAME
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PARENT_FIRST_NAME'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'PARENT_FIRST_NAME' TO 'PARENT_NAME';
  END IF;

  -- PARENT_ID -> PARENT_ID_NUMBER
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PARENT_ID'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'PARENT_ID' TO 'PARENT_ID_NUMBER';
  END IF;

  -- CHILD_FIRST_NAME -> CHILD_NAME
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CHILD_FIRST_NAME'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'CHILD_FIRST_NAME' TO 'CHILD_NAME';
  END IF;

  -- EMERGENCY_NAME -> EMERGENCY_CONTACT_NAME
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EMERGENCY_NAME'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'EMERGENCY_NAME' TO 'EMERGENCY_CONTACT_NAME';
  END IF;

  -- EMERGENCY_PHONE -> EMERGENCY_CONTACT_PHONE
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EMERGENCY_PHONE'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'EMERGENCY_PHONE' TO 'EMERGENCY_CONTACT_PHONE';
  END IF;

  -- EMERGENCY_RELATIONSHIP -> EMERGENCY_CONTACT_RELATION
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EMERGENCY_RELATIONSHIP'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'EMERGENCY_RELATIONSHIP' TO 'EMERGENCY_CONTACT_RELATION';
  END IF;

  -- FEE_ACKNOWLEDGEMENT -> FEE_AGREEMENT
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'FEE_ACKNOWLEDGEMENT'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'FEE_ACKNOWLEDGEMENT' TO 'FEE_AGREEMENT';
  END IF;

  -- COMPLETED -> COMPLETE (only in OnboardingStep, not WaOnboardingStatus)
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COMPLETED'
             AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OnboardingStep'))
  THEN
    ALTER TYPE "OnboardingStep" RENAME VALUE 'COMPLETED' TO 'COMPLETE';
  END IF;
END $$;
