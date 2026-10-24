-- Most-clicked app sections. Overall counts only: no user column on purpose.
CREATE TABLE IF NOT EXISTS "FeatureClick" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureClick_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeatureClick_eventId_key" ON "FeatureClick"("eventId");
CREATE INDEX IF NOT EXISTS "FeatureClick_featureKey_occurredAt_idx" ON "FeatureClick"("featureKey", "occurredAt");
CREATE INDEX IF NOT EXISTS "FeatureClick_occurredAt_idx" ON "FeatureClick"("occurredAt");
