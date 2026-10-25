-- Admit finance cashier OTP through the existing signed Supabase SMS hook.
-- No user, credential, loyalty membership, or financial row is changed.
BEGIN;
ALTER TABLE public.customer_phone_otp_requests ADD COLUMN finance_ip_hash text;
ALTER TABLE public.customer_phone_otp_requests DROP CONSTRAINT customer_phone_otp_requests_purpose_check;
ALTER TABLE public.customer_phone_otp_requests ADD CONSTRAINT customer_phone_otp_requests_purpose_check
 CHECK(purpose IN('customer_signup','customer_login','finance_cashier_login'));
ALTER TABLE public.customer_phone_otp_requests ADD CONSTRAINT customer_phone_otp_requests_finance_ip_check
 CHECK(purpose<>'finance_cashier_login' OR (finance_ip_hash IS NOT NULL AND finance_ip_hash ~ '^[a-f0-9]{64}$'));
CREATE INDEX idx_finance_sales_otp_phone ON public.customer_phone_otp_requests(phone_normalized,created_at DESC)
 WHERE purpose='finance_cashier_login';
CREATE INDEX idx_finance_sales_otp_ip ON public.customer_phone_otp_requests(finance_ip_hash,created_at DESC)
 WHERE purpose='finance_cashier_login';

-- Keep customer per-brand quotas unchanged while sharing the existing provider-wide new-chat budget.
DO $$ DECLARE v_definition text;v_predicate text:='WHERE request.cafe_id = p_cafe_id';BEGIN
 v_definition:=pg_get_functiondef('public.begin_customer_phone_otp_request(uuid,text,text,text,integer,integer,integer,integer)'::regprocedure);
 IF (length(v_definition)-length(replace(v_definition,v_predicate,'')))/length(v_predicate)<>3
  THEN RAISE EXCEPTION 'Unexpected customer OTP admission definition';END IF;
 EXECUTE replace(v_definition,v_predicate,v_predicate||E'\n    AND request.purpose IN (''customer_signup'', ''customer_login'')');
END $$;

CREATE FUNCTION public.begin_finance_sales_cashier_otp_request(
 p_phone_normalized text,p_provider_instance text,p_ip_hash text,p_global_daily_limit integer DEFAULT 20
) RETURNS TABLE(request_id uuid,result text,retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cafe_id uuid;v_request_id uuid;v_latest timestamptz;v_count integer;v_seen boolean;
BEGIN
 IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^9665[0-9]{8}$'
  OR p_provider_instance IS NULL OR length(p_provider_instance) NOT BETWEEN 1 AND 200
  OR p_ip_hash IS NULL OR p_ip_hash !~ '^[a-f0-9]{64}$'
  OR p_global_daily_limit IS NULL OR p_global_daily_limit<1
  OR NOT public.brand_finance_sales_cashier_phone_enabled(p_phone_normalized)
 THEN RETURN QUERY SELECT NULL::uuid,'unavailable'::text,NULL::integer;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-sales-otp-phone:'||p_phone_normalized,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-sales-otp-ip:'||p_ip_hash,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('customer-phone-otp-global:'||p_provider_instance,0));
 SELECT c.id INTO v_cafe_id FROM auth.users u JOIN public.profiles p ON p.id=u.id AND p.status='active' AND p.role='customer'
 JOIN public.bf_staff s ON s.user_id=u.id AND s.role='cashier' AND s.active
 JOIN public.cafes c ON c.id=s.cafe_id AND c.deleted_at IS NULL AND c.status IN('active','published')
 WHERE u.phone IN(p_phone_normalized,'+'||p_phone_normalized) AND u.phone_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
  AND platform_access_private.service_enabled(c.id,'finance') ORDER BY c.slug,c.id LIMIT 1;
 IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid,'unavailable'::text,NULL::integer;RETURN;END IF;
 SELECT max(r.created_at) INTO v_latest FROM public.customer_phone_otp_requests r
 WHERE r.purpose='finance_cashier_login' AND r.phone_normalized=p_phone_normalized;
 IF v_latest>now()-interval '60 seconds' THEN
  RETURN QUERY SELECT NULL::uuid,'cooldown'::text,greatest(1,ceil(extract(epoch FROM v_latest+interval '60 seconds'-now()))::integer);RETURN;
 END IF;
 SELECT max(r.created_at) INTO v_latest FROM public.customer_phone_otp_requests r
 WHERE r.purpose='finance_cashier_login' AND r.finance_ip_hash=p_ip_hash;
 IF v_latest>now()-interval '2 seconds' THEN
  RETURN QUERY SELECT NULL::uuid,'cooldown'::text,greatest(1,ceil(extract(epoch FROM v_latest+interval '2 seconds'-now()))::integer);RETURN;
 END IF;
 SELECT count(*) INTO v_count FROM public.customer_phone_otp_requests r
 WHERE r.purpose='finance_cashier_login' AND r.phone_normalized=p_phone_normalized AND r.created_at>=now()-interval '1 hour';
 IF v_count>=3 THEN RETURN QUERY SELECT NULL::uuid,'hourly_limit'::text,NULL::integer;RETURN;END IF;
 SELECT count(*) INTO v_count FROM public.customer_phone_otp_requests r
 WHERE r.purpose='finance_cashier_login' AND r.finance_ip_hash=p_ip_hash AND r.created_at>=now()-interval '1 hour';
 IF v_count>=20 THEN RETURN QUERY SELECT NULL::uuid,'hourly_limit'::text,NULL::integer;RETURN;END IF;
 SELECT count(*) INTO v_count FROM public.customer_phone_otp_requests r
 WHERE r.purpose='finance_cashier_login' AND r.phone_normalized=p_phone_normalized AND r.created_at>=now()-interval '24 hours';
 IF v_count>=5 THEN RETURN QUERY SELECT NULL::uuid,'daily_limit'::text,NULL::integer;RETURN;END IF;
 SELECT count(*) INTO v_count FROM public.customer_phone_otp_requests r
 WHERE r.purpose='finance_cashier_login' AND r.finance_ip_hash=p_ip_hash AND r.created_at>=now()-interval '24 hours';
 IF v_count>=50 THEN RETURN QUERY SELECT NULL::uuid,'daily_limit'::text,NULL::integer;RETURN;END IF;
 SELECT EXISTS(SELECT 1 FROM public.customer_phone_otp_requests r WHERE r.provider_instance=p_provider_instance
  AND r.phone_normalized=p_phone_normalized AND r.status IN('pending','accepted') AND r.created_at>=date_trunc('day',now())) INTO v_seen;
 SELECT count(DISTINCT r.phone_normalized) INTO v_count FROM public.customer_phone_otp_requests r
 WHERE r.provider_instance=p_provider_instance AND r.status IN('pending','accepted') AND r.created_at>=date_trunc('day',now());
 IF NOT v_seen AND v_count>=p_global_daily_limit THEN RETURN QUERY SELECT NULL::uuid,'global_limit'::text,NULL::integer;RETURN;END IF;
 INSERT INTO public.customer_phone_otp_requests(cafe_id,phone_normalized,purpose,provider_instance,finance_ip_hash)
 VALUES(v_cafe_id,p_phone_normalized,'finance_cashier_login',p_provider_instance,p_ip_hash) RETURNING id INTO v_request_id;
 RETURN QUERY SELECT v_request_id,'created'::text,60;
