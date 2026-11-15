BEGIN;

-- Manual invoice metadata only. Existing POS/recurring issuance is deliberately untouched.
CREATE TABLE public.bf_invoice_custom_field_settings (
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id), settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
 revision integer NOT NULL CHECK(revision>0), updated_by uuid NOT NULL REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.bf_invoice_custom_field_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),revision integer NOT NULL CHECK(revision>0),
 before_settings jsonb NOT NULL,after_settings jsonb NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(cafe_id,revision)
);
CREATE TABLE public.bf_invoice_custom_field_drafts (
 draft_id uuid PRIMARY KEY REFERENCES public.bf_invoice_drafts(id) ON DELETE CASCADE,cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 settings jsonb NOT NULL,settings_revision integer NOT NULL CHECK(settings_revision>=0),values jsonb NOT NULL CHECK(jsonb_typeof(values)='object'),
 revision integer NOT NULL CHECK(revision>0),draft_revision integer NOT NULL CHECK(draft_revision>0),updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bf_invoice_custom_field_drafts_cafe ON public.bf_invoice_custom_field_drafts(cafe_id,draft_id);
CREATE TABLE public.bf_invoice_custom_fields (
 document_id uuid PRIMARY KEY REFERENCES public.bf_documents(id),cafe_id uuid NOT NULL REFERENCES public.cafes(id),draft_id uuid NOT NULL REFERENCES public.bf_invoice_drafts(id),
 settings jsonb NOT NULL,settings_revision integer NOT NULL CHECK(settings_revision>=0),values jsonb NOT NULL CHECK(jsonb_typeof(values)='object'),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(cafe_id,draft_id)
);
CREATE TABLE public.bf_invoice_custom_field_values (
 document_id uuid NOT NULL REFERENCES public.bf_invoice_custom_fields(document_id),cafe_id uuid NOT NULL REFERENCES public.cafes(id),field_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 49),field jsonb NOT NULL,value jsonb NOT NULL,unique_key text,media jsonb,
 PRIMARY KEY(document_id,field_id)
);
CREATE INDEX bf_invoice_custom_field_values_lookup ON public.bf_invoice_custom_field_values(cafe_id,field_id,md5(unique_key)) WHERE unique_key IS NOT NULL;
CREATE TABLE public.bf_invoice_custom_field_media (
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),field_id uuid NOT NULL,settings_revision integer NOT NULL CHECK(settings_revision>0),
 file_id uuid NOT NULL REFERENCES public.bf_company_invoice_files(id),source_file_id uuid NOT NULL REFERENCES public.bf_company_invoice_files(id),thumbnail_file_id uuid REFERENCES public.bf_company_invoice_files(id),
 kind text NOT NULL CHECK(kind IN('file','image')),mime text NOT NULL CHECK(length(mime) BETWEEN 1 AND 127),sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
 categories text[] NOT NULL,verified_by uuid NOT NULL REFERENCES auth.users(id),verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(cafe_id,field_id,settings_revision,file_id)
);
ALTER TABLE public.bf_invoice_custom_field_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_custom_field_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_custom_field_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_custom_field_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_custom_field_settings,public.bf_invoice_custom_field_events,public.bf_invoice_custom_field_drafts,public.bf_invoice_custom_fields,public.bf_invoice_custom_field_values,public.bf_invoice_custom_field_media FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_invoice_custom_field_events_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_custom_field_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER bf_invoice_custom_fields_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_custom_fields FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER bf_invoice_custom_field_values_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_custom_field_values FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER bf_invoice_custom_field_media_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_custom_field_media FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.custom_field_role(p_cafe uuid,p_write boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r text;BEGIN
 r:=brand_finance_private.role_for(p_cafe);
 IF auth.uid() IS NULL OR coalesce(r,'')<>ALL(CASE WHEN p_write THEN ARRAY['owner','manager','accountant'] ELSE ARRAY['owner','manager','accountant','auditor'] END) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 RETURN r;
END $$;

CREATE FUNCTION brand_finance_private.custom_field_media_json(p_media public.bf_invoice_custom_field_media) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('fileId',p_media.file_id,'sourceFileId',p_media.source_file_id,'thumbnailFileId',p_media.thumbnail_file_id,'kind',p_media.kind,'mime',p_media.mime,'sha256',p_media.sha256,'size',p_media.size_bytes)
$$;

CREATE FUNCTION public.brand_finance_register_custom_field_media(p_cafe_id uuid,p_field_id uuid,p_settings_revision integer,p_actor_id uuid,p_file_id uuid,p_source_file_id uuid,p_thumbnail_file_id uuid,p_kind text,p_mime text,p_sha256 text,p_size bigint,p_categories text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE config jsonb;rev integer;f jsonb;existing public.bf_invoice_custom_field_media%ROWTYPE;file public.bf_company_invoice_files%ROWTYPE;
BEGIN
 IF p_actor_id IS NULL OR coalesce(brand_finance_private.invoice_actor_role(p_cafe_id,p_actor_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT settings,revision INTO config,rev FROM public.bf_invoice_custom_field_settings WHERE cafe_id=p_cafe_id;
 IF p_settings_revision IS DISTINCT FROM rev THEN RAISE EXCEPTION 'Custom field media settings conflict' USING ERRCODE='40001';END IF;
 SELECT x INTO f FROM jsonb_array_elements(config->'fields') x WHERE (x->>'id')::uuid=p_field_id;
 IF f IS NULL OR p_kind IS NULL OR p_kind NOT IN('file','image') OR f->>'type'<>CASE WHEN p_kind='image' THEN 'image_upload' ELSE 'file_upload' END THEN RAISE EXCEPTION 'نوع المستند لا يطابق الحقل' USING ERRCODE='22023';END IF;
 IF p_mime IS NULL OR length(p_mime) NOT BETWEEN 1 AND 127 OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 8388608 OR p_categories IS NULL OR cardinality(p_categories) NOT BETWEEN 1 AND 7 OR EXISTS(SELECT 1 FROM unnest(p_categories) c WHERE c IS NULL OR c NOT IN('document','pdf','spreadsheet','text','html','image','archive')) THEN RAISE EXCEPTION 'بيانات التحقق من المستند غير مكتملة' USING ERRCODE='22023';END IF;
 IF p_kind='image' AND (p_mime NOT IN('image/jpeg','image/png','image/webp','image/gif','image/tiff','image/avif') OR NOT 'image'=ANY(p_categories)) THEN RAISE EXCEPTION 'نوع الصورة غير مسموح' USING ERRCODE='22023';END IF;
 IF p_kind='file' AND jsonb_array_length(f->'fileTypes')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(f->'fileTypes') g WHERE g=ANY(p_categories)) THEN RAISE EXCEPTION 'نوع الملف غير مسموح لهذا الحقل' USING ERRCODE='22023';END IF;
 SELECT * INTO file FROM public.bf_company_invoice_files WHERE cafe_id=p_cafe_id AND id=p_file_id AND uploaded FOR SHARE;
 IF NOT FOUND OR file.size_bytes<>p_size OR NOT EXISTS(SELECT 1 FROM public.bf_company_invoice_files WHERE cafe_id=p_cafe_id AND id=p_source_file_id AND uploaded) OR (p_thumbnail_file_id IS NOT NULL AND (p_kind<>'image' OR NOT EXISTS(SELECT 1 FROM public.bf_company_invoice_files WHERE cafe_id=p_cafe_id AND id=p_thumbnail_file_id AND uploaded))) THEN RAISE EXCEPTION 'المستند غير متاح لهذه المنشأة' USING ERRCODE='42501';END IF;
 SELECT * INTO existing FROM public.bf_invoice_custom_field_media WHERE cafe_id=p_cafe_id AND field_id=p_field_id AND settings_revision=rev AND file_id=p_file_id;
 IF FOUND THEN
  IF existing.source_file_id IS DISTINCT FROM p_source_file_id OR existing.thumbnail_file_id IS DISTINCT FROM p_thumbnail_file_id OR existing.kind<>p_kind OR existing.mime<>p_mime OR existing.sha256<>p_sha256 OR existing.size_bytes<>p_size OR existing.categories<>p_categories THEN RAISE EXCEPTION 'Verified media conflict' USING ERRCODE='40001';END IF;
  RETURN brand_finance_private.custom_field_media_json(existing);
 END IF;
 INSERT INTO public.bf_invoice_custom_field_media(cafe_id,field_id,settings_revision,file_id,source_file_id,thumbnail_file_id,kind,mime,sha256,size_bytes,categories,verified_by) VALUES(p_cafe_id,p_field_id,rev,p_file_id,p_source_file_id,p_thumbnail_file_id,p_kind,p_mime,p_sha256,p_size,p_categories,p_actor_id) RETURNING * INTO existing;
 RETURN brand_finance_private.custom_field_media_json(existing);
END $$;

CREATE FUNCTION brand_finance_private.custom_field_unique_key(p_field jsonb,p_value jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_value IS NULL OR p_value IN('null'::jsonb,'""'::jsonb,'[]'::jsonb) THEN NULL WHEN p_field->>'type' IN('number','decimal','currency') THEN trim_scale((p_value#>>'{}')::numeric)::text ELSE p_value::text END
$$;

CREATE FUNCTION brand_finance_private.prepare_custom_field_values(p_cafe uuid,p_draft jsonb,p_settings jsonb,p_settings_revision integer,p_values jsonb,p_required boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;values_out jsonb:='{}';fields_out jsonb:='[]';k text;m public.bf_invoice_custom_field_media%ROWTYPE;media_value jsonb;key_value text;
BEGIN
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR octet_length(p_values::text)>600000 OR (SELECT count(*) FROM jsonb_object_keys(p_values))>50 THEN RAISE EXCEPTION 'راجع قيم حقول الفاتورة' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_values) k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'fields') f WHERE f->>'id'=k)) THEN RAISE EXCEPTION 'تغيرت تعريفات الحقول راجع القيم قبل الحفظ' USING ERRCODE='40001';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_settings->'fields') LOOP
  k:=f->>'id';v:=brand_finance_private.custom_field_value(f,p_values->k,p_required);media_value:=NULL;
  IF f->>'type' IN('file_upload','image_upload') AND v<>'null'::jsonb THEN
   SELECT * INTO m FROM public.bf_invoice_custom_field_media WHERE cafe_id=p_cafe AND field_id=k::uuid AND settings_revision=p_settings_revision AND file_id=(v#>>'{}')::uuid;
   IF NOT FOUND OR NOT coalesce(p_draft->'attachments','[]'::jsonb) @> jsonb_build_array(v) THEN RAISE EXCEPTION 'أعد التحقق من ملف الحقل وأرفقه بالمسودة' USING ERRCODE='22023';END IF;
   media_value:=brand_finance_private.custom_field_media_json(m);
  END IF;
  key_value:=brand_finance_private.custom_field_unique_key(f,v);
  IF p_required AND (f->>'unique')::boolean AND key_value IS NOT NULL AND EXISTS(SELECT 1 FROM public.bf_invoice_custom_field_values h WHERE h.cafe_id=p_cafe AND h.field_id=k::uuid AND md5(h.unique_key)=md5(key_value) AND h.unique_key=key_value) THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة في فاتورة أخرى: %',f->>'label' USING ERRCODE='22023';END IF;
  IF f->>'type' NOT IN('separator','free_static_content') THEN values_out:=values_out||jsonb_build_object(k,v);END IF;
  fields_out:=fields_out||jsonb_build_array(jsonb_build_object('field',f,'value',v,'media',media_value));
 END LOOP;
 RETURN jsonb_build_object('values',values_out,'fields',fields_out);
END $$;

CREATE FUNCTION public.brand_finance_invoice_custom_field_context(p_cafe_id uuid,p_draft_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb;chosen public.bf_invoice_custom_field_drafts%ROWTYPE;historic public.bf_invoice_custom_fields%ROWTYPE;v jsonb:='{}';f jsonb;
BEGIN
 PERFORM brand_finance_private.custom_field_role(p_cafe_id);
 state:=public.brand_finance_invoice_custom_fields(p_cafe_id);
 IF p_draft_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id) THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
  SELECT * INTO chosen FROM public.bf_invoice_custom_field_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  SELECT * INTO historic FROM public.bf_invoice_custom_fields WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
 END IF;
 IF chosen.draft_id IS NULL THEN
  FOR f IN SELECT value FROM jsonb_array_elements(state#>'{settings,fields}') LOOP IF f->>'type' NOT IN('separator','free_static_content') THEN v:=v||jsonb_build_object(f->>'id',f->'defaultValue');END IF;END LOOP;
 ELSE v:=chosen.values;END IF;
 RETURN jsonb_build_object('settings',state->'settings','settingsRevision',state->'revision','savedSettings',chosen.settings,'savedSettingsRevision',chosen.settings_revision,'values',coalesce(historic.values,v),'revision',coalesce(chosen.revision,0),'hasSelection',chosen.draft_id IS NOT NULL,'issued',EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id));
END $$;

CREATE FUNCTION public.brand_finance_set_invoice_custom_fields(p_cafe_id uuid,p_draft_id uuid,p_draft_revision integer,p_revision integer,p_settings_revision integer,p_values jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft public.bf_invoice_drafts%ROWTYPE;chosen public.bf_invoice_custom_field_drafts%ROWTYPE;state jsonb;prepared jsonb;current_revision integer;issued boolean;
BEGIN
 PERFORM brand_finance_private.custom_field_role(p_cafe_id,true);
 IF p_draft_revision IS NULL OR p_draft_revision<1 OR p_revision IS NULL OR p_revision<0 OR p_settings_revision IS NULL OR p_settings_revision<0 THEN RAISE EXCEPTION 'Invalid custom field revision' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO draft FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO chosen FROM public.bf_invoice_custom_field_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
 issued:=EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id);
 IF issued THEN
  IF chosen.draft_id IS NOT NULL AND chosen.values=p_values THEN RETURN jsonb_build_object('revision',chosen.revision,'values',chosen.values,'issued',true);END IF;
  RAISE EXCEPTION 'لا يمكن تعديل حقول فاتورة صادرة' USING ERRCODE='22023';
 END IF;
 IF draft.revision<>p_draft_revision THEN RAISE EXCEPTION 'Draft revision conflict' USING ERRCODE='40001';END IF;
 state:=public.brand_finance_invoice_custom_fields(p_cafe_id);
 IF (state->>'revision')::integer<>p_settings_revision THEN RAISE EXCEPTION 'Custom field settings conflict' USING ERRCODE='40001';END IF;
 prepared:=brand_finance_private.prepare_custom_field_values(p_cafe_id,draft.payload,state->'settings',p_settings_revision,p_values,false);
 current_revision:=coalesce(chosen.revision,0);
 IF chosen.draft_id IS NOT NULL AND chosen.values=prepared->'values' AND chosen.settings_revision=p_settings_revision THEN
  UPDATE public.bf_invoice_custom_field_drafts SET draft_revision=p_draft_revision,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE draft_id=p_draft_id;
  RETURN jsonb_build_object('revision',current_revision,'values',chosen.values,'issued',false);
 END IF;
 IF current_revision<>p_revision THEN RAISE EXCEPTION 'Custom field values conflict' USING ERRCODE='40001';END IF;
 INSERT INTO public.bf_invoice_custom_field_drafts(cafe_id,draft_id,settings,settings_revision,values,revision,draft_revision,updated_by) VALUES(p_cafe_id,p_draft_id,state->'settings',p_settings_revision,prepared->'values',current_revision+1,p_draft_revision,auth.uid())
 ON CONFLICT(draft_id) DO UPDATE SET settings=excluded.settings,settings_revision=excluded.settings_revision,values=excluded.values,revision=excluded.revision,draft_revision=excluded.draft_revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 RETURN jsonb_build_object('revision',current_revision+1,'values',prepared->'values','issued',false);
END $$;

CREATE FUNCTION public.brand_finance_issued_custom_fields(p_cafe_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE historic public.bf_invoice_custom_fields%ROWTYPE;fields jsonb;
BEGIN
 PERFORM brand_finance_private.custom_field_role(p_cafe_id);
 IF NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_document_id) THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO historic FROM public.bf_invoice_custom_fields WHERE cafe_id=p_cafe_id AND document_id=p_document_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('field',field,'value',value,'media',media) ORDER BY position),'[]') INTO fields FROM public.bf_invoice_custom_field_values WHERE cafe_id=p_cafe_id AND document_id=p_document_id;
 RETURN jsonb_build_object('recorded',historic.document_id IS NOT NULL,'title',coalesce(historic.settings->>'title',''),'settingsRevision',coalesce(historic.settings_revision,0),'fields',fields);
END $$;

CREATE FUNCTION public.brand_finance_copy_invoice_custom_fields(p_cafe_id uuid,p_source_document_id uuid,p_draft_id uuid,p_draft_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE historical public.bf_invoice_custom_fields%ROWTYPE;state jsonb;values_out jsonb:='{}';f jsonb;old jsonb;
BEGIN
 PERFORM brand_finance_private.custom_field_role(p_cafe_id,true);
 IF NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_source_document_id) THEN RAISE EXCEPTION 'Source invoice unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO historical FROM public.bf_invoice_custom_fields WHERE cafe_id=p_cafe_id AND document_id=p_source_document_id;
 state:=public.brand_finance_invoice_custom_fields(p_cafe_id);
 FOR f IN SELECT value FROM jsonb_array_elements(state#>'{settings,fields}') LOOP
  SELECT x INTO old FROM jsonb_array_elements(coalesce(historical.settings->'fields','[]')) x WHERE x->>'id'=f->>'id';
  IF old IS NOT NULL AND old->>'type'=f->>'type' AND f->>'type' NOT IN('separator','free_static_content') THEN values_out:=values_out||jsonb_build_object(f->>'id',historical.values->(f->>'id'));END IF;
 END LOOP;
 RETURN public.brand_finance_set_invoice_custom_fields(p_cafe_id,p_draft_id,p_draft_revision,0,(state->>'revision')::integer,values_out);
END $$;

CREATE FUNCTION brand_finance_private.custom_fields_for_issue(p_cafe uuid,p_draft uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE state jsonb;chosen public.bf_invoice_custom_field_drafts%ROWTYPE;payload jsonb;prepared jsonb;
BEGIN
 state:=public.brand_finance_invoice_custom_fields(p_cafe);
 SELECT payload INTO payload FROM public.bf_invoice_drafts d WHERE d.cafe_id=p_cafe AND d.id=p_draft;
 SELECT * INTO chosen FROM public.bf_invoice_custom_field_drafts WHERE cafe_id=p_cafe AND draft_id=p_draft;
 IF chosen.draft_id IS NOT NULL AND (chosen.draft_revision<>p_revision OR chosen.settings_revision<>(state->>'revision')::integer) THEN RAISE EXCEPTION 'أعد مراجعة وحفظ الحقول بعد تحديث المسودة أو إعداداتها' USING ERRCODE='40001';END IF;
 prepared:=brand_finance_private.prepare_custom_field_values(p_cafe,payload,state->'settings',(state->>'revision')::integer,coalesce(chosen.values,'{}'),true);
 RETURN prepared||jsonb_build_object('settings',state->'settings','settingsRevision',state->'revision');
END $$;

CREATE FUNCTION brand_finance_private.capture_invoice_custom_fields(p_cafe uuid,p_draft uuid,p_document uuid,p_prepared jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.bf_invoice_custom_fields(cafe_id,document_id,draft_id,settings,settings_revision,values,created_by) VALUES(p_cafe,p_document,p_draft,p_prepared->'settings',(p_prepared->>'settingsRevision')::integer,p_prepared->'values',auth.uid());
 INSERT INTO public.bf_invoice_custom_field_values(document_id,cafe_id,field_id,position,field,value,unique_key,media)
 SELECT p_document,p_cafe,(x.value#>>'{field,id}')::uuid,x.ordinality-1,x.value->'field',x.value->'value',brand_finance_private.custom_field_unique_key(x.value->'field',x.value->'value'),nullif(x.value->'media','null'::jsonb) FROM jsonb_array_elements(p_prepared->'fields') WITH ORDINALITY x(value,ordinality);
END $$;

CREATE FUNCTION brand_finance_private.custom_field_capabilities(p_type text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '__CAPABILITIES__'::jsonb->p_type
$$;

CREATE FUNCTION brand_finance_private.custom_field_html_valid(p_html text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p_html IS NOT NULL AND length(p_html)<=20000 AND position('<' IN regexp_replace(p_html,'</?(p|br|strong|b|em|i|u|s|strike|ol|ul|li)>|<br ?/>|<a href="(https?://|mailto:)[^"<>[:cntrl:][:space:]]*">|</a>','','gi'))=0
$$;

CREATE FUNCTION brand_finance_private.custom_field_value(p_field jsonb,p_value jsonb,p_required boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE t text:=p_field->>'type';v text;bound text;actual numeric;lo numeric;hi numeric;cap jsonb;dt date;ts timestamp;item jsonb;
BEGIN
 cap:=brand_finance_private.custom_field_capabilities(t);
 IF p_value IS NULL OR p_value='null'::jsonb OR p_value='""'::jsonb OR p_value='[]'::jsonb THEN
  IF p_required AND coalesce((p_field->>'required')::boolean,false) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',p_field->>'label' USING ERRCODE='22023';END IF;
  RETURN 'null'::jsonb;
 END IF;
 IF t IN('separator','free_static_content') THEN RAISE EXCEPTION 'العنصر الفاصل لا يقبل قيمة' USING ERRCODE='22023';END IF;
 IF t='checkbox' THEN IF jsonb_typeof(p_value)<>'boolean' THEN RAISE EXCEPTION 'راجع قيمة مربع الاختيار' USING ERRCODE='22023';END IF;RETURN p_value;END IF;
 IF t IN('multiple_dropdown','multiple_checkbox') THEN
  IF jsonb_typeof(p_value)<>'array' THEN RAISE EXCEPTION 'اختر قيمًا من خيارات الحقل' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(p_value)>100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_value) x WHERE jsonb_typeof(x)<>'string' OR NOT p_field->'options' @> jsonb_build_array(x)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_value) x GROUP BY x HAVING count(*)>1) THEN RAISE EXCEPTION 'راجع اختيارات الحقل' USING ERRCODE='22023';END IF;
  RETURN p_value;
 END IF;
 IF jsonb_typeof(p_value)<>'string' THEN RAISE EXCEPTION 'قيمة الحقل يجب أن تكون نصًا' USING ERRCODE='22023';END IF;
 v:=p_value#>>'{}';IF length(v)>10000 THEN RAISE EXCEPTION 'قيمة الحقل طويلة جدًا' USING ERRCODE='22023';END IF;
 IF t IN('dropdown','radio') AND NOT p_field->'options' @> jsonb_build_array(p_value) THEN RAISE EXCEPTION 'اختر قيمة من خيارات الحقل' USING ERRCODE='22023';END IF;
 IF t='email' AND v!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'أدخل بريدًا إلكترونيًا صحيحًا' USING ERRCODE='22023';END IF;
 IF t='website' AND v!~*'^https?://[^/[:space:]]+([^[:space:]]*)$' THEN RAISE EXCEPTION 'أدخل رابطًا صحيحًا يبدأ بـ https أو http' USING ERRCODE='22023';END IF;
 IF t IN('date','datetime') THEN
  BEGIN
   IF t='date' THEN
    IF v!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid date';END IF;dt:=v::date;IF to_char(dt,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'Invalid date';END IF;
   ELSE
    IF v!~'^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' THEN RAISE EXCEPTION 'Invalid datetime';END IF;ts:=v::timestamp;
   END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'أدخل تاريخًا ووقتًا صحيحين' USING ERRCODE='22023';END;
 END IF;
 IF t='time' AND v!~'^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' THEN RAISE EXCEPTION 'أدخل وقتًا صحيحًا' USING ERRCODE='22023';END IF;
 IF t IN('number','decimal','currency') THEN
  IF v!~'^-?\d{1,30}(\.\d{1,10})?$' OR (t='number' AND position('.' IN v)>0) THEN RAISE EXCEPTION 'أدخل رقمًا صحيحًا' USING ERRCODE='22023';END IF;
  IF t='decimal' AND length(split_part(v,'.',2))>(p_field->>'decimalPlaces')::integer THEN RAISE EXCEPTION 'تجاوزت عدد الخانات العشرية المحدد' USING ERRCODE='22023';END IF;
 END IF;
 IF t IN('file_upload','image_upload') AND v!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'اختر ملفًا مرفوعًا ومؤكدًا' USING ERRCODE='22023';END IF;
 IF (cap->>'range')::boolean THEN
  IF cap->>'rangeKind' IN('date','datetime') THEN
   IF coalesce(p_field->>'minimum','')<>'' AND v<p_field->>'minimum' OR coalesce(p_field->>'maximum','')<>'' AND v>p_field->>'maximum' THEN RAISE EXCEPTION 'التاريخ خارج حدود الحقل' USING ERRCODE='22023';END IF;
  ELSE
   actual:=CASE WHEN cap->>'rangeKind'='length' THEN length(v) WHEN t='number' AND p_field->>'numberRangeMode'='digits' THEN length(ltrim(v,'-')) ELSE v::numeric END;
   lo:=nullif(p_field->>'minimum','')::numeric;hi:=nullif(p_field->>'maximum','')::numeric;
   IF actual<lo OR actual>hi THEN RAISE EXCEPTION 'القيمة خارج حدود الحقل' USING ERRCODE='22023';END IF;
  END IF;
 END IF;
 RETURN p_value;
END $$;

CREATE FUNCTION brand_finance_private.validate_custom_field_settings(p_settings jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE f jsonb;cap jsonb;k text;v text;image_variant jsonb;bound text;
BEGIN
 IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR octet_length(p_settings::text)>700000 THEN RAISE EXCEPTION 'راجع إعدادات الحقول' USING ERRCODE='22023';END IF;
 IF NOT p_settings ?& ARRAY['title','fields'] OR (SELECT count(*) FROM jsonb_object_keys(p_settings))<>2 OR jsonb_typeof(p_settings->'title') IS DISTINCT FROM 'string' OR length(btrim(p_settings->>'title')) NOT BETWEEN 1 AND 255 OR jsonb_typeof(p_settings->'fields') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'راجع عنوان النموذج والحقول' USING ERRCODE='22023';END IF;
 IF jsonb_array_length(p_settings->'fields')>50 THEN RAISE EXCEPTION 'الحد الأقصى ٥٠ حقلًا' USING ERRCODE='22023';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_settings->'fields') LOOP
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع تعريف الحقل' USING ERRCODE='22023';END IF;
  IF NOT f ?& ARRAY['id','type','label','instructions','defaultValue','placeholder','autocomplete','quickSearch','required','unique','filterable','showInList','size','newLine','hidden','options','minimum','maximum','numberRangeMode','decimalPlaces','currency','fileTypes','image','content','placement'] OR (SELECT count(*) FROM jsonb_object_keys(f))<>25 THEN RAISE EXCEPTION 'تعريف الحقل غير مكتمل' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(f->'id') IS DISTINCT FROM 'string' OR f->>'id' !~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR jsonb_typeof(f->'type') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'راجع معرف الحقل ونوعه' USING ERRCODE='22023';END IF;
  cap:=brand_finance_private.custom_field_capabilities(f->>'type');IF cap IS NULL THEN RAISE EXCEPTION 'نوع الحقل غير معروف' USING ERRCODE='22023';END IF;
  FOREACH k IN ARRAY ARRAY['label','instructions','placeholder','size','numberRangeMode','currency','content','placement'] LOOP IF jsonb_typeof(f->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'راجع خصائص الحقل النصية' USING ERRCODE='22023';END IF;END LOOP;
  IF length(f->>'label')>255 OR (f->>'type' NOT IN('separator','free_static_content') AND btrim(f->>'label')='') OR length(f->>'placeholder')>255 OR length(f->>'instructions')>2000 OR length(f->>'content')>20000 OR f->>'size' NOT IN('xs','sm','md','lg','xl') OR f->>'numberRangeMode' NOT IN('digits','value') OR f->>'currency'!~'^[A-Z]{3}$' OR f->>'placement' NOT IN('view','edit','both') THEN RAISE EXCEPTION 'راجع أطوال وخصائص الحقل' USING ERRCODE='22023';END IF;
  FOREACH k IN ARRAY ARRAY['autocomplete','quickSearch','required','unique','filterable','showInList','newLine','hidden'] LOOP
   IF jsonb_typeof(f->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع خيارات الحقل' USING ERRCODE='22023';END IF;
   IF k NOT IN('newLine','hidden') AND (f->>k)::boolean AND NOT (cap->>k)::boolean THEN RAISE EXCEPTION 'خيار غير متاح لنوع الحقل' USING ERRCODE='22023';END IF;
  END LOOP;
  IF NOT (cap->>'instructions')::boolean AND f->>'instructions'<>'' OR NOT (cap->>'placeholder')::boolean AND f->>'placeholder'<>'' THEN RAISE EXCEPTION 'خاصية غير متاحة لنوع الحقل' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(f->'decimalPlaces') IS DISTINCT FROM 'number' OR (f->>'decimalPlaces')!~'^(10|[1-9])$' THEN RAISE EXCEPTION 'الخانات العشرية يجب أن تكون من ١ إلى ١٠' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(f->'options') IS DISTINCT FROM 'array' OR jsonb_typeof(f->'fileTypes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'راجع قائمة الخيارات' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(f->'options')>100 OR NOT (cap->>'options')::boolean AND jsonb_array_length(f->'options')>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(f->'options') x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 255 OR btrim(x#>>'{}')='') OR EXISTS(SELECT 1 FROM jsonb_array_elements(f->'options') x GROUP BY x HAVING count(*)>1) THEN RAISE EXCEPTION 'راجع خيارات الحقل وتكرارها' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(f->'fileTypes')>7 OR NOT (cap->>'fileTypes')::boolean AND jsonb_array_length(f->'fileTypes')>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(f->'fileTypes') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' NOT IN('document','pdf','spreadsheet','text','html','image','archive')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(f->'fileTypes') x GROUP BY x HAVING count(*)>1) THEN RAISE EXCEPTION 'راجع أنواع الملفات المسموحة' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(f->'image') IS DISTINCT FROM 'object' OR NOT f->'image' ?& ARRAY['enabled','large','thumbnail'] OR (SELECT count(*) FROM jsonb_object_keys(f->'image'))<>3 OR jsonb_typeof(f#>'{image,enabled}') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع إعدادات الصورة' USING ERRCODE='22023';END IF;
  IF (f#>>'{image,enabled}')::boolean AND NOT (cap->>'compressImage')::boolean THEN RAISE EXCEPTION 'ضغط الصورة غير متاح لهذا الحقل' USING ERRCODE='22023';END IF;
  FOREACH k IN ARRAY ARRAY['large','thumbnail'] LOOP
   image_variant:=f->'image'->k;
   IF jsonb_typeof(image_variant) IS DISTINCT FROM 'object' OR NOT image_variant ?& ARRAY['width','height','crop'] OR (SELECT count(*) FROM jsonb_object_keys(image_variant))<>3 OR jsonb_typeof(image_variant->'crop') IS DISTINCT FROM 'boolean' OR jsonb_typeof(image_variant->'width') IS DISTINCT FROM 'number' OR jsonb_typeof(image_variant->'height') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'راجع أبعاد الصورة' USING ERRCODE='22023';END IF;
   IF image_variant->>'width'!~'^\d{1,4}$' OR image_variant->>'height'!~'^\d{1,4}$' OR (image_variant->>'width')::integer>8192 OR (image_variant->>'height')::integer>8192 THEN RAISE EXCEPTION 'أبعاد الصورة تتجاوز الحد المسموح' USING ERRCODE='22023';END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['minimum','maximum'] LOOP
   IF f->k='null'::jsonb THEN CONTINUE;END IF;
   IF jsonb_typeof(f->k) IS DISTINCT FROM 'string' OR NOT (cap->>'range')::boolean THEN RAISE EXCEPTION 'حد غير متاح لهذا الحقل' USING ERRCODE='22023';END IF;
   v:=f->>k;
   IF cap->>'rangeKind' IN('date','datetime') THEN
    PERFORM brand_finance_private.custom_field_value(jsonb_set(jsonb_set(f,'{minimum}','null'),'{maximum}','null'),f->k,false);
   ELSE
    IF v!~'^-?\d{1,30}(\.\d{1,10})?$' OR ((cap->>'rangeKind'='length' OR f->>'type'='number' AND f->>'numberRangeMode'='digits') AND v!~'^\d{1,5}$') THEN RAISE EXCEPTION 'راجع قيمة حدود الحقل' USING ERRCODE='22023';END IF;
   END IF;
  END LOOP;
  IF f->'minimum'<>'null'::jsonb AND f->'maximum'<>'null'::jsonb THEN
   IF CASE WHEN cap->>'rangeKind' IN('date','datetime') THEN f->>'minimum'>f->>'maximum' ELSE (f->>'minimum')::numeric>(f->>'maximum')::numeric END THEN RAISE EXCEPTION 'الحد الأقصى أقل من الحد الأدنى' USING ERRCODE='22023';END IF;
  END IF;
  IF f->>'type'<>'free_static_content' AND f->>'content'<>'' OR NOT brand_finance_private.custom_field_html_valid(f->>'content') THEN RAISE EXCEPTION 'محتوى التنسيق غير مسموح' USING ERRCODE='22023';END IF;
  IF NOT (cap->>'defaultValue')::boolean AND f->'defaultValue' NOT IN('null'::jsonb,'""'::jsonb,'[]'::jsonb) THEN RAISE EXCEPTION 'القيمة المبدئية غير متاحة لهذا النوع' USING ERRCODE='22023';END IF;
  PERFORM brand_finance_private.custom_field_value(f,f->'defaultValue',false);
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'fields') f GROUP BY (f->>'id')::uuid HAVING count(*)>1) THEN RAISE EXCEPTION 'لا يمكن تكرار معرف الحقل' USING ERRCODE='22023';END IF;
END $$;

CREATE FUNCTION public.brand_finance_invoice_custom_fields(p_cafe_id uuid,p_action text DEFAULT 'get',p_settings jsonb DEFAULT NULL,p_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;config jsonb;rev integer;
BEGIN
 r:=brand_finance_private.custom_field_role(p_cafe_id);
 IF p_action IS NULL OR p_action NOT IN('get','save') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023';END IF;
 IF p_action='save' THEN
  IF r<>'owner' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='22023';END IF;
  PERFORM brand_finance_private.validate_custom_field_settings(p_settings);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 END IF;
 SELECT settings,revision INTO config,rev FROM public.bf_invoice_custom_field_settings WHERE cafe_id=p_cafe_id;
 config:=coalesce(config,'{"title":"المزيد من معلومات الفاتورة","fields":[]}'::jsonb);rev:=coalesce(rev,0);
 IF p_action='save' AND config IS DISTINCT FROM p_settings THEN
  IF rev<>p_revision THEN RAISE EXCEPTION 'Custom field settings conflict' USING ERRCODE='40001';END IF;
  INSERT INTO public.bf_invoice_custom_field_settings(cafe_id,settings,revision,updated_by) VALUES(p_cafe_id,p_settings,rev+1,auth.uid()) ON CONFLICT(cafe_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  INSERT INTO public.bf_invoice_custom_field_events(cafe_id,revision,before_settings,after_settings,created_by) VALUES(p_cafe_id,rev+1,config,p_settings,auth.uid());
  config:=p_settings;rev:=rev+1;
 END IF;
 RETURN jsonb_build_object('settings',config,'revision',rev);
END $$;
