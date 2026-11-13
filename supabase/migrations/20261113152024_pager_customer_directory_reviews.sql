BEGIN;
CREATE TABLE public.pager_customers (
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
 full_name text NOT NULL DEFAULT '' CHECK(length(full_name)<=120),
 PRIMARY KEY(cafe_id,phone)
);
ALTER TABLE public.pager_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pager_customers FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pager_customers TO service_role;
INSERT INTO public.pager_customers(cafe_id,phone) SELECT DISTINCT cafe_id,phone FROM public.pager_orders;
CREATE FUNCTION pager_private.remember_customer() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO public.pager_customers(cafe_id,phone) VALUES(NEW.cafe_id,NEW.phone) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pager_private.remember_customer() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION pager_private.remember_customer() TO service_role;
CREATE TRIGGER pager_remember_customer AFTER INSERT ON public.pager_orders FOR EACH ROW EXECUTE FUNCTION pager_private.remember_customer();
CREATE INDEX pager_customer_history ON public.pager_orders(cafe_id,phone,created_at DESC,id DESC);
CREATE INDEX pager_review_history ON public.pager_orders(cafe_id,rated_at DESC,id DESC) WHERE rating IS NOT NULL;

CREATE TABLE public.pager_brand_settings (
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),
 google_review_url text NOT NULL DEFAULT '' CHECK(length(google_review_url)<=2048)
);
ALTER TABLE public.pager_brand_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pager_brand_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pager_brand_settings TO service_role;

CREATE FUNCTION public.pager_create_named_order(p_id uuid,p_cafe uuid,p_invoice text,p_phone text,p_actor text,p_station text,p_actor_id uuid,p_feedback_hash text,p_name text DEFAULT '')
RETURNS public.pager_orders LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.pager_orders;
BEGIN
 IF p_name IS NULL OR length(p_name)>120 THEN RAISE EXCEPTION 'Invalid name'; END IF;
 v:=public.pager_create_order(p_id,p_cafe,p_invoice,p_phone,p_actor,p_station,p_actor_id,p_feedback_hash);
 IF btrim(p_name)<>'' THEN UPDATE public.pager_customers SET full_name=btrim(p_name) WHERE cafe_id=p_cafe AND phone=p_phone; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.pager_create_named_order(uuid,uuid,text,text,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_create_named_order(uuid,uuid,text,text,text,text,uuid,text,text) TO service_role;

CREATE VIEW pager_private.customer_directory WITH (security_invoker=true) AS
 SELECT pc.cafe_id,pc.phone,coalesce(nullif(pc.full_name,''),profile.full_name,'') full_name,
 count(o.id)::int registrations,min(o.created_at) first_seen,max(o.created_at) last_seen,
 count(o.id) FILTER(WHERE o.rating IS NOT NULL)::int reviews
 FROM public.pager_customers pc JOIN public.pager_orders o ON o.cafe_id=pc.cafe_id AND o.phone=pc.phone
 LEFT JOIN LATERAL (
  SELECT nullif(btrim(cp.full_name),'') full_name FROM public.customer_profiles cp
  WHERE cp.cafe_id=pc.cafe_id AND (cp.phone_normalized IN(pc.phone,'+'||pc.phone) OR cp.phone IN(pc.phone,'+'||pc.phone,'0'||substr(pc.phone,4)))
  ORDER BY cp.updated_at DESC,cp.id LIMIT 1
 ) profile ON true
 GROUP BY pc.cafe_id,pc.phone,pc.full_name,profile.full_name;
REVOKE ALL ON pager_private.customer_directory FROM PUBLIC,anon,authenticated;
GRANT SELECT ON pager_private.customer_directory TO service_role;

CREATE FUNCTION public.pager_customer_directory(p_cafe uuid DEFAULT NULL,p_phone text DEFAULT NULL,p_query text DEFAULT '',p_page int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; total bigint; q text:=btrim(coalesce(p_query,''));
BEGIN
 IF p_page<0 OR p_page>100000 OR length(q)>120 OR (p_phone IS NOT NULL AND (p_cafe IS NULL OR p_phone !~ '^9665[0-9]{8}$')) THEN RAISE EXCEPTION 'Invalid directory filter'; END IF;
 IF p_cafe IS NULL THEN
  SELECT count(*) INTO total FROM public.cafes c WHERE EXISTS(SELECT 1 FROM public.pager_customers pc WHERE pc.cafe_id=c.id) AND (q='' OR strpos(lower(c.name),lower(q))>0);
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.name,s.id),'[]') INTO result FROM (
   SELECT c.id,c.name,c.slug,count(DISTINCT o.phone)::int customers,count(*)::int registrations,max(o.created_at) last_seen
   FROM public.cafes c JOIN public.pager_orders o ON o.cafe_id=c.id
   WHERE q='' OR strpos(lower(c.name),lower(q))>0 GROUP BY c.id ORDER BY c.name,c.id LIMIT 25 OFFSET p_page*25
  ) s;
 ELSIF p_phone IS NULL THEN
  SELECT count(*) INTO total FROM pager_private.customer_directory d WHERE cafe_id=p_cafe AND (q='' OR strpos(phone,q)>0 OR strpos(lower(full_name),lower(q))>0);
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.last_seen DESC,s.phone),'[]') INTO result FROM (
   SELECT phone,full_name,registrations,first_seen,last_seen,reviews FROM pager_private.customer_directory
   WHERE cafe_id=p_cafe AND (q='' OR strpos(phone,q)>0 OR strpos(lower(full_name),lower(q))>0)
   ORDER BY last_seen DESC,phone LIMIT 25 OFFSET p_page*25
  ) s;
 ELSE
  SELECT count(*) INTO total FROM public.pager_orders WHERE cafe_id=p_cafe AND phone=p_phone;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC,s.id),'[]') INTO result FROM (
   SELECT id,invoice_number,status,created_at,created_by,created_station,ready_at,received_at,called_by,rating,notes,rated_at
   FROM public.pager_orders WHERE cafe_id=p_cafe AND phone=p_phone ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET p_page*25
  ) s;
 END IF;
 RETURN jsonb_build_object('rows',result,'total',total,'page',p_page,'pageSize',25);
