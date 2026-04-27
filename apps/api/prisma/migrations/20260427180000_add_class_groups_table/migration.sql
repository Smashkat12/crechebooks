-- Class Groups: foundation table for daily attendance, today admin tile,
-- parent absence reporting, and daily class reports.
-- Children with class_group_id = NULL remain valid; assignment is opt-in.
-- All operations idempotent: safe to run on environments where the table
-- already exists (e.g. local dev) and on production where it does not.

-- CreateTable: class_groups
CREATE TABLE IF NOT EXISTS "class_groups" (
    "id"              TEXT         NOT NULL,
    "tenant_id"       TEXT         NOT NULL,
    "name"            VARCHAR(120) NOT NULL,
    "code"            VARCHAR(20),
    "description"     TEXT,
    "age_min_months"  INTEGER,
    "age_max_months"  INTEGER,
    "capacity"        INTEGER,
    "display_order"   INTEGER      NOT NULL DEFAULT 0,
    "is_active"       BOOLEAN      NOT NULL DEFAULT true,
    "deleted_at"      TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: class_groups indexes
CREATE INDEX IF NOT EXISTS "class_groups_tenant_id_is_active_idx"
    ON "class_groups"("tenant_id", "is_active");

CREATE INDEX IF NOT EXISTS "class_groups_tenant_id_deleted_at_idx"
    ON "class_groups"("tenant_id", "deleted_at");

CREATE UNIQUE INDEX IF NOT EXISTS "class_groups_tenant_id_name_key"
    ON "class_groups"("tenant_id", "name");

-- AddForeignKey: class_groups.tenant_id -> tenants.id (idempotent)
DO $$ BEGIN
  ALTER TABLE "class_groups"
    ADD CONSTRAINT "class_groups_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add nullable class_group_id to children (idempotent)
ALTER TABLE "children"
    ADD COLUMN IF NOT EXISTS "class_group_id" TEXT;

-- CreateIndex: children.class_group_id
CREATE INDEX IF NOT EXISTS "children_class_group_id_idx"
    ON "children"("class_group_id");

-- AddForeignKey: children.class_group_id -> class_groups.id (idempotent)
-- ON DELETE SET NULL: deleting a class group leaves children intact, unassigned.
DO $$ BEGIN
  ALTER TABLE "children"
    ADD CONSTRAINT "children_class_group_id_fkey"
    FOREIGN KEY ("class_group_id") REFERENCES "class_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
