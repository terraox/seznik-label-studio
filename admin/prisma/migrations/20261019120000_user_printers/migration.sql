-- CreateTable
CREATE TABLE "UserPrinter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "firstConnectedAt" TIMESTAMP(3) NOT NULL,
    "lastConnectedAt" TIMESTAMP(3) NOT NULL,
    "connectionCount" INTEGER NOT NULL DEFAULT 0,
    "labelsPrinted" INTEGER NOT NULL DEFAULT 0,
    "lastTransport" TEXT,

    CONSTRAINT "UserPrinter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPrinter_userId_lastConnectedAt_idx" ON "UserPrinter"("userId", "lastConnectedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserPrinter_userId_printerId_key" ON "UserPrinter"("userId", "printerId");

-- AddForeignKey
ALTER TABLE "UserPrinter" ADD CONSTRAINT "UserPrinter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrinter" ADD CONSTRAINT "UserPrinter_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill from the existing connection and print history (one row per user and printer).
INSERT INTO "UserPrinter" ("id", "userId", "printerId", "firstConnectedAt", "lastConnectedAt", "connectionCount", "labelsPrinted", "lastTransport")
SELECT 'up_' || md5(t."userId" || ':' || t."printerId"), t."userId", t."printerId",
       min(t."at"), max(t."at"), sum(t."conns")::int, sum(t."labels")::int,
       (array_agg(t."transport" ORDER BY t."at" DESC) FILTER (WHERE t."transport" IS NOT NULL))[1]
FROM (
  SELECT "userId", "printerId", "occurredAt" AS "at", 1 AS "conns", 0 AS "labels", "transport" FROM "PrinterConnection"
  UNION ALL
  SELECT "userId", "printerId", "occurredAt", 0, "labelsCount", NULL FROM "PrintEvent" WHERE "userId" IS NOT NULL
) t
GROUP BY t."userId", t."printerId";
