-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('VAT201', 'EMP201', 'IRP5');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "sars_submissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "submission_type" "SubmissionType" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "deadline" DATE NOT NULL,
    "output_vat_cents" INTEGER,
    "input_vat_cents" INTEGER,
    "net_vat_cents" INTEGER,
    "total_paye_cents" INTEGER,
    "total_uif_cents" INTEGER,
    "total_sdl_cents" INTEGER,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "submitted_by" TEXT,
    "sars_reference" VARCHAR(100),
    "document_data" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "is_finalized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sars_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sars_submissions_tenant_id_status_idx" ON "sars_submissions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sars_submissions_deadline_idx" ON "sars_submissions"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "sars_submissions_tenant_id_submission_type_period_start_key" ON "sars_submissions"("tenant_id", "submission_type", "period_start");

-- AddForeignKey
ALTER TABLE "sars_submissions" ADD CONSTRAINT "sars_submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sars_submissions" ADD CONSTRAINT "sars_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
