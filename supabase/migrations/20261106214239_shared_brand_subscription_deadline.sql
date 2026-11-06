-- One lazily synchronized service deadline per brand, without rewriting history at deployment.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('public.admin_assign_plan_without_payment(uuid,text)'::regprocedure))<>'449820a98a588fcd8b0a5b28570461d3'
  OR md5(pg_get_functiondef('public.admin_update_subscription_deadline(uuid,uuid,timestamptz,timestamptz)'::regprocedure))<>'a2f641211d845e2a8eceab3a50f7b228'
  OR md5(pg_get_functiondef('public.admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamptz)'::regprocedure))<>'524ec7ebbebf48de0f2cb44303c3bc37' THEN
  RAISE EXCEPTION 'Unexpected subscription mutation functions; review migration';
 END IF;
END $guard$;
CREATE SCHEMA subscription_terms_private;
REVOKE ALL ON SCHEMA subscription_terms_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION subscription_terms_private.require_admin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active') THEN
  RAISE EXCEPTION 'brand_subscription_forbidden' USING ERRCODE='42501';
 END IF;
END $$;

CREATE FUNCTION subscription_terms_private.state(p_cafe_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH rows AS (
  SELECT s.id,s.plan_id,s.plan_name_snapshot,s.status,s.activation_source,s.started_at,s.expires_at,s.updated_at,s.created_at,s.duration_unit,s.duration_count,
   jsonb_build_object('active',coalesce(p.active,false),'name',p.name) AS platform_plans,
   s.status IN('active','trialing') AND coalesce(p.active,false) AS standing
  FROM public.subscriptions s LEFT JOIN public.platform_plans p ON p.id=s.plan_id WHERE s.cafe_id=p_cafe_id
 ), real_clock AS (SELECT * FROM rows WHERE standing AND activation_source IS DISTINCT FROM 'admin_prepared_trial')
 SELECT jsonb_build_object(
  'revision',md5(coalesce((SELECT jsonb_agg(to_jsonb(r)-'standing' ORDER BY created_at DESC,id DESC)::text FROM rows r),'[]')),
  'subscriptions',coalesce((SELECT jsonb_agg(to_jsonb(r)-'standing' ORDER BY created_at DESC,id DESC) FROM rows r),'[]'::jsonb),
  'currentPlanIds',coalesce((SELECT jsonb_agg(plan_id ORDER BY plan_id) FROM(SELECT DISTINCT plan_id FROM rows WHERE standing)x),'[]'::jsonb),
  'trialAwaitingDelivery',EXISTS(SELECT 1 FROM rows WHERE standing) AND NOT EXISTS(SELECT 1 FROM real_clock),
  'sharedExpiresAt',CASE WHEN EXISTS(SELECT 1 FROM real_clock WHERE expires_at IS NULL) THEN NULL ELSE (SELECT max(expires_at) FROM real_clock) END
 )
$$;

CREATE FUNCTION public.admin_brand_subscription_state(p_cafe_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM subscription_terms_private.require_admin();
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'brand_subscription_unavailable';END IF;
 RETURN subscription_terms_private.state(p_cafe_id);
END $$;

CREATE FUNCTION public.admin_brand_subscription_states(p_cafe_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM subscription_terms_private.require_admin();
 IF p_cafe_ids IS NULL OR cardinality(p_cafe_ids)>100 OR array_position(p_cafe_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'brand_subscription_unavailable';END IF;
 RETURN coalesce((SELECT jsonb_object_agg(c.id::text,subscription_terms_private.state(c.id)) FROM public.cafes c WHERE c.id=ANY(p_cafe_ids) AND c.deleted_at IS NULL),'{}'::jsonb);
END $$;

-- Every legitimate activation (administrator, bank approval, online capture or signup)
-- reaches this trigger. Financial values and duration snapshots are never recalculated.
CREATE FUNCTION subscription_terms_private.synchronize() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_end timestamptz; v_explicit boolean:=false; v_has_real boolean;
BEGIN
 IF pg_trigger_depth()>1 OR NEW.status NOT IN('active','trialing')
   OR NOT EXISTS(SELECT 1 FROM public.platform_plans WHERE id=NEW.plan_id AND active) THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status IN('expired','cancelled') THEN RETURN NEW;END IF;
  v_explicit:=OLD.status IN('active','trialing') AND NEW.expires_at IS DISTINCT FROM OLD.expires_at;
 END IF;
 -- Official RPCs already hold the brand lock before any subscription row.
 -- A legacy direct row write must retry rather than wait in the inverse lock order.
 BEGIN
  PERFORM 1 FROM public.cafes WHERE id=NEW.cafe_id FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'brand_subscription_conflict' USING ERRCODE='40001';
 END;
 PERFORM 1 FROM public.subscriptions WHERE cafe_id=NEW.cafe_id ORDER BY id FOR UPDATE;
 SELECT EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
   WHERE s.cafe_id=NEW.cafe_id AND s.status IN('active','trialing') AND p.active AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial') INTO v_has_real;
 IF NOT v_has_real THEN RETURN NEW;END IF;
 IF v_explicit THEN v_end:=NEW.expires_at;
 ELSE
  SELECT CASE WHEN bool_or(s.expires_at IS NULL) THEN NULL ELSE max(s.expires_at) END INTO v_end
   FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
   WHERE s.cafe_id=NEW.cafe_id AND s.status IN('active','trialing') AND p.active AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial';
 END IF;
 IF v_end IS NOT NULL AND EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
   WHERE s.cafe_id=NEW.cafe_id AND s.status IN('active','trialing') AND p.active AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial' AND s.started_at>=v_end) THEN
  RAISE EXCEPTION 'brand_subscription_invalid_deadline';
 END IF;
 UPDATE public.subscriptions s SET expires_at=v_end,
  started_at=CASE WHEN s.activation_source='admin_prepared_trial' AND NEW.activation_source='admin_whatsapp_trial' THEN NEW.started_at ELSE s.started_at END,
  activation_source=CASE WHEN s.activation_source='admin_prepared_trial' THEN CASE WHEN NEW.activation_source='admin_whatsapp_trial' THEN 'admin_whatsapp_trial' ELSE 'admin_shared_subscription' END ELSE s.activation_source END,
  updated_at=clock_timestamp()
 WHERE s.cafe_id=NEW.cafe_id AND s.status IN('active','trialing')
  AND EXISTS(SELECT 1 FROM public.platform_plans p WHERE p.id=s.plan_id AND p.active)
  AND (s.expires_at IS DISTINCT FROM v_end OR s.activation_source='admin_prepared_trial');
 RETURN NEW;
END $$;
CREATE TRIGGER zz_synchronize_brand_subscription_deadline
AFTER INSERT OR UPDATE OF status,expires_at,started_at,activation_source ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION subscription_terms_private.synchronize();

CREATE FUNCTION public.admin_add_brand_plans(p_cafe_id uuid,p_plan_ids text[],p_expected_revision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_state jsonb; v_end timestamptz; v_prepared boolean; v_plan public.platform_plans%ROWTYPE;
 v_start timestamptz:=now(); v_unit text; v_count integer; v_trial boolean; v_added text[]:='{}'; v_current text[];
BEGIN
 PERFORM subscription_terms_private.require_admin();
 IF p_plan_ids IS NULL OR cardinality(p_plan_ids) NOT BETWEEN 1 AND 50 OR array_position(p_plan_ids,NULL) IS NOT NULL
  OR EXISTS(SELECT 1 FROM unnest(p_plan_ids)x WHERE length(x) NOT BETWEEN 1 AND 100)
  THEN RAISE EXCEPTION 'brand_subscription_invalid_plan';END IF;
 PERFORM 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'brand_subscription_unavailable';END IF;
 PERFORM 1 FROM public.subscriptions WHERE cafe_id=p_cafe_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.platform_plans WHERE id=ANY(p_plan_ids) OR id IN(SELECT plan_id FROM public.subscriptions WHERE cafe_id=p_cafe_id) ORDER BY id FOR SHARE;
 IF EXISTS(SELECT 1 FROM unnest(p_plan_ids)x WHERE NOT EXISTS(SELECT 1 FROM public.platform_plans p WHERE p.id=x AND p.active)) THEN RAISE EXCEPTION 'brand_subscription_invalid_plan';END IF;
 v_state:=subscription_terms_private.state(p_cafe_id);
 SELECT coalesce(array_agg(value),'{}') INTO v_current FROM jsonb_array_elements_text(v_state->'currentPlanIds');
 -- A lost response can safely be reconciled without creating duplicate assignments.
 IF p_plan_ids<@v_current THEN RETURN v_state;END IF;
 IF p_expected_revision IS NULL OR p_expected_revision IS DISTINCT FROM v_state->>'revision' THEN RAISE EXCEPTION 'brand_subscription_conflict';END IF;
 v_prepared:=(v_state->>'trialAwaitingDelivery')::boolean;
 v_end:=(v_state->>'sharedExpiresAt')::timestamptz;
 IF NOT v_prepared AND (cardinality(v_current)=0 OR (v_end IS NOT NULL AND v_end<=v_start)) THEN
  SELECT max(v_start+CASE WHEN p.price_sar=0 AND p.trial_days>0 THEN make_interval(days=>p.trial_days)
    WHEN p.duration_unit='day' THEN make_interval(days=>p.duration_count)
    WHEN p.duration_unit='month' THEN make_interval(months=>p.duration_count)
    WHEN p.duration_unit='year' THEN make_interval(years=>p.duration_count) END) INTO v_end
  FROM public.platform_plans p WHERE p.id=ANY(p_plan_ids) AND p.active;
  IF v_end IS NULL OR v_end<=v_start THEN RAISE EXCEPTION 'brand_subscription_invalid_plan';END IF;
 END IF;
 FOR v_plan IN SELECT * FROM public.platform_plans WHERE id=ANY(p_plan_ids) AND active ORDER BY id FOR SHARE LOOP
  IF v_plan.id=ANY(v_current) THEN CONTINUE;END IF;
  v_trial:=v_prepared OR (v_plan.price_sar=0 AND coalesce(v_plan.trial_days,0)>0);
  -- Finance remains constrained to monthly terms; its zero-charge trial still ends with the shared trial.
  v_unit:=CASE WHEN v_trial AND v_plan.id<>'finance' THEN 'day' ELSE v_plan.duration_unit END;
  v_count:=CASE WHEN v_prepared AND v_plan.id<>'finance' THEN 7 WHEN v_trial AND v_plan.id<>'finance' THEN v_plan.trial_days ELSE v_plan.duration_count END;
  IF v_count IS NULL OR v_count<1 OR v_unit NOT IN('day','month','year') THEN RAISE EXCEPTION 'brand_subscription_invalid_plan';END IF;
  INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,base_amount_sar,discount_amount_sar,plan_name_snapshot,duration_unit,duration_count,activation_source,payment_provider,payment_method_label,started_at,expires_at)
  VALUES(p_cafe_id,v_plan.id,(CASE WHEN v_trial THEN 'trialing' ELSE 'active' END)::public.subscription_status,0,0,0,v_plan.name,v_unit,v_count,
   CASE WHEN v_prepared THEN 'admin_prepared_trial' ELSE 'admin_manual_change' END,'admin','تفعيل باقات من الأدمن',v_start,v_end);
  v_added:=array_append(v_added,v_plan.id);
 END LOOP;
 UPDATE public.subscriptions SET updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND status IN('active','trialing') AND plan_id IN(SELECT id FROM public.platform_plans WHERE active);
 INSERT INTO public.audit_logs(actor_id,cafe_id,action,entity_table,entity_id,new_data)
 VALUES(auth.uid(),p_cafe_id,'admin_brand_plans_added','cafes',p_cafe_id,jsonb_build_object('plan_ids',v_added,'shared_expires_at',v_end,'prepared_trial',v_prepared));
 RETURN subscription_terms_private.state(p_cafe_id);
END $$;

CREATE FUNCTION public.admin_update_brand_subscription_deadline(p_cafe_id uuid,p_expected_revision text,p_expires_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_state jsonb; v_ids uuid[];
BEGIN
 PERFORM subscription_terms_private.require_admin();
 PERFORM 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'brand_subscription_unavailable';END IF;
 PERFORM 1 FROM public.subscriptions WHERE cafe_id=p_cafe_id ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.platform_plans WHERE id IN(SELECT plan_id FROM public.subscriptions WHERE cafe_id=p_cafe_id) ORDER BY id FOR SHARE;
 v_state:=subscription_terms_private.state(p_cafe_id);
 IF (v_state->>'trialAwaitingDelivery')::boolean THEN RAISE EXCEPTION 'brand_subscription_prepared_trial';END IF;
 SELECT array_agg(s.id ORDER BY s.id) INTO v_ids FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id WHERE s.cafe_id=p_cafe_id AND s.status IN('active','trialing') AND p.active;
 IF cardinality(v_ids) IS NULL THEN RAISE EXCEPTION 'brand_subscription_unavailable';END IF;
 IF p_expires_at IS NULL OR NOT isfinite(p_expires_at) OR EXISTS(SELECT 1 FROM public.subscriptions WHERE id=ANY(v_ids) AND started_at>=p_expires_at) THEN RAISE EXCEPTION 'brand_subscription_invalid_deadline';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE id=ANY(v_ids) AND expires_at IS DISTINCT FROM p_expires_at) THEN RETURN v_state;END IF;
 IF p_expected_revision IS NULL OR p_expected_revision IS DISTINCT FROM v_state->>'revision' THEN RAISE EXCEPTION 'brand_subscription_conflict';END IF;
 UPDATE public.subscriptions SET expires_at=p_expires_at,updated_at=clock_timestamp() WHERE id=ANY(v_ids);
 INSERT INTO public.audit_logs(actor_id,cafe_id,action,entity_table,entity_id,old_data,new_data)
 VALUES(auth.uid(),p_cafe_id,'admin_brand_subscription_deadline_updated','cafes',p_cafe_id,
  jsonb_build_object('revision',v_state->>'revision','shared_expires_at',v_state->'sharedExpiresAt'),jsonb_build_object('subscription_ids',v_ids,'shared_expires_at',p_expires_at,'timezone','Asia/Riyadh'));
 RETURN subscription_terms_private.state(p_cafe_id);
END $$;

-- Legacy callers retain their signatures while receiving the same atomic semantics.
CREATE OR REPLACE FUNCTION public.admin_assign_plan_without_payment(p_cafe_id uuid,p_plan_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM subscription_terms_private.require_admin();
 PERFORM 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
 PERFORM public.admin_add_brand_plans(p_cafe_id,ARRAY[p_plan_id],subscription_terms_private.state(p_cafe_id)->>'revision');
END $$;
CREATE OR REPLACE FUNCTION public.admin_update_subscription_deadline(p_cafe_id uuid,p_subscription_id uuid,p_expected_updated_at timestamptz,p_expires_at timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM subscription_terms_private.require_admin();
 PERFORM 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id WHERE s.id=p_subscription_id AND s.cafe_id=p_cafe_id AND s.status IN('active','trialing') AND p.active AND s.updated_at=p_expected_updated_at) THEN RAISE EXCEPTION 'expiry_conflict';END IF;
 PERFORM public.admin_update_brand_subscription_deadline(p_cafe_id,subscription_terms_private.state(p_cafe_id)->>'revision',p_expires_at);
END $$;

CREATE FUNCTION public.activate_paid_brand_subscription(p_cafe_id uuid,p_subscription_id uuid,p_payment jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.subscriptions%ROWTYPE; v_provider text:=coalesce(p_payment->>'provider','paypal'); v_start timestamptz; v_end timestamptz; v_paid timestamptz:=now();
BEGIN
 IF p_payment IS NULL OR jsonb_typeof(p_payment)<>'object' OR v_provider NOT IN('paypal','paymob')
  OR octet_length(p_payment::text)>5000 THEN RAISE EXCEPTION 'Invalid captured payment';END IF;
 PERFORM 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('activated',false,'subscriptionId',p_subscription_id);END IF;
 SELECT * INTO v FROM public.subscriptions WHERE id=p_subscription_id AND cafe_id=p_cafe_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'past_due' THEN RETURN jsonb_build_object('activated',false,'subscriptionId',p_subscription_id);END IF;
 PERFORM 1 FROM public.platform_plans WHERE id IN(SELECT plan_id FROM public.subscriptions WHERE cafe_id=p_cafe_id) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.platform_plans WHERE id=v.plan_id AND active) THEN RAISE EXCEPTION 'Plan unavailable';END IF;
 SELECT greatest(v_paid,coalesce(max(expires_at),v_paid)) INTO v_start FROM public.subscriptions WHERE cafe_id=p_cafe_id AND plan_id=v.plan_id AND status IN('active','trialing') AND expires_at>v_paid;
 v_end:=public.calculate_subscription_expiry(v_start,v.duration_unit,v.duration_count);
 UPDATE public.subscriptions SET status='active',started_at=v_start,expires_at=v_end,paid_at=v_paid,updated_at=clock_timestamp(),
  payment_provider=v_provider,payment_method_label=coalesce(nullif(p_payment->>'paymentMethodLabel',''),CASE WHEN v_provider='paymob' THEN 'Paymob' ELSE 'PayPal' END),
  paypal_order_id=CASE WHEN v_provider='paypal' THEN p_payment->>'orderId' ELSE paypal_order_id END,
  paypal_capture_id=CASE WHEN v_provider='paypal' THEN p_payment->>'captureId' ELSE paypal_capture_id END,
  paypal_currency=CASE WHEN v_provider='paypal' THEN p_payment->>'currency' ELSE paypal_currency END,
  paypal_amount=CASE WHEN v_provider='paypal' THEN (p_payment->>'amount')::numeric ELSE paypal_amount END,
  paymob_transaction_id=CASE WHEN v_provider='paymob' THEN p_payment->>'paymobTransactionId' ELSE paymob_transaction_id END,
  paymob_order_id=CASE WHEN v_provider='paymob' THEN p_payment->>'paymobOrderId' ELSE paymob_order_id END
 WHERE id=v.id;
 RETURN jsonb_build_object('activated',true,'subscriptionId',v.id);
END $$;

-- The existing welcome starts the referenced prepared row. Synchronization starts
-- every other prepared row atomically, including newly added finance access.
DO $welcome$
DECLARE src text:=pg_get_functiondef('public.admin_finish_brand_welcome(uuid,uuid,uuid,text,timestamptz)'::regprocedure);
BEGIN
 IF md5(src)<>'524ec7ebbebf48de0f2cb44303c3bc37' THEN RAISE EXCEPTION 'Unexpected welcome function';END IF;
 -- Keep the finance monthly-duration constraint while applying the common seven-day clock.
 EXECUTE replace(src,'duration_unit=''day'',duration_count=7,','duration_unit=CASE WHEN s.plan_id=''finance'' THEN s.duration_unit ELSE ''day'' END,duration_count=CASE WHEN s.plan_id=''finance'' THEN s.duration_count ELSE 7 END,');
END $welcome$;

-- Bank approval uses the same plan-row lock as administrative and online activation.
-- Its price, credit, renewal and commission calculation remains byte-for-byte intact.
DO $bank$
DECLARE src text:=pg_get_functiondef('public.admin_approve_subscription_request(uuid)'::regprocedure);
 needle text:='  IF NOT EXISTS (SELECT 1 FROM public.platform_plans WHERE id = v_request.plan_id AND active = true) THEN';
BEGIN
 IF md5(src)<>'0f02c02aac69686fc195d9efba416ec2'
  OR (length(src)-length(replace(src,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected bank approval function';END IF;
 EXECUTE replace(src,needle,E'  PERFORM 1 FROM public.platform_plans WHERE id = v_request.plan_id FOR SHARE;\n'||needle);
END $bank$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA subscription_terms_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_brand_subscription_state(uuid),public.admin_brand_subscription_states(uuid[]),public.admin_add_brand_plans(uuid,text[],text),public.admin_update_brand_subscription_deadline(uuid,text,timestamptz) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_brand_subscription_state(uuid),public.admin_brand_subscription_states(uuid[]),public.admin_add_brand_plans(uuid,text[],text),public.admin_update_brand_subscription_deadline(uuid,text,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.activate_paid_brand_subscription(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_brand_subscription(uuid,uuid,jsonb) TO service_role;
COMMIT;
