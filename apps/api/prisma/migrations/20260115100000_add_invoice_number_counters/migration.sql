-- TASK-BILL-003 / TASK-BILL-041: Add invoice number counters for atomic invoice number generation
-- This prevents race conditions in concurrent invoice creation
-- Uses PostgreSQL UPDATE...RETURNING pattern for atomic increment

-- Create invoice number counters table
CREATE TABLE "invoice_number_counters" (
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_number_counters_pkey" PRIMARY KEY ("tenant_id","year")
);

-- Foreign key to tenants
ALTER TABLE "invoice_number_counters" ADD CONSTRAINT "invoice_number_counters_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Initialize counters from existing invoices
-- This ensures continuity with existing invoice numbers
INSERT INTO "invoice_number_counters" ("tenant_id", "year", "current_value", "updated_at")
SELECT
    i."tenant_id",
    EXTRACT(YEAR FROM i."issue_date")::INTEGER as "year",
    MAX(
        CASE
            WHEN i."invoice_number" ~ '^INV-\d{4}-\d+$'
            THEN CAST(SUBSTRING(i."invoice_number" FROM 'INV-\d{4}-(\d+)$') AS INTEGER)
            ELSE 0
        END
    ) as "current_value",
    NOW() as "updated_at"
FROM "invoices" i
WHERE i."invoice_number" ~ '^INV-\d{4}-\d+$'
GROUP BY i."tenant_id", EXTRACT(YEAR FROM i."issue_date")
ON CONFLICT ("tenant_id", "year") DO UPDATE
SET "current_value" = GREATEST(
    "invoice_number_counters"."current_value",
    EXCLUDED."current_value"
);
