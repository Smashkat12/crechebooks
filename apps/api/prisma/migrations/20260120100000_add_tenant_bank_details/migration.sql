-- TASK-BILL-043: Add bank details to tenants for invoice/statement PDF generation
-- These fields allow tenants to specify banking information that appears on invoices and statements

-- Add bank detail columns to tenants table
ALTER TABLE "tenants" ADD COLUMN "bank_name" VARCHAR(100);
ALTER TABLE "tenants" ADD COLUMN "bank_account_holder" VARCHAR(200);
ALTER TABLE "tenants" ADD COLUMN "bank_account_number" VARCHAR(50);
ALTER TABLE "tenants" ADD COLUMN "bank_branch_code" VARCHAR(20);
ALTER TABLE "tenants" ADD COLUMN "bank_account_type" VARCHAR(30);
ALTER TABLE "tenants" ADD COLUMN "bank_swift_code" VARCHAR(20);
