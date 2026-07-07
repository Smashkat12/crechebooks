-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MessageTemplateKey" AS ENUM (
    'ARREARS_REMINDER_FRIENDLY',
    'ARREARS_REMINDER_FIRM',
    'ARREARS_REMINDER_FINAL',
    'INVOICE_DELIVERY',
    'WELCOME_PACK',
    'STATEMENT_DELIVERY',
    'INVOICE_SCHEDULER_ADMIN_SUMMARY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MessageTemplateChannel" AS ENUM (
    'EMAIL',
    'WHATSAPP',
    'SMS'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "message_templates" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "key"        "MessageTemplateKey" NOT NULL,
  "channel"    "MessageTemplateChannel" NOT NULL,
  "subject"    VARCHAR(500),
  "body"       TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "message_templates_tenant_id_key_channel_key"
  ON "message_templates" ("tenant_id", "key", "channel");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "message_templates_tenant_id_idx"
  ON "message_templates" ("tenant_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "message_templates"
    ADD CONSTRAINT "message_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
