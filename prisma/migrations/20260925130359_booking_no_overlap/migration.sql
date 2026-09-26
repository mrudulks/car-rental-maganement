-- Prevent double-booking a vehicle at the database level.
--
-- An application-level "check then insert" loses the race under concurrency, so the
-- rule is enforced by Postgres. btree_gist lets us mix the equality test on vehicleId
-- with the range-overlap test in one exclusion constraint.
--
-- '[)' makes the range half-open: a booking ending 10:00 and one starting 10:00 do
-- not overlap, which is what a same-day handover needs.
--
-- Only RESERVED and ACTIVE bookings block a vehicle; COMPLETED and CANCELLED do not.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist (
    "vehicleId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE (status IN ('RESERVED', 'ACTIVE'));
