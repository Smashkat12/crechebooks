-- Daily Attendance: backlog #6. Foundation for Today admin tile (#8),
-- parent absence reporting (#9), and daily class report (#10).
-- One row per child per day. class_group_id is a snapshot at the time of
-- attendance (ON DELETE SET NULL) so historical reports survive class moves.
-- All operations idempotent: safe on environments where the entities already
-- exist (e.g. local dev) and on production where they do not.

-- CreateEnum: AttendanceStatus (idempotent)
DO $$ BEGIN
  CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'EARLY_PICKUP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: attendance_records
CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id"             TEXT             NOT NULL,
    "tenant_id"      TEXT             NOT NULL,
    "child_id"       TEXT             NOT NULL,
    "class_group_id" TEXT,
    "date"           DATE             NOT NULL,
    "status"         "AttendanceStatus" NOT NULL,
    "arrival_at"     TIMESTAMP(3),
    "departure_at"   TIMESTAMP(3),
    "note"           VARCHAR(500),
    "marked_by_id"   TEXT             NOT NULL,
    "marked_at"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one record per child per day
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_child_id_date_key"
    ON "attendance_records"("child_id", "date");

-- CreateIndex: tenant + date (daily roll-ups across tenant)
CREATE INDEX IF NOT EXISTS "attendance_records_tenant_id_date_idx"
    ON "attendance_records"("tenant_id", "date");

-- CreateIndex: tenant + class group + date (daily class report #10)
CREATE INDEX IF NOT EXISTS "attendance_records_tenant_id_class_group_id_date_idx"
    ON "attendance_records"("tenant_id", "class_group_id", "date");

-- CreateIndex: tenant + status + date (absence reporting #9, today tile #8)
CREATE INDEX IF NOT EXISTS "attendance_records_tenant_id_status_date_idx"
    ON "attendance_records"("tenant_id", "status", "date");

-- AddForeignKey: attendance_records.tenant_id -> tenants.id (idempotent)
DO $$ BEGIN
  ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: attendance_records.child_id -> children.id (idempotent)
-- ON DELETE CASCADE: a deleted child's attendance history is removed with them.
DO $$ BEGIN
  ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_child_id_fkey"
    FOREIGN KEY ("child_id") REFERENCES "children"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: attendance_records.class_group_id -> class_groups.id (idempotent)
-- ON DELETE SET NULL: deleting a class group leaves the historical record intact,
-- with class_group_id NULL. The snapshot semantics intentionally drop the link.
DO $$ BEGIN
  ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_class_group_id_fkey"
    FOREIGN KEY ("class_group_id") REFERENCES "class_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: attendance_records.marked_by_id -> users.id (idempotent)
-- ON DELETE RESTRICT: do not silently lose audit trail of who marked the record.
DO $$ BEGIN
  ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_marked_by_id_fkey"
    FOREIGN KEY ("marked_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
