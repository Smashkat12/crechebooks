-- CreateEnum
CREATE TYPE "BulkOperationType" AS ENUM ('GENERIC_INPUT', 'SALARY_ADJUSTMENT', 'BONUS_DISTRIBUTION', 'DEDUCTION_SETUP', 'EMPLOYEE_UPDATE');

-- CreateEnum
CREATE TYPE "BulkOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED');

-- CreateTable
CREATE TABLE "bulk_operation_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "operation_type" "BulkOperationType" NOT NULL,
    "status" "BulkOperationStatus" NOT NULL DEFAULT 'PENDING',
    "total_entities" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "request_data" JSONB NOT NULL,
    "result_data" JSONB,
    "errors" JSONB,
    "warnings" JSONB,
    "executed_by" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "bulk_operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulk_operation_logs_tenant_id_idx" ON "bulk_operation_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "bulk_operation_logs_operation_type_idx" ON "bulk_operation_logs"("operation_type");

-- CreateIndex
CREATE INDEX "bulk_operation_logs_status_idx" ON "bulk_operation_logs"("status");

-- AddForeignKey
ALTER TABLE "bulk_operation_logs" ADD CONSTRAINT "bulk_operation_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
