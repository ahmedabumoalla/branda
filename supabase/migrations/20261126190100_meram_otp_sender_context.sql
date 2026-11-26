BEGIN;

-- Preserve existing access checks, quotas, function privileges and country rules.
-- Staff messaging must use the same cashier and cafe that own the challenge.
DO $migration$
DECLARE
  target regprocedure := 'public.begin_staff_otp(uuid,text,text,text,text,text)'::regprocedure;
  definition text := pg_get_functiondef(target);
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=target) <> 'd1d6b767de174f0a44e0a1c1919a3ff1' THEN
    RAISE EXCEPTION 'Unexpected staff admission definition';
  END IF;
  definition := replace(definition, 'v_brand text;', 'v_brand text; v_cafe_id uuid;');
  definition := replace(definition, 'SELECT c.id,b.name INTO v_staff,v_brand',
    'SELECT c.id,b.name,b.id INTO v_staff,v_brand,v_cafe_id');
  EXECUTE replace(definition, '''brandName'',v_brand);', '''brandName'',v_brand,''cafeId'',v_cafe_id);');
END $migration$;

-- The signed Auth hook carries a phone and verification code, but no tenant.
-- Both admissions already hold the same provider-wide transaction lock as the
-- claim. While a Meram hook could be pending, accept just one eligible request.
DO $migration$
DECLARE
  target record;
  definition text;
  anchor constant text := 'INSERT INTO public.customer_phone_otp_requests';
  guard constant text := $guard$
    IF EXISTS (
      SELECT 1 FROM public.customer_phone_otp_requests r
      WHERE r.phone_normalized=p_phone_normalized AND r.provider_instance=p_provider_instance
        AND r.status='pending' AND r.provider_dispatched_at IS NULL
        AND r.created_at>now()-interval '2 minutes'
        AND ('98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid IN (%s,r.cafe_id))
    ) THEN
      RETURN QUERY SELECT NULL::uuid, 'cooldown'::text, 60;
      RETURN;
    END IF;
    $guard$;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public.begin_customer_phone_otp_request(uuid,text,text,text,integer,integer,integer,integer)'::regprocedure,
      '5ce04f6b6109b7369c76a7615f2b93a1', 'p_cafe_id'),
    ('public.begin_finance_sales_cashier_otp_request(text,text,text,integer)'::regprocedure,
      'e6df51c6f4c12214728668083b7a82b1', 'v_cafe_id')
  ) AS targets(func, body_hash, cafe_variable) LOOP
    SELECT pg_get_functiondef(target.func) INTO definition
    FROM pg_proc WHERE oid=target.func AND md5(prosrc)=target.body_hash;
    IF definition IS NULL OR strpos(definition, anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected OTP admission definition for %', target.func;
    END IF;
    EXECUTE replace(definition, anchor, format(guard,target.cafe_variable) || anchor);
  END LOOP;
END $migration$;

COMMIT;
