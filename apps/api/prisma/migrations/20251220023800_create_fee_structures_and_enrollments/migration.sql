-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('FULL_DAY', 'HALF_DAY', 'HOURLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PENDING', 'WITHDRAWN', 'GRADUATED');

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "fee_type" "FeeType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "vat_inclusive" BOOLEAN NOT NULL DEFAULT true,
    "sibling_discount_percent" DECIMAL(5,2),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "fee_structure_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "sibling_discount_applied" BOOLEAN NOT NULL DEFAULT false,
    "custom_fee_override_cents" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_structures_tenant_id_is_active_idx" ON "fee_structures"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "fee_structures_tenant_id_effective_from_idx" ON "fee_structures"("tenant_id", "effective_from");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_child_id_status_idx" ON "enrollments"("tenant_id", "child_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_status_start_date_idx" ON "enrollments"("tenant_id", "status", "start_date");

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
