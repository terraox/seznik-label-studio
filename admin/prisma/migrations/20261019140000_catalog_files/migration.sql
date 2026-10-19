-- CreateTable
CREATE TABLE "CatalogFile" (
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "body" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogFile_pkey" PRIMARY KEY ("key")
);

