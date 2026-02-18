-- TASK-WA-015: WhatsApp Onboarding → Auto-Enrollment → Parent Portal
-- Adds ChildStatus enum with status column on children table
-- Adds 6 new OnboardingStep enum values for complete onboarding flow

-- 1. Create ChildStatus enum
CREATE TYPE "ChildStatus" AS ENUM ('REGISTERED', 'ENROLLED', 'WITHDRAWN', 'GRADUATED');

-- 2. Add status column to children table
ALTER TABLE "children" ADD COLUMN "status" "ChildStatus" NOT NULL DEFAULT 'REGISTERED';

-- 3. Backfill children with active enrollments as ENROLLED
UPDATE "children" SET "status" = 'ENROLLED'
WHERE id IN (SELECT DISTINCT "child_id" FROM "enrollments" WHERE "status" = 'ACTIVE');

-- 4. Backfill children with withdrawn enrollments (only if still REGISTERED)
UPDATE "children" SET "status" = 'WITHDRAWN'
WHERE id IN (SELECT DISTINCT "child_id" FROM "enrollments" WHERE "status" = 'WITHDRAWN')
AND "status" = 'REGISTERED';

-- 5. Backfill children with graduated enrollments (only if still REGISTERED)
UPDATE "children" SET "status" = 'GRADUATED'
WHERE id IN (SELECT DISTINCT "child_id" FROM "enrollments" WHERE "status" = 'GRADUATED')
AND "status" = 'REGISTERED';

-- 6. Add new OnboardingStep enum values
-- Note: ADD VALUE IF NOT EXISTS is idempotent and safe for re-runs
ALTER TYPE "OnboardingStep" ADD VALUE IF NOT EXISTS 'PARENT_ADDRESS';
ALTER TYPE "OnboardingStep" ADD VALUE IF NOT EXISTS 'CHILD_SURNAME';
ALTER TYPE "OnboardingStep" ADD VALUE IF NOT EXISTS 'FEE_SELECTION';
ALTER TYPE "OnboardingStep" ADD VALUE IF NOT EXISTS 'MEDIA_CONSENT';
ALTER TYPE "OnboardingStep" ADD VALUE IF NOT EXISTS 'AUTHORIZED_COLLECTORS';
ALTER TYPE "OnboardingStep" ADD VALUE IF NOT EXISTS 'CONSENT_AGREEMENT';

-- 7. Add index for child status queries
CREATE INDEX "children_tenant_id_status_idx" ON "children"("tenant_id", "status");
