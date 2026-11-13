BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE INDEX pager_orders_directory_period ON public.pager_orders(created_at DESC,cafe_id,phone);

CREATE FUNCTION public.pager_customer_directory_range(p_cafe uuid DEFAULT NULL,p_phone text DEFAULT NULL,p_query text DEFAULT '',p_page int DEFAULT 0,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; q text:=btrim(coalesce(p_query,''));
BEGIN
 IF p_page IS NULL OR p_page<0 OR p_page>100000 OR length(q)>120 OR(p_phone IS NOT NULL AND(p_cafe IS NULL OR p_phone !~ '^9665[0-9]{8}$')) THEN RAISE EXCEPTION 'Invalid directory filter';END IF;
 IF p_from IS NULL AND p_to IS NULL THEN RETURN public.pager_customer_directory(p_cafe,p_phone,q,p_page);END IF;
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_from>=p_to OR p_to-p_from>interval '366 days' THEN RAISE EXCEPTION 'Invalid directory period';END IF;
 IF p_cafe IS NULL THEN
  WITH matched AS MATERIALIZED (
   SELECT c.id,c.name,c.slug,count(DISTINCT o.phone)::int customers,count(*)::int registrations,max(o.created_at) last_seen
   FROM public.cafes c JOIN public.pager_orders o ON o.cafe_id=c.id
   WHERE o.created_at>=p_from AND o.created_at<p_to AND(q='' OR strpos(lower(c.name),lower(q))>0)
   GROUP BY c.id
  ), page_rows AS(SELECT * FROM matched ORDER BY name,id LIMIT 25 OFFSET p_page*25)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name,r.id) FROM page_rows r),'[]'),'total',(SELECT count(*) FROM matched),'page',p_page,'pageSize',25) INTO result;
 ELSIF p_phone IS NULL THEN
  WITH visits AS (
   SELECT o.phone,count(*)::int registrations,min(o.created_at) first_seen,max(o.created_at) last_seen,count(*) FILTER(WHERE o.rating IS NOT NULL)::int reviews
   FROM public.pager_orders o WHERE o.cafe_id=p_cafe AND o.created_at>=p_from AND o.created_at<p_to GROUP BY o.phone
  ), named AS (
   SELECT v.*,coalesce(nullif(pc.full_name,''),profile.full_name,'') full_name FROM visits v
   LEFT JOIN public.pager_customers pc ON pc.cafe_id=p_cafe AND pc.phone=v.phone
   LEFT JOIN LATERAL(SELECT nullif(btrim(cp.full_name),'') full_name FROM public.customer_profiles cp WHERE cp.cafe_id=p_cafe
    AND(cp.phone_normalized IN(v.phone,'+'||v.phone) OR cp.phone IN(v.phone,'+'||v.phone,'0'||substr(v.phone,4))) ORDER BY cp.updated_at DESC,cp.id LIMIT 1) profile ON true
  ), matched AS MATERIALIZED(SELECT * FROM named WHERE q='' OR strpos(phone,q)>0 OR strpos(lower(full_name),lower(q))>0),
  page_rows AS(SELECT * FROM matched ORDER BY last_seen DESC,phone LIMIT 25 OFFSET p_page*25)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.last_seen DESC,r.phone) FROM page_rows r),'[]'),'total',(SELECT count(*) FROM matched),'page',p_page,'pageSize',25) INTO result;
 ELSE
  WITH matched AS MATERIALIZED (
   SELECT id,invoice_number,status,created_at,created_by,created_station,ready_at,received_at,called_by,rating,notes,rated_at
   FROM public.pager_orders WHERE cafe_id=p_cafe AND phone=p_phone AND created_at>=p_from AND created_at<p_to
  ), page_rows AS(SELECT * FROM matched ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET p_page*25)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC) FROM page_rows r),'[]'),'total',(SELECT count(*) FROM matched),'page',p_page,'pageSize',25) INTO result;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pager_customer_directory_range(uuid,text,text,int,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_customer_directory_range(uuid,text,text,int,timestamptz,timestamptz) TO service_role;
COMMIT;
