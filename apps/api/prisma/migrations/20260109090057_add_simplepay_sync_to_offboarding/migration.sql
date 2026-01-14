-- AlterTable
ALTER TABLE "staff_offboardings" ADD COLUMN     "simplepay_sync_error" TEXT,
ADD COLUMN     "simplepay_sync_status" VARCHAR(20),
ADD COLUMN     "simplepay_synced_at" TIMESTAMP(3);
