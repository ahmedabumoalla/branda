BEGIN;

-- GoTrue inserts auth.users before applying administrator-supplied app_metadata
-- The deferred guard runs in the SAME transaction and still requires the original
-- verified, unexpired, single-use session proof before an owner can be committed
DO $migration$
DECLARE body text := pg_get_functiondef('public.handle_new_user()'::regprocedure);
DECLARE marker text := '  IF coalesce(NEW.raw_user_meta_data->>''account_type'',''customer'')<>''cafe_owner'' THEN';
BEGIN
  body := replace(body, E'\r\n', E'\n');
  IF position('on_verified_owner_created' IN body)>0 THEN RETURN; END IF;
  IF position(marker IN body)=0 OR position('  SELECT * INTO challenge FROM owner_onboarding_private.challenges' IN body)=0 THEN
    RAISE EXCEPTION 'Unexpected owner onboarding function; review before applying';
  END IF;
  body := replace(body, E'BEGIN\n', E'BEGIN\n  IF TG_NAME = ''on_verified_owner_created'' THEN\n    SELECT * INTO NEW FROM auth.users WHERE id=NEW.id;\n    IF NOT FOUND OR EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.id) THEN RETURN NEW; END IF;\n  END IF;\n');
  body := replace(body, marker,
    E'  IF TG_NAME <> ''on_verified_owner_created''\n    AND NEW.raw_user_meta_data->>''account_type'' = ''cafe_owner''\n    AND NEW.raw_app_meta_data->>''owner_onboarding_id'' IS NULL THEN\n    RETURN NEW;\n  END IF;\n' || marker);
  EXECUTE body;
END $migration$;

CREATE CONSTRAINT TRIGGER on_verified_owner_created
AFTER INSERT ON auth.users DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.raw_user_meta_data->>'account_type' = 'cafe_owner'
  AND NEW.raw_app_meta_data->>'owner_onboarding_id' IS NULL)
EXECUTE FUNCTION public.handle_new_user();

COMMIT;
