-- CreateTable
CREATE TABLE "whatsapp_content_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "friendly_name" VARCHAR(200) NOT NULL,
    "content_sid" VARCHAR(50) NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "category" VARCHAR(20) NOT NULL DEFAULT 'UTILITY',
    "content_type" VARCHAR(50) NOT NULL,
    "approval_status" VARCHAR(30),
    "variables" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "whatsapp_content_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_content_templates_friendly_name_key" ON "whatsapp_content_templates"("friendly_name");

-- CreateIndex
CREATE INDEX "whatsapp_content_templates_tenant_id_idx" ON "whatsapp_content_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "whatsapp_content_templates_approval_status_idx" ON "whatsapp_content_templates"("approval_status");

-- CreateIndex
CREATE INDEX "whatsapp_content_templates_content_sid_idx" ON "whatsapp_content_templates"("content_sid");

-- AddForeignKey
ALTER TABLE "whatsapp_content_templates" ADD CONSTRAINT "whatsapp_content_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
