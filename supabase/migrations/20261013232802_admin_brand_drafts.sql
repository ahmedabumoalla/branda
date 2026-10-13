ALTER TABLE brand_onboarding_private.accounts ADD COLUMN pending_edit jsonb, ADD COLUMN last_edit_id uuid, ADD COLUMN last_edit_fingerprint text, ADD COLUMN password_context uuid;

-- Only the server can stage changes. Auth applies credentials through its supported API
-- and the trigger commits matching contact details in that same transaction
CREATE FUNCTION public.admin_prepare_brand_owner_edit(p_actor uuid,p_cafe uuid,p_id uuid,p_details jsonb,p_fingerprint text,p_ciphertext text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE; e jsonb;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_UNAVAILABLE'; END IF;
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE cafe_id=p_cafe FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_PREPARED'; END IF;
  IF v.last_edit_id=p_id THEN
    IF v.last_edit_fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'REQUEST_CHANGED'; END IF;
    RETURN jsonb_build_object('done',true);
  END IF;
  IF v.state<>'ready' THEN RAISE EXCEPTION 'OWNER_EDIT_NOT_ALLOWED'; END IF;
  IF length(coalesce(p_details->>'ownerName',''))>120 OR length(coalesce(p_details->>'email',''))>254
    OR (coalesce(p_details->>'phone','')<>'' AND p_details->>'phone' !~ '^9665[0-9]{8}$')
    OR (p_ciphertext IS NOT NULL AND length(p_ciphertext) NOT BETWEEN 40 AND 1000)
    OR length(coalesce(p_fingerprint,''))<>64 OR p_id IS NULL THEN RAISE EXCEPTION 'INVALID_ACCOUNT_DATA'; END IF;
  IF coalesce(v.draft->>'phone','')<>'' AND coalesce(p_details->>'phone','')='' THEN RAISE EXCEPTION 'PHONE_REQUIRED'; END IF;
  IF coalesce(p_details->>'phone','')<>'' AND (
    EXISTS(SELECT 1 FROM auth.users WHERE id<>v.owner_id AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=p_details->>'phone')
    OR EXISTS(SELECT 1 FROM public.profiles WHERE id<>v.owner_id AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=p_details->>'phone')) THEN RAISE EXCEPTION 'PHONE_EXISTS'; END IF;
  IF coalesce(p_details->>'email','')<>'' AND (
    EXISTS(SELECT 1 FROM auth.users WHERE id<>v.owner_id AND lower(email)=lower(p_details->>'email'))
    OR EXISTS(SELECT 1 FROM public.profiles WHERE id<>v.owner_id AND lower(email::text)=lower(p_details->>'email'))) THEN RAISE EXCEPTION 'EMAIL_EXISTS'; END IF;
  IF v.pending_edit->>'id'=p_id::text AND v.pending_edit->>'fingerprint'=p_fingerprint THEN e:=v.pending_edit;
  ELSE
    e:=jsonb_build_object('id',p_id,'actor',p_actor,'details',p_details,'ciphertext',p_ciphertext,'fingerprint',p_fingerprint,'proof',gen_random_uuid());
    UPDATE brand_onboarding_private.accounts SET pending_edit=e WHERE id=v.id;
  END IF;
  RETURN jsonb_build_object('done',false,'ownerId',v.owner_id,'proof',e->>'proof');
END $$;

CREATE FUNCTION public.admin_cancel_brand_owner_edit(p_actor uuid,p_cafe uuid,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  UPDATE brand_onboarding_private.accounts SET pending_edit=NULL WHERE cafe_id=p_cafe AND pending_edit->>'id'=p_id::text;
END $$;

CREATE FUNCTION brand_onboarding_private.complete_owner_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE; e jsonb; d jsonb;
BEGIN
  IF NEW.raw_app_meta_data->>'admin_brand_edit_attempt' IS NOT DISTINCT FROM OLD.raw_app_meta_data->>'admin_brand_edit_attempt' THEN RETURN NEW; END IF;
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE owner_id=NEW.id AND pending_edit->>'id'=NEW.raw_app_meta_data->>'admin_brand_edit_id' FOR UPDATE;
  IF NOT FOUND OR v.state<>'ready' OR v.pending_edit->>'proof' IS DISTINCT FROM NEW.raw_app_meta_data->>'admin_brand_edit_proof' THEN
    RAISE EXCEPTION 'OWNER_EDIT_PROOF_REQUIRED' USING ERRCODE='42501';
  END IF;
  e:=v.pending_edit; d:=e->'details';
  PERFORM brand_onboarding_private.require_admin((e->>'actor')::uuid);
  IF regexp_replace(coalesce(NEW.phone,''),'[^0-9]','','g')<>coalesce(d->>'phone','') THEN RAISE EXCEPTION 'OWNER_PHONE_CHANGED'; END IF;
  IF coalesce(d->>'phone','')<>'' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_phone:'||(d->>'phone'),0));
    IF EXISTS(SELECT 1 FROM public.profiles WHERE id<>NEW.id AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=d->>'phone') THEN RAISE EXCEPTION 'PHONE_EXISTS'; END IF;
  END IF;
  IF coalesce(d->>'email','')<>'' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_email:'||lower(d->>'email'),0));
    IF EXISTS(SELECT 1 FROM public.profiles WHERE id<>NEW.id AND lower(email::text)=lower(d->>'email'))
      OR EXISTS(SELECT 1 FROM auth.users WHERE id<>NEW.id AND lower(email)=lower(d->>'email')) THEN RAISE EXCEPTION 'EMAIL_EXISTS'; END IF;
  END IF;
  UPDATE public.profiles SET full_name=d->>'ownerName',phone=nullif(d->>'phone',''),email=nullif(d->>'email','') WHERE id=NEW.id;
  UPDATE public.cafe_settings SET owner_name=d->>'ownerName',owner_phone=d->>'phone',owner_email=d->>'email' WHERE cafe_id=v.cafe_id;
  UPDATE brand_onboarding_private.accounts SET draft=draft||d||jsonb_build_object('passwordReady',CASE WHEN e->>'ciphertext' IS NOT NULL THEN true ELSE coalesce((draft->>'passwordReady')::boolean,true) END),
    password_ciphertext=coalesce(e->>'ciphertext',password_ciphertext),
    password_context=CASE WHEN e->>'ciphertext' IS NOT NULL THEN (e->>'id')::uuid ELSE password_context END,
    owner_password_hash=CASE WHEN e->>'ciphertext' IS NOT NULL THEN NEW.encrypted_password ELSE owner_password_hash END,
    last_edit_id=(e->>'id')::uuid,last_edit_fingerprint=e->>'fingerprint',pending_edit=NULL WHERE id=v.id;
  RETURN NEW;
END $$;
CREATE TRIGGER complete_admin_brand_owner_edit AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION brand_onboarding_private.complete_owner_edit();
REVOKE ALL ON FUNCTION brand_onboarding_private.complete_owner_edit() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_prepare_brand_owner_edit(uuid,uuid,uuid,jsonb,text,text),public.admin_cancel_brand_owner_edit(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_brand_owner_edit(uuid,uuid,uuid,jsonb,text,text),public.admin_cancel_brand_owner_edit(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_prepare_brand_account(p_id uuid,p_actor uuid,p_draft jsonb,p_fingerprint text,p_ciphertext text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE; v_plan text;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM pg_advisory_xact_lock(hashtextextended('admin-brand-create:'||p_id::text,0));
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF v.created_by<>p_actor OR v.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'REQUEST_CHANGED'; END IF;
    RETURN jsonb_build_object('cafeId',v.cafe_id,'proof',v.proof,'ciphertext',v.password_ciphertext);
  END IF;
  IF p_draft->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(p_draft->>'slug') NOT BETWEEN 3 AND 60
    OR (coalesce(p_draft->>'phone','')<>'' AND p_draft->>'phone' !~ '^9665[0-9]{8}$') OR length(coalesce(p_draft->>'brandName','')) NOT BETWEEN 2 AND 120
    OR length(coalesce(p_draft->>'ownerName',''))>120
    OR coalesce(p_draft->>'category','') NOT IN ('cafes_coffee','restaurants','events_conferences')
    OR length(coalesce(p_ciphertext,'')) NOT BETWEEN 40 AND 1000 OR length(coalesce(p_fingerprint,''))<>64 THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_DATA';
  END IF;
  IF EXISTS(SELECT 1 FROM public.cafes WHERE slug=p_draft->>'slug') THEN RAISE EXCEPTION 'SLUG_EXISTS'; END IF;
  IF coalesce(p_draft->>'phone','')<>'' AND (EXISTS(SELECT 1 FROM auth.users WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=p_draft->>'phone')
    OR EXISTS(SELECT 1 FROM public.profiles WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=p_draft->>'phone')) THEN
    RAISE EXCEPTION 'PHONE_EXISTS';
  END IF;
  SELECT p.id INTO v_plan FROM public.platform_plans p
    WHERE p.id=coalesce((SELECT default_plan_id FROM public.category_default_plans WHERE category_id=p_draft->>'category'),
      (SELECT default_plan_id FROM public.platform_settings WHERE id='default'))
    AND p.active AND p.price_sar=0 AND p.trial_days>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_PLAN_UNAVAILABLE'; END IF;
  INSERT INTO brand_onboarding_private.accounts(id,created_by,draft,fingerprint,password_ciphertext)
    VALUES(p_id,p_actor,p_draft||jsonb_build_object('planId',v_plan),p_fingerprint,p_ciphertext) RETURNING * INTO v;
  RETURN jsonb_build_object('cafeId',NULL,'proof',v.proof,'ciphertext',v.password_ciphertext);
END $$;

CREATE OR REPLACE FUNCTION brand_onboarding_private.complete_account(p_owner uuid,p_phone text,p_id text,p_proof text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE; v_cafe uuid; v_sub uuid; v_plan public.platform_plans%ROWTYPE;
BEGIN
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE id::text=p_id AND proof=p_proof FOR UPDATE;
  IF NOT FOUND OR v.state<>'draft' OR v.cafe_id IS NOT NULL OR v.created_at<now()-interval '1 day'
    OR regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')<>v.draft->>'phone' THEN
    RAISE EXCEPTION 'ADMIN_ONBOARDING_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF coalesce(p_phone,'')='' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND email='prepared-'||v.id::text||'@accounts.barndaksa.invalid') THEN RAISE EXCEPTION 'DRAFT_IDENTITY_REQUIRED'; END IF;
  PERFORM brand_onboarding_private.require_admin(v.created_by);
  SELECT * INTO v_plan FROM public.platform_plans WHERE id=v.draft->>'planId' AND active AND price_sar=0 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_PLAN_UNAVAILABLE'; END IF;
  IF coalesce(v.draft->>'email','')<>'' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('owner_signup_email:'||lower(v.draft->>'email'),0));
    IF EXISTS(SELECT 1 FROM public.profiles WHERE lower(email::text)=lower(v.draft->>'email'))
      OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email::text)=lower(v.draft->>'email')) THEN RAISE EXCEPTION 'EMAIL_EXISTS'; END IF;
  END IF;
  INSERT INTO public.profiles(id,email,full_name,phone,role,status)
    VALUES(p_owner,nullif(v.draft->>'email',''),v.draft->>'ownerName',v.draft->>'phone','cafe_owner','active');
  INSERT INTO public.cafes(slug,name,name_en,owner_user_id,status,is_public,business_category)
    VALUES(v.draft->>'slug',v.draft->>'brandName',v.draft->>'brandNameEn',p_owner,'active',true,v.draft->>'category') RETURNING id INTO v_cafe;
  INSERT INTO public.cafe_members(cafe_id,user_id,role,permissions) VALUES(v_cafe,p_owner,'owner','{}'::jsonb);
  INSERT INTO public.cafe_settings(cafe_id,owner_name,owner_email,owner_phone)
    VALUES(v_cafe,v.draft->>'ownerName',v.draft->>'email',v.draft->>'phone');
  -- Access is ready immediately. The actual seven-day window is assigned only after send acknowledgement.
  INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,started_at,expires_at,plan_name_snapshot,duration_unit,duration_count,activation_source)
    VALUES(v_cafe,v_plan.id,'trialing',0,now(),NULL,v_plan.name,'day',7,'admin_prepared_trial') RETURNING id INTO v_sub;
  UPDATE brand_onboarding_private.accounts SET cafe_id=v_cafe,owner_id=p_owner,subscription_id=v_sub,state='ready',
    owner_password_hash=(SELECT encrypted_password FROM auth.users WHERE id=p_owner) WHERE id=v.id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_claim_brand_welcome(p_actor uuid,p_cafe uuid,p_attempt uuid,p_retry_uncertain boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v brand_onboarding_private.accounts%ROWTYPE;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_UNAVAILABLE'; END IF;
  SELECT * INTO v FROM brand_onboarding_private.accounts WHERE cafe_id=p_cafe FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_PREPARED'; END IF;
  IF v.state='sent' THEN RETURN jsonb_build_object('sent',true); END IF;
  IF v.pending_edit IS NOT NULL THEN RAISE EXCEPTION 'OWNER_EDIT_PENDING'; END IF;
  IF coalesce(v.draft->>'phone','') !~ '^9665[0-9]{8}$' OR length(coalesce(v.draft->>'ownerName',''))<2 OR NOT coalesce((v.draft->>'passwordReady')::boolean,true) THEN RAISE EXCEPTION 'OWNER_DETAILS_REQUIRED'; END IF;
  IF v.state='sending' AND v.attempt_started_at>now()-interval '2 minutes' THEN RAISE EXCEPTION 'SEND_IN_PROGRESS'; END IF;
  IF v.state IN ('sending','uncertain') AND NOT p_retry_uncertain THEN RAISE EXCEPTION 'SEND_UNCERTAIN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
    WHERE s.id=v.subscription_id AND s.status='trialing' AND s.activation_source='admin_prepared_trial' AND p.active) THEN
    RAISE EXCEPTION 'PREPARED_TRIAL_CHANGED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v.owner_id AND regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v.draft->>'phone') THEN
    RAISE EXCEPTION 'OWNER_PHONE_CHANGED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v.owner_id AND encrypted_password=v.owner_password_hash) THEN
    RAISE EXCEPTION 'OWNER_PASSWORD_CHANGED';
  END IF;
  UPDATE brand_onboarding_private.accounts SET state='sending',attempt_id=p_attempt,attempt_started_at=now() WHERE id=v.id;
  RETURN jsonb_build_object('sent',false,'requestId',coalesce(v.password_context,v.id),'phone',v.draft->>'phone','brandName',v.draft->>'brandName','ciphertext',v.password_ciphertext);
END $$;

CREATE OR REPLACE FUNCTION public.admin_brand_onboarding_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('cafeId',cafe_id,
    'passwordReady',coalesce((draft->>'passwordReady')::boolean,true),
    'detailsReady',coalesce(draft->>'phone','') ~ '^9665[0-9]{8}$' AND length(coalesce(draft->>'ownerName',''))>=2 AND coalesce((draft->>'passwordReady')::boolean,true),
    'state',CASE WHEN pending_edit IS NOT NULL THEN 'editing' WHEN state='sending' AND attempt_started_at<now()-interval '2 minutes' THEN 'uncertain' ELSE state END,
    'sentAt',sent_at)) FROM brand_onboarding_private.accounts WHERE cafe_id IS NOT NULL),'[]'::jsonb);
END $$;
