-- Backlog #7: per-staff invite + login flow.
-- Adds StaffInvitation table tracking invite state for staff who use magic-link auth
-- (no User row created). Separate from parent `invitations` table to avoid the
-- @@unique([email, tenantId, status]) collision when a staff and parent share an email.
-- token_hash stores SHA-256 of a random token; the raw token is shown to the invited
-- staff once via the email link and never persisted. All operations idempotent so the
-- migration is safe on environments where the table/enum already exist (local dev) and
-- where they do not (staging, production).

-- CreateEnum: StaffInvitationStatus (idempotent)
DO $$ BEGIN
  CREATE TYPE "StaffInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: staff_invitations
CREATE TABLE IF NOT EXISTS "staff_invitations" (
    "id"            TEXT                    NOT NULL,
    "tenant_id"     TEXT                    NOT NULL,
    "staff_id"      TEXT                    NOT NULL,
    "email"         VARCHAR(255)            NOT NULL,
    "token_hash"    VARCHAR(128)            NOT NULL,
    "status"        "StaffInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by_id" TEXT                    NOT NULL,
    "expires_at"    TIMESTAMP(3)            NOT NULL,
    "accepted_at"   TIMESTAMP(3),
    "revoked_at"    TIMESTAMP(3),
    "created_at"    TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)            NOT NULL,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: token_hash uniqueness (single use, fast lookup on accept)
CREATE UNIQUE INDEX IF NOT EXISTS "staff_invitations_token_hash_key"
    ON "staff_invitations"("token_hash");

-- CreateIndex: list pending invites for tenant + staff
CREATE INDEX IF NOT EXISTS "staff_invitations_tenant_id_staff_id_status_idx"
    ON "staff_invitations"("tenant_id", "staff_id", "status");

-- CreateIndex: token-hash-only secondary index (Prisma emits this alongside the unique above)
CREATE INDEX IF NOT EXISTS "staff_invitations_token_hash_idx"
    ON "staff_invitations"("token_hash");

-- CreateIndex: expiry sweep job
CREATE INDEX IF NOT EXISTS "staff_invitations_expires_at_idx"
    ON "staff_invitations"("expires_at");

-- AddForeignKey: staff_invitations.tenant_id -> tenants.id (idempotent)
-- ON DELETE RESTRICT (Prisma default for required relation; matches sibling tables).
DO $$ BEGIN
  ALTER TABLE "staff_invitations"
    ADD CONSTRAINT "staff_invitations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: staff_invitations.staff_id -> staff.id (idempotent)
-- ON DELETE CASCADE: deleting a staff record removes their pending/historical invites.
DO $$ BEGIN
  ALTER TABLE "staff_invitations"
    ADD CONSTRAINT "staff_invitations_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: staff_invitations.invited_by_id -> users.id (idempotent)
-- ON DELETE RESTRICT: preserve audit trail of who issued the invite.
DO $$ BEGIN
  ALTER TABLE "staff_invitations"
    ADD CONSTRAINT "staff_invitations_invited_by_id_fkey"
    FOREIGN KEY ("invited_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
