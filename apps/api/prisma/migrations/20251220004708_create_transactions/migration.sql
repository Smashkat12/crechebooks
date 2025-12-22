-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('BANK_FEED', 'CSV_IMPORT', 'PDF_IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CATEGORIZED', 'REVIEW_REQUIRED', 'SYNCED');

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "xero_transaction_id" TEXT,
    "bank_account" VARCHAR(50) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "payee_name" VARCHAR(200),
    "reference" VARCHAR(100),
    "amount_cents" INTEGER NOT NULL,
    "is_credit" BOOLEAN NOT NULL,
    "source" "ImportSource" NOT NULL,
    "import_batch_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "is_reconciled" BOOLEAN NOT NULL DEFAULT false,
    "reconciled_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_xero_transaction_id_key" ON "transactions"("xero_transaction_id");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_date_idx" ON "transactions"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_status_idx" ON "transactions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_payee_name_idx" ON "transactions"("tenant_id", "payee_name");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_is_reconciled_idx" ON "transactions"("tenant_id", "is_reconciled");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
