-- Feedback form: optional rating, title + printer, category suggestion|feedback
ALTER TABLE "Feedback" ALTER COLUMN "rating" DROP NOT NULL;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "printerName" TEXT;

UPDATE "Feedback"
SET "category" = 'feedback'
WHERE "category" IN ('bug', 'other');

CREATE INDEX IF NOT EXISTS "Feedback_category_idx" ON "Feedback"("category");
