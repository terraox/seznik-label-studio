-- Taps are now added up per day and section instead of stored one row per tap.
-- The per-tap table was created a moment earlier and never received data.
DROP TABLE IF EXISTS "FeatureClick";

CREATE TABLE IF NOT EXISTS "FeatureClickDaily" (
    "day" DATE NOT NULL,
    "featureKey" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FeatureClickDaily_pkey" PRIMARY KEY ("day", "featureKey")
);

CREATE TABLE IF NOT EXISTS "FeatureClickBatch" (
    "eventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeatureClickBatch_pkey" PRIMARY KEY ("eventId")
);
CREATE INDEX IF NOT EXISTS "FeatureClickBatch_receivedAt_idx" ON "FeatureClickBatch"("receivedAt");