END $$;
REVOKE ALL ON FUNCTION public.pager_customer_directory(uuid,text,text,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_customer_directory(uuid,text,text,int) TO service_role;

CREATE FUNCTION public.pager_reviews_page(p_cafe uuid,p_query text DEFAULT '',p_rating int DEFAULT NULL,p_page int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; total bigint; average numeric; q text:=btrim(coalesce(p_query,''));
BEGIN
 IF p_page<0 OR p_page>100000 OR length(q)>120 OR (p_rating IS NOT NULL AND p_rating NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'Invalid review filter'; END IF;
 IF NOT pager_private.enabled(p_cafe) THEN RAISE EXCEPTION 'Pager unavailable' USING ERRCODE='42501'; END IF;
 SELECT count(*),round(avg(rating),2) INTO total,average FROM public.pager_orders WHERE cafe_id=p_cafe AND rating IS NOT NULL
  AND (p_rating IS NULL OR rating=p_rating) AND(q='' OR strpos(phone,q)>0 OR strpos(lower(invoice_number),lower(q))>0 OR strpos(lower(notes),lower(q))>0);
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.rated_at DESC,s.id),'[]') INTO result FROM (
  SELECT o.id,o.phone,o.invoice_number,o.rating,o.notes,o.rated_at,o.received_at,pc.full_name
  FROM public.pager_orders o LEFT JOIN public.pager_customers pc ON pc.cafe_id=o.cafe_id AND pc.phone=o.phone
  WHERE o.cafe_id=p_cafe AND o.rating IS NOT NULL AND (p_rating IS NULL OR o.rating=p_rating)
   AND(q='' OR strpos(o.phone,q)>0 OR strpos(lower(o.invoice_number),lower(q))>0 OR strpos(lower(o.notes),lower(q))>0)
  ORDER BY o.rated_at DESC,o.id DESC LIMIT 25 OFFSET p_page*25
 ) s;
 RETURN jsonb_build_object('rows',result,'total',total,'average',average,'page',p_page,'pageSize',25);
END $$;
REVOKE ALL ON FUNCTION public.pager_reviews_page(uuid,text,int,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_reviews_page(uuid,text,int,int) TO service_role;
COMMIT;
