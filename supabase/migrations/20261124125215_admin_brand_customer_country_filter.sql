BEGIN;

-- Filter by the brand account country before summary and pagination
CREATE FUNCTION public.get_admin_brand_customers_by_country(
  p_search text DEFAULT '',p_brand_id uuid DEFAULT NULL,p_segment text DEFAULT 'all',
  p_sort text DEFAULT 'recent',p_page integer DEFAULT 1,p_page_size integer DEFAULT 25, p_country text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb; v_search text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active')
    THEN RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501'; END IF;
  IF p_search IS NULL OR length(p_search)>100 OR p_segment IS NULL OR p_segment NOT IN ('all','shared','frequent','rewarded','expired')
    OR p_sort IS NULL OR p_sort NOT IN ('recent','stamps','rewards') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid customer filters'; END IF;
  IF p_country IS NOT NULL AND p_country NOT IN ('SA','PS','AE','BH','KW','QA','OM','YE','JO','LB','SY','IQ','EG','SD','LY','TN','DZ','MA','MR','SO','DJ','KM') THEN RAISE EXCEPTION 'Invalid country filter'; END IF;
  v_search:=lower(btrim(p_search));
  WITH matching AS MATERIALIZED (
    SELECT r.* FROM loyalty_audit_private.brand_customer_rows r
    JOIN public.cafes c ON c.id=r.brand_id
    WHERE (p_country IS NULL OR c.phone_country=p_country) AND (v_search='' OR position(v_search IN search_text)>0)
      AND (p_segment='all' OR (p_segment='shared' AND brand_count>1) OR (p_segment='frequent' AND stamps>=10)
        OR (p_segment='rewarded' AND rewards_earned>0) OR (p_segment='expired' AND rewards_expired>0))
  ), filtered AS MATERIALIZED (
    SELECT * FROM matching WHERE p_brand_id IS NULL OR brand_id=p_brand_id
  ), ranked AS (
    SELECT *,row_number() OVER(ORDER BY CASE WHEN p_sort='stamps' THEN stamps WHEN p_sort='rewards' THEN rewards_redeemed ELSE 0 END DESC,
      last_activity_at DESC NULLS LAST,id) AS row_number FROM filtered
  ), brand_summary AS (
    SELECT brand_id,brand_name,brand_slug,count(*) AS customers,sum(stamps) AS stamps,sum(rewards_redeemed) AS redeemed
    FROM matching GROUP BY brand_id,brand_name,brand_slug
  ) SELECT jsonb_build_object(
    'customers',coalesce((SELECT jsonb_agg(row_data ORDER BY row_number) FROM ranked WHERE row_number>(p_page-1)*p_page_size AND row_number<=p_page*p_page_size),'[]'::jsonb),
    'brands',coalesce((SELECT jsonb_agg(jsonb_build_object('id',brand_id,'name',brand_name,'slug',brand_slug,'customers',customers,'stamps',stamps,'rewardsRedeemed',redeemed) ORDER BY customers DESC,brand_name,brand_id) FROM brand_summary),'[]'::jsonb),
    'summary',(SELECT jsonb_build_object('memberships',count(*),'uniqueCustomers',count(DISTINCT identity_key),
      'sharedCustomers',count(DISTINCT identity_key) FILTER(WHERE brand_count>1),'frequentCustomers',count(DISTINCT identity_key) FILTER(WHERE stamps>=10),
      'stamps',coalesce(sum(stamps),0),'scans',coalesce(sum(scans),0),'rewardsEarned',coalesce(sum(rewards_earned),0),
      'rewardsRedeemed',coalesce(sum(rewards_redeemed),0),'rewardsExpired',coalesce(sum(rewards_expired),0)) FROM filtered),
    'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',p_page_size,'frequentThreshold',10,
    'recordingStartedAt',(SELECT recording_started_at FROM loyalty_audit_private.settings),
    'walletRecordingStartedAt',(SELECT wallet_recording_started_at FROM loyalty_audit_private.settings)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_admin_brand_customers_by_country(text,uuid,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_brand_customers_by_country(text,uuid,text,text,integer,integer,text) TO authenticated;


-- The pager directory is service-only; retain the original validated per-brand path
CREATE FUNCTION public.pager_customer_directory_country(
  p_cafe uuid DEFAULT NULL,p_phone text DEFAULT NULL,p_query text DEFAULT '',p_page integer DEFAULT 0,
  p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,p_country text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; q text:=btrim(coalesce(p_query,''));
BEGIN
  IF p_page IS NULL OR p_page NOT BETWEEN 0 AND 100000 OR length(q)>120 OR (p_phone IS NOT NULL AND p_cafe IS NULL)
    OR (p_country IS NOT NULL AND p_country NOT IN ('SA','PS','AE','BH','KW','QA','OM','YE','JO','LB','SY','IQ','EG','SD','LY','TN','DZ','MA','MR','SO','DJ','KM'))
    THEN RAISE EXCEPTION 'Invalid directory filter'; END IF;
  IF (p_from IS NULL) <> (p_to IS NULL) OR (p_from IS NOT NULL AND
    (NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_from>=p_to OR p_to-p_from>interval '366 days'))
    THEN RAISE EXCEPTION 'Invalid directory period'; END IF;
  IF p_country IS NULL THEN
    RETURN public.pager_customer_directory_range(p_cafe,p_phone,q,p_page,p_from,p_to);
  END IF;
  IF p_cafe IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND phone_country=p_country) THEN
      RETURN jsonb_build_object('rows','[]'::jsonb,'total',0,'page',p_page,'pageSize',25);
    END IF;
    RETURN public.pager_customer_directory_range(p_cafe,p_phone,q,p_page,p_from,p_to);
  END IF;
  WITH matched AS MATERIALIZED (
    SELECT c.id,c.name,c.slug,count(DISTINCT o.phone)::integer customers,count(*)::integer registrations,max(o.created_at) last_seen
    FROM public.cafes c JOIN public.pager_orders o ON o.cafe_id=c.id
    WHERE c.phone_country=p_country AND (p_from IS NULL OR (o.created_at>=p_from AND o.created_at<p_to))
      AND (q='' OR strpos(lower(c.name),lower(q))>0)
    GROUP BY c.id
  ), page_rows AS(SELECT * FROM matched ORDER BY name,id LIMIT 25 OFFSET p_page*25)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name,r.id) FROM page_rows r),'[]'::jsonb),
    'total',(SELECT count(*) FROM matched),'page',p_page,'pageSize',25) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pager_customer_directory_country(uuid,text,text,integer,timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pager_customer_directory_country(uuid,text,text,integer,timestamptz,timestamptz,text) TO service_role;

COMMIT;
