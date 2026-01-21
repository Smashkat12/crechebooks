-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppContextType" AS ENUM ('INVOICE', 'REMINDER', 'STATEMENT', 'WELCOME', 'ARREARS');

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "recipient_phone" VARCHAR(20) NOT NULL,
    "template_name" VARCHAR(100) NOT NULL,
    "template_params" JSONB,
    "wamid" VARCHAR(100),
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'PENDING',
    "status_updated_at" TIMESTAMP(3),
    "error_code" VARCHAR(50),
    "error_message" TEXT,
    "context_type" "WhatsAppContextType" NOT NULL,
    "context_id" VARCHAR(100),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_wamid_key" ON "whatsapp_messages"("wamid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_tenant_id_parent_id_idx" ON "whatsapp_messages"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_tenant_id_status_idx" ON "whatsapp_messages"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "whatsapp_messages_tenant_id_context_type_context_id_idx" ON "whatsapp_messages"("tenant_id", "context_type", "context_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_wamid_idx" ON "whatsapp_messages"("wamid");

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
