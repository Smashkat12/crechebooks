-- CreateTable
CREATE TABLE "xero_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "xero_tenant_id" TEXT NOT NULL,
    "encrypted_tokens" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "xero_tokens_tenant_id_key" ON "xero_tokens"("tenant_id");

-- CreateIndex
CREATE INDEX "xero_tokens_tenant_id_idx" ON "xero_tokens"("tenant_id");

-- AddForeignKey
ALTER TABLE "xero_tokens" ADD CONSTRAINT "xero_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
