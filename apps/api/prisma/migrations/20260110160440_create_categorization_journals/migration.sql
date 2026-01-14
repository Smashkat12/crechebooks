-- CreateEnum
CREATE TYPE "CategorizationJournalStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "categorization_journals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "xero_journal_id" VARCHAR(50),
    "journal_number" VARCHAR(50),
    "status" "CategorizationJournalStatus" NOT NULL DEFAULT 'PENDING',
    "from_account_code" VARCHAR(20) NOT NULL,
    "to_account_code" VARCHAR(20) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "is_credit" BOOLEAN NOT NULL,
    "narration" VARCHAR(500) NOT NULL,
    "posted_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorization_journals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorization_journals_transaction_id_key" ON "categorization_journals"("transaction_id");

-- CreateIndex
CREATE INDEX "categorization_journals_tenant_id_status_idx" ON "categorization_journals"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "categorization_journals" ADD CONSTRAINT "categorization_journals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_journals" ADD CONSTRAINT "categorization_journals_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
