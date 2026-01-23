-- CreateEnum
CREATE TYPE "PendingSyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRY');

-- CreateEnum
CREATE TYPE "PendingSyncEntityType" AS ENUM ('INVOICE', 'PAYMENT', 'TRANSACTION', 'CONTACT', 'JOURNAL');

-- CreateEnum
CREATE TYPE "LinkedBankAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "SplitMatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SplitMatchType" AS ENUM ('ONE_TO_MANY', 'MANY_TO_ONE');

-- CreateEnum
CREATE TYPE "UI19Type" AS ENUM ('COMMENCEMENT', 'TERMINATION');

-- CreateEnum
CREATE TYPE "UI19Status" AS ENUM ('PENDING', 'SUBMITTED', 'LATE_SUBMITTED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "VatAdjustmentType" AS ENUM ('CHANGE_IN_USE_OUTPUT', 'CHANGE_IN_USE_INPUT', 'OTHER_OUTPUT', 'OTHER_INPUT', 'BAD_DEBTS_WRITTEN_OFF', 'BAD_DEBTS_RECOVERED', 'CAPITAL_GOODS_SCHEME');

-- CreateEnum
CREATE TYPE "AccruedBankChargeStatus" AS ENUM ('ACCRUED', 'MATCHED', 'REVERSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "XeroTransactionSplitStatus" AS ENUM ('PENDING', 'CONFIRMED', 'MATCHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "pending_syncs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" "PendingSyncEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "payload" JSONB,
    "status" "PendingSyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "pending_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_bank_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "account_holder_name" VARCHAR(200),
    "account_number_masked" VARCHAR(20) NOT NULL,
    "account_type" VARCHAR(50) NOT NULL,
    "stitch_account_id" VARCHAR(100) NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "consent_expires_at" TIMESTAMP(3) NOT NULL,
    "consent_granted_at" TIMESTAMP(3) NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "sync_error_count" INTEGER NOT NULL DEFAULT 0,
    "status" "LinkedBankAccountStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linked_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_bank_sync_events" (
    "id" TEXT NOT NULL,
    "linked_bank_account_id" TEXT NOT NULL,
    "sync_type" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "transactions_fetched" INTEGER,
    "transactions_imported" INTEGER,
    "transactions_duplicate" INTEGER,
    "status" VARCHAR(20) NOT NULL,
    "error_message" TEXT,
    "error_code" VARCHAR(50),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linked_bank_sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_matches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "match_type" "SplitMatchType" NOT NULL,
    "total_amount_cents" INTEGER NOT NULL,
    "matched_amount_cents" INTEGER NOT NULL,
    "remainder_cents" INTEGER NOT NULL,
    "status" "SplitMatchStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_match_components" (
    "id" TEXT NOT NULL,
    "split_match_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "payment_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "split_match_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "level_1_days" INTEGER NOT NULL DEFAULT 7,
    "level_2_days" INTEGER NOT NULL DEFAULT 14,
    "level_3_days" INTEGER NOT NULL DEFAULT 30,
    "level_4_days" INTEGER NOT NULL DEFAULT 60,
    "cc_admin_level" INTEGER NOT NULL DEFAULT 3,
    "send_hours_start" INTEGER NOT NULL DEFAULT 8,
    "send_hours_end" INTEGER NOT NULL DEFAULT 18,
    "max_per_day" INTEGER NOT NULL DEFAULT 1,
    "admin_email" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ui19_submissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "type" "UI19Type" NOT NULL,
    "event_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "UI19Status" NOT NULL DEFAULT 'PENDING',
    "submitted_at" TIMESTAMP(3),
    "submitted_by" TEXT,
    "reference_number" VARCHAR(50),
    "late_reason" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ui19_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_adjustments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "adjustment_type" "VatAdjustmentType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "adjustment_date" DATE NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "reference" VARCHAR(100),
    "invoice_id" TEXT,
    "transaction_id" TEXT,
    "notes" TEXT,
    "is_voided" BOOLEAN NOT NULL DEFAULT false,
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "void_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "source" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "delivery_id" VARCHAR(100),
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_invoice_mappings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "xero_invoice_id" VARCHAR(50) NOT NULL,
    "xero_invoice_number" VARCHAR(50),
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "sync_direction" TEXT NOT NULL,
    "sync_status" TEXT NOT NULL DEFAULT 'SYNCED',
    "sync_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_invoice_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_contact_mappings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "xero_contact_id" TEXT NOT NULL,
    "xero_contact_name" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_contact_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_payment_mappings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "xero_payment_id" TEXT NOT NULL,
    "xero_invoice_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "sync_direction" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_payment_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accrued_bank_charges" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_transaction_id" TEXT,
    "source_description" TEXT NOT NULL,
    "source_date" DATE NOT NULL,
    "source_amount_cents" INTEGER NOT NULL,
    "accrued_amount_cents" INTEGER NOT NULL,
    "fee_type" VARCHAR(50) NOT NULL,
    "fee_description" TEXT,
    "status" "AccruedBankChargeStatus" NOT NULL DEFAULT 'ACCRUED',
    "bank_statement_match_id" TEXT,
    "xero_transaction_id" TEXT,
    "xero_amount_cents" INTEGER,
    "charge_transaction_id" TEXT,
    "charge_date" DATE,
    "matched_at" TIMESTAMP(3),
    "matched_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accrued_bank_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_transaction_splits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "xero_transaction_id" TEXT NOT NULL,
    "original_amount_cents" INTEGER NOT NULL,
    "net_amount_cents" INTEGER NOT NULL,
    "fee_amount_cents" INTEGER NOT NULL,
    "fee_type" VARCHAR(50) NOT NULL,
    "fee_description" TEXT,
    "status" "XeroTransactionSplitStatus" NOT NULL DEFAULT 'PENDING',
    "accrued_charge_id" TEXT,
    "bank_transaction_id" TEXT,
    "bank_statement_match_id" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_syncs_tenant_id_status_idx" ON "pending_syncs"("tenant_id", "status");
CREATE INDEX "pending_syncs_entity_type_entity_id_idx" ON "pending_syncs"("entity_type", "entity_id");
CREATE INDEX "pending_syncs_created_at_idx" ON "pending_syncs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "linked_bank_accounts_stitch_account_id_key" ON "linked_bank_accounts"("stitch_account_id");
CREATE INDEX "linked_bank_accounts_tenant_id_status_idx" ON "linked_bank_accounts"("tenant_id", "status");
CREATE INDEX "linked_bank_accounts_consent_expires_at_idx" ON "linked_bank_accounts"("consent_expires_at");
CREATE INDEX "linked_bank_accounts_last_synced_at_idx" ON "linked_bank_accounts"("last_synced_at");

-- CreateIndex
CREATE INDEX "linked_bank_sync_events_linked_bank_account_id_started_at_idx" ON "linked_bank_sync_events"("linked_bank_account_id", "started_at");
CREATE INDEX "linked_bank_sync_events_status_idx" ON "linked_bank_sync_events"("status");

-- CreateIndex
CREATE INDEX "split_matches_tenant_id_status_idx" ON "split_matches"("tenant_id", "status");
CREATE INDEX "split_matches_tenant_id_bank_transaction_id_idx" ON "split_matches"("tenant_id", "bank_transaction_id");

-- CreateIndex
CREATE INDEX "split_match_components_split_match_id_idx" ON "split_match_components"("split_match_id");
CREATE INDEX "split_match_components_invoice_id_idx" ON "split_match_components"("invoice_id");
CREATE INDEX "split_match_components_payment_id_idx" ON "split_match_components"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_configs_tenant_id_key" ON "reminder_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ui19_submissions_staff_id_type_event_date_key" ON "ui19_submissions"("staff_id", "type", "event_date");
CREATE INDEX "ui19_submissions_tenant_id_idx" ON "ui19_submissions"("tenant_id");
CREATE INDEX "ui19_submissions_tenant_id_status_idx" ON "ui19_submissions"("tenant_id", "status");
CREATE INDEX "ui19_submissions_due_date_idx" ON "ui19_submissions"("due_date");

-- CreateIndex
CREATE INDEX "vat_adjustments_tenant_id_idx" ON "vat_adjustments"("tenant_id");
CREATE INDEX "vat_adjustments_tenant_id_adjustment_type_idx" ON "vat_adjustments"("tenant_id", "adjustment_type");
CREATE INDEX "vat_adjustments_tenant_id_adjustment_date_idx" ON "vat_adjustments"("tenant_id", "adjustment_date");
CREATE INDEX "vat_adjustments_tenant_id_is_voided_idx" ON "vat_adjustments"("tenant_id", "is_voided");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_logs_source_delivery_id_key" ON "webhook_logs"("source", "delivery_id");
CREATE INDEX "webhook_logs_source_event_type_idx" ON "webhook_logs"("source", "event_type");
CREATE INDEX "webhook_logs_processed_idx" ON "webhook_logs"("processed");
CREATE INDEX "webhook_logs_created_at_idx" ON "webhook_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "xero_invoice_mappings_invoice_id_key" ON "xero_invoice_mappings"("invoice_id");
CREATE UNIQUE INDEX "xero_invoice_mappings_tenant_id_invoice_id_key" ON "xero_invoice_mappings"("tenant_id", "invoice_id");
CREATE UNIQUE INDEX "xero_invoice_mappings_tenant_id_xero_invoice_id_key" ON "xero_invoice_mappings"("tenant_id", "xero_invoice_id");
CREATE INDEX "xero_invoice_mappings_tenant_id_idx" ON "xero_invoice_mappings"("tenant_id");
CREATE INDEX "xero_invoice_mappings_tenant_id_sync_status_idx" ON "xero_invoice_mappings"("tenant_id", "sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "xero_contact_mappings_parent_id_key" ON "xero_contact_mappings"("parent_id");
CREATE UNIQUE INDEX "xero_contact_mappings_tenant_id_parent_id_key" ON "xero_contact_mappings"("tenant_id", "parent_id");
CREATE UNIQUE INDEX "xero_contact_mappings_tenant_id_xero_contact_id_key" ON "xero_contact_mappings"("tenant_id", "xero_contact_id");
CREATE INDEX "xero_contact_mappings_tenant_id_idx" ON "xero_contact_mappings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_payment_mappings_payment_id_key" ON "xero_payment_mappings"("payment_id");
CREATE UNIQUE INDEX "xero_payment_mappings_tenant_id_payment_id_key" ON "xero_payment_mappings"("tenant_id", "payment_id");
CREATE UNIQUE INDEX "xero_payment_mappings_tenant_id_xero_payment_id_key" ON "xero_payment_mappings"("tenant_id", "xero_payment_id");
CREATE INDEX "xero_payment_mappings_tenant_id_idx" ON "xero_payment_mappings"("tenant_id");
CREATE INDEX "xero_payment_mappings_tenant_id_xero_invoice_id_idx" ON "xero_payment_mappings"("tenant_id", "xero_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "accrued_bank_charges_bank_statement_match_id_key" ON "accrued_bank_charges"("bank_statement_match_id");
CREATE INDEX "accrued_bank_charges_tenant_id_idx" ON "accrued_bank_charges"("tenant_id");
CREATE INDEX "accrued_bank_charges_tenant_id_status_idx" ON "accrued_bank_charges"("tenant_id", "status");
CREATE INDEX "accrued_bank_charges_tenant_id_fee_type_idx" ON "accrued_bank_charges"("tenant_id", "fee_type");
CREATE INDEX "accrued_bank_charges_source_date_idx" ON "accrued_bank_charges"("source_date");
CREATE INDEX "accrued_bank_charges_charge_transaction_id_idx" ON "accrued_bank_charges"("charge_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_transaction_splits_accrued_charge_id_key" ON "xero_transaction_splits"("accrued_charge_id");

-- AddForeignKey
ALTER TABLE "pending_syncs" ADD CONSTRAINT "pending_syncs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_bank_accounts" ADD CONSTRAINT "linked_bank_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_bank_sync_events" ADD CONSTRAINT "linked_bank_sync_events_linked_bank_account_id_fkey" FOREIGN KEY ("linked_bank_account_id") REFERENCES "linked_bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_matches" ADD CONSTRAINT "split_matches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_match_components" ADD CONSTRAINT "split_match_components_split_match_id_fkey" FOREIGN KEY ("split_match_id") REFERENCES "split_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_match_components" ADD CONSTRAINT "split_match_components_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_match_components" ADD CONSTRAINT "split_match_components_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_configs" ADD CONSTRAINT "reminder_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ui19_submissions" ADD CONSTRAINT "ui19_submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ui19_submissions" ADD CONSTRAINT "ui19_submissions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_adjustments" ADD CONSTRAINT "vat_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_invoice_mappings" ADD CONSTRAINT "xero_invoice_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_invoice_mappings" ADD CONSTRAINT "xero_invoice_mappings_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_contact_mappings" ADD CONSTRAINT "xero_contact_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_contact_mappings" ADD CONSTRAINT "xero_contact_mappings_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_payment_mappings" ADD CONSTRAINT "xero_payment_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_payment_mappings" ADD CONSTRAINT "xero_payment_mappings_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accrued_bank_charges" ADD CONSTRAINT "accrued_bank_charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accrued_bank_charges" ADD CONSTRAINT "accrued_bank_charges_source_transaction_id_fkey" FOREIGN KEY ("source_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accrued_bank_charges" ADD CONSTRAINT "accrued_bank_charges_charge_transaction_id_fkey" FOREIGN KEY ("charge_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accrued_bank_charges" ADD CONSTRAINT "accrued_bank_charges_bank_statement_match_id_fkey" FOREIGN KEY ("bank_statement_match_id") REFERENCES "bank_statement_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accrued_bank_charges" ADD CONSTRAINT "accrued_bank_charges_matched_by_fkey" FOREIGN KEY ("matched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_transaction_splits" ADD CONSTRAINT "xero_transaction_splits_accrued_charge_id_fkey" FOREIGN KEY ("accrued_charge_id") REFERENCES "accrued_bank_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
