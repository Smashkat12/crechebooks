-- AlterTable: Add failed_at timestamp to whatsapp_messages
-- Fixes: Unknown argument `failedAt` error when Twilio status callback reports FAILED
ALTER TABLE "whatsapp_messages" ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMP(3);
