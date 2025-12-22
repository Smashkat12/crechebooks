-- CreateEnum
CREATE TYPE "EscalationLevel" AS ENUM ('FRIENDLY', 'FIRM', 'FINAL');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "escalation_level" "EscalationLevel" NOT NULL,
    "delivery_method" "DeliveryMethod" NOT NULL,
    "reminder_status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "content" TEXT NOT NULL,
    "subject" VARCHAR(500),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminders_tenant_id_invoice_id_idx" ON "reminders"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "reminders_tenant_id_parent_id_idx" ON "reminders"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "reminders_tenant_id_scheduled_for_idx" ON "reminders"("tenant_id", "scheduled_for");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
