-- Backlog #11: parent proof-of-payment uploads.
--
-- Parents upload EFT screenshots / deposit slips from the parent portal. Files
-- live in S3 under StorageKind.ProofOfPayment; this table stores the metadata
-- and review state.
--
-- Cascade design:
--   tenant_id        → tenants(id)   ON DELETE RESTRICT  -- preserve tenant data
--   payment_id       → payments(id)  ON DELETE SET NULL  -- proof survives payment deletion (audit)
--   parent_id        → parents(id)   ON DELETE SET NULL  -- proof survives parent deletion (audit)
--   uploaded_by_id   → users(id)     ON DELETE SET NULL  -- preserve upload record if user removed
--   reviewed_by_id   → users(id)     ON DELETE SET NULL  -- preserve review record if user removed
--
-- All ID/FK columns are TEXT to match the existing String-uuid PKs (Prisma
-- emits TEXT NOT NULL for `String @id @default(uuid())`, not UUID).
--
-- All blocks are idempotent: enums, table, indexes, FKs are guarded so the
-- migration is safe to re-run if interrupted.

-- CreateEnum: PaymentAttachmentKind
DO $$ BEGIN
  CREATE TYPE "PaymentAttachmentKind" AS ENUM ('PROOF_OF_PAYMENT', 'RECEIPT', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: PaymentAttachmentStatus
DO $$ BEGIN
  CREATE TYPE "PaymentAttachmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: payment_attachments
CREATE TABLE IF NOT EXISTS "payment_attachments" (
    "id"             TEXT NOT NULL,
    "tenant_id"      TEXT NOT NULL,
    "payment_id"     TEXT,
    "parent_id"      TEXT,
    "uploaded_by_id" TEXT,
    "kind"           "PaymentAttachmentKind" NOT NULL DEFAULT 'PROOF_OF_PAYMENT',
    "s3_key"         VARCHAR(500) NOT NULL,
    "filename"       VARCHAR(200) NOT NULL,
    "content_type"   VARCHAR(100) NOT NULL,
    "file_size"      INTEGER NOT NULL,
    "note"           VARCHAR(500),
    "uploaded_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at"    TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "review_status"  "PaymentAttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_attachments_tenant_id_uploaded_at_idx" ON "payment_attachments"("tenant_id", "uploaded_at");
CREATE INDEX IF NOT EXISTS "payment_attachments_tenant_id_payment_id_idx" ON "payment_attachments"("tenant_id", "payment_id");
CREATE INDEX IF NOT EXISTS "payment_attachments_tenant_id_review_status_idx" ON "payment_attachments"("tenant_id", "review_status");
CREATE INDEX IF NOT EXISTS "payment_attachments_parent_id_uploaded_at_idx" ON "payment_attachments"("parent_id", "uploaded_at");

-- AddForeignKey: payment_attachments.tenant_id → tenants.id (RESTRICT)
DO $$ BEGIN
  ALTER TABLE "payment_attachments"
    ADD CONSTRAINT "payment_attachments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: payment_attachments.payment_id → payments.id (SET NULL)
DO $$ BEGIN
  ALTER TABLE "payment_attachments"
    ADD CONSTRAINT "payment_attachments_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: payment_attachments.parent_id → parents.id (SET NULL)
DO $$ BEGIN
  ALTER TABLE "payment_attachments"
    ADD CONSTRAINT "payment_attachments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "parents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: payment_attachments.uploaded_by_id → users.id (SET NULL)
DO $$ BEGIN
  ALTER TABLE "payment_attachments"
    ADD CONSTRAINT "payment_attachments_uploaded_by_id_fkey"
    FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: payment_attachments.reviewed_by_id → users.id (SET NULL)
DO $$ BEGIN
  ALTER TABLE "payment_attachments"
    ADD CONSTRAINT "payment_attachments_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
