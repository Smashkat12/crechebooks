-- AUDIT-PAY-04: Persist payment receipt S3 pointer
-- Additive + idempotent migration.
-- Column types match Prisma's String @id @default(uuid()) convention (TEXT, not UUID)
-- so the FK to payments(id) and tenants(id) can be enforced.

CREATE TABLE IF NOT EXISTS payment_receipts (
  id           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  payment_id   TEXT         NOT NULL,
  tenant_id    TEXT         NOT NULL,
  s3_key       VARCHAR(500) NOT NULL,
  content_hash VARCHAR(64),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT payment_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT payment_receipts_payment_id_key UNIQUE (payment_id),
  CONSTRAINT payment_receipts_payment_id_fkey
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT payment_receipts_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_tenant
  ON payment_receipts(tenant_id);
