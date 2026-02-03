-- TASK-FIX-001: SARS Submission Failure Notifications
-- CreateTable
CREATE TABLE "sars_notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "notification_type" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sars_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sars_notifications_tenant_id_created_at_idx" ON "sars_notifications"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "sars_notifications_submission_id_idx" ON "sars_notifications"("submission_id");

-- AddForeignKey
ALTER TABLE "sars_notifications" ADD CONSTRAINT "sars_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sars_notifications" ADD CONSTRAINT "sars_notifications_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "sars_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
