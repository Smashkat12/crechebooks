-- CreateEnum
CREATE TYPE "SetupStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'FAILED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "employee_setup_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "simplepay_employee_id" TEXT,
    "status" "SetupStatus" NOT NULL DEFAULT 'PENDING',
    "setup_steps" JSONB NOT NULL DEFAULT '[]',
    "profile_assigned" TEXT,
    "leave_initialized" BOOLEAN NOT NULL DEFAULT false,
    "tax_configured" BOOLEAN NOT NULL DEFAULT false,
    "calculations_added" INTEGER NOT NULL DEFAULT 0,
    "triggered_by" TEXT NOT NULL,
    "errors" JSONB,
    "warnings" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "employee_setup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_setup_logs_staff_id_key" ON "employee_setup_logs"("staff_id");

-- CreateIndex
CREATE INDEX "employee_setup_logs_tenant_id_idx" ON "employee_setup_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "employee_setup_logs_status_idx" ON "employee_setup_logs"("status");

-- AddForeignKey
ALTER TABLE "employee_setup_logs" ADD CONSTRAINT "employee_setup_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_setup_logs" ADD CONSTRAINT "employee_setup_logs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
