-- Explicit owner publication. Draft edits never become publicly readable implicitly.
CREATE SCHEMA erp_store_public_private;
REVOKE ALL ON SCHEMA erp_store_public_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_store_public_versions(
 cafe_id uuid NOT NULL REFERENCES public.cafes(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 data jsonb NOT NULL CHECK(octet_length(data::text)<=4000000), created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(cafe_id,id));
CREATE TABLE public.erp_store_publications(
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id), version_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(cafe_id,version_id) REFERENCES public.erp_store_public_versions(cafe_id,id));
CREATE TABLE public.erp_store_public_submissions(
 cafe_id uuid NOT NULL, id uuid NOT NULL, version_id uuid NOT NULL, page_id uuid NOT NULL, form_id uuid NOT NULL,
 values jsonb NOT NULL CHECK(octet_length(values::text)<=20000), fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(cafe_id,id),
 FOREIGN KEY(cafe_id,version_id) REFERENCES public.erp_store_public_versions(cafe_id,id));
CREATE INDEX erp_store_public_replies ON public.erp_store_public_submissions(cafe_id,page_id,created_at DESC);
CREATE TABLE erp_store_public_private.rates(cafe_id uuid NOT NULL,fingerprint text NOT NULL,hour timestamptz NOT NULL,used integer NOT NULL,PRIMARY KEY(cafe_id,fingerprint,hour));
CREATE FUNCTION erp_store_public_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'Published evidence is immutable' USING ERRCODE='42501'; END$$;
CREATE TRIGGER store_version_immutable BEFORE UPDATE OR DELETE ON public.erp_store_public_versions FOR EACH ROW EXECUTE FUNCTION erp_store_public_private.immutable();
CREATE TRIGGER store_submission_immutable BEFORE UPDATE OR DELETE ON public.erp_store_public_submissions FOR EACH ROW EXECUTE FUNCTION erp_store_public_private.immutable();
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_store_public_versions','erp_store_publications','erp_store_public_submissions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER cancellation_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive()',t);
 EXECUTE format('CREATE POLICY cancellation_archive_scope ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(public.brand_account_not_cancelled(cafe_id)) WITH CHECK(public.brand_account_not_cancelled(cafe_id))',t);
END LOOP;END$$;
CREATE FUNCTION erp_store_public_private.enabled(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND deleted_at IS NULL AND status IN('active','published'))
 AND platform_access_private.service_enabled(c,'finance')
 AND public.brand_account_not_cancelled(c)
 AND NOT EXISTS(SELECT 1 FROM public.erp_system_settings WHERE cafe_id=c AND kind='apps' AND payload->'store'='false'::jsonb)
