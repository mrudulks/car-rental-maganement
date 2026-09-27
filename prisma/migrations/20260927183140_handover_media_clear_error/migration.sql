-- Correcting the error this raises.
--
-- The previous version used SQLSTATE 23001 (restrict_violation). Prisma maps the 23xxx
-- class to constraint errors, so a blocked edit surfaced as "foreign key constraint
-- violated" and the actual reason was lost -- the worst kind of error, one that sends
-- you looking in the wrong place.
--
-- Raising without an explicit ERRCODE gives P0001, which Prisma passes through with the
-- message intact.
CREATE OR REPLACE FUNCTION handover_media_is_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.purge_media', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'HandoverMedia is append-only: % is not allowed. Hand-over media is evidence and cannot be changed or removed.', TG_OP;
END;
$$ LANGUAGE plpgsql;
