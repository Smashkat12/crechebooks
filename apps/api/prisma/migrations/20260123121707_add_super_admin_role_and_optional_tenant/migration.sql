-- AlterEnum
-- Add SUPER_ADMIN role for CrecheBooks platform administrators
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
-- Make tenant_id nullable to allow platform admins without tenant association
ALTER TABLE "users" ALTER COLUMN "tenant_id" DROP NOT NULL;
