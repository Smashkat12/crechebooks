-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "delivery_retry_count" INTEGER NOT NULL DEFAULT 0;
