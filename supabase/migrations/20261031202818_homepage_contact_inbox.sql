-- Extend the existing inbox without replacing historical email requests
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.platform_contact_requests
  ALTER COLUMN email DROP NOT NULL,
  ADD COLUMN phone text CHECK (phone IS NULL OR phone ~ '^9665[0-9]{8}$'),
  ADD COLUMN business_name text CHECK (business_name IS NULL OR char_length(business_name) BETWEEN 2 AND 150),
  ADD COLUMN business_type text CHECK (business_type IS NULL OR char_length(business_type) BETWEEN 2 AND 80),
  ADD COLUMN selected_plan text CHECK (selected_plan IS NULL OR char_length(selected_plan) <= 150);
CREATE INDEX platform_contact_requests_phone_created_idx ON public.platform_contact_requests(phone, created_at DESC) WHERE phone IS NOT NULL;
CREATE INDEX platform_contact_requests_created_idx ON public.platform_contact_requests(created_at DESC, id);
ALTER TABLE public.platform_contact_requests ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.submit_home_contact_request(p_id uuid, p_full_name text, p_phone text, p_business text, p_business_type text, p_selected_plan text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_id IS NULL OR p_full_name IS NULL OR char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 120
     OR p_phone IS NULL OR p_phone !~ '^9665[0-9]{8}$'
     OR p_business IS NULL OR char_length(btrim(p_business)) NOT BETWEEN 2 AND 150
     OR p_business_type IS NULL OR char_length(btrim(p_business_type)) NOT BETWEEN 2 AND 80
     OR char_length(coalesce(p_selected_plan,'')) > 150 THEN
    RAISE EXCEPTION 'Invalid contact request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_phone, 184));
  IF EXISTS (SELECT 1 FROM public.platform_contact_requests WHERE id=p_id AND phone=p_phone) THEN RETURN p_id; END IF;
  IF (SELECT count(*) FROM public.platform_contact_requests WHERE phone=p_phone AND created_at>now()-interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Contact rate limit';
  END IF;
  INSERT INTO public.platform_contact_requests(id,full_name,phone,business_name,business_type,selected_plan,message,status)
  VALUES(p_id,btrim(p_full_name),p_phone,btrim(p_business),btrim(p_business_type),nullif(btrim(p_selected_plan),''),
    concat_ws(E'\n',btrim(p_business),btrim(p_business_type),nullif(btrim(p_selected_plan),'')),'new');
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_home_contact_request(uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_home_contact_request(uuid,text,text,text,text,text) TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.platform_contact_requests TO service_role;
-- Keep the existing admin-only SELECT policy and legacy email RPC
UPDATE public.platform_contact_settings SET whatsapp='0508333556',updated_at=now() WHERE id='main';
NOTIFY pgrst, 'reload schema';
COMMIT;
-- Forward rollback: disable the new form action; keep inbox rows and additive columns
