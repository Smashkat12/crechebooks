-- CreateTable: stub_connections (idempotent)
-- Stub.africa integration — one connection per tenant.
-- Table already exists on staging (bootstrapped via raw SQL in stub-accounting.adapter.ts).
-- This migration is a no-op on staging, creates the table on production.

CREATE TABLE IF NOT EXISTS "stub_connections" (
    "tenant_id"         VARCHAR(50)  NOT NULL,
    "stub_business_uid" VARCHAR(100),
    "is_active"         BOOLEAN      NOT NULL DEFAULT false,
    "connected_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "last_sync_at"      TIMESTAMPTZ,
    "last_sync_status"  VARCHAR(20),
    "error_message"     TEXT,
    "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "stub_connections_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey: stub_connections.tenant_id -> tenants.id (idempotent)
-- ON DELETE/UPDATE intentionally omitted = NO ACTION (PG default). This matches
-- the FK created by the runtime bootstrap on staging. Schema declares the same
-- via @relation(..., onDelete: NoAction, onUpdate: NoAction).
DO $$ BEGIN
  ALTER TABLE "stub_connections"
    ADD CONSTRAINT "stub_connections_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
