-- Add TRIAL_SIGNUP to AuditAction enum
ALTER TYPE "public"."AuditAction" ADD VALUE IF NOT EXISTS 'TRIAL_SIGNUP';
