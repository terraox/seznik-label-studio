-- Archive of accounts deleted from the app (name, phone, printer, labels, reason).
CREATE TABLE "DeletedAccount" (
    "id" TEXT NOT NULL,
    "formerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "printerName" TEXT,
    "labelsPrinted" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "appVersion" TEXT,
    "platform" TEXT,

    CONSTRAINT "DeletedAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeletedAccount_deletedAt_idx" ON "DeletedAccount"("deletedAt");
CREATE INDEX "DeletedAccount_mobile_idx" ON "DeletedAccount"("mobile");
