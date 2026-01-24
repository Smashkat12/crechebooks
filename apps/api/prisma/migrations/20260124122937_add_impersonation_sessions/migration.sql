/*
  Warnings:

  - You are about to drop the column `manual_match_at` on the `bank_statement_matches` table. All the data in the column will be lost.
  - You are about to drop the column `manual_match_by` on the `bank_statement_matches` table. All the data in the column will be lost.
  - You are about to drop the column `match_type` on the `bank_statement_matches` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `contact_submissions` table. The data in that column could be lost. The data in that column will be cast from `VarChar(200)` to `VarChar(100)`.
  - You are about to alter the column `full_name` on the `demo_requests` table. The data in that column could be lost. The data in that column will be cast from `VarChar(200)` to `VarChar(100)`.
  - You are about to alter the column `preferred_time` on the `demo_requests` table. The data in that column could be lost. The data in that column will be cast from `VarChar(50)` to `VarChar(20)`.
  - The primary key for the `duplicate_resolutions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `manual_match_history` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `sync_status` column on the `xero_invoice_mappings` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `subject` on table `contact_submissions` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `children_count` on the `demo_requests` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `sync_direction` on the `xero_invoice_mappings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "InvoiceSyncDirection" AS ENUM ('PUSH', 'PULL', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "InvoiceSyncStatus" AS ENUM ('SYNCED', 'PENDING', 'FAILED', 'OUT_OF_SYNC');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'IMPERSONATION_START';
ALTER TYPE "AuditAction" ADD VALUE 'IMPERSONATION_END';

-- AlterEnum
ALTER TYPE "BankStatementMatchStatus" ADD VALUE 'FEE_ADJUSTED_MATCH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubmissionStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "SubmissionStatus" ADD VALUE 'REJECTED';

-- DropForeignKey
ALTER TABLE "bank_statement_matches" DROP CONSTRAINT "bank_statement_matches_manual_match_by_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "webhook_logs" DROP CONSTRAINT "webhook_logs_tenant_id_fkey";

-- DropIndex
DROP INDEX "bank_statement_matches_manual_match_by_idx";

-- AlterTable
ALTER TABLE "bank_statement_matches" DROP COLUMN "manual_match_at",
DROP COLUMN "manual_match_by",
DROP COLUMN "match_type",
ADD COLUMN     "accrued_fee_amount_cents" INTEGER,
ADD COLUMN     "fee_type" VARCHAR(50),
ADD COLUMN     "is_fee_adjusted_match" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "broadcast_messages" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "contact_submissions" ALTER COLUMN "name" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "subject" SET NOT NULL,
ALTER COLUMN "subject" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "demo_requests" ALTER COLUMN "full_name" SET DATA TYPE VARCHAR(100),
DROP COLUMN "children_count",
ADD COLUMN     "children_count" INTEGER NOT NULL,
ALTER COLUMN "current_software" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "preferred_time" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "duplicate_resolutions" DROP CONSTRAINT "duplicate_resolutions_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT,
ADD CONSTRAINT "duplicate_resolutions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "manual_match_history" DROP CONSTRAINT "manual_match_history_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "manual_match_history_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "message_recipients" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "recipient_groups" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "xero_invoice_mappings" DROP COLUMN "sync_direction",
ADD COLUMN     "sync_direction" "InvoiceSyncDirection" NOT NULL,
DROP COLUMN "sync_status",
ADD COLUMN     "sync_status" "InvoiceSyncStatus" NOT NULL DEFAULT 'SYNCED';

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" TEXT NOT NULL,
    "super_admin_id" TEXT NOT NULL,
    "target_tenant_id" TEXT NOT NULL,
    "assumed_role" "UserRole" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "impersonation_sessions_super_admin_id_is_active_idx" ON "impersonation_sessions"("super_admin_id", "is_active");

-- CreateIndex
CREATE INDEX "impersonation_sessions_target_tenant_id_idx" ON "impersonation_sessions"("target_tenant_id");

-- CreateIndex
CREATE INDEX "impersonation_sessions_expires_at_idx" ON "impersonation_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "demo_requests_province_idx" ON "demo_requests"("province");

-- CreateIndex
CREATE INDEX "xero_invoice_mappings_tenant_id_sync_status_idx" ON "xero_invoice_mappings"("tenant_id", "sync_status");

-- CreateIndex
CREATE INDEX "xero_transaction_splits_tenant_id_idx" ON "xero_transaction_splits"("tenant_id");

-- CreateIndex
CREATE INDEX "xero_transaction_splits_tenant_id_status_idx" ON "xero_transaction_splits"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "xero_transaction_splits_xero_transaction_id_idx" ON "xero_transaction_splits"("xero_transaction_id");

-- CreateIndex
CREATE INDEX "xero_transaction_splits_bank_transaction_id_idx" ON "xero_transaction_splits"("bank_transaction_id");

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_super_admin_id_fkey" FOREIGN KEY ("super_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_target_tenant_id_fkey" FOREIGN KEY ("target_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_transaction_splits" ADD CONSTRAINT "xero_transaction_splits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_transaction_splits" ADD CONSTRAINT "xero_transaction_splits_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_transaction_splits" ADD CONSTRAINT "xero_transaction_splits_bank_statement_match_id_fkey" FOREIGN KEY ("bank_statement_match_id") REFERENCES "bank_statement_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_transaction_splits" ADD CONSTRAINT "xero_transaction_splits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_transaction_splits" ADD CONSTRAINT "xero_transaction_splits_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "children_tenantId_deletedAt_idx" RENAME TO "children_tenant_id_deleted_at_idx";

-- RenameIndex
ALTER INDEX "parents_tenantId_deletedAt_idx" RENAME TO "parents_tenant_id_deleted_at_idx";

-- RenameIndex
ALTER INDEX "payments_tenantId_deletedAt_idx" RENAME TO "payments_tenant_id_deleted_at_idx";

-- RenameIndex
ALTER INDEX "staff_tenantId_deletedAt_idx" RENAME TO "staff_tenant_id_deleted_at_idx";
