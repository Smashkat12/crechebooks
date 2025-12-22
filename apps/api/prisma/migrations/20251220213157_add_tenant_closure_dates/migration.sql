-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "closure_dates" JSONB NOT NULL DEFAULT '[]';