END $$;
REVOKE ALL ON FUNCTION public.begin_finance_sales_cashier_otp_request(text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_finance_sales_cashier_otp_request(text,text,text,integer) TO service_role;

CREATE FUNCTION public.complete_finance_sales_cashier_otp_request(p_request_id uuid,p_accepted boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.customer_phone_otp_requests
 SET status=CASE WHEN p_accepted OR provider_dispatched_at IS NOT NULL THEN 'accepted' ELSE 'failed' END,completed_at=now()
 WHERE id=p_request_id AND purpose='finance_cashier_login' AND status='pending';
END $$;
REVOKE ALL ON FUNCTION public.complete_finance_sales_cashier_otp_request(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_finance_sales_cashier_otp_request(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_customer_phone_otp_dispatch(p_phone_normalized text,p_provider_instance text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request_id uuid;v_slug text;
BEGIN
 IF p_phone_normalized IS NULL OR p_phone_normalized !~ '^9665[0-9]{8}$'
  OR p_provider_instance IS NULL OR char_length(p_provider_instance) NOT BETWEEN 1 AND 200 THEN RETURN NULL;END IF;
 SELECT r.id,c.slug::text INTO v_request_id,v_slug
 FROM public.customer_phone_otp_requests r JOIN public.cafes c ON c.id=r.cafe_id
 WHERE r.phone_normalized=p_phone_normalized AND r.provider_instance=p_provider_instance
  AND r.status='pending' AND r.provider_dispatched_at IS NULL AND r.created_at>now()-interval '2 minutes'
  AND c.deleted_at IS NULL
  AND (
   (r.purpose IN('customer_signup','customer_login') AND c.status='active' AND c.is_public
    AND platform_access_private.service_enabled(c.id,'loyalty')
    AND EXISTS(SELECT 1 FROM public.cafe_loyalty_programs p WHERE p.cafe_id=c.id AND p.enabled))
   OR
   (r.purpose='finance_cashier_login' AND r.finance_ip_hash IS NOT NULL AND c.status IN('active','published')
    AND platform_access_private.service_enabled(c.id,'finance')
    AND public.brand_finance_sales_cashier_phone_enabled(p_phone_normalized)
    AND EXISTS(SELECT 1 FROM public.bf_staff s JOIN auth.users u ON u.id=s.user_id
     WHERE s.cafe_id=c.id AND s.role='cashier' AND s.active AND u.phone IN(p_phone_normalized,'+'||p_phone_normalized)))
  )
 ORDER BY r.created_at DESC,r.id DESC LIMIT 1 FOR UPDATE OF r SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.customer_phone_otp_requests SET provider_dispatched_at=now() WHERE id=v_request_id;
 RETURN v_slug;
END $$;
REVOKE ALL ON FUNCTION public.claim_customer_phone_otp_dispatch(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_phone_otp_dispatch(text,text) TO service_role;
-- Forward rollback: revoke finance admission/complete RPCs, restore the preceding claim
-- function in a new migration, retaining request history and customer per-purpose counts.
COMMIT;
