-- "Can't find my template" requests sent from the app's Templates tab.
CREATE TABLE "TemplateRequest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "widthMm" DOUBLE PRECISION,
    "heightMm" DOUBLE PRECISION,
    "shape" TEXT,
    "searchText" TEXT,
    "appVersion" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TemplateRequest_eventId_key" ON "TemplateRequest"("eventId");

CREATE INDEX "TemplateRequest_status_createdAt_idx" ON "TemplateRequest"("status", "createdAt");

ALTER TABLE "TemplateRequest" ADD CONSTRAINT "TemplateRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
