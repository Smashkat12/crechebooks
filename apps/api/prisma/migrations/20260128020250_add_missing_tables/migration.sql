-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountSubType" AS ENUM ('CURRENT_ASSET', 'FIXED_ASSET', 'OTHER_ASSET', 'BANK', 'CURRENT_LIABILITY', 'LONG_TERM_LIABILITY', 'OWNER_EQUITY', 'RETAINED_EARNINGS', 'OPERATING_REVENUE', 'OTHER_REVENUE', 'COST_OF_SALES', 'OPERATING_EXPENSE', 'OTHER_EXPENSE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentLinkStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'USED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentLinkType" AS ENUM ('INVOICE', 'OUTSTANDING', 'CUSTOM', 'REGISTRATION');

-- CreateEnum
CREATE TYPE "PaymentGatewayStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OpeningBalanceImportStatus" AS ENUM ('DRAFT', 'VALIDATING', 'VALIDATED', 'POSTING', 'POSTED', 'FAILED');

-- DropForeignKey
ALTER TABLE "employee_number_counters" DROP CONSTRAINT "employee_number_counters_tenant_id_fkey";

-- AlterTable
ALTER TABLE "demo_requests" ALTER COLUMN "children_count" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employee_number_counters" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payee_patterns" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "supplier_id" TEXT;

-- AlterTable
ALTER TABLE "xero_invoice_mappings" ALTER COLUMN "sync_direction" DROP DEFAULT;

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "AccountType" NOT NULL,
    "subType" "AccountSubType",
    "description" TEXT,
    "parent_id" TEXT,
    "is_education_exempt" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "xero_account_id" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "import_id" TEXT,
    "as_of_date" DATE NOT NULL,
    "debit_cents" INTEGER,
    "credit_cents" INTEGER,
    "notes" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balance_imports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "as_of_date" DATE NOT NULL,
    "status" "OpeningBalanceImportStatus" NOT NULL DEFAULT 'DRAFT',
    "source_type" VARCHAR(50),
    "total_debits" INTEGER NOT NULL DEFAULT 0,
    "total_credits" INTEGER NOT NULL DEFAULT 0,
    "discrepancy" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3),
    "processed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_balance_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quote_number" VARCHAR(20) NOT NULL,
    "parent_id" TEXT,
    "recipient_name" VARCHAR(200) NOT NULL,
    "recipient_email" VARCHAR(255) NOT NULL,
    "recipient_phone" VARCHAR(20),
    "child_name" VARCHAR(100),
    "child_dob" DATE,
    "expected_start_date" DATE,
    "quote_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "validity_days" INTEGER NOT NULL DEFAULT 30,
    "subtotal_cents" INTEGER NOT NULL,
    "vat_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMP(3),
    "viewed_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "converted_to_invoice_id" TEXT,
    "converted_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "vat_type" "VatType" NOT NULL DEFAULT 'EXEMPT',
    "fee_structure_id" TEXT,
    "line_type" "LineType",
    "account_id" TEXT,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_number_counters" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_number_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "trading_name" VARCHAR(200),
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "address" TEXT,
    "vat_number" VARCHAR(20),
    "registration_number" VARCHAR(50),
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "bank_name" VARCHAR(100),
    "branch_code" VARCHAR(20),
    "account_number" VARCHAR(50),
    "account_type" VARCHAR(30),
    "default_account_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bills" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "bill_number" VARCHAR(50) NOT NULL,
    "bill_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "vat_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL,
    "paid_cents" INTEGER NOT NULL DEFAULT 0,
    "balance_due_cents" INTEGER NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "paid_date" DATE,
    "purchase_order_ref" VARCHAR(50),
    "notes" TEXT,
    "attachment_url" VARCHAR(500),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_lines" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,
    "vat_type" "VatType" NOT NULL DEFAULT 'STANDARD',
    "account_id" TEXT,

    CONSTRAINT "supplier_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_method" VARCHAR(30) NOT NULL,
    "reference" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_bill_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_links" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "type" "PaymentLinkType" NOT NULL DEFAULT 'INVOICE',
    "amount_cents" INTEGER NOT NULL,
    "short_code" VARCHAR(20) NOT NULL,
    "description" VARCHAR(200),
    "status" "PaymentLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payment_link_id" TEXT,
    "parent_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "gateway" VARCHAR(30) NOT NULL,
    "gateway_id" VARCHAR(100) NOT NULL,
    "gateway_checkout_id" VARCHAR(100),
    "status" "PaymentGatewayStatus" NOT NULL DEFAULT 'PENDING',
    "amount_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER,
    "net_amount_cents" INTEGER,
    "card_brand" VARCHAR(20),
    "card_last_four" VARCHAR(4),
    "card_expiry_month" INTEGER,
    "card_expiry_year" INTEGER,
    "payment_id" TEXT,
    "metadata" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_decisions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agent_type" VARCHAR(30) NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "decision" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "was_correct" BOOLEAN,
    "corrected_to" JSONB,
    "transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_feedback" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agent_decision_id" TEXT NOT NULL,
    "original_value" JSONB NOT NULL,
    "corrected_value" JSONB NOT NULL,
    "corrected_by" TEXT NOT NULL,
    "reason" TEXT,
    "applied_to_pattern" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shadow_comparisons" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agent_type" TEXT NOT NULL,
    "sdk_result" JSONB NOT NULL,
    "sdk_confidence" INTEGER NOT NULL,
    "sdk_duration_ms" INTEGER NOT NULL,
    "heuristic_result" JSONB NOT NULL,
    "heuristic_confidence" INTEGER NOT NULL,
    "heuristic_duration_ms" INTEGER NOT NULL,
    "results_match" BOOLEAN NOT NULL,
    "match_details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenant_id_type_idx" ON "chart_of_accounts"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenant_id_is_active_idx" ON "chart_of_accounts"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_tenant_id_code_key" ON "chart_of_accounts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "opening_balances_tenant_id_as_of_date_idx" ON "opening_balances"("tenant_id", "as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_tenant_id_account_id_as_of_date_key" ON "opening_balances"("tenant_id", "account_id", "as_of_date");

