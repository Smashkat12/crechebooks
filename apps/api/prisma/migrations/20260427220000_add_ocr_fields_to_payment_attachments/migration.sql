-- Backlog #11 part 2: OCR extraction + match-suggestion fields on payment_attachments.
-- Populated asynchronously after an attachment reaches APPROVED reviewStatus.
-- All columns are nullable (no backfill needed).
-- suggestedPaymentId FK uses ON DELETE SET NULL so payment deletion never loses the OCR work.
-- match_confidence is DECIMAL(5,4) to store normalised 0.0000 – 1.0000 (matcher divides 0-100 ints by 100 before storing).

-- AlterTable: add OCR + match-suggestion columns idempotently
ALTER TABLE "payment_attachments"
  ADD COLUMN IF NOT EXISTS "ocr_text" TEXT,
  ADD COLUMN IF NOT EXISTS "extracted_amount" INTEGER,
  ADD COLUMN IF NOT EXISTS "extracted_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "extracted_reference" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "match_attempted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "match_confidence" DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS "suggested_payment_id" TEXT;

-- CreateIndex: matcher lookup pattern (find pending OCR suggestions for a payment within a tenant)
CREATE INDEX IF NOT EXISTS "payment_attachments_tenant_id_suggested_payment_id_idx"
  ON "payment_attachments"("tenant_id", "suggested_payment_id");

-- AddForeignKey: suggested_payment_id → payments(id), preserve OCR work on payment deletion
DO $$ BEGIN
  ALTER TABLE "payment_attachments"
    ADD CONSTRAINT "payment_attachments_suggested_payment_id_fkey"
    FOREIGN KEY ("suggested_payment_id") REFERENCES "payments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
