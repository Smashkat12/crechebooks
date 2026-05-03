-- Drop sms_opt_in column from parents table (SMS infrastructure removed in ad79861)
ALTER TABLE "parents" DROP COLUMN IF EXISTS "sms_opt_in";
