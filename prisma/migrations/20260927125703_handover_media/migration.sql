-- CreateEnum
CREATE TYPE "HandoverPhase" AS ENUM ('CHECK_OUT', 'CHECK_IN');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "HandoverMedia" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "phase" "HandoverPhase" NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "caption" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HandoverMedia_storageKey_key" ON "HandoverMedia"("storageKey");

-- CreateIndex
CREATE INDEX "HandoverMedia_organizationId_idx" ON "HandoverMedia"("organizationId");

-- CreateIndex
CREATE INDEX "HandoverMedia_bookingId_phase_idx" ON "HandoverMedia"("bookingId", "phase");

-- AddForeignKey
ALTER TABLE "HandoverMedia" ADD CONSTRAINT "HandoverMedia_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverMedia" ADD CONSTRAINT "HandoverMedia_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverMedia" ADD CONSTRAINT "HandoverMedia_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-over media is evidence, so the table is append-only.
--
-- Enforcing this only in application code would leave it a convention: anything with a
-- database connection could rewrite a photograph's row after a dispute started. The
-- trigger makes it a property of the data instead.
--
-- Rows still disappear when their booking or organization is deleted, because those
-- cascades are DELETEs on the parent, not on this table.
CREATE OR REPLACE FUNCTION handover_media_is_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'HandoverMedia is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handover_media_no_update
  BEFORE UPDATE ON "HandoverMedia"
  FOR EACH ROW EXECUTE FUNCTION handover_media_is_append_only();

CREATE TRIGGER handover_media_no_delete
  BEFORE DELETE ON "HandoverMedia"
  FOR EACH ROW EXECUTE FUNCTION handover_media_is_append_only();
