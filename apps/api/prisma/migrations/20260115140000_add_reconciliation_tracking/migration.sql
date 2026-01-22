-- TASK-RECON-004: Duplicate Detection
-- TASK-RECON-005: Manual Match Override with tracking and undo

-- Create duplicate resolution table for tracking false positives and confirmed duplicates
CREATE TABLE "duplicate_resolutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "composite_key" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_resolutions_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for tenant + composite key
CREATE UNIQUE INDEX "duplicate_resolutions_tenant_id_composite_key_key" ON "duplicate_resolutions"("tenant_id", "composite_key");

-- Create index for querying by tenant
CREATE INDEX "duplicate_resolutions_tenant_id_idx" ON "duplicate_resolutions"("tenant_id");

-- Create index for querying by status
CREATE INDEX "duplicate_resolutions_status_idx" ON "duplicate_resolutions"("status");

-- Add foreign key for tenant
ALTER TABLE "duplicate_resolutions" ADD CONSTRAINT "duplicate_resolutions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key for resolved_by user
ALTER TABLE "duplicate_resolutions" ADD CONSTRAINT "duplicate_resolutions_resolved_by_fkey"
    FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create manual match history table for audit and undo functionality
CREATE TABLE "manual_match_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "match_id" UUID NOT NULL,
    "previous_transaction_id" UUID,
    "new_transaction_id" UUID,
    "performed_by" UUID NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" VARCHAR(20) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "manual_match_history_pkey" PRIMARY KEY ("id")
);

-- Create indexes for manual match history
CREATE INDEX "manual_match_history_tenant_id_idx" ON "manual_match_history"("tenant_id");
CREATE INDEX "manual_match_history_match_id_idx" ON "manual_match_history"("match_id");
CREATE INDEX "manual_match_history_performed_by_idx" ON "manual_match_history"("performed_by");
CREATE INDEX "manual_match_history_performed_at_idx" ON "manual_match_history"("performed_at" DESC);

-- Add foreign keys for manual match history
ALTER TABLE "manual_match_history" ADD CONSTRAINT "manual_match_history_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manual_match_history" ADD CONSTRAINT "manual_match_history_match_id_fkey"
    FOREIGN KEY ("match_id") REFERENCES "bank_statement_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manual_match_history" ADD CONSTRAINT "manual_match_history_performed_by_fkey"
    FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "manual_match_history" ADD CONSTRAINT "manual_match_history_previous_transaction_id_fkey"
    FOREIGN KEY ("previous_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "manual_match_history" ADD CONSTRAINT "manual_match_history_new_transaction_id_fkey"
    FOREIGN KEY ("new_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add match_type column to bank_statement_matches for tracking automatic vs manual matches
ALTER TABLE "bank_statement_matches" ADD COLUMN "match_type" VARCHAR(20) DEFAULT 'AUTOMATIC';

-- Add manual_match_by column to track who performed manual matches
ALTER TABLE "bank_statement_matches" ADD COLUMN "manual_match_by" UUID;
ALTER TABLE "bank_statement_matches" ADD COLUMN "manual_match_at" TIMESTAMP(3);

-- Add foreign key for manual_match_by
ALTER TABLE "bank_statement_matches" ADD CONSTRAINT "bank_statement_matches_manual_match_by_fkey"
    FOREIGN KEY ("manual_match_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for manual matches
CREATE INDEX "bank_statement_matches_manual_match_by_idx" ON "bank_statement_matches"("manual_match_by");
