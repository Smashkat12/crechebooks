-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'CATEGORIZE', 'MATCH', 'RECONCILE', 'SUBMIT');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "agent_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "change_summary" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_idx" ON "audit_logs"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- ============================================
-- IMMUTABILITY RULES
-- Prevents UPDATE and DELETE on audit_logs table
-- ============================================

-- Prevent UPDATE on audit_logs (immutable)
CREATE RULE prevent_audit_log_update AS
  ON UPDATE TO audit_logs DO INSTEAD NOTHING;

-- Prevent DELETE on audit_logs (immutable)
CREATE RULE prevent_audit_log_delete AS
  ON DELETE TO audit_logs DO INSTEAD NOTHING;
