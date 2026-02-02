-- Add __system__ tenant for system-wide feature flags and configuration
-- This tenant uses a well-known UUID (all zeros) to ensure consistency across environments
-- It is not a real tenant and should not be used for business data

INSERT INTO "tenants" (
  "id",
  "name",
  "address_line1",
  "city",
  "province",
  "postal_code",
  "phone",
  "email",
  "subscription_status",
  "subscription_plan",
  "tax_status",
  "invoice_day_of_month",
  "invoice_due_days",
  "closure_dates",
  "matching_tolerance_cents",
  "cumulative_turnover_cents",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '__system__',
  'System',
  'System',
  'System',
  '0000',
  '0000000000',
  'system@crechebooks.internal',
  'ACTIVE',
  'ENTERPRISE',
  'NOT_REGISTERED',
  1,
  30,
  '[]',
  0,
  0,
  NOW(),
  NOW()
) ON CONFLICT ("id") DO NOTHING;

-- Add comment to document the purpose of this tenant
COMMENT ON TABLE "tenants" IS 'Tenant records. The __system__ tenant (id=00000000-0000-0000-0000-000000000000) is reserved for system-wide configuration and should not be used for business data.';
