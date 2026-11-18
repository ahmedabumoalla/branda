BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.brand_management_accounts (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 120),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.brand_management_brands (
 user_id uuid NOT NULL REFERENCES public.brand_management_accounts(user_id) ON DELETE CASCADE,
 cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
 sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,cafe_id)
);
CREATE INDEX brand_management_brands_cafe ON public.brand_management_brands(cafe_id);
ALTER TABLE public.brand_management_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_management_brands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_management_accounts,public.brand_management_brands FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.brand_management_accounts,public.brand_management_brands TO authenticated;
GRANT ALL ON public.brand_management_accounts,public.brand_management_brands TO service_role;
CREATE POLICY management_account_read ON public.brand_management_accounts FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND (SELECT public.current_account_active()));
CREATE POLICY management_brand_read ON public.brand_management_brands FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND (SELECT public.current_account_active()) AND public.is_cafe_owner(cafe_id));

-- Membership in the management list never grants ownership by itself.
-- The existing cafe owner/RLS rules remain authoritative for every brand.
CREATE FUNCTION public.get_brand_management_dashboard() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE account public.brand_management_accounts;
BEGIN
 IF NOT coalesce(public.current_account_active(),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO account FROM public.brand_management_accounts WHERE user_id=auth.uid();
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('name',account.name,'brands',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',c.id,'slug',c.slug,'name',c.name,'businessCategory',c.business_category,'logoPath',s.logo_storage_path) ORDER BY b.sort_order,c.name,c.id)
   FROM public.brand_management_brands b JOIN public.cafes c ON c.id=b.cafe_id LEFT JOIN public.cafe_settings s ON s.cafe_id=c.id
   WHERE b.user_id=auth.uid() AND c.deleted_at IS NULL AND c.status IN('active','published') AND public.is_cafe_owner(c.id)),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_brand_management_dashboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_brand_management_dashboard() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
