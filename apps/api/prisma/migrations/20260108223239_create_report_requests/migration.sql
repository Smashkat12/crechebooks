-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('ETI', 'TRANSACTION_HISTORY', 'VARIANCE', 'LEAVE_COMPARISON', 'LEAVE_LIABILITY', 'TRACKED_BALANCES');

-- CreateTable
CREATE TABLE "report_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "params" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "async_uuid" VARCHAR(100),
    "result_data" JSONB,
    "error_message" TEXT,
    "requested_by" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_requests_tenant_id_idx" ON "report_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "report_requests_status_idx" ON "report_requests"("status");

-- CreateIndex
CREATE INDEX "report_requests_async_uuid_idx" ON "report_requests"("async_uuid");

-- AddForeignKey
ALTER TABLE "report_requests" ADD CONSTRAINT "report_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
