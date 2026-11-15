-- Local authentication/entitlement boundary. All finance posting functions stay original.
CREATE OR REPLACE FUNCTION platform_access_private.service_enabled(p_cafe uuid,p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_feature IN('finance','menu','settings') AND EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND status IN('active','published') AND deleted_at IS NULL)
$$;
CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.is_cafe_owner(p_cafe_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id WHERE c.id=p_cafe_id AND c.owner_user_id=auth.uid() AND p.status='active' AND c.deleted_at IS NULL) $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.role(),auth.jwt() TO authenticated;
REVOKE ALL ON auth.users FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION brand_cancellation_private.cancelled(p_cafe uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND (deleted_at IS NOT NULL OR status='archived')) $$;
CREATE OR REPLACE FUNCTION public.brand_account_not_cancelled(p_cafe uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT NOT brand_cancellation_private.cancelled(p_cafe) $$;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT ON storage.buckets TO authenticated;
INSERT INTO storage.buckets(id,name,public) SELECT value,value,false FROM unnest(ARRAY['bf-inventory-images','branda-finance-shift-files','branda-finance-treasury-files','menu-products','cafe-logos','bf-invoice-custom-fields']) value ON CONFLICT(id) DO NOTHING;

-- Direct catalog/settings reads still use the original finance role checks.
CREATE OR REPLACE FUNCTION public.local_finance_access(p_cafe uuid,p_manage boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe);
 RETURN NOT p_manage OR role_name IN('owner','manager');
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.local_finance_access(uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.local_finance_access(uuid,boolean) TO authenticated;
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['menu_products','menu_categories','cafe_settings','cafe_custom_identity','product_media','cafe_printer_settings','event_ticket_settings','branches'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY local_finance_read ON public.%I FOR SELECT TO authenticated USING(public.local_finance_access(cafe_id,false))',table_name);
  EXECUTE format('CREATE POLICY local_finance_manage ON public.%I FOR ALL TO authenticated USING(public.local_finance_access(cafe_id,true)) WITH CHECK(public.local_finance_access(cafe_id,true))',table_name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',table_name);
 END LOOP;
END $$;
ALTER TABLE public.cafes ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_finance_read ON public.cafes FOR SELECT TO authenticated USING(public.local_finance_access(id,false));
CREATE POLICY local_finance_manage ON public.cafes FOR UPDATE TO authenticated USING(public.is_cafe_owner(id)) WITH CHECK(public.is_cafe_owner(id));
GRANT SELECT ON public.cafes TO authenticated;
GRANT UPDATE(name,name_en,business_category) ON public.cafes TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_profile_read ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());
GRANT SELECT ON public.profiles TO authenticated;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_finance_files ON storage.objects FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.cafes c WHERE storage.objects.name LIKE c.id::text||'/%' AND public.local_finance_access(c.id,false)));
GRANT SELECT ON storage.objects TO authenticated;
