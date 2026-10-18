-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'blocked');

-- CreateEnum
CREATE TYPE "StatusAction" AS ENUM ('block', 'unblock', 'force_logout');

-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "blockInternalNote" TEXT,
ADD COLUMN     "blockMessage" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deviceModel" TEXT,
ADD COLUMN     "isInternal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastPrintAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "passwordUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "printCountTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RegisteredPhone" (
    "mobile" TEXT NOT NULL,
    "userId" TEXT,
    "firstRegisteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "blockedAt" TIMESTAMP(3),

    CONSTRAINT "RegisteredPhone_pkey" PRIMARY KEY ("mobile")
);

-- CreateTable
CREATE TABLE "UserStatusEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "StatusAction" NOT NULL,
    "message" TEXT,
    "internalNote" TEXT,
    "adminEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "nameRaw" TEXT NOT NULL,
    "modelNormalised" TEXT NOT NULL,
    "sdkFamily" TEXT NOT NULL DEFAULT 'unknown',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrinterAlias" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "modelNormalised" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrinterAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrinterConnection" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrinterConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT,
    "printerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "labelWidthMm" DOUBLE PRECISION NOT NULL,
    "labelHeightMm" DOUBLE PRECISION NOT NULL,
    "templateId" TEXT,
    "templateNameSnapshot" TEXT,
    "labelKey" TEXT NOT NULL,
    "jobs" INTEGER NOT NULL DEFAULT 1,
    "labelsCount" INTEGER NOT NULL,
    "ups" INTEGER NOT NULL DEFAULT 1,
    "appVersion" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT,
    "appVersion" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductClick" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'shop_buy',
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogCategory" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "svgKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "widthMm" DOUBLE PRECISION,
    "heightMm" DOUBLE PRECISION,
    "viewBox" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogTombstone" (
    "itemId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogTombstone_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredPhone_userId_key" ON "RegisteredPhone"("userId");

-- CreateIndex
CREATE INDEX "RegisteredPhone_blocked_idx" ON "RegisteredPhone"("blocked");

-- CreateIndex
CREATE INDEX "UserStatusEvent_userId_createdAt_idx" ON "UserStatusEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_nameRaw_key" ON "Printer"("nameRaw");

-- CreateIndex
CREATE INDEX "Printer_modelNormalised_idx" ON "Printer"("modelNormalised");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterAlias_pattern_key" ON "PrinterAlias"("pattern");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterConnection_eventId_key" ON "PrinterConnection"("eventId");

-- CreateIndex
CREATE INDEX "PrinterConnection_userId_occurredAt_idx" ON "PrinterConnection"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "PrinterConnection_printerId_idx" ON "PrinterConnection"("printerId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintEvent_eventId_key" ON "PrintEvent"("eventId");

-- CreateIndex
CREATE INDEX "PrintEvent_occurredAt_idx" ON "PrintEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "PrintEvent_userId_occurredAt_idx" ON "PrintEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "PrintEvent_labelKey_idx" ON "PrintEvent"("labelKey");

-- CreateIndex
CREATE INDEX "PrintEvent_printerId_idx" ON "PrintEvent"("printerId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_eventId_key" ON "Feedback"("eventId");

-- CreateIndex
CREATE INDEX "Feedback_rating_idx" ON "Feedback"("rating");

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductClick_eventId_key" ON "ProductClick"("eventId");

-- CreateIndex
CREATE INDEX "ProductClick_productKey_occurredAt_idx" ON "ProductClick"("productKey", "occurredAt");

-- CreateIndex
CREATE INDEX "CatalogCategory_kind_sortOrder_idx" ON "CatalogCategory"("kind", "sortOrder");

-- CreateIndex
CREATE INDEX "CatalogItem_categoryId_idx" ON "CatalogItem"("categoryId");

-- CreateIndex
CREATE INDEX "CatalogItem_revision_idx" ON "CatalogItem"("revision");

-- CreateIndex
CREATE INDEX "CatalogTombstone_revision_idx" ON "CatalogTombstone"("revision");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "OtpCode_mobile_createdAt_idx" ON "OtpCode"("mobile", "createdAt");

-- CreateIndex
CREATE INDEX "AppUser_status_idx" ON "AppUser"("status");

-- CreateIndex
CREATE INDEX "AppUser_createdAt_idx" ON "AppUser"("createdAt");

-- AddForeignKey
ALTER TABLE "RegisteredPhone" ADD CONSTRAINT "RegisteredPhone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStatusEvent" ADD CONSTRAINT "UserStatusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrinterConnection" ADD CONSTRAINT "PrinterConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrinterConnection" ADD CONSTRAINT "PrinterConnection_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintEvent" ADD CONSTRAINT "PrintEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintEvent" ADD CONSTRAINT "PrintEvent_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductClick" ADD CONSTRAINT "ProductClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing account permanently claims its mobile number.
INSERT INTO "RegisteredPhone" ("mobile", "userId", "firstRegisteredAt", "blocked")
SELECT "mobile", "id", "createdAt", false FROM "AppUser"
ON CONFLICT ("mobile") DO NOTHING;
