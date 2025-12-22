-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'CASUAL');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "employee_number" VARCHAR(50),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "id_number" VARCHAR(13) NOT NULL,
    "tax_number" VARCHAR(20),
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "date_of_birth" DATE NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "employment_type" "EmploymentType" NOT NULL,
    "pay_frequency" "PayFrequency" NOT NULL DEFAULT 'MONTHLY',
    "basic_salary_cents" INTEGER NOT NULL,
    "bank_name" VARCHAR(100),
    "bank_account" VARCHAR(20),
    "bank_branch_code" VARCHAR(10),
    "medical_aid_members" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "pay_period_start" DATE NOT NULL,
    "pay_period_end" DATE NOT NULL,
    "basic_salary_cents" INTEGER NOT NULL,
    "overtime_cents" INTEGER NOT NULL DEFAULT 0,
    "bonus_cents" INTEGER NOT NULL DEFAULT 0,
    "other_earnings_cents" INTEGER NOT NULL DEFAULT 0,
    "gross_salary_cents" INTEGER NOT NULL,
    "paye_cents" INTEGER NOT NULL,
    "uif_employee_cents" INTEGER NOT NULL,
    "uif_employer_cents" INTEGER NOT NULL,
    "other_deductions_cents" INTEGER NOT NULL DEFAULT 0,
    "net_salary_cents" INTEGER NOT NULL,
    "medical_aid_credit_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_tenant_id_is_active_idx" ON "staff"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "staff_tenant_id_id_number_key" ON "staff"("tenant_id", "id_number");

-- CreateIndex
CREATE INDEX "payrolls_tenant_id_status_idx" ON "payrolls"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payrolls_tenant_id_pay_period_start_idx" ON "payrolls"("tenant_id", "pay_period_start");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_tenant_id_staff_id_pay_period_start_key" ON "payrolls"("tenant_id", "staff_id", "pay_period_start");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
