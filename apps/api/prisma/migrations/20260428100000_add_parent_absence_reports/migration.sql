-- Migration: add parent_absence_reports table
-- Parents can proactively report that their child will be absent on a future date.
-- Kept separate from attendance_records to preserve the admin-fact / parent-intent
-- distinction. Admin's attendance mark always takes precedence; this table is purely
-- informational (pre-notification) and is joined by admin views at query time.
--
-- Note: All ID columns use TEXT to match the existing CrecheBooks schema convention
-- (Prisma String @id without @db.Uuid maps to TEXT in Postgres).

CREATE TABLE IF NOT EXISTS "parent_absence_reports" (
  "id"                      TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "tenant_id"               TEXT        NOT NULL,
  "child_id"                TEXT        NOT NULL,
  "parent_id"               TEXT        NOT NULL,
  "date"                    DATE        NOT NULL,
  "reason"                  VARCHAR(500),
  "reported_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "cancelled_at"            TIMESTAMPTZ,
  "cancelled_by_parent_id"  TEXT,

  CONSTRAINT "parent_absence_reports_pkey" PRIMARY KEY ("id"),
  -- One active report per child per day (cancelled rows are excluded by app logic)
  CONSTRAINT "parent_absence_reports_child_date_key" UNIQUE ("child_id", "date")
);

CREATE INDEX IF NOT EXISTS "parent_absence_reports_tenant_date_idx"
  ON "parent_absence_reports" ("tenant_id", "date");

CREATE INDEX IF NOT EXISTS "parent_absence_reports_child_idx"
  ON "parent_absence_reports" ("child_id");

ALTER TABLE "parent_absence_reports"
  ADD CONSTRAINT "parent_absence_reports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "parent_absence_reports_child_id_fkey"
    FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "parent_absence_reports_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE;
