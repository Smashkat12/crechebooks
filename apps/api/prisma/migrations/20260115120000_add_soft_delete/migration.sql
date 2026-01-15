-- TASK-DATA-003: Add soft delete support to key entities
-- Add deletedAt timestamp fields for soft delete functionality

-- Add deletedAt to parents table
ALTER TABLE "parents" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deletedAt to children table
ALTER TABLE "children" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deletedAt to staff table
ALTER TABLE "staff" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add deletedAt to payments table
ALTER TABLE "payments" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add indexes for efficient filtering of soft-deleted records
CREATE INDEX "parents_tenantId_deletedAt_idx" ON "parents"("tenant_id", "deleted_at");
CREATE INDEX "children_tenantId_deletedAt_idx" ON "children"("tenant_id", "deleted_at");
CREATE INDEX "staff_tenantId_deletedAt_idx" ON "staff"("tenant_id", "deleted_at");
CREATE INDEX "payments_tenantId_deletedAt_idx" ON "payments"("tenant_id", "deleted_at");
