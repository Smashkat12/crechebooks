-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('READ_TENANTS', 'READ_PARENTS', 'READ_CHILDREN', 'READ_STAFF', 'READ_INVOICES', 'READ_PAYMENTS', 'READ_TRANSACTIONS', 'READ_REPORTS', 'WRITE_PARENTS', 'WRITE_CHILDREN', 'WRITE_STAFF', 'WRITE_INVOICES', 'WRITE_PAYMENTS', 'WRITE_TRANSACTIONS', 'MANAGE_USERS', 'MANAGE_API_KEYS', 'MANAGE_INTEGRATIONS', 'FULL_ACCESS');

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_prefix" VARCHAR(12) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scopes" "ApiKeyScope"[],
    "description" VARCHAR(500),
    "environment" VARCHAR(20) NOT NULL DEFAULT 'production',
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "last_used_ip" VARCHAR(45),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys"("tenant_id");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_revoked_at_idx" ON "api_keys"("tenant_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
