-- BARNDAKSA_CONTACT_FORM_FINAL_DB_FIX
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor إذا لم تكن تستخدم supabase db push.
-- الهدف: إرجاع نموذج تواصل معنا للعمل عبر RPC آمنة بدون خطأ citext وبدون permission denied.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.platform_contact_requests TO service_role;
GRANT SELECT ON TABLE public.platform_contact_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_platform_contact_request(
  p_full_name text,
  p_email text,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_full_name text;
  v_email text;
  v_message text;
BEGIN
  v_full_name := btrim(coalesce(p_full_name, ''));
  v_email := lower(btrim(coalesce(p_email, '')));
  v_message := btrim(coalesce(p_message, ''));

  IF char_length(v_full_name) < 2 OR char_length(v_full_name) > 120 THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;

  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  IF char_length(v_message) < 5 OR char_length(v_message) > 2000 THEN
    RAISE EXCEPTION 'Invalid message';
  END IF;

  INSERT INTO public.platform_contact_requests(full_name, email, message, status)
  VALUES (v_full_name, v_email, v_message, 'new')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_platform_contact_request(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_platform_contact_request(text, text, text) TO anon, authenticated, service_role;

COMMIT;
