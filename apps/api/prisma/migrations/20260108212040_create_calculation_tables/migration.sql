-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ID_DOCUMENT', 'PROOF_OF_ADDRESS', 'TAX_CERTIFICATE', 'QUALIFICATIONS', 'POLICE_CLEARANCE', 'MEDICAL_CERTIFICATE', 'FIRST_AID_CERTIFICATE', 'EMPLOYMENT_CONTRACT', 'BANK_CONFIRMATION', 'POPIA_CONSENT', 'SIGNED_CONTRACT', 'SIGNED_POPIA', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UPLOADED', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DOCUMENTS_PENDING', 'VERIFICATION_PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OffboardingReason" AS ENUM ('RESIGNATION', 'TERMINATION', 'RETIREMENT', 'DEATH', 'CONTRACT_END', 'MUTUAL_AGREEMENT', 'RETRENCHMENT', 'DISMISSAL', 'ABSCONDED');

-- CreateEnum
CREATE TYPE "StaffOffboardingStatus" AS ENUM ('INITIATED', 'IN_PROGRESS', 'PENDING_FINAL_PAY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetReturnStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'RETURNED', 'NOT_RETURNED', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('NONE', 'FLAGGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "CreditBalanceSourceType" AS ENUM ('OVERPAYMENT', 'REFUND', 'CREDIT_NOTE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BankConnectionStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "MetricEventType" AS ENUM ('CATEGORIZED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('DRAFT', 'FINAL', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StatementLineType" AS ENUM ('OPENING_BALANCE', 'INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT', 'CLOSING_BALANCE');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('UPDATE_UPDATE', 'DELETE_UPDATE', 'CREATE_CREATE');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('PENDING', 'AUTO_RESOLVED', 'MANUALLY_RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "GeneratedDocumentType" AS ENUM ('EMPLOYMENT_CONTRACT', 'POPIA_CONSENT', 'WELCOME_PACK');

-- CreateEnum
CREATE TYPE "XeroAccountType" AS ENUM ('SALARY_EXPENSE', 'UIF_EMPLOYER_EXPENSE', 'SDL_EXPENSE', 'PENSION_EXPENSE', 'PAYE_PAYABLE', 'UIF_PAYABLE', 'SDL_PAYABLE', 'PENSION_PAYABLE', 'NET_PAY_CLEARING', 'BONUS_EXPENSE', 'OVERTIME_EXPENSE', 'OTHER_DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollJournalStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SimplePaySyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCED', 'SYNC_FAILED', 'OUT_OF_SYNC');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayRunSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'XERO_POSTED', 'XERO_FAILED');

-- CreateEnum
CREATE TYPE "CalculationType" AS ENUM ('EARNING', 'DEDUCTION', 'COMPANY_CONTRIBUTION');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DELETE_BLOCKED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryStatus" ADD VALUE 'CLICKED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'BOUNCED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'COMPLAINED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LineType" ADD VALUE 'BOOKS';
ALTER TYPE "LineType" ADD VALUE 'SCHOOL_TRIP';
ALTER TYPE "LineType" ADD VALUE 'STATIONERY';
ALTER TYPE "LineType" ADD VALUE 'UNIFORM';
ALTER TYPE "LineType" ADD VALUE 'AD_HOC';

-- AlterTable
ALTER TABLE "fee_structures" ADD COLUMN     "re_registration_fee_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "registration_fee_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "ad_hoc_charge_id" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "pdf_url" VARCHAR(500),
ADD COLUMN     "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "parents" ADD COLUMN     "sms_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "address" VARCHAR(500),
ADD COLUMN     "bank_account_type" VARCHAR(50),
ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "department" VARCHAR(100),
ADD COLUMN     "emergency_contact_name" VARCHAR(200),
ADD COLUMN     "emergency_contact_phone" VARCHAR(20),
ADD COLUMN     "emergency_contact_relation" VARCHAR(50),
ADD COLUMN     "hours_per_week" INTEGER,
ADD COLUMN     "payment_method" VARCHAR(50),
ADD COLUMN     "position" VARCHAR(100),
ADD COLUMN     "postal_code" VARCHAR(10),
ADD COLUMN     "province" VARCHAR(100),
ADD COLUMN     "reporting_to" VARCHAR(200),
ADD COLUMN     "suburb" VARCHAR(100),
ADD COLUMN     "tax_status" VARCHAR(50),
ADD COLUMN     "work_schedule" VARCHAR(100);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "cumulative_turnover_cents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "vat_registration_date" DATE,
ADD COLUMN     "xero_connected_at" TIMESTAMP(3),
ADD COLUMN     "xero_tenant_name" VARCHAR(200);

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "duplicate_of_id" TEXT,
ADD COLUMN     "duplicate_status" "DuplicateStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "is_reversal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reverses_transaction_id" TEXT,
ADD COLUMN     "transaction_hash" VARCHAR(64);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "current_tenant_id" TEXT;

-- CreateTable
CREATE TABLE "credit_balances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "source_type" "CreditBalanceSourceType" NOT NULL,
    "source_id" TEXT,
    "description" TEXT,
    "applied_to_invoice_id" TEXT,
    "applied_at" TIMESTAMP(3),
    "is_applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_delivery_logs" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "external_message_id" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "xero_account_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "status" "BankConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "error_message" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorization_metrics" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_type" "MetricEventType" NOT NULL,
    "confidence" DECIMAL(5,2) NOT NULL,
    "is_auto_applied" BOOLEAN NOT NULL DEFAULT false,
    "original_account_code" TEXT,
    "corrected_account_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorization_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_hoc_charges" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "charge_date" DATE NOT NULL,
    "invoiced_at" TIMESTAMP(3),
    "invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_hoc_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_oauth_states" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code_verifier" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xero_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "stage" VARCHAR(20) NOT NULL,
    "days_overdue" INTEGER NOT NULL,
    "channels" TEXT[],
    "email_subject" VARCHAR(500),
    "email_body" TEXT,
    "whatsapp_body" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tenant_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tenant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by" TEXT,
    "accepted_by" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "statement_number" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "opening_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "total_charges_cents" INTEGER NOT NULL DEFAULT 0,
    "total_payments_cents" INTEGER NOT NULL DEFAULT 0,
    "total_credits_cents" INTEGER NOT NULL DEFAULT 0,
    "closing_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "StatementStatus" NOT NULL DEFAULT 'DRAFT',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_status" VARCHAR(20),
    "delivered_at" TIMESTAMP(3),
    "delivery_channel" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statement_lines" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "line_type" "StatementLineType" NOT NULL,
    "reference_number" VARCHAR(100),
    "reference_id" TEXT,
    "debit_cents" INTEGER NOT NULL DEFAULT 0,
    "credit_cents" INTEGER NOT NULL DEFAULT 0,
    "balance_cents" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_conflicts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "conflict_type" "ConflictType" NOT NULL,
    "local_data" JSONB NOT NULL,
    "xero_data" JSONB NOT NULL,
    "local_modified_at" TIMESTAMP(3) NOT NULL,
    "xero_modified_at" TIMESTAMP(3) NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by" TEXT,
    "resolution" VARCHAR(50),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "expiry_date" DATE,
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_onboardings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "current_step" VARCHAR(50) NOT NULL DEFAULT 'PERSONAL_INFO',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "welcome_pack_sent_at" TIMESTAMP(3),
    "welcome_pack_generated_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_generated_documents" (
    "id" TEXT NOT NULL,
    "onboarding_id" TEXT NOT NULL,
    "document_type" "GeneratedDocumentType" NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_at" TIMESTAMP(3),
    "signed_by_name" VARCHAR(200),
    "signed_by_ip" VARCHAR(45),
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_checklist_items" (
    "id" TEXT NOT NULL,
    "onboarding_id" TEXT NOT NULL,
    "item_key" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50) NOT NULL,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_account_mappings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_type" "XeroAccountType" NOT NULL,
    "xero_account_id" VARCHAR(50) NOT NULL,
    "xero_account_code" VARCHAR(20) NOT NULL,
    "xero_account_name" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_journals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payroll_id" TEXT NOT NULL,
    "xero_journal_id" VARCHAR(50),
    "journal_number" VARCHAR(50),
    "pay_period_start" DATE NOT NULL,
    "pay_period_end" DATE NOT NULL,
    "status" "PayrollJournalStatus" NOT NULL DEFAULT 'PENDING',
    "total_debit_cents" INTEGER NOT NULL,
    "total_credit_cents" INTEGER NOT NULL,
    "narration" VARCHAR(500) NOT NULL,
    "posted_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_journal_lines" (
    "id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_type" "XeroAccountType" NOT NULL,
    "xero_account_code" VARCHAR(20) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "debit_cents" INTEGER NOT NULL DEFAULT 0,
    "credit_cents" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_offboardings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "status" "StaffOffboardingStatus" NOT NULL DEFAULT 'INITIATED',
    "reason" "OffboardingReason" NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initiated_by" TEXT,
    "last_working_day" DATE NOT NULL,
    "notice_period_days" INTEGER NOT NULL,
    "notice_period_waived" BOOLEAN NOT NULL DEFAULT false,
    "outstanding_salary_cents" INTEGER NOT NULL DEFAULT 0,
    "leave_payout_cents" INTEGER NOT NULL DEFAULT 0,
    "leave_balance_days" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notice_pay_cents" INTEGER NOT NULL DEFAULT 0,
    "pro_rata_bonus_cents" INTEGER NOT NULL DEFAULT 0,
    "other_earnings_cents" INTEGER NOT NULL DEFAULT 0,
    "deductions_cents" INTEGER NOT NULL DEFAULT 0,
    "final_pay_gross_cents" INTEGER NOT NULL DEFAULT 0,
    "final_pay_net_cents" INTEGER NOT NULL DEFAULT 0,
    "ui19_generated_at" TIMESTAMP(3),
    "certificate_generated_at" TIMESTAMP(3),
    "irp5_generated_at" TIMESTAMP(3),
    "exit_pack_generated_at" TIMESTAMP(3),
    "exit_interview_date" TIMESTAMP(3),
    "exit_interview_notes" TEXT,
    "exit_interview_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_offboardings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_returns" (
    "id" TEXT NOT NULL,
    "offboarding_id" TEXT NOT NULL,
    "asset_type" VARCHAR(100) NOT NULL,
    "asset_description" VARCHAR(255) NOT NULL,
    "serial_number" VARCHAR(100),
    "status" "AssetReturnStatus" NOT NULL DEFAULT 'PENDING',
    "returned_at" TIMESTAMP(3),
    "checked_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "asset_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simplepay_connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" VARCHAR(50) NOT NULL,
    "api_key" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "sync_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simplepay_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simplepay_employee_mappings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "simplepay_employee_id" VARCHAR(50) NOT NULL,
    "sync_status" "SimplePaySyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simplepay_employee_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simplepay_payslip_imports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "simplepay_payslip_id" VARCHAR(50) NOT NULL,
    "pay_period_start" DATE NOT NULL,
    "pay_period_end" DATE NOT NULL,
    "gross_salary_cents" INTEGER NOT NULL,
    "net_salary_cents" INTEGER NOT NULL,
    "paye_cents" INTEGER NOT NULL,
    "uif_employee_cents" INTEGER NOT NULL,
    "uif_employer_cents" INTEGER NOT NULL,
    "payslip_data" JSONB NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simplepay_payslip_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "leave_type_name" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "total_days" DECIMAL(4,1) NOT NULL,
    "total_hours" DECIMAL(5,1) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "simplepay_synced" BOOLEAN NOT NULL DEFAULT false,
    "simplepay_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrun_syncs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "simplepay_payrun_id" TEXT NOT NULL,
    "wave_id" INTEGER NOT NULL,
    "wave_name" VARCHAR(100) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "pay_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "employee_count" INTEGER NOT NULL,
    "total_gross_cents" INTEGER NOT NULL,
    "total_net_cents" INTEGER NOT NULL,
    "total_paye_cents" INTEGER NOT NULL,
    "total_uif_employee_cents" INTEGER NOT NULL,
    "total_uif_employer_cents" INTEGER NOT NULL,
    "total_sdl_cents" INTEGER NOT NULL,
    "total_eti_cents" INTEGER NOT NULL DEFAULT 0,
    "sync_status" "PayRunSyncStatus" NOT NULL DEFAULT 'PENDING',
    "xero_journal_id" TEXT,
    "xero_synced_at" TIMESTAMP(3),
    "xero_sync_error" TEXT,
    "accounting_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrun_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_item_cache" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "CalculationType" NOT NULL,
    "taxable" BOOLEAN NOT NULL,
    "affects_uif" BOOLEAN NOT NULL,
    "category" VARCHAR(100),
    "cached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculation_item_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "item_code" VARCHAR(50) NOT NULL,
    "item_name" VARCHAR(200) NOT NULL,
    "type" "CalculationType" NOT NULL,
    "amount_cents" INTEGER,
    "percentage" DECIMAL(5,2),
    "is_recurring" BOOLEAN NOT NULL DEFAULT true,
    "effective_date" DATE NOT NULL,
    "end_date" DATE,
    "simplepay_calc_id" TEXT,
    "synced_to_simplepay" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_balances_tenant_id_parent_id_idx" ON "credit_balances"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "credit_balances_tenant_id_is_applied_idx" ON "credit_balances"("tenant_id", "is_applied");

-- CreateIndex
CREATE INDEX "invoice_delivery_logs_invoice_id_occurred_at_idx" ON "invoice_delivery_logs"("invoice_id", "occurred_at");

-- CreateIndex
CREATE INDEX "invoice_delivery_logs_external_message_id_idx" ON "invoice_delivery_logs"("external_message_id");

-- CreateIndex
CREATE INDEX "invoice_delivery_logs_tenant_id_channel_idx" ON "invoice_delivery_logs"("tenant_id", "channel");

-- CreateIndex
CREATE INDEX "bank_connections_tenant_id_status_idx" ON "bank_connections"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_connections_tenant_id_xero_account_id_key" ON "bank_connections"("tenant_id", "xero_account_id");

-- CreateIndex
CREATE INDEX "categorization_metrics_tenant_id_date_idx" ON "categorization_metrics"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "categorization_metrics_tenant_id_event_type_idx" ON "categorization_metrics"("tenant_id", "event_type");

-- CreateIndex
CREATE INDEX "categorization_metrics_transaction_id_idx" ON "categorization_metrics"("transaction_id");

-- CreateIndex
CREATE INDEX "ad_hoc_charges_tenant_id_child_id_idx" ON "ad_hoc_charges"("tenant_id", "child_id");

-- CreateIndex
CREATE INDEX "ad_hoc_charges_tenant_id_invoiced_at_idx" ON "ad_hoc_charges"("tenant_id", "invoiced_at");

-- CreateIndex
CREATE INDEX "ad_hoc_charges_tenant_id_charge_date_idx" ON "ad_hoc_charges"("tenant_id", "charge_date");

-- CreateIndex
CREATE UNIQUE INDEX "xero_oauth_states_tenant_id_key" ON "xero_oauth_states"("tenant_id");

-- CreateIndex
CREATE INDEX "xero_oauth_states_tenant_id_idx" ON "xero_oauth_states"("tenant_id");

-- CreateIndex
CREATE INDEX "reminder_templates_tenant_id_idx" ON "reminder_templates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_templates_tenant_id_stage_key" ON "reminder_templates"("tenant_id", "stage");

-- CreateIndex
CREATE INDEX "user_tenant_roles_user_id_idx" ON "user_tenant_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_tenant_roles_tenant_id_idx" ON "user_tenant_roles"("tenant_id");

-- CreateIndex
CREATE INDEX "user_tenant_roles_tenant_id_is_active_idx" ON "user_tenant_roles"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_tenant_roles_user_id_tenant_id_key" ON "user_tenant_roles"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_idx" ON "invitations"("tenant_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_status_idx" ON "invitations"("status");

-- CreateIndex
CREATE INDEX "invitations_expires_at_idx" ON "invitations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_email_tenant_id_status_key" ON "invitations"("email", "tenant_id", "status");

-- CreateIndex
CREATE INDEX "statements_tenant_id_parent_id_idx" ON "statements"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "statements_tenant_id_period_start_period_end_idx" ON "statements"("tenant_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "statements_tenant_id_statement_number_key" ON "statements"("tenant_id", "statement_number");

-- CreateIndex
CREATE INDEX "statement_lines_statement_id_idx" ON "statement_lines"("statement_id");

-- CreateIndex
CREATE INDEX "sync_conflicts_tenant_id_status_idx" ON "sync_conflicts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sync_conflicts_tenant_id_entity_type_entity_id_idx" ON "sync_conflicts"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "sync_conflicts_created_at_idx" ON "sync_conflicts"("created_at");

-- CreateIndex
CREATE INDEX "staff_documents_tenant_id_staff_id_idx" ON "staff_documents"("tenant_id", "staff_id");

-- CreateIndex
CREATE INDEX "staff_documents_tenant_id_document_type_idx" ON "staff_documents"("tenant_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "staff_onboardings_staff_id_key" ON "staff_onboardings"("staff_id");

-- CreateIndex
CREATE INDEX "staff_onboardings_tenant_id_idx" ON "staff_onboardings"("tenant_id");

-- CreateIndex
CREATE INDEX "staff_onboardings_tenant_id_status_idx" ON "staff_onboardings"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "staff_generated_documents_onboarding_id_idx" ON "staff_generated_documents"("onboarding_id");

-- CreateIndex
CREATE INDEX "staff_generated_documents_onboarding_id_document_type_idx" ON "staff_generated_documents"("onboarding_id", "document_type");

-- CreateIndex
CREATE INDEX "onboarding_checklist_items_onboarding_id_idx" ON "onboarding_checklist_items"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_checklist_items_onboarding_id_item_key_key" ON "onboarding_checklist_items"("onboarding_id", "item_key");

-- CreateIndex
CREATE INDEX "xero_account_mappings_tenant_id_idx" ON "xero_account_mappings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_account_mappings_tenant_id_account_type_key" ON "xero_account_mappings"("tenant_id", "account_type");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_journals_payroll_id_key" ON "payroll_journals"("payroll_id");

-- CreateIndex
CREATE INDEX "payroll_journals_tenant_id_status_idx" ON "payroll_journals"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payroll_journal_lines_journal_id_idx" ON "payroll_journal_lines"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_offboardings_staff_id_key" ON "staff_offboardings"("staff_id");

-- CreateIndex
CREATE INDEX "staff_offboardings_tenant_id_idx" ON "staff_offboardings"("tenant_id");

-- CreateIndex
CREATE INDEX "staff_offboardings_tenant_id_status_idx" ON "staff_offboardings"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "asset_returns_offboarding_id_idx" ON "asset_returns"("offboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "simplepay_connections_tenant_id_key" ON "simplepay_connections"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "simplepay_employee_mappings_staff_id_key" ON "simplepay_employee_mappings"("staff_id");

-- CreateIndex
CREATE INDEX "simplepay_employee_mappings_tenant_id_idx" ON "simplepay_employee_mappings"("tenant_id");

-- CreateIndex
CREATE INDEX "simplepay_employee_mappings_simplepay_employee_id_idx" ON "simplepay_employee_mappings"("simplepay_employee_id");

-- CreateIndex
CREATE INDEX "simplepay_payslip_imports_tenant_id_staff_id_idx" ON "simplepay_payslip_imports"("tenant_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "simplepay_payslip_imports_tenant_id_staff_id_simplepay_pays_key" ON "simplepay_payslip_imports"("tenant_id", "staff_id", "simplepay_payslip_id");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_idx" ON "leave_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "leave_requests_staff_id_idx" ON "leave_requests"("staff_id");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_status_idx" ON "leave_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payrun_syncs_tenant_id_idx" ON "payrun_syncs"("tenant_id");

-- CreateIndex
CREATE INDEX "payrun_syncs_tenant_id_period_start_idx" ON "payrun_syncs"("tenant_id", "period_start");

-- CreateIndex
CREATE INDEX "payrun_syncs_sync_status_idx" ON "payrun_syncs"("sync_status");

-- CreateIndex
CREATE UNIQUE INDEX "payrun_syncs_tenant_id_simplepay_payrun_id_key" ON "payrun_syncs"("tenant_id", "simplepay_payrun_id");

-- CreateIndex
CREATE INDEX "calculation_item_cache_tenant_id_idx" ON "calculation_item_cache"("tenant_id");

-- CreateIndex
CREATE INDEX "calculation_item_cache_tenant_id_type_idx" ON "calculation_item_cache"("tenant_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_item_cache_tenant_id_code_key" ON "calculation_item_cache"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "payroll_adjustments_tenant_id_idx" ON "payroll_adjustments"("tenant_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_staff_id_idx" ON "payroll_adjustments"("staff_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_tenant_id_staff_id_is_recurring_idx" ON "payroll_adjustments"("tenant_id", "staff_id", "is_recurring");

-- CreateIndex
CREATE INDEX "invoice_lines_ad_hoc_charge_id_idx" ON "invoice_lines"("ad_hoc_charge_id");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_transaction_hash_idx" ON "transactions"("tenant_id", "transaction_hash");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_duplicate_status_idx" ON "transactions"("tenant_id", "duplicate_status");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_is_reversal_idx" ON "transactions"("tenant_id", "is_reversal");

-- CreateIndex
CREATE INDEX "transactions_reverses_transaction_id_idx" ON "transactions"("reverses_transaction_id");

-- CreateIndex
CREATE INDEX "users_current_tenant_id_idx" ON "users"("current_tenant_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reverses_transaction_id_fkey" FOREIGN KEY ("reverses_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_applied_to_invoice_id_fkey" FOREIGN KEY ("applied_to_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_ad_hoc_charge_id_fkey" FOREIGN KEY ("ad_hoc_charge_id") REFERENCES "ad_hoc_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_delivery_logs" ADD CONSTRAINT "invoice_delivery_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_delivery_logs" ADD CONSTRAINT "invoice_delivery_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_metrics" ADD CONSTRAINT "categorization_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_metrics" ADD CONSTRAINT "categorization_metrics_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_hoc_charges" ADD CONSTRAINT "ad_hoc_charges_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_oauth_states" ADD CONSTRAINT "xero_oauth_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_templates" ADD CONSTRAINT "reminder_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenant_roles" ADD CONSTRAINT "user_tenant_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tenant_roles" ADD CONSTRAINT "user_tenant_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_onboardings" ADD CONSTRAINT "staff_onboardings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_onboardings" ADD CONSTRAINT "staff_onboardings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_generated_documents" ADD CONSTRAINT "staff_generated_documents_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "staff_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "staff_onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_account_mappings" ADD CONSTRAINT "xero_account_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_journals" ADD CONSTRAINT "payroll_journals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_journals" ADD CONSTRAINT "payroll_journals_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_journal_lines" ADD CONSTRAINT "payroll_journal_lines_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "payroll_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_offboardings" ADD CONSTRAINT "staff_offboardings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_offboardings" ADD CONSTRAINT "staff_offboardings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_returns" ADD CONSTRAINT "asset_returns_offboarding_id_fkey" FOREIGN KEY ("offboarding_id") REFERENCES "staff_offboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simplepay_connections" ADD CONSTRAINT "simplepay_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simplepay_employee_mappings" ADD CONSTRAINT "simplepay_employee_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simplepay_employee_mappings" ADD CONSTRAINT "simplepay_employee_mappings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simplepay_payslip_imports" ADD CONSTRAINT "simplepay_payslip_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simplepay_payslip_imports" ADD CONSTRAINT "simplepay_payslip_imports_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrun_syncs" ADD CONSTRAINT "payrun_syncs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_item_cache" ADD CONSTRAINT "calculation_item_cache_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
