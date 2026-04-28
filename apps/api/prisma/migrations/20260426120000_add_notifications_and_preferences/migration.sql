-- CreateEnum: NotificationType (idempotent)
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'ENROLLMENT_COMPLETED',
    'PAYMENT_RECEIVED',
    'PAYMENT_ALLOCATED',
    'INVOICE_GENERATED',
    'INVOICE_SENT',
    'INVOICE_DELIVERY_FAILED',
    'ARREARS_NEW',
    'ARREARS_ESCALATION',
    'SARS_DEADLINE',
    'RECONCILIATION_COMPLETE',
    'RECONCILIATION_DISCREPANCY',
    'XERO_SYNC_FAILURE',
    'STAFF_LEAVE_REQUEST',
    'STAFF_LEAVE_DECISION',
    'STAFF_ONBOARDING_COMPLETE',
    'PAYSLIP_AVAILABLE',
    'STATEMENT_AVAILABLE',
    'BROADCAST_SUMMARY',
    'TRIAL_EXPIRING',
    'SYSTEM_ALERT'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: NotificationPriority (idempotent)
DO $$ BEGIN
  CREATE TYPE "NotificationPriority" AS ENUM (
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable: notifications (idempotent)
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"             TEXT         NOT NULL,
  "tenant_id"      TEXT         NOT NULL,
  "recipient_type" VARCHAR(20)  NOT NULL,
  "recipient_id"   TEXT         NOT NULL,
  "type"           "NotificationType" NOT NULL,
  "priority"       "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "title"          VARCHAR(200) NOT NULL,
  "body"           TEXT         NOT NULL,
  "action_url"     VARCHAR(500),
  "metadata"       JSONB,
  "is_read"        BOOLEAN      NOT NULL DEFAULT false,
  "read_at"        TIMESTAMP(3),
  "expires_at"     TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notification_preferences (idempotent)
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id"                  TEXT         NOT NULL,
  "tenant_id"           TEXT         NOT NULL,
  "recipient_type"      VARCHAR(20)  NOT NULL,
  "recipient_id"        TEXT         NOT NULL,
  "disabled_types"      TEXT[]       NOT NULL DEFAULT '{}',
  "quiet_hours_enabled" BOOLEAN      NOT NULL DEFAULT false,
  "quiet_hours_start"   VARCHAR(5),
  "quiet_hours_end"     VARCHAR(5),
  "in_app_enabled"      BOOLEAN      NOT NULL DEFAULT true,
  "email_digest"        BOOLEAN      NOT NULL DEFAULT false,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: notifications composite indexes (idempotent)
CREATE INDEX IF NOT EXISTS "notifications_tenant_id_recipient_type_recipient_id_is_read_idx"
  ON "notifications" ("tenant_id", "recipient_type", "recipient_id", "is_read");

CREATE INDEX IF NOT EXISTS "notifications_tenant_id_recipient_id_created_at_idx"
  ON "notifications" ("tenant_id", "recipient_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_expires_at_idx"
  ON "notifications" ("expires_at");

-- CreateIndex: notification_preferences unique constraint (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_preferences_tenant_id_recipient_type_recipient_key'
  ) THEN
    ALTER TABLE "notification_preferences"
      ADD CONSTRAINT "notification_preferences_tenant_id_recipient_type_recipient_key"
      UNIQUE ("tenant_id", "recipient_type", "recipient_id");
  END IF;
END $$;

-- AddForeignKey: notifications.tenant_id -> tenants.id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_tenant_id_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: notification_preferences.tenant_id -> tenants.id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_preferences_tenant_id_fkey'
  ) THEN
    ALTER TABLE "notification_preferences"
      ADD CONSTRAINT "notification_preferences_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
