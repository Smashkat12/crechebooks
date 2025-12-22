-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "PreferredContact" AS ENUM ('EMAIL', 'WHATSAPP', 'BOTH');

-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "xero_contact_id" TEXT,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "whatsapp" VARCHAR(20),
    "preferred_contact" "PreferredContact" NOT NULL DEFAULT 'EMAIL',
    "id_number" VARCHAR(20),
    "address" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" "Gender",
    "medical_notes" TEXT,
    "emergency_contact" VARCHAR(200),
    "emergency_phone" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parents_xero_contact_id_key" ON "parents"("xero_contact_id");

-- CreateIndex
CREATE INDEX "parents_tenant_id_idx" ON "parents"("tenant_id");

-- CreateIndex
CREATE INDEX "parents_tenant_id_last_name_first_name_idx" ON "parents"("tenant_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "parents_tenant_id_email_key" ON "parents"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "children_tenant_id_idx" ON "children"("tenant_id");

-- CreateIndex
CREATE INDEX "children_tenant_id_parent_id_idx" ON "children"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "children_tenant_id_is_active_idx" ON "children"("tenant_id", "is_active");

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
