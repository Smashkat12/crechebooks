-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('EXACT', 'PARTIAL', 'MANUAL', 'OVERPAYMENT');

-- CreateEnum
CREATE TYPE "MatchedBy" AS ENUM ('AI_AUTO', 'USER');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "xero_payment_id" TEXT,
    "transaction_id" TEXT,
    "invoice_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "reference" VARCHAR(100),
    "match_type" "MatchType" NOT NULL,
    "match_confidence" DECIMAL(5,2),
    "matched_by" "MatchedBy" NOT NULL,
    "is_reversed" BOOLEAN NOT NULL DEFAULT false,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_xero_payment_id_key" ON "payments"("xero_payment_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_transaction_id_idx" ON "payments"("tenant_id", "transaction_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_invoice_id_idx" ON "payments"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payments_xero_payment_id_idx" ON "payments"("xero_payment_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
