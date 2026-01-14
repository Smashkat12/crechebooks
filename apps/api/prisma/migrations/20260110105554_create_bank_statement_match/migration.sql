-- CreateEnum
CREATE TYPE "BankStatementMatchStatus" AS ENUM ('MATCHED', 'IN_BANK_ONLY', 'IN_XERO_ONLY', 'AMOUNT_MISMATCH', 'DATE_MISMATCH');

-- CreateTable
CREATE TABLE "bank_statement_matches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "bank_date" DATE NOT NULL,
    "bank_description" TEXT NOT NULL,
    "bank_amount_cents" INTEGER NOT NULL,
    "bank_is_credit" BOOLEAN NOT NULL,
    "transaction_id" TEXT,
    "xero_date" DATE,
    "xero_description" TEXT,
    "xero_amount_cents" INTEGER,
    "xero_is_credit" BOOLEAN,
    "status" "BankStatementMatchStatus" NOT NULL,
    "match_confidence" DECIMAL(5,2),
    "discrepancy_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_statement_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statement_matches_tenant_id_idx" ON "bank_statement_matches"("tenant_id");

-- CreateIndex
CREATE INDEX "bank_statement_matches_reconciliation_id_idx" ON "bank_statement_matches"("reconciliation_id");

-- CreateIndex
CREATE INDEX "bank_statement_matches_transaction_id_idx" ON "bank_statement_matches"("transaction_id");

-- CreateIndex
CREATE INDEX "bank_statement_matches_tenant_id_status_idx" ON "bank_statement_matches"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "bank_statement_matches" ADD CONSTRAINT "bank_statement_matches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_matches" ADD CONSTRAINT "bank_statement_matches_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_matches" ADD CONSTRAINT "bank_statement_matches_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
