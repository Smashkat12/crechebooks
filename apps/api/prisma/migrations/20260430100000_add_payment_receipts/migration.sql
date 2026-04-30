-- AUDIT-PAY-04: Persist payment receipt S3 pointer
-- Additive + idempotent migration

CREATE TABLE IF NOT EXISTS payment_receipts (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  payment_id   UUID        NOT NULL,
  tenant_id    UUID        NOT NULL,
  s3_key       VARCHAR(500) NOT NULL,
  content_hash VARCHAR(64),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT payment_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT payment_receipts_payment_id_key UNIQUE (payment_id),
  CONSTRAINT payment_receipts_payment_id_fkey
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT payment_receipts_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_tenant
  ON payment_receipts(tenant_id);
