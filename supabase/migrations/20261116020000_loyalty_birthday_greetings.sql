BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Birth date is collected only for brands listed in birthday_settings
ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS birth_date date;

CREATE TABLE loyalty_audit_private.birthday_settings (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE loyalty_audit_private.birthday_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_audit_private.birthday_settings FROM PUBLIC,anon,authenticated,service_role;

-- One greeting per customer per year; never backfilled and never resent after an ambiguous delivery
CREATE TABLE loyalty_audit_private.birthday_greetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  customer_profile_id uuid NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
  greeting_year integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dispatching','queued','rejected','unknown','expired')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempted_at timestamptz,
  finished_at timestamptz,
  claim_token uuid,
  provider_message_id text CHECK(length(provider_message_id)<=200),
  UNIQUE(cafe_id,customer_profile_id,greeting_year)
);
ALTER TABLE loyalty_audit_private.birthday_greetings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_audit_private.birthday_greetings FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX birthday_greetings_pending ON loyalty_audit_private.birthday_greetings(created_at) WHERE status='pending';

CREATE FUNCTION public.loyalty_birthday_enabled(p_cafe uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM loyalty_audit_private.birthday_settings WHERE cafe_id=p_cafe AND enabled)
$$;
REVOKE ALL ON FUNCTION public.loyalty_birthday_enabled(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.loyalty_birthday_enabled(uuid) TO authenticated,service_role;

-- Called by the server after a successful enrollment; a stored date is never overwritten from the public page
CREATE FUNCTION public.set_loyalty_customer_birth_date(p_cafe uuid,p_profile uuid,p_birth date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_birth IS NULL OR p_birth<date '1900-01-01' OR p_birth>(clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date THEN RETURN false;END IF;
 IF NOT public.loyalty_birthday_enabled(p_cafe) THEN RETURN false;END IF;
 UPDATE public.customer_profiles SET birth_date=p_birth WHERE id=p_profile AND cafe_id=p_cafe AND birth_date IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.set_loyalty_customer_birth_date(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_loyalty_customer_birth_date(uuid,uuid,date) TO service_role;

CREATE FUNCTION public.claim_loyalty_birthday_greeting(p_primary_ready boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_now timestamp:=clock_timestamp() AT TIME ZONE 'Asia/Riyadh';v_today date;v_leap boolean;
 v_job loyalty_audit_private.birthday_greetings;v_context jsonb;
BEGIN
 IF NOT coalesce(p_primary_ready,false) THEN RETURN NULL;END IF;
 v_today:=v_now::date;
 v_leap:=extract(day FROM (make_date(extract(year FROM v_today)::integer,3,1)-1))=29;
 UPDATE loyalty_audit_private.birthday_greetings SET status='unknown',finished_at=clock_timestamp()
 WHERE status='dispatching' AND attempted_at<clock_timestamp()-interval '5 minutes';
 -- A greeting that could not leave on the birthday itself is dropped, not sent late
 UPDATE loyalty_audit_private.birthday_greetings SET status='expired',finished_at=clock_timestamp()
 WHERE status='pending' AND (created_at AT TIME ZONE 'Asia/Riyadh')::date<v_today;
 -- Greetings go out from nine in the morning, Riyadh time
 IF extract(hour FROM v_now)<9 THEN RETURN NULL;END IF;
 INSERT INTO loyalty_audit_private.birthday_greetings(cafe_id,customer_profile_id,greeting_year)
 SELECT cp.cafe_id,cp.id,extract(year FROM v_today)::integer
 FROM loyalty_audit_private.birthday_settings s
 JOIN public.customer_profiles cp ON cp.cafe_id=s.cafe_id
 WHERE s.enabled AND cp.birth_date IS NOT NULL
  AND ((extract(month FROM cp.birth_date)=extract(month FROM v_today) AND extract(day FROM cp.birth_date)=extract(day FROM v_today))
    OR (NOT v_leap AND extract(month FROM v_today)=2 AND extract(day FROM v_today)=28
      AND extract(month FROM cp.birth_date)=2 AND extract(day FROM cp.birth_date)=29))
 ON CONFLICT(cafe_id,customer_profile_id,greeting_year) DO NOTHING;
 SELECT g.* INTO v_job FROM loyalty_audit_private.birthday_greetings g
 JOIN loyalty_audit_private.birthday_settings s ON s.cafe_id=g.cafe_id AND s.enabled
 JOIN public.customer_profiles cp ON cp.id=g.customer_profile_id AND cp.cafe_id=g.cafe_id
 JOIN public.loyalty_cards lc ON lc.cafe_id=g.cafe_id AND lc.customer_profile_id=g.customer_profile_id
 JOIN public.cafes c ON c.id=g.cafe_id
 JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=g.cafe_id
 WHERE public.brand_account_not_cancelled(g.cafe_id) AND g.status='pending'
  AND lc.status='active' AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
  AND cp.phone_normalized ~ '^9665[0-9]{8}$' AND c.status='active' AND c.deleted_at IS NULL
  AND lp.enabled AND platform_access_private.service_enabled(c.id,'loyalty')
 ORDER BY g.created_at,g.id FOR UPDATE OF g SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE loyalty_audit_private.birthday_greetings SET status='dispatching',attempted_at=clock_timestamp(),claim_token=gen_random_uuid()
 WHERE id=v_job.id RETURNING * INTO v_job;
 SELECT jsonb_build_object('id',v_job.id,'claimToken',v_job.claim_token,'cafeId',v_job.cafe_id,'brandName',c.name,
  'customerName',cp.full_name,'phone',cp.phone_normalized)
 INTO v_context FROM public.cafes c
 JOIN public.customer_profiles cp ON cp.id=v_job.customer_profile_id WHERE c.id=v_job.cafe_id;
 RETURN v_context;
END $$;
REVOKE ALL ON FUNCTION public.claim_loyalty_birthday_greeting(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_loyalty_birthday_greeting(boolean) TO service_role;

CREATE FUNCTION public.finish_loyalty_birthday_greeting(p_id uuid,p_token uuid,p_status text,p_provider_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status IS NULL OR p_status NOT IN ('queued','rejected','unknown') OR length(p_provider_message_id)>200
  OR (p_status='queued' AND coalesce(length(p_provider_message_id),0)=0) THEN
  RAISE EXCEPTION 'invalid_birthday_result';
 END IF;
 UPDATE loyalty_audit_private.birthday_greetings SET status=p_status,provider_message_id=p_provider_message_id,finished_at=clock_timestamp()
 WHERE id=p_id AND claim_token=p_token AND status='dispatching';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.finish_loyalty_birthday_greeting(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_loyalty_birthday_greeting(uuid,uuid,text,text) TO service_role;

-- Customer file of the wallet-card registry also carries the birth date for brands that collect it
CREATE OR REPLACE FUNCTION public.finance_loyalty_customer_detail(p_cafe uuid,p_customer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT coalesce(brand_finance_private.loyalty_directory_authorized(p_cafe),false) THEN RAISE EXCEPTION 'LOYALTY_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),'عميل بدون اسم'),'phone',p.phone,
  'birthdayEnabled',public.loyalty_birthday_enabled(p_cafe),'birthDate',p.birth_date) INTO result
 FROM public.customer_profiles p WHERE p.cafe_id=p_cafe AND p.id=p_customer AND brand_finance_private.loyalty_customer_downloaded(p_cafe,p.id);
 IF result IS NULL THEN RAISE EXCEPTION 'LOYALTY_CUSTOMER_UNAVAILABLE';END IF;
 RETURN result;
END $$;

-- مقص 77
INSERT INTO loyalty_audit_private.birthday_settings(cafe_id) VALUES('d4a19dc5-ef99-4aec-86ae-0bebc7bbd59e');
NOTIFY pgrst,'reload schema';
COMMIT;