-- CreateIndex
CREATE INDEX "opening_balance_imports_tenant_id_status_idx" ON "opening_balance_imports"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_status_idx" ON "quotes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "quotes_recipient_email_idx" ON "quotes"("recipient_email");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenant_id_quote_number_key" ON "quotes"("tenant_id", "quote_number");

-- CreateIndex
CREATE INDEX "quote_lines_quote_id_idx" ON "quote_lines"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_number_counters_tenant_id_year_key" ON "quote_number_counters"("tenant_id", "year");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_is_active_idx" ON "suppliers"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_name_key" ON "suppliers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "supplier_bills_tenant_id_status_idx" ON "supplier_bills"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "supplier_bills_tenant_id_due_date_idx" ON "supplier_bills"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "supplier_bills_supplier_id_idx" ON "supplier_bills"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_tenant_id_supplier_id_bill_number_key" ON "supplier_bills"("tenant_id", "supplier_id", "bill_number");

-- CreateIndex
CREATE INDEX "supplier_bill_lines_bill_id_idx" ON "supplier_bill_lines"("bill_id");

-- CreateIndex
CREATE INDEX "supplier_bill_payments_bill_id_idx" ON "supplier_bill_payments"("bill_id");

-- CreateIndex
CREATE INDEX "supplier_bill_payments_transaction_id_idx" ON "supplier_bill_payments"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_short_code_key" ON "payment_links"("short_code");

-- CreateIndex
CREATE INDEX "payment_links_tenant_id_status_idx" ON "payment_links"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payment_links_short_code_idx" ON "payment_links"("short_code");

-- CreateIndex
CREATE INDEX "payment_gateway_transactions_tenant_id_status_idx" ON "payment_gateway_transactions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payment_gateway_transactions_payment_link_id_idx" ON "payment_gateway_transactions"("payment_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_transactions_gateway_gateway_id_key" ON "payment_gateway_transactions"("gateway", "gateway_id");

-- CreateIndex
CREATE INDEX "agent_decisions_tenant_id_agent_type_idx" ON "agent_decisions"("tenant_id", "agent_type");

-- CreateIndex
CREATE INDEX "agent_decisions_tenant_id_input_hash_idx" ON "agent_decisions"("tenant_id", "input_hash");

-- CreateIndex
CREATE INDEX "agent_decisions_agent_type_was_correct_idx" ON "agent_decisions"("agent_type", "was_correct");

-- CreateIndex
CREATE INDEX "agent_decisions_transaction_id_idx" ON "agent_decisions"("transaction_id");

-- CreateIndex
CREATE INDEX "correction_feedback_tenant_id_applied_to_pattern_idx" ON "correction_feedback"("tenant_id", "applied_to_pattern");

-- CreateIndex
CREATE INDEX "correction_feedback_agent_decision_id_idx" ON "correction_feedback"("agent_decision_id");

-- CreateIndex
CREATE INDEX "shadow_comparisons_tenant_id_agent_type_created_at_idx" ON "shadow_comparisons"("tenant_id", "agent_type", "created_at");

-- CreateIndex
CREATE INDEX "shadow_comparisons_agent_type_created_at_idx" ON "shadow_comparisons"("agent_type", "created_at");

-- CreateIndex
CREATE INDEX "shadow_comparisons_results_match_agent_type_idx" ON "shadow_comparisons"("results_match", "agent_type");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_number_counters" ADD CONSTRAINT "employee_number_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "opening_balance_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_imports" ADD CONSTRAINT "opening_balance_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balance_imports" ADD CONSTRAINT "opening_balance_imports_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_to_invoice_id_fkey" FOREIGN KEY ("converted_to_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_number_counters" ADD CONSTRAINT "quote_number_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_payments" ADD CONSTRAINT "supplier_bill_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_payments" ADD CONSTRAINT "supplier_bill_payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_payments" ADD CONSTRAINT "supplier_bill_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_payment_link_id_fkey" FOREIGN KEY ("payment_link_id") REFERENCES "payment_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_transactions" ADD CONSTRAINT "payment_gateway_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_agent_decision_id_fkey" FOREIGN KEY ("agent_decision_id") REFERENCES "agent_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_feedback" ADD CONSTRAINT "correction_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
