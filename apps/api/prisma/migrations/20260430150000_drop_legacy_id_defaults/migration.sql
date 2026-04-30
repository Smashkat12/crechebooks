-- Tech-debt cleanup: align DB-side id defaults with Prisma schema.
--
-- Prisma uses `@default(uuid())` which generates the UUID at the application
-- layer (no DB default). Both `parent_absence_reports` and `payment_receipts`
-- were created with `DEFAULT gen_random_uuid()::text` at the DB level — a
-- defensive belt-and-braces pattern that diverged from every other table in
-- the codebase. The drift causes `prisma migrate diff` to flag both columns
-- on every run.
--
-- Dropping the DB default is safe: Prisma always supplies the id on insert.
-- Any non-Prisma writer (psql, sql.js) must now provide the id explicitly,
-- which matches the convention for every other id column in this schema.

ALTER TABLE "parent_absence_reports" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "payment_receipts"       ALTER COLUMN "id" DROP DEFAULT;
