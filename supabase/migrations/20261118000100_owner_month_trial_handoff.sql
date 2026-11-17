-- Expand-only handoff policy: legacy application attempts retain seven days
-- Roll back via a forward migration restoring the former functions after all
-- in-flight v2 receipts finish; retain this nullable private column
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF md5(replace(pg_get_functiondef('admin_claim_brand_welcome(uuid,uuid,uuid,boolean)'::regprocedure),E'\r\n',E'\n'))<>'99620d7602813e12d1b116cc0e2401c2' THEN RAISE EXCEPTION 'Owner handoff prerequisite changed'; END IF;
 IF md5(replace(pg_get_functiondef('admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure),E'\r\n',E'\n'))<>'6a6d8c828ad115bfa652f8e70ef60776' THEN RAISE EXCEPTION 'Owner handoff prerequisite changed'; END IF;
END $guard$;
ALTER TABLE brand_onboarding_private.accounts ADD COLUMN welcome_trial_policy jsonb;
CREATE OR REPLACE FUNCTION public.admin_claim_brand_welcome(p_actor uuid, p_cafe uuid, p_attempt uuid, p_retry_uncertain boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v brand_onboarding_private.accounts%ROWTYPE; v_start_trial boolean := false;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  IF p_attempt IS NULL THEN RAISE EXCEPTION 'INVALID_SEND_ATTEMPT'; END IF;
  PERFORM 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_UNAVAILABLE'; END IF;
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE cafe_id=p_cafe FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_PREPARED'; END IF;
  IF v.state='sent' THEN RETURN jsonb_build_object('sent',true); END IF;
  IF v.pending_edit IS NOT NULL THEN RAISE EXCEPTION 'OWNER_EDIT_PENDING'; END IF;
  IF coalesce(v.draft->>'phone','') !~ '^9665[0-9]{8}$' OR length(coalesce(v.draft->>'ownerName',''))<2 OR NOT coalesce((v.draft->>'passwordReady')::boolean,true) THEN RAISE EXCEPTION 'OWNER_DETAILS_REQUIRED'; END IF;
  IF v.state='sending' AND v.attempt_started_at>now()-interval '2 minutes' THEN RAISE EXCEPTION 'SEND_IN_PROGRESS'; END IF;
  IF v.state IN ('sending','uncertain') AND NOT p_retry_uncertain THEN RAISE EXCEPTION 'SEND_UNCERTAIN'; END IF;
  PERFORM 1 FROM public.subscriptions WHERE cafe_id=p_cafe ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.platform_plans WHERE id IN(SELECT plan_id FROM public.subscriptions WHERE cafe_id=p_cafe) ORDER BY id FOR SHARE;
  IF EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
    WHERE s.cafe_id=p_cafe AND (s.status='active' OR (s.status='trialing' AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial')) AND p.active
      AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())) THEN
    v_start_trial := false;
  ELSIF EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
    WHERE s.cafe_id=p_cafe AND s.status='trialing'
      AND s.activation_source='admin_prepared_trial' AND coalesce(s.amount_sar,0)=0 AND s.paid_at IS NULL AND p.active
      AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())) THEN
    v_start_trial := true;
  ELSE
    RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_REQUIRED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v.owner_id AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v.draft->>'phone') THEN
    RAISE EXCEPTION 'OWNER_PHONE_CHANGED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v.owner_id AND encrypted_password=v.owner_password_hash)
    OR nullif(v.password_ciphertext,'') IS NULL THEN
    RAISE EXCEPTION 'OWNER_PASSWORD_CHANGED';
  END IF;
  UPDATE brand_onboarding_private.accounts SET state='sending',attempt_id=p_attempt,attempt_started_at=now(),
    welcome_trial_policy=NULL,welcome_starts_trial=v_start_trial WHERE id=v.id;
  RETURN jsonb_build_object('sent',false,'requestId',coalesce(v.password_context,v.id),'phone',v.draft->>'phone',
    'brandName',v.draft->>'brandName','ciphertext',v.password_ciphertext,'startsTrial',v_start_trial);
END $function$
;
CREATE OR REPLACE FUNCTION public.admin_finish_brand_welcome(p_actor uuid, p_cafe uuid, p_attempt uuid, p_message_id text, p_sent_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v brand_onboarding_private.accounts%ROWTYPE;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM 1 FROM public.cafes WHERE id=p_cafe FOR UPDATE;
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE cafe_id=p_cafe FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_PREPARED'; END IF;
  IF v.state='sent' THEN RETURN; END IF;
  IF p_attempt IS NULL OR v.attempt_id IS DISTINCT FROM p_attempt OR v.state<>'sending'
    OR length(coalesce(p_message_id,'')) NOT BETWEEN 1 AND 256
    OR p_sent_at IS NULL OR p_sent_at>now()+interval '1 minute' OR p_sent_at<v.attempt_started_at-interval '1 minute' THEN
    RAISE EXCEPTION 'INVALID_SEND_RECEIPT';
  END IF;
  PERFORM 1 FROM public.subscriptions WHERE cafe_id=p_cafe ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.platform_plans WHERE id IN(SELECT plan_id FROM public.subscriptions WHERE cafe_id=p_cafe) ORDER BY id FOR SHARE;
  IF coalesce(v.welcome_starts_trial,true) AND NOT EXISTS(
    SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
    WHERE s.cafe_id=p_cafe AND (s.status='active' OR (s.status='trialing' AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial')) AND p.active
      AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
  ) THEN
    UPDATE public.subscriptions s SET started_at=p_sent_at,expires_at=p_sent_at+make_interval(days=>coalesce((v.welcome_trial_policy->>s.plan_id)::integer,7)),duration_unit=CASE WHEN s.plan_id='finance' THEN s.duration_unit ELSE 'day' END,duration_count=CASE WHEN s.plan_id='finance' THEN s.duration_count ELSE coalesce((v.welcome_trial_policy->>s.plan_id)::integer,7) END,
      activation_source='admin_whatsapp_trial',updated_at=now()
    WHERE s.cafe_id=p_cafe AND s.status='trialing' AND s.activation_source='admin_prepared_trial'
      AND coalesce(s.amount_sar,0)=0 AND s.paid_at IS NULL
      AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
      AND EXISTS(SELECT 1 FROM public.platform_plans p WHERE p.id=s.plan_id AND p.active)
      AND EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe AND c.deleted_at IS NULL AND c.status='active');
  END IF;
  UPDATE brand_onboarding_private.accounts SET state='sent',sent_at=p_sent_at,provider_message_id=p_message_id,password_ciphertext=NULL,
    owner_password_hash=NULL,proof='' WHERE id=v.id;
END $function$
;
CREATE FUNCTION public.admin_claim_brand_welcome_v2(p_actor uuid,p_cafe uuid,p_attempt uuid,p_retry_uncertain boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; terms jsonb; policy constant jsonb := '{"-":30,"starter":30,"pro":30,"plan-b523d348":30}';
BEGIN
 -- Reuse the authoritative admin, owner identity, state and row-lock guards
 result:=public.admin_claim_brand_welcome(p_actor,p_cafe,p_attempt,p_retry_uncertain);
 IF coalesce((result->>'sent')::boolean,false) THEN RETURN result; END IF;
 IF coalesce((result->>'startsTrial')::boolean,false) THEN
  SELECT jsonb_agg(jsonb_build_object('planId',s.plan_id,'planName',p.name,'days',coalesce((policy->>s.plan_id)::integer,7)) ORDER BY s.plan_id)
  INTO terms FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
  WHERE s.cafe_id=p_cafe AND s.status='trialing' AND s.activation_source='admin_prepared_trial'
   AND coalesce(s.amount_sar,0)=0 AND s.paid_at IS NULL AND p.active
   AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now());
  IF terms IS NULL THEN RAISE EXCEPTION 'ACTIVE_SUBSCRIPTION_REQUIRED'; END IF;
  UPDATE brand_onboarding_private.accounts SET welcome_trial_policy=policy WHERE cafe_id=p_cafe;
 END IF;
 RETURN result || jsonb_build_object('trialTerms',coalesce(terms,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_claim_brand_welcome_v2(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_claim_brand_welcome_v2(uuid,uuid,uuid,boolean) TO service_role;
COMMIT;
