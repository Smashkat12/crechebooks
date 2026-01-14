-- CreateTable
CREATE TABLE "profile_mapping_sync" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "simplepay_mapping_id" INTEGER NOT NULL,
    "simplepay_profile_id" INTEGER NOT NULL,
    "profile_name" VARCHAR(100) NOT NULL,
    "calculation_settings" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_mapping_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_mapping_sync_tenant_id_idx" ON "profile_mapping_sync"("tenant_id");

-- CreateIndex
CREATE INDEX "profile_mapping_sync_staff_id_idx" ON "profile_mapping_sync"("staff_id");

-- CreateIndex
CREATE INDEX "profile_mapping_sync_simplepay_profile_id_idx" ON "profile_mapping_sync"("simplepay_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_mapping_sync_tenant_id_staff_id_simplepay_mapping_i_key" ON "profile_mapping_sync"("tenant_id", "staff_id", "simplepay_mapping_id");

-- AddForeignKey
ALTER TABLE "profile_mapping_sync" ADD CONSTRAINT "profile_mapping_sync_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_mapping_sync" ADD CONSTRAINT "profile_mapping_sync_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
