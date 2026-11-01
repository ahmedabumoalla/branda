-- Explicit owner approval: Together Plants only, seven days of finance, no charge.
-- Existing admin assignment/deadline flows permit a custom expiry independent of
-- plan term metadata. Finance's existing constraint requires month/1 here;
-- started_at/expires_at, not that label, control access. Shared plan is unchanged.
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SELECT id FROM public.cafes WHERE id='4e5a661a-7029-40ec-a3bc-dc75959a05bb' FOR UPDATE;
CREATE TEMP TABLE together_trial_before AS SELECT jsonb_build_object(
 'subscriptions',(SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]'::jsonb)::text) FROM public.subscriptions s),
 'plans',(SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) FROM public.platform_plans p),
 'requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::jsonb)::text) FROM public.subscription_payment_requests p)
) AS snapshot;
DO $trial$
DECLARE trial_id uuid; start_at timestamptz:=now();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id='4e5a661a-7029-40ec-a3bc-dc75959a05bb' AND slug='brand-871ec6e243c0' AND business_category='gifts_flowers' AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Together identity mismatch';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_plans WHERE id='finance' AND active AND features ? 'finance' AND duration_unit='month' AND duration_count=1) THEN RAISE EXCEPTION 'Finance plan changed';END IF;
 IF EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id='4e5a661a-7029-40ec-a3bc-dc75959a05bb' AND (activation_source='owner_authorized_finance_trial_7d' OR (plan_id='finance' AND status IN('active','trialing','past_due')))) THEN RAISE EXCEPTION 'Together finance already assigned or trial already granted';END IF;
 IF NOT platform_access_private.service_enabled('4e5a661a-7029-40ec-a3bc-dc75959a05bb','menu') OR NOT platform_access_private.service_enabled('4e5a661a-7029-40ec-a3bc-dc75959a05bb','loyalty') THEN RAISE EXCEPTION 'Existing catalog and loyalty entitlement missing';END IF;
 INSERT INTO public.subscriptions(cafe_id,plan_id,status,amount_sar,base_amount_sar,discount_amount_sar,plan_name_snapshot,duration_unit,duration_count,activation_source,payment_provider,payment_method_label,started_at,expires_at)
 VALUES('4e5a661a-7029-40ec-a3bc-dc75959a05bb','finance','trialing',0,0,0,'تجربة برندة المالية المجانية لمدة 7 أيام','month',1,'owner_authorized_finance_trial_7d','internal','تجربة مجانية لمدة 7 أيام',start_at,start_at+interval '7 days') RETURNING id INTO trial_id;
 INSERT INTO public.audit_logs(cafe_id,action,entity_table,entity_id,new_data)
 VALUES('4e5a661a-7029-40ec-a3bc-dc75959a05bb','owner_authorized_finance_trial_granted','subscriptions',trial_id,jsonb_build_object('plan_id','finance','status','trialing','amount_sar',0,'started_at',start_at,'expires_at',start_at+interval '7 days','authorization','Explicit owner approval for seven-day free finance trial'));
END $trial$;
DO $verify$
DECLARE actual jsonb;
BEGIN
 SELECT jsonb_build_object(
  'subscriptions',(SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]'::jsonb)::text) FROM public.subscriptions s WHERE NOT(cafe_id='4e5a661a-7029-40ec-a3bc-dc75959a05bb' AND activation_source IS NOT DISTINCT FROM 'owner_authorized_finance_trial_7d')),
  'plans',(SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) FROM public.platform_plans p),
  'requests',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::jsonb)::text) FROM public.subscription_payment_requests p)
 ) INTO actual;
 IF actual IS DISTINCT FROM (SELECT snapshot FROM together_trial_before) THEN RAISE EXCEPTION 'Existing subscriptions, shared plans or payment requests changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE cafe_id='4e5a661a-7029-40ec-a3bc-dc75959a05bb' AND activation_source='owner_authorized_finance_trial_7d' AND status='trialing' AND amount_sar=0 AND base_amount_sar=0 AND discount_amount_sar=0 AND expires_at=started_at+interval '7 days') THEN RAISE EXCEPTION 'Trial amount or deadline mismatch';END IF;
 IF NOT platform_access_private.service_enabled('4e5a661a-7029-40ec-a3bc-dc75959a05bb','finance') THEN RAISE EXCEPTION 'Finance trial not effective';END IF;
END $verify$;
COMMIT;
