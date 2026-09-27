-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ServiceSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceSchedule_organizationId_idx" ON "ServiceSchedule"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceSchedule_vehicleId_startAt_endAt_idx" ON "ServiceSchedule"("vehicleId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "ServiceSchedule_organizationId_status_idx" ON "ServiceSchedule"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "ServiceSchedule" ADD CONSTRAINT "ServiceSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSchedule" ADD CONSTRAINT "ServiceSchedule_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSchedule" ADD CONSTRAINT "ServiceSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A vehicle cannot be in the workshop twice over the same window. Same reasoning as
-- booking_no_overlap: an application-level check loses the race, so Postgres decides.
-- Only SCHEDULED windows block; completed and cancelled ones do not.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "ServiceSchedule"
  ADD CONSTRAINT "service_no_overlap"
  EXCLUDE USING gist (
    "vehicleId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE (status = 'SCHEDULED');
