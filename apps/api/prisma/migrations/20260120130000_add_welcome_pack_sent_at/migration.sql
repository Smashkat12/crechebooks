-- TASK-ENROL-008: Welcome Pack Delivery Integration
-- Add welcome_pack_sent_at column to enrollments table

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN "welcome_pack_sent_at" TIMESTAMP(3);
