-- Correcting the previous migration.
--
-- Blocking every DELETE also blocked the cascade from Organization and Booking, so a
-- tenant could never be removed -- which matters the day someone asks for their data
-- to be deleted. The rule now allows a delete only when the transaction has explicitly
-- asked for one, so removing data stays a deliberate, visible act rather than something
-- a stray statement can do.
--
--   BEGIN;
--   SET LOCAL app.purge_media = 'on';
--   DELETE FROM "Organization" WHERE id = '...';
--   COMMIT;
--
-- UPDATE stays refused unconditionally: there is no legitimate reason to rewrite a
-- photograph's row.
CREATE OR REPLACE FUNCTION handover_media_is_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.purge_media', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'HandoverMedia is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'To remove data deliberately, SET LOCAL app.purge_media = ''on'' first.';
END;
$$ LANGUAGE plpgsql;
