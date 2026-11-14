BEGIN;
-- Elevate only the active audited maintenance session; keep the real actor for audit trails.
CREATE OR REPLACE FUNCTION brand_finance_private.role_for(p_cafe uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r text;
BEGIN
 IF auth.uid() IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
   OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status IN('active','published'))
   OR NOT platform_access_private.service_enabled(p_cafe,'finance')
 THEN RAISE EXCEPTION 'Finance access denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) THEN RETURN 'owner'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active') THEN
  IF brand_finance_private.invoice_settings_maintenance(p_cafe) THEN RETURN 'owner'; END IF;
  RETURN 'manager';
 END IF;
 SELECT role INTO r FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=auth.uid() AND active FOR SHARE;
 IF r IS NULL THEN RAISE EXCEPTION 'Finance staff access denied' USING ERRCODE='42501'; END IF;
 RETURN r;
END $function$
;
CREATE OR REPLACE FUNCTION public.brand_finance_context(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c public.cafes%ROWTYPE; r text;
BEGIN
 SELECT * INTO c FROM public.cafes WHERE slug=lower(btrim(p_slug)) AND deleted_at IS NULL;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Finance access denied' USING ERRCODE='42501'; END IF;
 r:=brand_finance_private.role_for(c.id);
 RETURN jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'role',r,'businessCategory',c.business_category,'maintenance',r='owner' AND c.owner_user_id IS DISTINCT FROM auth.uid() AND brand_finance_private.invoice_settings_maintenance(c.id));
END $function$
;
COMMIT;