$$;
CREATE FUNCTION public.erp_store_publish(p_cafe uuid,p_action text DEFAULT 'read',p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pub public.erp_store_publications%ROWTYPE; pages jsonb; menus jsonb; assets jsonb; settings jsonb; snapshot jsonb; vid uuid; row record; b jsonb; f jsonb; names text[]; home uuid; contact uuid; footer uuid;
BEGIN
 IF brand_finance_private.role_for(p_cafe) IS DISTINCT FROM 'owner' OR erp_store_public_private.enabled(p_cafe) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Store publication denied' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN('read','submissions','publish','unpublish') THEN RAISE EXCEPTION 'Invalid publication action' USING ERRCODE='22023'; END IF;
 PERFORM erp_access_private.assert_allowed(p_cafe,'store',CASE WHEN p_action='read' OR p_action='submissions' THEN 'read' ELSE 'update' END);
 PERFORM pg_advisory_xact_lock(63130,hashtext(p_cafe::text));
 SELECT * INTO pub FROM public.erp_store_publications WHERE cafe_id=p_cafe FOR UPDATE;
 IF p_action='submissions' THEN RETURN coalesce((SELECT jsonb_agg(x) FROM (SELECT id,page_id,form_id,values,created_at AS at FROM public.erp_store_public_submissions WHERE cafe_id=p_cafe AND page_id=(p_input->>'pageId')::uuid ORDER BY created_at DESC LIMIT 500)x),'[]'); END IF;
 IF p_action='read' THEN RETURN coalesce(to_jsonb(pub)-'cafe_id','{"enabled":false,"revision":0}'::jsonb)||jsonb_build_object('selection',(SELECT data->'selection' FROM public.erp_store_public_versions WHERE cafe_id=p_cafe AND id=pub.version_id)); END IF;
 IF coalesce(pub.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'Publication changed' USING ERRCODE='40001'; END IF;
 IF p_action='unpublish' THEN IF pub.version_id IS NOT NULL THEN INSERT INTO public.erp_store_events(cafe_id,record_id,action,revision,before_data,after_data,actor) VALUES(p_cafe,pub.version_id,'unpublish',pub.revision+1,to_jsonb(pub),jsonb_build_object('enabled',false),auth.uid());END IF;UPDATE public.erp_store_publications SET enabled=false,revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe; RETURN public.erp_store_publish(p_cafe,'read'); END IF;
 IF p_action<>'publish' OR jsonb_typeof(p_input->'pageIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'pageIds')>100 THEN RAISE EXCEPTION 'Invalid publication' USING ERRCODE='22023'; END IF;
 home:=(p_input->>'homePageId')::uuid;contact:=(p_input->>'contactPageId')::uuid;footer:=(p_input->>'footerSectionId')::uuid;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_input->'pageIds') a WHERE NOT EXISTS(SELECT 1 FROM public.erp_store_records r WHERE r.cafe_id=p_cafe AND r.kind='page' AND r.id=a::uuid)) THEN RAISE EXCEPTION 'Unknown page' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'key',key,'data',data) ORDER BY title,id),'[]') INTO pages FROM public.erp_store_records WHERE cafe_id=p_cafe AND kind='page' AND p_input->'pageIds' ? id::text;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY[home,contact,footer]) v WHERE v IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pages) a WHERE a->>'id'=v::text)) THEN RAISE EXCEPTION 'Select the referenced pages' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(pages) a WHERE (a->>'id'=footer::text AND a#>>'{data,kind}'<>'section') OR (a->>'id'=ANY(ARRAY[home::text,contact::text]) AND a#>>'{data,kind}'<>'page')) THEN RAISE EXCEPTION 'Invalid page placement' USING ERRCODE='22023'; END IF;
 SELECT data INTO menus FROM public.erp_store_records WHERE cafe_id=p_cafe AND kind='menu';
 menus:=coalesce(menus,'{"items":[]}'::jsonb);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(menus->'items') m WHERE m->>'type'='content_page' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pages) a WHERE a->>'id'=m->>'target' AND a#>>'{data,kind}'='page')) THEN RAISE EXCEPTION 'A menu page is not selected for publication' USING ERRCODE='22023'; END IF;
 SELECT data INTO settings FROM public.erp_store_records WHERE cafe_id=p_cafe AND kind='settings';
 IF contact IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(menus->'items') m WHERE m->>'type'='contact_us') THEN RAISE EXCEPTION 'Choose a contact page' USING ERRCODE='22023'; END IF;
 settings:=coalesce(settings,'{"template":"arabic","lowStockThreshold":10,"showOutOfStock":false,"warehouseId":null}'::jsonb);
 -- Published forms must have unique names and cannot contain nested forms.
 FOR row IN SELECT value AS page FROM jsonb_array_elements(pages) LOOP
  PERFORM brand_finance_private.validate_store_blocks(row.page#>'{data,blocks}',0);
  FOR b IN SELECT value FROM jsonb_path_query(row.page,'$.data.blocks.** ? (@.type == "form")') AS q(value) LOOP
   names:=ARRAY[]::text[];
   FOR f IN SELECT DISTINCT value FROM jsonb_path_query(b,'$.children.** ? (@.type == "input" || @.type == "textarea" || @.type == "select" || @.type == "checkbox" || @.type == "radio" || @.type == "form")') AS q(value) LOOP
    IF f->>'type'='form' OR coalesce(nullif(f->>'name',''),f->>'id')='__branda_store_guard' OR coalesce(nullif(f->>'name',''),f->>'id')=ANY(names) THEN RAISE EXCEPTION 'Duplicate or nested form fields' USING ERRCODE='22023'; END IF;
    names:=array_append(names,coalesce(nullif(f->>'name',''),f->>'id'));
   END LOOP;
  END LOOP;
 END LOOP;
 SELECT coalesce(jsonb_agg(a-'url'),'[]') INTO assets FROM public.erp_store_records r CROSS JOIN LATERAL jsonb_array_elements(r.data->'assets') a WHERE r.cafe_id=p_cafe AND r.kind='gallery' AND EXISTS(SELECT 1 FROM jsonb_path_query(pages,'$.**.assetId') v WHERE v#>>'{}'=a->>'id');
 snapshot:=jsonb_build_object('pages',pages,'menu',menus,'settings',settings,'assets',assets,'selection',jsonb_build_object('pageIds',p_input->'pageIds','homePageId',home,'contactPageId',contact,'footerSectionId',footer));
 INSERT INTO public.erp_store_public_versions(cafe_id,data,created_by) VALUES(p_cafe,snapshot,auth.uid()) RETURNING id INTO vid;
 INSERT INTO public.erp_store_publications(cafe_id,version_id,enabled) VALUES(p_cafe,vid,true) ON CONFLICT(cafe_id) DO UPDATE SET version_id=excluded.version_id,enabled=true,revision=erp_store_publications.revision+1,updated_at=now();
 INSERT INTO public.erp_store_events(cafe_id,record_id,action,revision,before_data,after_data,actor) VALUES(p_cafe,vid,'publish',coalesce(pub.revision,0)+1,to_jsonb(pub),jsonb_build_object('versionId',vid,'selection',snapshot->'selection'),auth.uid());
 RETURN public.erp_store_publish(p_cafe,'read');
END$$;
CREATE FUNCTION erp_store_public_private.publication(p_slug text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT v.data||jsonb_build_object('versionId',v.id,'cafe',jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug)) FROM public.cafes c JOIN public.erp_store_publications p ON p.cafe_id=c.id AND p.enabled JOIN public.erp_store_public_versions v ON v.cafe_id=c.id AND v.id=p.version_id WHERE c.slug=p_slug AND erp_store_public_private.enabled(c.id)
$$;
CREATE FUNCTION public.erp_store_public_read(p_slug text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; c uuid; w uuid; products jsonb; low numeric;
BEGIN
 v:=erp_store_public_private.publication(p_slug);IF v IS NULL THEN RETURN NULL;END IF;c:=(v#>>'{cafe,id}')::uuid;w:=(v#>>'{settings,warehouseId}')::uuid;low:=(v#>>'{settings,lowStockThreshold}')::numeric;
 IF w IS NULL THEN SELECT id INTO w FROM public.bf_warehouses WHERE cafe_id=c AND active ORDER BY is_default DESC,name,id LIMIT 1;END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'category',x->>'name',x->>'id'),'[]') INTO products FROM (
 SELECT jsonb_build_object('id',p.id,'name',p.name,'description',coalesce(p.description,''),'price',p.price,'imageUrl',p.image_url,'category',coalesce(cat.name,p.legacy_category,''),'available',p.available AND (s.parts=0 OR coalesce(s.qty,0)>0),'lowStock',s.parts>0 AND coalesce(s.qty,0)>0 AND s.qty<=low) x
 FROM public.menu_products p LEFT JOIN public.menu_categories cat ON cat.id=p.category_id AND cat.cafe_id=p.cafe_id
 CROSS JOIN LATERAL(SELECT count(*) parts,min(CASE WHEN i.active THEN (coalesce((SELECT sum(st.quantity) FROM public.bf_stock st JOIN public.bf_warehouses wh ON wh.cafe_id=st.cafe_id AND wh.id=st.warehouse_id AND wh.active WHERE st.cafe_id=c AND st.warehouse_id=w AND st.item_id=l.item_id),0)-erp_inventory_private.reserved(c,l.item_id,w))/l.quantity ELSE 0 END) qty FROM public.bf_item_product_links l JOIN public.bf_items i ON i.cafe_id=l.cafe_id AND i.id=l.item_id WHERE l.cafe_id=c AND l.product_id=p.id)s
 WHERE p.cafe_id=c AND p.deleted_at IS NULL AND p.branch_id IS NULL AND (coalesce((v#>>'{settings,showOutOfStock}')::boolean,false) OR (p.available AND (s.parts=0 OR coalesce(s.qty,0)>0)))
 ) q;
 RETURN (v-'assets')||jsonb_build_object('assets',coalesce((SELECT jsonb_agg(a-'path') FROM jsonb_array_elements(v->'assets') a),'[]'),'products',products);
END$$;
CREATE FUNCTION public.erp_store_public_media(p_slug text,p_asset uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT a FROM jsonb_array_elements(erp_store_public_private.publication(p_slug)->'assets') a WHERE a->>'id'=p_asset::text$$;
CREATE FUNCTION public.erp_store_public_submit(p_slug text,p_version uuid,p_page uuid,p_form uuid,p_request uuid,p_values jsonb,p_fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb;c uuid;b jsonb;f jsonb;n text;names text[]:=ARRAY[]::text[];old public.erp_store_public_submissions%ROWTYPE;used integer;
BEGIN
 v:=erp_store_public_private.publication(p_slug);IF v IS NULL OR v->>'versionId' IS DISTINCT FROM p_version::text THEN RAISE EXCEPTION 'Store publication unavailable' USING ERRCODE='42501';END IF;c:=(v#>>'{cafe,id}')::uuid;
 IF p_request IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR octet_length(p_values::text)>20000 THEN RAISE EXCEPTION 'Invalid submission' USING ERRCODE='22023';END IF;
 SELECT form INTO b FROM jsonb_array_elements(v->'pages') page CROSS JOIN LATERAL jsonb_path_query(page,'$.data.blocks.** ? (@.type == "form")') form WHERE page->>'id'=p_page::text AND form->>'id'=p_form::text LIMIT 1;
 IF b IS NULL THEN RAISE EXCEPTION 'Unknown public form' USING ERRCODE='22023';END IF;
 FOR f IN SELECT DISTINCT value FROM jsonb_path_query(b,'$.children.** ? (@.type == "input" || @.type == "textarea" || @.type == "select" || @.type == "checkbox" || @.type == "radio")') AS q(value) LOOP
  n:=coalesce(nullif(f->>'name',''),f->>'id');names:=array_append(names,n);
  IF ((f->>'required')::boolean AND coalesce(btrim(p_values->>n),'')='') OR (p_values ? n AND (jsonb_typeof(p_values->n)<>'string' OR length(p_values->>n)>2000)) OR (f->>'type' IN('select','radio') AND coalesce(p_values->>n,'')<>'' AND NOT f->'options' ? (p_values->>n)) OR (f->>'type'='checkbox' AND coalesce(p_values->>n,'') NOT IN('','on')) THEN RAISE EXCEPTION 'Invalid form field' USING ERRCODE='22023';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) k WHERE NOT k=ANY(names)) THEN RAISE EXCEPTION 'Unknown form field' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(63131,hashtext(c::text||p_request::text));
 SELECT * INTO old FROM public.erp_store_public_submissions WHERE cafe_id=c AND id=p_request;
 IF FOUND THEN IF old.page_id<>p_page OR old.form_id<>p_form OR old.version_id<>p_version OR old.values<>p_values OR old.fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Request conflict' USING ERRCODE='23505';END IF;RETURN jsonb_build_object('id',old.id);END IF;
 INSERT INTO erp_store_public_private.rates(cafe_id,fingerprint,hour,used) VALUES(c,p_fingerprint,date_trunc('hour',now()),1) ON CONFLICT(cafe_id,fingerprint,hour) DO UPDATE SET used=rates.used+1 RETURNING rates.used INTO used;
 IF used>30 THEN RAISE EXCEPTION 'Submission rate exceeded' USING ERRCODE='54000';END IF;
 IF (SELECT count(*) FROM public.erp_store_public_submissions WHERE cafe_id=c AND fingerprint=p_fingerprint AND created_at>now()-interval '1 minute')>=5 THEN RAISE EXCEPTION 'Submission rate exceeded' USING ERRCODE='54000';END IF;
 INSERT INTO public.erp_store_public_submissions(cafe_id,id,version_id,page_id,form_id,values,fingerprint) VALUES(c,p_request,p_version,p_page,p_form,p_values,p_fingerprint);
 RETURN jsonb_build_object('id',p_request);
END$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_store_public_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_store_public_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_store_publish(uuid,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_store_publish(uuid,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_store_public_read(text),public.erp_store_public_media(text,uuid),public.erp_store_public_submit(text,uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_store_public_read(text),public.erp_store_public_media(text,uuid),public.erp_store_public_submit(text,uuid,uuid,uuid,uuid,jsonb,text) TO service_role;
CREATE FUNCTION public.erp_store_media_unpublished(p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT NOT EXISTS(SELECT 1 FROM public.erp_store_public_versions v CROSS JOIN LATERAL jsonb_array_elements(v.data->'assets') a WHERE a->>'path'=p_path)$$;
REVOKE ALL ON FUNCTION public.erp_store_media_unpublished(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_store_media_unpublished(text) TO authenticated;
CREATE POLICY erp_store_public_asset_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'erp-store-media' OR public.erp_store_media_unpublished(name));
CREATE POLICY erp_store_public_asset_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'erp-store-media' OR public.erp_store_media_unpublished(name)) WITH CHECK(bucket_id<>'erp-store-media' OR public.erp_store_media_unpublished(name));
