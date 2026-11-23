BEGIN;

-- Only the service-staged draft supplies the country, including when the owner
-- phone will be provided later. Preserve the existing admin and proof checks.
DO $country$
DECLARE
  prepare_fn regprocedure := 'public.admin_prepare_brand_account(uuid,uuid,jsonb,text,text)'::regprocedure;
  complete_fn regprocedure := 'brand_onboarding_private.complete_account(uuid,text,text,text)'::regprocedure;
  source text;
BEGIN
  IF (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid=prepare_fn) <> '7cc1b1f715edd9b25d9ff4583ccff3da'
    OR (SELECT md5(replace(prosrc,chr(13),'')) FROM pg_proc WHERE oid=complete_fn) <> '91666379d85bcfcc9d24971bcde1f099' THEN
    RAISE EXCEPTION 'Administrator account creation prerequisite changed';
  END IF;
  source := pg_get_functiondef(prepare_fn);
  EXECUTE replace(source,
    $old$(coalesce(p_draft->>'phone','')<>'' AND p_draft->>'phone' !~ '^9665[0-9]{8}$')$old$,
    $new$(p_draft ? 'phoneCountry' AND coalesce(p_draft->>'phoneCountry','') NOT IN ('SA','PS'))
    OR (coalesce(p_draft->>'phone','')<>'' AND p_draft->>'phone' !~ CASE p_draft->>'phoneCountry'
      WHEN 'PS' THEN '^9705[69][0-9]{7}$' ELSE '^9665[0-9]{8}$' END)$new$);
  source := pg_get_functiondef(complete_fn);
  source := replace(source,'INSERT INTO public.cafes(slug,name,name_en','INSERT INTO public.cafes(phone_country,slug,name,name_en');
  EXECUTE replace(source,
    $old$VALUES(v.draft->>'slug',v.draft->>'brandName'$old$,
    $new$VALUES(coalesce(v.draft->>'phoneCountry','SA'),v.draft->>'slug',v.draft->>'brandName'$new$);
END $country$;

COMMIT;
