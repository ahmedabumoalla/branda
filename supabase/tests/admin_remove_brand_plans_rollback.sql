-- Synthetic brand and subscriptions only; no provider calls; always rolled back.
BEGIN;
DO $setup$
DECLARE actor uuid;brand uuid:=gen_random_uuid();disabled text:='remove_fixture_'||replace(brand::text,'-','');
BEGIN
 SELECT id INTO actor FROM public.profiles WHERE role='platform_admin' AND status='active' ORDER BY id LIMIT 1;
 ASSERT actor IS NOT NULL,'Active platform administrator required';
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('test.uid',actor::text,true);
 PERFORM set_config('test.admin','yes',true);
 PERFORM set_config('app.remove_brand',brand::text,true);
 PERFORM set_config('app.remove_actor',actor::text,true);
 PERFORM set_config('app.remove_disabled',disabled,true);
 INSERT INTO public.cafes(id,owner_user_id,name,slug,status,is_public)
 VALUES(brand,actor,'Removal rollback fixture','remove-'||brand::text,'active',false);
 INSERT INTO public.platform_plans(id,name,active,price_sar,duration_unit,duration_count)
 VALUES(disabled,'Removal disabled fixture',false,0,'month',1),('remove_fixture_menu','Removal fixture menu',true,0,'month',1),('remove_fixture_loyalty','Removal fixture loyalty',true,0,'month',1);
 INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,started_at,expires_at,duration_unit,duration_count,activation_source)
 VALUES(brand,'remove_fixture_menu','active',0,now()-interval '1 day',now()+interval '20 days','month',1,'admin_manual_change'),
 (brand,'remove_fixture_menu','trialing',0,now()+interval '2 days',now()+interval '20 days','month',1,'admin_manual_change'),
 (brand,'remove_fixture_loyalty','active',0,now()-interval '1 day',now()+interval '20 days','month',1,'admin_manual_change'),
 (brand,disabled,'active',0,now()-interval '1 day',NULL,'month',1,'admin_manual_change'),
 (brand,'remove_fixture_menu','expired',0,now()-interval '40 days',now()-interval '10 days','month',1,'admin_manual_change'),
 (brand,'remove_fixture_menu','past_due',0,now(),NULL,'month',1,'admin_manual_change'),
 (brand,'remove_fixture_menu','cancelled',0,now()-interval '10 days',now()+interval '20 days','month',1,'admin_manual_change');
END $setup$;

SET LOCAL ROLE authenticated;
DO $checks$
DECLARE brand uuid:=current_setting('app.remove_brand')::uuid;disabled text:=current_setting('app.remove_disabled');
 before_state jsonb;after_state jsonb;before_rows jsonb;after_rows jsonb;r jsonb;rev text;newrev text;old_ids uuid[];n int;v text[];
