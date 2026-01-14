-- CreateEnum
CREATE TYPE "XeroAccountStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "xero_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "tax_type" VARCHAR(50),
    "status" "XeroAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "xero_account_id" VARCHAR(50),
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "xero_accounts_tenant_id_idx" ON "xero_accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "xero_accounts_tenant_id_status_idx" ON "xero_accounts"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "xero_accounts_tenant_id_account_code_key" ON "xero_accounts"("tenant_id", "account_code");

-- AddForeignKey
ALTER TABLE "xero_accounts" ADD CONSTRAINT "xero_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
