-- CreateEnum
CREATE TYPE "TaxStatus" AS ENUM ('VAT_REGISTERED', 'NOT_REGISTERED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "trading_name" VARCHAR(200),
    "registration_number" VARCHAR(50),
    "vat_number" VARCHAR(20),
    "tax_status" "TaxStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "address_line1" VARCHAR(200) NOT NULL,
    "address_line2" VARCHAR(200),
    "city" VARCHAR(100) NOT NULL,
    "province" VARCHAR(50) NOT NULL,
    "postal_code" VARCHAR(10) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "xero_tenant_id" VARCHAR(50),
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "invoice_day_of_month" INTEGER NOT NULL DEFAULT 1,
    "invoice_due_days" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_xero_tenant_id_key" ON "tenants"("xero_tenant_id");
