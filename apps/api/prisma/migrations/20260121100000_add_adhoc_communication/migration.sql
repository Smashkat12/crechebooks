-- TASK-COMM-001: Ad-hoc Communication Database Schema
-- Migration: Add broadcast messaging tables for multi-channel communication

-- RecipientGroup: Saved recipient lists for reusable targeting
CREATE TABLE "recipient_groups" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "recipient_type" VARCHAR(20) NOT NULL,
    "filter_criteria" JSONB,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipient_groups_pkey" PRIMARY KEY ("id")
);

-- BroadcastMessage: Main broadcast message record
CREATE TABLE "broadcast_messages" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tenant_id" TEXT NOT NULL,
    "subject" VARCHAR(200),
    "body" TEXT NOT NULL,
    "html_body" TEXT,
    "recipient_type" VARCHAR(20) NOT NULL,
    "recipient_filter" JSONB,
    "recipient_group_id" TEXT,
    "channel" VARCHAR(20) NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_messages_pkey" PRIMARY KEY ("id")
);

-- MessageRecipient: Individual recipient delivery status per broadcast
CREATE TABLE "message_recipients" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "broadcast_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "recipient_type" VARCHAR(20) NOT NULL,
    "recipient_name" VARCHAR(200) NOT NULL,
    "recipient_email" VARCHAR(255),
    "recipient_phone" VARCHAR(20),
    "email_status" VARCHAR(20),
    "email_sent_at" TIMESTAMP(3),
    "email_message_id" VARCHAR(255),
    "whatsapp_status" VARCHAR(20),
    "whatsapp_sent_at" TIMESTAMP(3),
    "whatsapp_wamid" VARCHAR(100),
    "sms_status" VARCHAR(20),
    "sms_sent_at" TIMESTAMP(3),
    "sms_message_id" VARCHAR(255),
    "last_error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- Indexes for RecipientGroup
CREATE UNIQUE INDEX "recipient_groups_tenant_id_name_key" ON "recipient_groups"("tenant_id", "name");
CREATE INDEX "recipient_groups_tenant_id_recipient_type_idx" ON "recipient_groups"("tenant_id", "recipient_type");

-- Indexes for BroadcastMessage
CREATE INDEX "broadcast_messages_tenant_id_status_idx" ON "broadcast_messages"("tenant_id", "status");
CREATE INDEX "broadcast_messages_tenant_id_recipient_type_idx" ON "broadcast_messages"("tenant_id", "recipient_type");
CREATE INDEX "broadcast_messages_tenant_id_created_at_idx" ON "broadcast_messages"("tenant_id", "created_at");

-- Indexes for MessageRecipient
CREATE UNIQUE INDEX "message_recipients_broadcast_id_recipient_id_key" ON "message_recipients"("broadcast_id", "recipient_id");
CREATE INDEX "message_recipients_broadcast_id_recipient_type_idx" ON "message_recipients"("broadcast_id", "recipient_type");
CREATE INDEX "message_recipients_email_status_idx" ON "message_recipients"("email_status");
CREATE INDEX "message_recipients_whatsapp_status_idx" ON "message_recipients"("whatsapp_status");

-- Foreign key constraints
ALTER TABLE "recipient_groups" ADD CONSTRAINT "recipient_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "broadcast_messages" ADD CONSTRAINT "broadcast_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "broadcast_messages" ADD CONSTRAINT "broadcast_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "broadcast_messages" ADD CONSTRAINT "broadcast_messages_recipient_group_id_fkey" FOREIGN KEY ("recipient_group_id") REFERENCES "recipient_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcast_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
