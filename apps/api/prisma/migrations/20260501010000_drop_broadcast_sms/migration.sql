-- Drop SMS schema surface from message_recipients (audit follow-up F7-schema).
-- SMS infrastructure was removed in code by:
--   ad79861  delivery
--   b2327a5  parent code refs
--   90fe960  Parent.smsOptIn migration
--   9fe6c9f  broadcast pipeline SMS surface
-- The 3 sms_* columns live on message_recipients (NOT broadcast_messages — the
-- brief misnamed the table). channel on broadcast_messages is a free-form
-- VARCHAR(20), NOT a Prisma enum, so no enum swap is needed.

ALTER TABLE "message_recipients" DROP COLUMN IF EXISTS "sms_status";
ALTER TABLE "message_recipients" DROP COLUMN IF EXISTS "sms_sent_at";
ALTER TABLE "message_recipients" DROP COLUMN IF EXISTS "sms_message_id";
