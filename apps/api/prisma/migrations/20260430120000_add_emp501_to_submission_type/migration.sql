-- AddValue: EMP501 to SubmissionType enum (TAX-08)
-- Additive and idempotent — no existing values removed.
-- EMP501 is the canonical SARS form name for the Employer Annual
-- Reconciliation Declaration (EMP501 §2). Previously tracked under
-- the legacy name IRP5. Both values coexist during migration period.
ALTER TYPE "SubmissionType" ADD VALUE IF NOT EXISTS 'EMP501';
