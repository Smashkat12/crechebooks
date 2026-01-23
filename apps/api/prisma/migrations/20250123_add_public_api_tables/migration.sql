-- Update existing ContactSubmission table fields
ALTER TABLE "contact_submissions" ALTER COLUMN "name" TYPE VARCHAR(100);
ALTER TABLE "contact_submissions" ALTER COLUMN "subject" TYPE VARCHAR(200);
ALTER TABLE "contact_submissions" ALTER COLUMN "subject" SET NOT NULL;

-- Update existing DemoRequest table fields
ALTER TABLE "demo_requests" ALTER COLUMN "full_name" TYPE VARCHAR(100);
ALTER TABLE "demo_requests" ALTER COLUMN "children_count" TYPE INTEGER USING "children_count"::integer;
ALTER TABLE "demo_requests" ALTER COLUMN "current_software" TYPE VARCHAR(200);
ALTER TABLE "demo_requests" ALTER COLUMN "preferred_time" TYPE VARCHAR(20);

-- Add missing index for demo_requests
CREATE INDEX IF NOT EXISTS "demo_requests_province_idx" ON "demo_requests"("province");
