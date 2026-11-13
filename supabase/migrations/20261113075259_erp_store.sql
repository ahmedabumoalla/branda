BEGIN;
CREATE TABLE public.erp_store_records (
  id uuid NOT NULL, cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  kind text NOT NULL CHECK(kind IN ('page','gallery','menu','settings')),
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
  key text NOT NULL CHECK(length(key) BETWEEN 1 AND 160 AND key !~ '[[:space:]/\\]'),
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=700000),
  revision integer NOT NULL CHECK(revision>0), updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(cafe_id,id), UNIQUE(cafe_id,kind,key)
);
CREATE UNIQUE INDEX erp_store_single_settings ON public.erp_store_records(cafe_id,kind) WHERE kind IN ('settings','menu');
CREATE TABLE public.erp_store_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  record_id uuid NOT NULL, action text NOT NULL, revision integer NOT NULL, before_data jsonb, after_data jsonb,
  actor uuid NOT NULL REFERENCES auth.users(id), at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX erp_store_events_cafe ON public.erp_store_events(cafe_id,record_id,at DESC);
CREATE TABLE public.erp_store_submissions (
  id uuid NOT NULL, cafe_id uuid NOT NULL REFERENCES public.cafes(id), page_id uuid NOT NULL, values jsonb NOT NULL CHECK(jsonb_typeof(values)='object' AND octet_length(values::text)<=20000),
  actor uuid NOT NULL REFERENCES auth.users(id), at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(cafe_id,id), FOREIGN KEY(cafe_id,page_id) REFERENCES public.erp_store_records(cafe_id,id)
);
ALTER TABLE public.erp_store_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_store_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_store_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_store_records,public.erp_store_events,public.erp_store_submissions FROM PUBLIC,anon,authenticated;
CREATE TRIGGER erp_store_events_immutable BEFORE UPDATE OR DELETE ON public.erp_store_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.validate_store_blocks(p_blocks jsonb,p_depth integer DEFAULT 0) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE b jsonb;
BEGIN
  IF p_depth>8 OR jsonb_typeof(p_blocks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_blocks)>100 THEN RAISE EXCEPTION 'Invalid store blocks' USING ERRCODE='22023'; END IF;
  FOR b IN SELECT value FROM jsonb_array_elements(p_blocks) LOOP
    IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR coalesce(b->>'type','') NOT IN ('column','columns2','columns3','columns37','text','link','image','video','map','linkBlock','quote','textSection','navbar','countdown','form','input','textarea','select','button','label','checkbox','radio')
      OR coalesce(b->>'id','') !~* '^[a-f0-9-]{36}$' OR length(coalesce(b->>'text',''))>10000 OR jsonb_typeof(b->'style') IS DISTINCT FROM 'object'
      OR coalesce(b->>'href','') !~* '^(https?://|mailto:|tel:|/([^/]|$)|#|$)' THEN RAISE EXCEPTION 'Invalid store block content' USING ERRCODE='22023';END IF;
    PERFORM brand_finance_private.validate_store_blocks(b->'children',p_depth+1);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.validate_store_blocks(jsonb,integer) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_store(p_cafe_id uuid,p_action text DEFAULT 'list',p_record jsonb DEFAULT NULL,p_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.erp_store_records%ROWTYPE; role_name text; record_id uuid; kind_name text; d jsonb; entry jsonb; seen uuid[]; parent_id uuid; a jsonb; form_definition jsonb; field_definition jsonb; field_name text; allowed_names text[]; submission public.erp_store_submissions%ROWTYPE;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_action='list' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'-'updated_by' ORDER BY x.updated_at DESC,x.id) FROM public.erp_store_records x WHERE x.cafe_id=p_cafe_id),'[]'::jsonb);END IF;
  IF role_name<>'owner' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF p_action IS NULL OR p_action NOT IN ('save','delete','submit','submissions') OR p_record IS NULL THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023';END IF;
  record_id:=(p_record->>'id')::uuid;
  IF record_id IS NULL THEN RAISE EXCEPTION 'Missing record' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,63130));
  SELECT * INTO r FROM public.erp_store_records WHERE cafe_id=p_cafe_id AND id=record_id FOR UPDATE;
  IF p_action IN ('submit','submissions') THEN
    IF r.id IS NULL OR r.kind<>'page' THEN RAISE EXCEPTION 'Page unavailable' USING ERRCODE='42501'; END IF;
    IF p_action='submit' THEN
      SELECT value INTO form_definition FROM jsonb_path_query(r.data,'$.blocks.** ? (@.type == "form")') AS q(value) WHERE value->>'id'=p_record->>'formId' LIMIT 1;
      IF form_definition IS NULL OR jsonb_typeof(p_record->'values') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Form unavailable' USING ERRCODE='22023';END IF;
      allowed_names:=ARRAY[]::text[];
      FOR field_definition IN SELECT value FROM jsonb_path_query(form_definition,'$.** ? (@.type == "input" || @.type == "textarea" || @.type == "select" || @.type == "checkbox" || @.type == "radio")') AS q(value) LOOP
        field_name:=coalesce(nullif(field_definition->>'name',''),field_definition->>'id');allowed_names:=array_append(allowed_names,field_name);
        IF (field_definition->>'required')::boolean AND length(btrim(coalesce(p_record->'values'->>field_name,'')))=0 THEN RAISE EXCEPTION 'أكمل حقول النموذج المطلوبة' USING ERRCODE='22023';END IF;
        IF field_definition->>'type'='select' AND p_record->'values'->>field_name IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(field_definition->'options') o WHERE o=p_record->'values'->>field_name) THEN RAISE EXCEPTION 'Invalid form selection' USING ERRCODE='22023';END IF;
      END LOOP;
      IF EXISTS(SELECT 1 FROM jsonb_each(p_record->'values') x WHERE NOT (x.key=ANY(allowed_names)) OR jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}')>2000) THEN RAISE EXCEPTION 'Invalid form values' USING ERRCODE='22023';END IF;
      SELECT * INTO submission FROM public.erp_store_submissions WHERE cafe_id=p_cafe_id AND id=(p_record->>'requestId')::uuid;
      IF submission.id IS NOT NULL AND (submission.page_id<>record_id OR submission.values IS DISTINCT FROM p_record->'values') THEN RAISE EXCEPTION 'Form request conflict' USING ERRCODE='22023';END IF;
      INSERT INTO public.erp_store_submissions(id,cafe_id,page_id,values,actor) VALUES((p_record->>'requestId')::uuid,p_cafe_id,record_id,p_record->'values',auth.uid()) ON CONFLICT(cafe_id,id) DO NOTHING;
      RETURN jsonb_build_object('saved',true);
    END IF;
    RETURN coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id'-'actor' ORDER BY s.at DESC) FROM (SELECT * FROM public.erp_store_submissions WHERE cafe_id=p_cafe_id AND page_id=record_id ORDER BY at DESC LIMIT 500) s),'[]'::jsonb);
  END IF;
  IF p_revision IS NULL OR p_revision<0 OR coalesce(r.revision,0)<>p_revision THEN RAISE EXCEPTION 'Store revision conflict' USING ERRCODE='40001';END IF;
  IF p_action='delete' THEN
    IF r.id IS NULL THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501';END IF;
    IF r.kind IN ('menu','settings') THEN RAISE EXCEPTION 'Cannot delete singleton' USING ERRCODE='22023';END IF;
    IF r.kind='page' AND EXISTS(SELECT 1 FROM public.erp_store_records m CROSS JOIN LATERAL jsonb_array_elements(m.data->'items') i WHERE m.cafe_id=p_cafe_id AND m.kind='menu' AND i->>'type'='content_page' AND i->>'target'=r.id::text) THEN RAISE EXCEPTION 'أزل الصفحة من عناصر القائمة قبل حذفها' USING ERRCODE='22023';END IF;
    IF r.kind='gallery' AND EXISTS(SELECT 1 FROM public.erp_store_records p CROSS JOIN LATERAL jsonb_path_query(p.data,'$.blocks.** ? (@.type == "image")') AS img(value) CROSS JOIN LATERAL jsonb_array_elements(r.data->'assets') AS asset_item(value) WHERE p.cafe_id=p_cafe_id AND p.kind='page' AND img.value->>'assetId'=asset_item.value->>'id') THEN RAISE EXCEPTION 'المعرض يحتوي صورًا مستخدمة في صفحات المتجر' USING ERRCODE='22023';END IF;
    INSERT INTO public.erp_store_events(cafe_id,record_id,action,revision,before_data,actor) VALUES(p_cafe_id,record_id,'delete',r.revision,to_jsonb(r),auth.uid());
    DELETE FROM public.erp_store_records WHERE cafe_id=p_cafe_id AND id=record_id;
    RETURN jsonb_build_object('id',record_id);
  END IF;
  kind_name:=p_record->>'kind';d:=p_record->'data';
  IF kind_name IS NULL OR kind_name NOT IN('page','gallery','menu','settings') OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>700000 OR (r.id IS NOT NULL AND r.kind<>kind_name) THEN RAISE EXCEPTION 'Invalid store record' USING ERRCODE='22023';END IF;
  IF kind_name='page' THEN
    IF coalesce(d->>'kind','') NOT IN('page','section') THEN RAISE EXCEPTION 'Invalid content kind' USING ERRCODE='22023';END IF;
    PERFORM brand_finance_private.validate_store_blocks(d->'blocks');
    IF EXISTS(SELECT 1 FROM jsonb_path_query(d,'$.blocks.** ? (@.type == "image")') AS img(value) WHERE coalesce(img.value->>'assetId','')<>'' AND NOT EXISTS(SELECT 1 FROM public.erp_store_records g CROSS JOIN LATERAL jsonb_array_elements(g.data->'assets') AS asset_item(value) WHERE g.cafe_id=p_cafe_id AND g.kind='gallery' AND asset_item.value->>'id'=img.value->>'assetId')) THEN RAISE EXCEPTION 'اختر صورة محفوظة في معرض هذه العلامة' USING ERRCODE='22023';END IF;
  ELSIF kind_name='gallery' THEN
    IF jsonb_typeof(d->'assets') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'assets')>100 THEN RAISE EXCEPTION 'Invalid gallery' USING ERRCODE='22023';END IF;
    FOR a IN SELECT value FROM jsonb_array_elements(d->'assets') LOOP
      IF coalesce(a->>'path','') !~ ('^'||p_cafe_id::text||'/[a-f0-9-]{36}\.webp$') OR length(coalesce(a->>'name','')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid gallery asset ownership' USING ERRCODE='22023';END IF;
    END LOOP;
    IF r.id IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.data->'assets') old_asset WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'assets') new_asset WHERE new_asset->>'id'=old_asset->>'id') AND EXISTS(SELECT 1 FROM public.erp_store_records p CROSS JOIN LATERAL jsonb_path_query(p.data,'$.blocks.** ? (@.type == "image")') AS img(value) WHERE p.cafe_id=p_cafe_id AND p.kind='page' AND img.value->>'assetId'=old_asset->>'id')) THEN RAISE EXCEPTION 'الصورة مستخدمة في صفحة متجر عدل الصفحة أولًا' USING ERRCODE='22023';END IF;
  ELSIF kind_name='menu' THEN
    IF jsonb_typeof(d->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'items')>100 THEN RAISE EXCEPTION 'Invalid menu' USING ERRCODE='22023';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'items') x GROUP BY x->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate menu IDs' USING ERRCODE='22023';END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(d->'items') LOOP
      IF coalesce(entry->>'type','') NOT IN('link','category','product','content_page','home','contact_us','rental') OR length(btrim(coalesce(entry->>'title',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid menu item' USING ERRCODE='22023';END IF;
      IF entry->>'type'='link' AND coalesce(entry->>'target','') !~* '^(https?://|mailto:|tel:|/([^/]|$)|#)' THEN RAISE EXCEPTION 'Invalid menu link' USING ERRCODE='22023';END IF;
      IF entry->>'type'='content_page' AND NOT EXISTS(SELECT 1 FROM public.erp_store_records WHERE cafe_id=p_cafe_id AND kind='page' AND id::text=entry->>'target') THEN RAISE EXCEPTION 'Content page unavailable' USING ERRCODE='22023';END IF;
      IF entry->>'type'='product' AND NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=p_cafe_id AND id::text=entry->>'target' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='22023';END IF;
      IF entry->>'type'='category' AND NOT EXISTS(SELECT 1 FROM public.menu_categories WHERE cafe_id=p_cafe_id AND name=entry->>'target') THEN RAISE EXCEPTION 'Category unavailable' USING ERRCODE='22023';END IF;
      seen:=ARRAY[(entry->>'id')::uuid];parent_id:=(entry->>'parentId')::uuid;
      WHILE parent_id IS NOT NULL LOOP
        IF parent_id=ANY(seen) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'items') x WHERE x->>'id'=parent_id::text) THEN RAISE EXCEPTION 'Invalid menu hierarchy' USING ERRCODE='22023';END IF;
        seen:=array_append(seen,parent_id);SELECT (x->>'parentId')::uuid INTO parent_id FROM jsonb_array_elements(d->'items') x WHERE x->>'id'=parent_id::text;
      END LOOP;
    END LOOP;
  ELSE
    IF coalesce(d->>'template','') NOT IN('arabic','english') OR jsonb_typeof(d->'showOutOfStock') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'lowStockThreshold') IS DISTINCT FROM 'number' OR (d->>'lowStockThreshold')::numeric NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'Invalid store settings' USING ERRCODE='22023';END IF;
    IF d->>'warehouseId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=(d->>'warehouseId')::uuid AND active) THEN RAISE EXCEPTION 'Warehouse unavailable' USING ERRCODE='22023';END IF;
  END IF;
  INSERT INTO public.erp_store_records(id,cafe_id,kind,title,key,data,revision,updated_by) VALUES(record_id,p_cafe_id,kind_name,p_record->>'title',p_record->>'key',d,p_revision+1,auth.uid())
    ON CONFLICT(cafe_id,id) DO UPDATE SET title=excluded.title,key=excluded.key,data=excluded.data,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  INSERT INTO public.erp_store_events(cafe_id,record_id,action,revision,before_data,after_data,actor) VALUES(p_cafe_id,record_id,'save',p_revision+1,CASE WHEN r.id IS NULL THEN NULL ELSE to_jsonb(r) END,p_record,auth.uid());
  RETURN (SELECT to_jsonb(x)-'cafe_id'-'updated_by' FROM public.erp_store_records x WHERE x.cafe_id=p_cafe_id AND x.id=record_id);
END $$;
REVOKE ALL ON FUNCTION public.erp_store(uuid,text,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_store(uuid,text,jsonb,integer) TO authenticated;

-- Storage is independently authorized and private; previews receive expiring URLs.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('erp-store-media','erp-store-media',false,26214400,ARRAY['image/webp']) ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION public.erp_store_media_access(p_name text,p_write boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant_id uuid; role_name text;
BEGIN
  IF auth.uid() IS NULL OR p_name !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' THEN RETURN false;END IF;
  tenant_id:=split_part(p_name,'/',1)::uuid;role_name:=brand_finance_private.role_for(tenant_id);
  RETURN coalesce(CASE WHEN p_write THEN role_name='owner' ELSE role_name IN('owner','manager','accountant','auditor') END,false);
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.erp_store_media_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_store_media_access(text,boolean) TO authenticated;
CREATE POLICY erp_store_media_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='erp-store-media' AND public.erp_store_media_access(name,false));
CREATE POLICY erp_store_media_add ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='erp-store-media' AND public.erp_store_media_access(name,true));
CREATE POLICY erp_store_media_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='erp-store-media' AND public.erp_store_media_access(name,true));
COMMIT;
