-- Synthetic admissions only. The transaction rolls back every queue row.
BEGIN;
DO $test$
DECLARE
  meram constant uuid := '98fd33d5-522d-46e7-adeb-34b04a665f4f';
  other_cafe uuid;
  phone text := '9665' || lpad(floor(random()*100000000)::bigint::text,8,'0');
  instance text := 'isolated-' || gen_random_uuid()::text;
  first_cafe uuid;
  second_cafe uuid;
  purpose text;
  result text;
  job uuid;
  admitted record;
BEGIN
  SELECT id INTO STRICT other_cafe FROM public.cafes
  WHERE id<>meram AND deleted_at IS NULL AND status='active' AND is_public
    AND brand_phone_private.canonical(id,phone)
    AND platform_access_private.service_enabled(id,'loyalty')
    AND EXISTS(SELECT 1 FROM public.cafe_loyalty_programs p WHERE p.cafe_id=cafes.id AND p.enabled)
  ORDER BY id LIMIT 1;
  FOREACH first_cafe IN ARRAY ARRAY[meram,other_cafe] LOOP
    second_cafe := CASE WHEN first_cafe=meram THEN other_cafe ELSE meram END;
    purpose := CASE WHEN first_cafe=meram THEN 'customer_signup' ELSE 'customer_login' END;
    SELECT b.result INTO result FROM public.begin_customer_phone_otp_request(first_cafe,phone,purpose,instance) b;
    ASSERT result='created','First brand admitted';
    SELECT b.result INTO result FROM public.begin_customer_phone_otp_request(second_cafe,phone,'customer_login',instance) b;
    ASSERT result='cooldown','Competing admission is blocked in both orders';
    job := public.enqueue_customer_phone_otp_delivery(phone,instance,gen_random_uuid()::text,'encrypted-fixture');
    SELECT * INTO STRICT admitted FROM public.claim_customer_phone_otp_delivery_context(instance,job);
    ASSERT admitted.cafe_id IS NOT DISTINCT FROM first_cafe AND admitted.purpose IS NOT DISTINCT FROM purpose,
      'The worker receives the original authenticated brand and purpose';
    instance := 'isolated-' || gen_random_uuid()::text;
    phone := '9665' || lpad(floor(random()*100000000)::bigint::text,8,'0');
  END LOOP;
END $test$;
ROLLBACK;
