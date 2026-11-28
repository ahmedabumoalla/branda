BEGIN;

CREATE TABLE owner_onboarding_private.approvals (
  challenge_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  contact jsonb,
  activated_at timestamptz,
  activated_by uuid,
  notice_state text NOT NULL DEFAULT 'pending' CHECK (notice_state IN ('pending','sending','sent','uncertain')),
  notice_due timestamptz NOT NULL DEFAULT now(),
  attempt uuid
);
ALTER TABLE owner_onboarding_private.approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_onboarding_private.approvals FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX signup_team_notice_due ON owner_onboarding_private.approvals(notice_due)
  WHERE notice_state IN ('pending','sending');

-- Replace only the verified self-registration trigger. Historical and admin-created accounts are unaffected.
DROP TRIGGER enqueue_verified_signup_guides ON owner_onboarding_private.challenges;
CREATE FUNCTION owner_onboarding_private.hold_verified_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO owner_onboarding_private.approvals(challenge_id,owner_id,phone,contact)
  VALUES (NEW.id,NEW.consumed_by,NEW.phone,jsonb_strip_nulls(jsonb_build_object(
    'ownerName',NEW.draft->>'ownerName','brandNameAr',NEW.draft->>'brandNameAr',
    'brandNameEn',NEW.draft->>'brandNameEn','email',NEW.draft->>'email',
    'category',NEW.draft->>'category','customCategoryName',NEW.draft->>'customCategoryName',
    'country',NEW.draft->>'accountCountry')));
  UPDATE auth.users SET banned_until='9999-12-30 00:00:00+00' WHERE id=NEW.consumed_by;
  IF NOT FOUND THEN RAISE EXCEPTION 'signup_owner_missing'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hold_verified_signup AFTER UPDATE OF consumed_by ON owner_onboarding_private.challenges
FOR EACH ROW WHEN (OLD.consumed_by IS NULL AND NEW.consumed_by IS NOT NULL AND NEW.sent AND NEW.verified_at IS NOT NULL)
EXECUTE FUNCTION owner_onboarding_private.hold_verified_signup();

-- Keep all Auth paths closed even if a generic administrative action changes the ban.
CREATE FUNCTION owner_onboarding_private.check_signup_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM owner_onboarding_private.approvals WHERE owner_id=NEW.user_id AND activated_at IS NULL)
    THEN RAISE EXCEPTION 'signup_awaiting_activation' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_signup_session BEFORE INSERT ON auth.sessions FOR EACH ROW
EXECUTE FUNCTION owner_onboarding_private.check_signup_session();

-- Versioned entry point ensures the app cannot provision an unguarded account before migration.
CREATE FUNCTION public.get_verified_owner_for_approval(p_id uuid,p_session_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.get_verified_owner_onboarding(p_id,p_session_hash);
$$;

CREATE FUNCTION public.owner_signup_activation(p_cafe_id uuid,p_activate boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE approval owner_onboarding_private.approvals; brand public.cafes;
BEGIN
  IF public.is_platform_admin() IS NOT TRUE THEN RAISE insufficient_privilege; END IF;
  SELECT * INTO STRICT brand FROM public.cafes WHERE id=p_cafe_id FOR SHARE;
  SELECT * INTO approval FROM owner_onboarding_private.approvals WHERE owner_id=brand.owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'existing'; END IF;
  IF approval.activated_at IS NOT NULL THEN RETURN 'active'; END IF;
  IF p_activate IS NOT TRUE THEN RETURN 'pending'; END IF;
  IF brand.deleted_at IS NOT NULL OR brand.status NOT IN ('active','published') OR EXISTS (SELECT 1 FROM public.brand_account_cancellations WHERE cafe_id=p_cafe_id) THEN RAISE EXCEPTION 'brand_inactive'; END IF;
  UPDATE auth.users SET banned_until=NULL
    WHERE id=approval.owner_id AND deleted_at IS NULL AND
      (banned_until IS NULL OR banned_until<=now() OR banned_until='9999-12-30 00:00:00+00');
  IF NOT FOUND THEN RAISE EXCEPTION 'owner_unavailable'; END IF;
  UPDATE owner_onboarding_private.approvals SET activated_at=clock_timestamp(),activated_by=auth.uid()
    WHERE challenge_id=approval.challenge_id;
  INSERT INTO owner_guide_private.jobs(signup_challenge_id,welcome_receipt,phone,guide)
    SELECT approval.challenge_id,'signup:'||approval.challenge_id,approval.phone,clip
    FROM unnest(ARRAY['setup','cashier','customer']) AS clip
    ON CONFLICT (welcome_receipt,guide) DO NOTHING;
  RETURN 'active';
END $$;

-- Keep the existing primary-only queue's ordering, leases and admin handoff behavior.
CREATE FUNCTION public.claim_owner_guide_with_activation() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job jsonb := public.claim_owner_signup_guide();
BEGIN
  IF job IS NULL OR job->>'guide' <> 'setup' THEN RETURN job; END IF;
  RETURN job || jsonb_build_object('activation', EXISTS (
    SELECT 1 FROM owner_guide_private.jobs g
    JOIN owner_onboarding_private.approvals a ON a.challenge_id=g.signup_challenge_id
    WHERE g.id=(job->>'id')::uuid AND a.activated_at IS NOT NULL));
END $$;

CREATE FUNCTION public.claim_signup_team_notice(p_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job owner_onboarding_private.approvals;
BEGIN
  UPDATE owner_onboarding_private.approvals SET notice_state='uncertain'
    WHERE notice_state='sending' AND notice_due<=now();
  WITH candidate AS (
    SELECT challenge_id FROM owner_onboarding_private.approvals
    WHERE (p_id IS NULL OR challenge_id=p_id) AND notice_state='pending' AND notice_due<=now()
    ORDER BY notice_due,challenge_id LIMIT 1 FOR UPDATE SKIP LOCKED
  ) UPDATE owner_onboarding_private.approvals a SET notice_state='sending',attempt=gen_random_uuid(),
    notice_due=now()+interval '3 minutes' FROM candidate c WHERE c.challenge_id=a.challenge_id RETURNING a.* INTO job;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',job.challenge_id,'attempt',job.attempt,'phone',job.phone,'contact',job.contact);
END $$;
CREATE FUNCTION public.finish_signup_team_notice(p_id uuid,p_attempt uuid,p_result text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_result IS NULL OR p_result NOT IN ('sent','pending','uncertain') THEN RAISE EXCEPTION 'invalid_notice_result'; END IF;
  UPDATE owner_onboarding_private.approvals SET notice_state=p_result,notice_due=now()+interval '5 minutes',
    contact=CASE WHEN p_result='sent' THEN NULL ELSE contact END
    WHERE challenge_id=p_id AND attempt=p_attempt AND notice_state='sending';
  RETURN FOUND OR EXISTS (SELECT 1 FROM owner_onboarding_private.approvals
    WHERE challenge_id=p_id AND attempt=p_attempt AND notice_state=p_result);
END $$;
REVOKE ALL ON FUNCTION owner_onboarding_private.hold_verified_signup(),owner_onboarding_private.check_signup_session(),
 public.get_verified_owner_for_approval(uuid,text),public.owner_signup_activation(uuid,boolean),
 public.claim_owner_guide_with_activation(),public.claim_signup_team_notice(uuid),public.finish_signup_team_notice(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_verified_owner_for_approval(uuid,text),
 public.claim_owner_guide_with_activation(),public.claim_signup_team_notice(uuid),public.finish_signup_team_notice(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.owner_signup_activation(uuid,boolean) TO authenticated;
COMMIT;
