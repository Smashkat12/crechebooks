-- CreateEnum
CREATE TYPE "AdHocChargeType" AS ENUM ('MEALS', 'TRANSPORT', 'LATE_PICKUP', 'EXTRA_MURAL', 'DAMAGED_EQUIPMENT', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LineType" ADD VALUE 'RE_REGISTRATION';
ALTER TYPE "LineType" ADD VALUE 'EXTRA_MURAL';
ALTER TYPE "LineType" ADD VALUE 'MEALS';
ALTER TYPE "LineType" ADD VALUE 'TRANSPORT';
ALTER TYPE "LineType" ADD VALUE 'LATE_PICKUP';
ALTER TYPE "LineType" ADD VALUE 'DAMAGED_EQUIPMENT';

-- AlterTable
ALTER TABLE "ad_hoc_charges" ADD COLUMN     "charge_type" "AdHocChargeType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "is_vat_exempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vat_cents" INTEGER;
