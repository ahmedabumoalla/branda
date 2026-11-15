BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Reuse wallet delivery history, never treat an unissued customer profile as a downloaded card
-- Google save_link is the existing delivery event, not proof of device installation
CREATE FUNCTION brand_finance_private.loyalty_customer_downloaded(p_cafe uuid,p_customer uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.loyalty_cards c WHERE c.cafe_id=p_cafe AND c.customer_profile_id=p_customer AND (
  EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_customer_events e WHERE e.cafe_id=c.cafe_id AND e.card_id=c.id AND e.kind IN('download','save_link','installed'))
  OR EXISTS(SELECT 1 FROM public.wallet_apple_registrations r WHERE r.cafe_id=c.cafe_id AND r.card_id=c.id)))
$$;

CREATE FUNCTION public.finance_loyalty_customers_read(p_cafe uuid,p_page integer DEFAULT 0,p_query text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE total_rows bigint;actual_page integer;pattern text;items jsonb;
BEGIN
 IF brand_finance_private.role_for(p_cafe) IS DISTINCT FROM 'owner' OR NOT platform_access_private.service_enabled(p_cafe,'loyalty') THEN RAISE EXCEPTION 'LOYALTY_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_page IS NULL OR p_page<0 OR p_page>100000 OR p_query IS NULL OR length(p_query)>100 THEN RAISE EXCEPTION 'LOYALTY_INVALID_INPUT';END IF;
 pattern:='%'||replace(replace(replace(trim(p_query),'\','\\'),'%','\%'),'_','\_')||'%';
 SELECT count(*) INTO total_rows FROM public.customer_profiles p WHERE p.cafe_id=p_cafe AND p.full_name ILIKE pattern AND brand_finance_private.loyalty_customer_downloaded(p_cafe,p.id);
 actual_page:=least(p_page,greatest(0,ceil(total_rows/20.0)::integer-1));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',coalesce(nullif(r.full_name,''),'عميل بدون اسم'),'joinedAt',r.created_at) ORDER BY r.created_at DESC,r.id DESC),'[]') INTO items
 FROM(SELECT p.id,p.full_name,p.created_at FROM public.customer_profiles p WHERE p.cafe_id=p_cafe AND p.full_name ILIKE pattern AND brand_finance_private.loyalty_customer_downloaded(p_cafe,p.id) ORDER BY p.created_at DESC,p.id DESC LIMIT 20 OFFSET actual_page*20) r;
 RETURN jsonb_build_object('rows',items,'total',total_rows,'page',actual_page,'pageSize',20);
END $$;

CREATE FUNCTION public.finance_loyalty_customer_detail(p_cafe uuid,p_customer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF brand_finance_private.role_for(p_cafe) IS DISTINCT FROM 'owner' OR NOT platform_access_private.service_enabled(p_cafe,'loyalty') THEN RAISE EXCEPTION 'LOYALTY_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),'عميل بدون اسم'),'phone',p.phone) INTO result
 FROM public.customer_profiles p WHERE p.cafe_id=p_cafe AND p.id=p_customer AND brand_finance_private.loyalty_customer_downloaded(p_cafe,p.id);
 IF result IS NULL THEN RAISE EXCEPTION 'LOYALTY_CUSTOMER_UNAVAILABLE';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.loyalty_customer_downloaded(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_loyalty_customers_read(uuid,integer,text),public.finance_loyalty_customer_detail(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_loyalty_customers_read(uuid,integer,text),public.finance_loyalty_customer_detail(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
