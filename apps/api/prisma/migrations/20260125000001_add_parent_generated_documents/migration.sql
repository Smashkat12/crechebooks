-- CreateTable: ParentGeneratedDocument
-- Stores fee agreements, consent forms, and other onboarding documents for parents

CREATE TABLE "parent_generated_documents" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" TIMESTAMP(3),
    "signed_by_name" VARCHAR(200),
    "signed_by_ip" VARCHAR(45),
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parent_generated_documents_parent_id_idx" ON "parent_generated_documents"("parent_id");

-- CreateIndex
CREATE INDEX "parent_generated_documents_parent_id_document_type_idx" ON "parent_generated_documents"("parent_id", "document_type");

-- CreateIndex
CREATE INDEX "parent_generated_documents_tenant_id_idx" ON "parent_generated_documents"("tenant_id");

-- AddForeignKey
ALTER TABLE "parent_generated_documents" ADD CONSTRAINT "parent_generated_documents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
