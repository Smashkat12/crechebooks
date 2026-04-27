-- Add middle_name to children table
ALTER TABLE "children"
  ADD COLUMN IF NOT EXISTS "middle_name" VARCHAR(100);

-- Add middle_name to parents table
ALTER TABLE "parents"
  ADD COLUMN IF NOT EXISTS "middle_name" VARCHAR(100);
