-- Item #12: Extend whatsapp_messages to also represent INBOUND messages
-- Foundation for persisting parent → platform messages received via the
-- existing Twilio webhook (POST /webhooks/twilio/incoming). Currently
-- the webhook handles inbound traffic but does NOT store it; this
-- migration adds the columns needed for that persistence step.
--
-- Backwards compatibility:
--   - templateName / contextType become NULL-able. Existing 17 rows in
--     staging (all OUTBOUND template sends) still hold non-null values;
--     dropping NOT NULL is a metadata-only ALTER in Postgres, no rewrite.
--   - direction column adds with DEFAULT 'OUTBOUND' NOT NULL — Postgres
--     applies the default to existing rows in the same statement, so all
--     17 existing rows are auto-backfilled to OUTBOUND. No separate UPDATE
--     needed.
--   - isRead defaults FALSE NOT NULL — same auto-backfill story.
--   - All other new columns are NULL-able.
-- Result: pre-extension code paths (which read/write the existing columns)
-- keep working. New inbound persistence code paths use the new columns.
--
-- Idempotency: every clause uses IF NOT EXISTS / EXCEPTION WHEN
-- duplicate_object so re-running the migration is safe.
-- Authoring-only: NOT applied. Engineer will deploy via Railway
-- (`prisma migrate deploy` in start.sh) after review.

-- 1. CreateEnum: MessageDirection
DO $$ BEGIN
  CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. AlterTable: relax NOT NULL on template_name (inbound rows have no template)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_messages'
      AND column_name = 'template_name'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "whatsapp_messages" ALTER COLUMN "template_name" DROP NOT NULL;
  END IF;
END $$;

-- 3. AlterTable: relax NOT NULL on context_type (inbound rows have no platform context)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_messages'
      AND column_name = 'context_type'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "whatsapp_messages" ALTER COLUMN "context_type" DROP NOT NULL;
  END IF;
END $$;

-- 4. AlterTable: add inbound persistence columns
-- direction: NOT NULL DEFAULT 'OUTBOUND' — Postgres backfills existing rows
-- in the same statement. No separate UPDATE needed.
ALTER TABLE "whatsapp_messages"
  ADD COLUMN IF NOT EXISTS "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
  ADD COLUMN IF NOT EXISTS "body" TEXT,
  ADD COLUMN IF NOT EXISTS "from_phone" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "media_urls" JSONB,
  ADD COLUMN IF NOT EXISTS "is_read" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "read_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "admin_read_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reply_to_message_id" TEXT;

-- 5. CreateIndex: query patterns for inbound flows
-- (a) admin unread badge: WHERE tenant_id = ? AND direction = 'INBOUND' AND is_read = false
CREATE INDEX IF NOT EXISTS "whatsapp_messages_tenant_id_direction_is_read_idx"
  ON "whatsapp_messages"("tenant_id", "direction", "is_read");

-- (b) conversation thread view: WHERE tenant_id = ? AND parent_id = ? ORDER BY created_at
CREATE INDEX IF NOT EXISTS "whatsapp_messages_tenant_id_parent_id_created_at_idx"
  ON "whatsapp_messages"("tenant_id", "parent_id", "created_at");

-- (c) inbound timeline: WHERE tenant_id = ? AND direction = 'INBOUND' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS "whatsapp_messages_tenant_id_direction_created_at_idx"
  ON "whatsapp_messages"("tenant_id", "direction", "created_at");

-- 6. AddForeignKey: read_by_user_id → users(id)
-- ON DELETE SET NULL — Prisma default for optional User? relation.
-- Preserves the message audit trail even if the admin user is later removed.
DO $$ BEGIN
  ALTER TABLE "whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_read_by_user_id_fkey"
    FOREIGN KEY ("read_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 7. AddForeignKey: reply_to_message_id → whatsapp_messages(id) (self-FK)
-- ON DELETE SET NULL — if the parent message is later deleted, replies
-- survive but lose the explicit linkage (rather than cascading the delete).
DO $$ BEGIN
  ALTER TABLE "whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_reply_to_message_id_fkey"
    FOREIGN KEY ("reply_to_message_id") REFERENCES "whatsapp_messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
