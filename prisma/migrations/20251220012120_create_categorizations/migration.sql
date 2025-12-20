-- CreateEnum
CREATE TYPE "VatType" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT');

-- CreateEnum
CREATE TYPE "CategorizationSource" AS ENUM ('AI_AUTO', 'AI_SUGGESTED', 'USER_OVERRIDE', 'RULE_BASED');

-- CreateTable
CREATE TABLE "categorizations" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "account_name" VARCHAR(100) NOT NULL,
    "confidence_score" DECIMAL(5,2) NOT NULL,
    "reasoning" TEXT,
    "source" "CategorizationSource" NOT NULL,
    "is_split" BOOLEAN NOT NULL DEFAULT false,
    "split_amount_cents" INTEGER,
    "vat_amount_cents" INTEGER,
    "vat_type" "VatType" NOT NULL DEFAULT 'STANDARD',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categorizations_transaction_id_idx" ON "categorizations"("transaction_id");

-- CreateIndex
CREATE INDEX "categorizations_account_code_idx" ON "categorizations"("account_code");

-- AddForeignKey
ALTER TABLE "categorizations" ADD CONSTRAINT "categorizations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorizations" ADD CONSTRAINT "categorizations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
