-- TASK-ENROL-006: Add welcome pack fields to tenants for parent welcome pack
-- These fields allow tenants to customize their parent welcome message and display operating hours

-- Add welcome message column to tenants table
ALTER TABLE "tenants" ADD COLUMN "parent_welcome_message" TEXT;
ALTER TABLE "tenants" ADD COLUMN "operating_hours" VARCHAR(200);
