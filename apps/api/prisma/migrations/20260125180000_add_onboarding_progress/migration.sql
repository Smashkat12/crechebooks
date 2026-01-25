-- CreateTable
CREATE TABLE "onboarding_progress" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "logo_uploaded" BOOLEAN NOT NULL DEFAULT false,
    "address_set" BOOLEAN NOT NULL DEFAULT false,
    "bank_details_set" BOOLEAN NOT NULL DEFAULT false,
    "vat_configured" BOOLEAN NOT NULL DEFAULT false,
    "fee_structure_created" BOOLEAN NOT NULL DEFAULT false,
    "child_enrolled" BOOLEAN NOT NULL DEFAULT false,
    "first_invoice_sent" BOOLEAN NOT NULL DEFAULT false,
    "bank_connected" BOOLEAN NOT NULL DEFAULT false,
    "skipped_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completed_at" TIMESTAMP(3),
    "last_active_step" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_progress_tenant_id_key" ON "onboarding_progress"("tenant_id");

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
