BEGIN;

ALTER TABLE owner_onboarding_private.challenges
  DROP CONSTRAINT challenges_phone_check,
  ADD CONSTRAINT challenges_phone_check CHECK (phone ~ '^(9665[0-9]{8}|9705[69][0-9]{7})$');

CREATE OR REPLACE FUNCTION public.begin_owner_onboarding(p_id uuid,p_phone text,p_ip_hash text,p_session_hash text,p_code_hash text,p_draft jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE latest timestamptz;
BEGIN
  IF p_phone IS NULL OR p_phone !~ '^(9665[0-9]{8}|9705[69][0-9]{7})$' OR p_session_hash !~ '^[a-f0-9]{64}$' OR p_code_hash !~ '^[a-f0-9]{64}$'
    OR p_ip_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_draft)<>'object' THEN RETURN '{"ok":false}'::jsonb; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_send',0));
  IF EXISTS(SELECT 1 FROM public.profiles WHERE role='cafe_owner' AND regexp_replace(coalesce(phone,''),'[^0-9]','','g') IN(p_phone,'00'||p_phone,CASE WHEN left(p_phone,3)='966' THEN '0'||substring(p_phone from 4) END))
    THEN RETURN '{"ok":false,"reason":"registered"}'::jsonb; END IF;
  SELECT max(created_at) INTO latest FROM owner_onboarding_private.challenges WHERE phone=p_phone;
  IF latest>now()-interval '60 seconds' THEN RETURN jsonb_build_object('ok',false,'retryAfterSeconds',60); END IF;
  IF (SELECT count(*) FROM owner_onboarding_private.challenges WHERE phone=p_phone AND created_at>now()-interval '1 hour')>=3
    OR (SELECT count(*) FROM owner_onboarding_private.challenges WHERE phone=p_phone AND created_at>now()-interval '1 day')>=5
    OR (SELECT count(*) FROM owner_onboarding_private.challenges WHERE ip_hash=p_ip_hash AND created_at>now()-interval '1 hour')>=10
    OR (SELECT count(*) FROM owner_onboarding_private.challenges WHERE created_at>now()-interval '1 day')>=100
    THEN RETURN '{"ok":false,"reason":"limit"}'::jsonb; END IF;
  UPDATE owner_onboarding_private.challenges SET expires_at=now() WHERE phone=p_phone AND consumed_by IS NULL;
  INSERT INTO owner_onboarding_private.challenges(id,phone,ip_hash,session_hash,code_hash,draft)
    VALUES(p_id,p_phone,p_ip_hash,p_session_hash,p_code_hash,p_draft);
  RETURN '{"ok":true}'::jsonb;
END $$;

COMMIT;
