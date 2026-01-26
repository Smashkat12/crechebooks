-- CreateTable
CREATE TABLE "agent_audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agent_type" VARCHAR(30) NOT NULL,
    "event_type" VARCHAR(30) NOT NULL,
    "workflow_id" TEXT,
    "transaction_id" TEXT,
    "decision" VARCHAR(50) NOT NULL,
    "confidence" INTEGER,
    "source" VARCHAR(20),
    "auto_applied" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB NOT NULL,
    "reasoning" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "flag" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" VARCHAR(20) NOT NULL DEFAULT 'SHADOW',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_audit_logs_tenant_id_agent_type_idx" ON "agent_audit_logs"("tenant_id", "agent_type");

-- CreateIndex
CREATE INDEX "agent_audit_logs_tenant_id_event_type_idx" ON "agent_audit_logs"("tenant_id", "event_type");

-- CreateIndex
CREATE INDEX "agent_audit_logs_tenant_id_created_at_idx" ON "agent_audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_audit_logs_workflow_id_idx" ON "agent_audit_logs"("workflow_id");

-- CreateIndex
CREATE INDEX "agent_audit_logs_transaction_id_idx" ON "agent_audit_logs"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_tenant_id_flag_key" ON "feature_flags"("tenant_id", "flag");

-- CreateIndex
CREATE INDEX "feature_flags_tenant_id_idx" ON "feature_flags"("tenant_id");

-- AddForeignKey
ALTER TABLE "agent_audit_logs" ADD CONSTRAINT "agent_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
