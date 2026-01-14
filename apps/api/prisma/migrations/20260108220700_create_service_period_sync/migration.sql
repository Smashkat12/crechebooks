-- CreateEnum
CREATE TYPE "TerminationCode" AS ENUM ('RESIGNATION', 'DISMISSAL_MISCONDUCT', 'DISMISSAL_INCAPACITY', 'RETRENCHMENT', 'CONTRACT_EXPIRY', 'RETIREMENT', 'DEATH', 'ABSCONDED', 'TRANSFER');

-- CreateTable
CREATE TABLE "service_period_syncs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "simplepay_employee_id" VARCHAR(50) NOT NULL,
    "simplepay_period_id" VARCHAR(50) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "termination_code" "TerminationCode",
    "termination_reason" TEXT,
    "last_working_day" DATE,
    "final_payslip_id" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_period_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_period_syncs_tenant_id_idx" ON "service_period_syncs"("tenant_id");

-- CreateIndex
CREATE INDEX "service_period_syncs_staff_id_idx" ON "service_period_syncs"("staff_id");

-- CreateIndex
CREATE INDEX "service_period_syncs_tenant_id_is_active_idx" ON "service_period_syncs"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "service_period_syncs_tenant_id_staff_id_simplepay_period_id_key" ON "service_period_syncs"("tenant_id", "staff_id", "simplepay_period_id");

-- AddForeignKey
ALTER TABLE "service_period_syncs" ADD CONSTRAINT "service_period_syncs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_period_syncs" ADD CONSTRAINT "service_period_syncs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
