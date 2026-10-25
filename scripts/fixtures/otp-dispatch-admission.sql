-- Exact admission consumer from already-applied migration20261024083527, for isolated queue regression tests only
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
