-- Templates and clipart now live in their own tables (SVG code stored in the row); the shared
-- catalogue tables and the file table are not used any more.
DROP TABLE IF EXISTS "CatalogItem";
DROP TABLE IF EXISTS "CatalogCategory";
DROP TABLE IF EXISTS "CatalogFile";
DROP TABLE IF EXISTS "CatalogTombstone";

CREATE TABLE "TemplateCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "svgCode" TEXT NOT NULL,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "viewBox" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClipartCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClipartCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Clipart" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "svgCode" TEXT NOT NULL,
    "widthMm" DOUBLE PRECISION,
    "heightMm" DOUBLE PRECISION,
    "viewBox" TEXT,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Clipart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TemplateCategory_name_key" ON "TemplateCategory"("name");
CREATE INDEX "Template_categoryId_idx" ON "Template"("categoryId");
CREATE INDEX "Template_status_updatedAt_idx" ON "Template"("status", "updatedAt");
CREATE UNIQUE INDEX "ClipartCategory_name_key" ON "ClipartCategory"("name");
CREATE INDEX "Clipart_categoryId_idx" ON "Clipart"("categoryId");
CREATE INDEX "Clipart_status_updatedAt_idx" ON "Clipart"("status", "updatedAt");
ALTER TABLE "Template" ADD CONSTRAINT "Template_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TemplateCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Clipart" ADD CONSTRAINT "Clipart_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClipartCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