BEGIN
 before_state:=public.admin_brand_subscription_state(brand);rev:=before_state->>'revision';
 SELECT jsonb_agg(to_jsonb(s) ORDER BY id) INTO before_rows FROM public.subscriptions s WHERE cafe_id=brand;
 FOREACH v SLICE 1 IN ARRAY ARRAY[ARRAY[''],ARRAY[' '],ARRAY['missing_remove_plan'],ARRAY[repeat('x',101)]] LOOP
  BEGIN PERFORM public.admin_remove_brand_plans(brand,v,rev);RAISE EXCEPTION 'Invalid plan accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_invalid_plan' THEN RAISE;END IF;END;
 END LOOP;
 BEGIN PERFORM public.admin_remove_brand_plans(brand,NULL,rev);RAISE EXCEPTION 'Null list accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_invalid_plan' THEN RAISE;END IF;END;
 BEGIN PERFORM public.admin_remove_brand_plans(brand,ARRAY[]::text[],rev);RAISE EXCEPTION 'Empty list accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_invalid_plan' THEN RAISE;END IF;END;
 BEGIN PERFORM public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu','remove_fixture_menu'],rev);RAISE EXCEPTION 'Duplicate list accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_invalid_plan' THEN RAISE;END IF;END;
 BEGIN PERFORM public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu',NULL],rev);RAISE EXCEPTION 'Null member accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_invalid_plan' THEN RAISE;END IF;END;
 BEGIN PERFORM public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu'],repeat('0',32));RAISE EXCEPTION 'Stale accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_conflict' THEN RAISE;END IF;END;
 BEGIN PERFORM public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu'],NULL);RAISE EXCEPTION 'Null revision accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_conflict' THEN RAISE;END IF;END;
 BEGIN PERFORM public.admin_remove_brand_plans(NULL,ARRAY['remove_fixture_menu'],rev);RAISE EXCEPTION 'Null brand accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_unavailable' THEN RAISE;END IF;END;
 ASSERT before_state=public.admin_brand_subscription_state(brand),'Invalid requests changed state';
 after_state:=public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu',disabled],rev);
 ASSERT after_state->'currentPlanIds'='["remove_fixture_loyalty"]'::jsonb,'Selected plans not removed';
 SELECT count(*) INTO n FROM public.subscriptions WHERE cafe_id=brand AND plan_id IN('remove_fixture_menu',disabled) AND status IN('active','trialing');ASSERT n=0,'Standing selected rows remain';
 FOR r IN SELECT value FROM jsonb_array_elements(before_rows) LOOP
  SELECT to_jsonb(s) INTO after_rows FROM public.subscriptions s WHERE id=(r->>'id')::uuid;
  IF r->>'plan_id' IN('remove_fixture_menu',disabled) AND r->>'status' IN('active','trialing') THEN
   ASSERT after_rows->>'status'='cancelled' AND after_rows->>'cancelled_at' IS NOT NULL,'Missing cancellation marker';
   ASSERT after_rows-'status'-'cancelled_at'-'updated_at'=r-'status'-'cancelled_at'-'updated_at','Other subscription fields changed';
  ELSE ASSERT after_rows=r,'History or remaining plan changed';END IF;
 END LOOP;
 ASSERT after_state->'sharedExpiresAt'=before_state->'sharedExpiresAt','Remaining deadline changed';
 ASSERT after_state=public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu',disabled],rev),'Retry must be no-op';
 ASSERT (SELECT count(*) FROM public.audit_logs WHERE cafe_id=brand AND action='admin_brand_plans_removed')=1,'Retry added audit';
 ASSERT EXISTS(SELECT 1 FROM public.audit_logs WHERE cafe_id=brand AND action='admin_brand_plans_removed' AND old_data->>'revision'=rev AND jsonb_array_length(new_data->'subscription_ids')=3),'Missing explicit old/new audit';
 after_state:=public.admin_add_brand_plans(brand,ARRAY['remove_fixture_menu'],after_state->>'revision');
 BEGIN PERFORM public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu'],rev);RAISE EXCEPTION 'Stale request removed reassignment';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'brand_subscription_conflict' THEN RAISE;END IF;END;
 after_state:=public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu','remove_fixture_loyalty'],after_state->>'revision');
 ASSERT after_state->'currentPlanIds'='[]'::jsonb,'Last plan cannot be removed';
 ASSERT public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu','remove_fixture_loyalty'],rev)=after_state,'Empty standing retry changed state';
 PERFORM set_config('app.remove_checks','25',true);
END $checks$;
RESET ROLE;

-- A welcome receipt already in flight must not revive its cancelled trial.
DO $welcome$
DECLARE brand uuid:=current_setting('app.remove_brand')::uuid;actor uuid:=current_setting('app.remove_actor')::uuid;
 sid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();attempt uuid:=gen_random_uuid();s jsonb;before_row jsonb;
BEGIN
 INSERT INTO public.subscriptions(id,cafe_id,plan_id,status,amount_sar,started_at,expires_at,duration_unit,duration_count,activation_source)
 VALUES(sid,brand,'remove_fixture_menu','trialing',0,now(),NULL,'day',7,'admin_prepared_trial');
 INSERT INTO brand_onboarding_private.accounts(id,cafe_id,owner_id,subscription_id,created_by,fingerprint,state,draft,proof,attempt_id,attempt_started_at,welcome_starts_trial)
 VALUES(aid,brand,actor,sid,actor,'rollback-fixture','sending','{}','',attempt,now(),true);
 s:=public.admin_brand_subscription_state(brand);
 PERFORM public.admin_remove_brand_plans(brand,ARRAY['remove_fixture_menu'],s->>'revision');
 SELECT to_jsonb(t) INTO before_row FROM public.subscriptions t WHERE id=sid;
 PERFORM public.admin_finish_brand_welcome(actor,brand,attempt,'rollback-fixture-receipt',now());
 ASSERT (SELECT to_jsonb(t) FROM public.subscriptions t WHERE id=sid)=before_row,'Welcome revived cancelled trial';
 ASSERT (SELECT state FROM brand_onboarding_private.accounts WHERE id=aid)='sent','Welcome receipt not recorded';
 ASSERT NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id=brand AND status IN('active','trialing')),'Unexpected active assignment';
 PERFORM set_config('app.remove_checks','28',true);
END $welcome$;

SELECT jsonb_build_object('checks',current_setting('app.remove_checks')::int,'syntheticOnly',true,'providerActions',0) AS result;
ROLLBACK;
