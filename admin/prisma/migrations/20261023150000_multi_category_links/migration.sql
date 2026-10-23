-- A template or clipart can sit in several categories: the single categoryId becomes a link table.
-- Existing assignments are copied over before the old column goes.
CREATE TABLE "TemplateCategoryLink" (
    "itemId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateCategoryLink_pkey" PRIMARY KEY ("itemId","categoryId")
);

CREATE TABLE "ClipartCategoryLink" (
    "itemId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipartCategoryLink_pkey" PRIMARY KEY ("itemId","categoryId")
);

CREATE INDEX "TemplateCategoryLink_categoryId_idx" ON "TemplateCategoryLink"("categoryId");
CREATE INDEX "ClipartCategoryLink_categoryId_idx" ON "ClipartCategoryLink"("categoryId");

ALTER TABLE "TemplateCategoryLink" ADD CONSTRAINT "TemplateCategoryLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateCategoryLink" ADD CONSTRAINT "TemplateCategoryLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TemplateCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipartCategoryLink" ADD CONSTRAINT "ClipartCategoryLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Clipart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipartCategoryLink" ADD CONSTRAINT "ClipartCategoryLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClipartCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TemplateCategoryLink" ("itemId", "categoryId") SELECT "id", "categoryId" FROM "Template" WHERE "categoryId" IS NOT NULL;
INSERT INTO "ClipartCategoryLink" ("itemId", "categoryId") SELECT "id", "categoryId" FROM "Clipart" WHERE "categoryId" IS NOT NULL;

ALTER TABLE "Template" DROP CONSTRAINT "Template_categoryId_fkey";
ALTER TABLE "Clipart" DROP CONSTRAINT "Clipart_categoryId_fkey";
DROP INDEX "Template_categoryId_idx";
DROP INDEX "Clipart_categoryId_idx";
ALTER TABLE "Template" DROP COLUMN "categoryId";
ALTER TABLE "Clipart" DROP COLUMN "categoryId";
