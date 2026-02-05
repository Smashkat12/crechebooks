-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('WELCOME', 'PARENT_FIRST_NAME', 'PARENT_SURNAME', 'PARENT_EMAIL', 'PARENT_ID', 'CHILD_FIRST_NAME', 'CHILD_DOB', 'CHILD_ALLERGIES', 'CHILD_ANOTHER', 'EMERGENCY_NAME', 'EMERGENCY_PHONE', 'EMERGENCY_RELATIONSHIP', 'ID_DOCUMENT', 'FEE_ACKNOWLEDGEMENT', 'COMMUNICATION_PREFS', 'POPIA_CONSENT', 'CONFIRMATION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WaOnboardingStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateTable
CREATE TABLE "whatsapp_onboarding_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "wa_id" VARCHAR(20) NOT NULL,
    "parent_id" TEXT,
    "current_step" "OnboardingStep" NOT NULL DEFAULT 'WELCOME',
    "collected_data" JSONB NOT NULL DEFAULT '{}',
    "status" "WaOnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_onboarding_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_onboarding_sessions_tenant_id_wa_id_key" ON "whatsapp_onboarding_sessions"("tenant_id", "wa_id");

-- CreateIndex
CREATE INDEX "whatsapp_onboarding_sessions_tenant_id_status_idx" ON "whatsapp_onboarding_sessions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "whatsapp_onboarding_sessions_wa_id_idx" ON "whatsapp_onboarding_sessions"("wa_id");

-- CreateIndex
CREATE INDEX "whatsapp_onboarding_sessions_status_last_message_at_idx" ON "whatsapp_onboarding_sessions"("status", "last_message_at");

-- AddForeignKey
ALTER TABLE "whatsapp_onboarding_sessions" ADD CONSTRAINT "whatsapp_onboarding_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_onboarding_sessions" ADD CONSTRAINT "whatsapp_onboarding_sessions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
