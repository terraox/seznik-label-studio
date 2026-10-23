-- Deleting a category keeps its templates and clipart; they lose the category and stay under All.
ALTER TABLE "Template" ALTER COLUMN "categoryId" DROP NOT NULL;
ALTER TABLE "Template" DROP CONSTRAINT "Template_categoryId_fkey";
ALTER TABLE "Template" ADD CONSTRAINT "Template_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TemplateCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Clipart" ALTER COLUMN "categoryId" DROP NOT NULL;
ALTER TABLE "Clipart" DROP CONSTRAINT "Clipart_categoryId_fkey";
ALTER TABLE "Clipart" ADD CONSTRAINT "Clipart_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClipartCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
