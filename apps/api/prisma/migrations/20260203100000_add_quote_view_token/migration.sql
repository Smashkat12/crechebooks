-- TASK-QUOTE-001: Add viewToken field for public quote access
-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "view_token" VARCHAR(36);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_view_token_key" ON "quotes"("view_token");
