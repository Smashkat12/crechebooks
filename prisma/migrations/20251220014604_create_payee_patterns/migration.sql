-- CreateTable
CREATE TABLE "payee_patterns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payee_pattern" VARCHAR(200) NOT NULL,
    "payee_aliases" JSONB NOT NULL DEFAULT '[]',
    "default_account_code" VARCHAR(20) NOT NULL,
    "default_account_name" VARCHAR(100) NOT NULL,
    "confidence_boost" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "expected_amount_cents" INTEGER,
    "amount_variance_percent" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payee_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payee_patterns_tenant_id_idx" ON "payee_patterns"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payee_patterns_tenant_id_payee_pattern_key" ON "payee_patterns"("tenant_id", "payee_pattern");

-- AddForeignKey
ALTER TABLE "payee_patterns" ADD CONSTRAINT "payee_patterns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
