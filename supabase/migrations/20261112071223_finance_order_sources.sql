BEGIN;
DO $$ BEGIN
  IF md5(pg_get_functiondef('public.brand_finance_issue_company_invoice(uuid,uuid,integer,numeric)'::regprocedure)) <> '76d4ba35ecd181f50c9c56be67c3f04f' THEN RAISE EXCEPTION 'Unexpected public invoice issuer baseline'; END IF;
END $$;

CREATE TABLE public.bf_order_source_settings (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),
  settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
  revision integer NOT NULL CHECK(revision>0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.bf_order_source_settings_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  revision integer NOT NULL CHECK(revision>0), before_settings jsonb NOT NULL, after_settings jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(cafe_id,revision)
);
CREATE TABLE public.bf_invoice_order_source_drafts (
  draft_id uuid PRIMARY KEY REFERENCES public.bf_invoice_drafts(id) ON DELETE CASCADE,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id), source_id uuid,
  revision integer NOT NULL CHECK(revision>0), updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bf_invoice_order_source_drafts_cafe ON public.bf_invoice_order_source_drafts(cafe_id,draft_id);
CREATE TABLE public.bf_invoice_order_source_last (
  cafe_id uuid NOT NULL REFERENCES public.cafes(id), user_id uuid NOT NULL REFERENCES auth.users(id),
  source_id uuid, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(cafe_id,user_id)
);
CREATE TABLE public.bf_invoice_order_sources (
  document_id uuid PRIMARY KEY, cafe_id uuid NOT NULL, source_id uuid, source_name text,
  created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
  CHECK((source_id IS NULL AND source_name IS NULL) OR (source_id IS NOT NULL AND source_name IS NOT NULL AND length(source_name) BETWEEN 1 AND 80))
);
CREATE INDEX bf_invoice_order_sources_cafe ON public.bf_invoice_order_sources(cafe_id,source_id,document_id);
ALTER TABLE public.bf_order_source_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_order_source_settings_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_order_source_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_order_source_last ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_order_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_order_source_settings,public.bf_order_source_settings_events,public.bf_invoice_order_source_drafts,public.bf_invoice_order_source_last,public.bf_invoice_order_sources FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_order_source_settings_events_immutable BEFORE UPDATE OR DELETE ON public.bf_order_source_settings_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER bf_invoice_order_sources_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_order_sources FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.order_source_settings(p_cafe_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce((SELECT settings FROM public.bf_order_source_settings WHERE cafe_id=p_cafe_id),'{"sources":[],"defaultMode":"none","defaultSourceId":null,"required":false}'::jsonb)
$$;
CREATE FUNCTION brand_finance_private.validate_order_source_settings(p_settings jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE source jsonb; default_id uuid;
BEGIN
  IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR octet_length(p_settings::text)>50000
    OR (SELECT count(*) FROM jsonb_object_keys(p_settings))<>4
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_settings) k WHERE k NOT IN('sources','defaultMode','defaultSourceId','required'))
    OR jsonb_typeof(p_settings->'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(p_settings->'sources')>100
    OR jsonb_typeof(p_settings->'required') IS DISTINCT FROM 'boolean'
    OR coalesce(p_settings->>'defaultMode','') NOT IN('none','last','specific')
    OR (p_settings->'defaultSourceId'<>'null'::jsonb AND (jsonb_typeof(p_settings->'defaultSourceId') IS DISTINCT FROM 'string' OR p_settings->>'defaultSourceId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
  THEN RAISE EXCEPTION 'راجع خيارات مصادر الطلب والحد الأقصى ١٠٠ مصدر' USING ERRCODE='22023'; END IF;
  FOR source IN SELECT value FROM jsonb_array_elements(p_settings->'sources') LOOP
    IF jsonb_typeof(source) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(source))<>3
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(source) k WHERE k NOT IN('id','name','active'))
      OR coalesce(source->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(source->'name') IS DISTINCT FROM 'string' OR coalesce(length(btrim(source->>'name')),0) NOT BETWEEN 1 AND 80
      OR source->>'name'<>btrim(source->>'name') OR jsonb_typeof(source->'active') IS DISTINCT FROM 'boolean'
    THEN RAISE EXCEPTION 'راجع اسم مصدر الطلب وحالته' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'sources') s GROUP BY (s->>'id')::uuid HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'sources') s GROUP BY lower(s->>'name') HAVING count(*)>1)
  THEN RAISE EXCEPTION 'اسم مصدر الطلب ومعرفه يجب ألا يتكررا' USING ERRCODE='22023'; END IF;
  default_id:=(p_settings->>'defaultSourceId')::uuid;
  IF (p_settings->>'defaultMode'='specific' AND (default_id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'sources') s WHERE (s->>'id')::uuid=default_id AND (s->>'active')::boolean)))
    OR (p_settings->>'defaultMode'<>'specific' AND default_id IS NOT NULL)
    OR ((p_settings->>'required')::boolean AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'sources') s WHERE (s->>'active')::boolean))
  THEN RAISE EXCEPTION 'اختر مصدرًا نشطًا للإعداد الافتراضي أو الإلزامي' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.order_source_settings(uuid),brand_finance_private.validate_order_source_settings(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_order_sources(p_cafe_id uuid,p_action text DEFAULT 'get',p_settings jsonb DEFAULT NULL,p_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; current_settings jsonb; current_revision integer;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF p_action IS NULL OR p_action NOT IN('get','save') THEN RAISE EXCEPTION 'Invalid source action' USING ERRCODE='22023';END IF;
  IF p_action='save' THEN
    IF role_name<>'owner' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
    IF p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='22023';END IF;
    PERFORM brand_finance_private.validate_order_source_settings(p_settings);
    PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  END IF;
  current_settings:=brand_finance_private.order_source_settings(p_cafe_id);
  SELECT revision INTO current_revision FROM public.bf_order_source_settings WHERE cafe_id=p_cafe_id;
  current_revision:=coalesce(current_revision,0);
  IF p_action='save' AND p_settings IS DISTINCT FROM current_settings THEN
    IF p_revision<>current_revision THEN RAISE EXCEPTION 'Order source settings conflict' USING ERRCODE='40001';END IF;
    INSERT INTO public.bf_order_source_settings(cafe_id,settings,revision,updated_by) VALUES(p_cafe_id,p_settings,current_revision+1,auth.uid())
      ON CONFLICT(cafe_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
    INSERT INTO public.bf_order_source_settings_events(cafe_id,revision,before_settings,after_settings,created_by) VALUES(p_cafe_id,current_revision+1,current_settings,p_settings,auth.uid());
    current_settings:=p_settings;current_revision:=current_revision+1;
  END IF;
  RETURN jsonb_build_object('settings',current_settings,'revision',current_revision);
END $$;

CREATE FUNCTION public.brand_finance_invoice_order_source_context(p_cafe_id uuid,p_draft_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; config jsonb; config_revision integer; chosen public.bf_invoice_order_source_drafts%ROWTYPE; default_id uuid; issued boolean:=false;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  config:=brand_finance_private.order_source_settings(p_cafe_id);
  SELECT revision INTO config_revision FROM public.bf_order_source_settings WHERE cafe_id=p_cafe_id;
  IF p_draft_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id) THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
    SELECT * INTO chosen FROM public.bf_invoice_order_source_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
    issued:=EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id);
  END IF;
  IF config->>'defaultMode'='specific' THEN default_id:=(config->>'defaultSourceId')::uuid;
  ELSIF config->>'defaultMode'='last' THEN SELECT source_id INTO default_id FROM public.bf_invoice_order_source_last WHERE cafe_id=p_cafe_id AND user_id=auth.uid();END IF;
  IF default_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(config->'sources') s WHERE (s->>'id')::uuid=default_id AND (s->>'active')::boolean) THEN default_id:=NULL;END IF;
  RETURN jsonb_build_object('settings',config,'settingsRevision',coalesce(config_revision,0),'selectedSourceId',chosen.source_id,'selectionRevision',coalesce(chosen.revision,0),'hasSelection',chosen.draft_id IS NOT NULL,'defaultSelectionId',default_id,'issued',issued);
END $$;

CREATE FUNCTION public.brand_finance_set_invoice_order_source(p_cafe_id uuid,p_draft_id uuid,p_draft_revision integer,p_source_id uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; draft public.bf_invoice_drafts%ROWTYPE; chosen public.bf_invoice_order_source_drafts%ROWTYPE; config jsonb; next_revision integer; issued_id uuid; historical public.bf_invoice_order_sources%ROWTYPE;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF p_revision IS NULL OR p_revision<0 OR p_draft_revision IS NULL OR p_draft_revision<1 THEN RAISE EXCEPTION 'Invalid source revision' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  SELECT * INTO draft FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
  SELECT * INTO chosen FROM public.bf_invoice_order_source_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  SELECT document_id INTO issued_id FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF issued_id IS NOT NULL THEN
    SELECT * INTO historical FROM public.bf_invoice_order_sources WHERE cafe_id=p_cafe_id AND document_id=issued_id;
    IF historical.source_id IS DISTINCT FROM p_source_id THEN RAISE EXCEPTION 'لا يمكن تغيير مصدر طلب فاتورة صادرة' USING ERRCODE='22023';END IF;
    RETURN jsonb_build_object('sourceId',historical.source_id,'revision',coalesce(chosen.revision,0),'issued',true);
  END IF;
  IF draft.revision<>p_draft_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001';END IF;
  config:=brand_finance_private.order_source_settings(p_cafe_id);
  IF p_source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(config->'sources') s WHERE (s->>'id')::uuid=p_source_id AND (s->>'active')::boolean) THEN RAISE EXCEPTION 'مصدر الطلب غير متاح اختر مصدرًا نشطًا' USING ERRCODE='22023';END IF;
  INSERT INTO public.bf_invoice_order_source_last(cafe_id,user_id,source_id) VALUES(p_cafe_id,auth.uid(),p_source_id)
    ON CONFLICT(cafe_id,user_id) DO UPDATE SET source_id=excluded.source_id,updated_at=clock_timestamp();
  IF chosen.draft_id IS NOT NULL AND chosen.source_id IS NOT DISTINCT FROM p_source_id THEN RETURN jsonb_build_object('sourceId',chosen.source_id,'revision',chosen.revision,'issued',false);END IF;
  IF coalesce(chosen.revision,0)<>p_revision THEN RAISE EXCEPTION 'Order source selection conflict' USING ERRCODE='40001';END IF;
  next_revision:=coalesce(chosen.revision,0)+1;
  INSERT INTO public.bf_invoice_order_source_drafts(cafe_id,draft_id,source_id,revision,updated_by) VALUES(p_cafe_id,p_draft_id,p_source_id,next_revision,auth.uid())
    ON CONFLICT(draft_id) DO UPDATE SET source_id=excluded.source_id,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  RETURN jsonb_build_object('sourceId',p_source_id,'revision',next_revision,'issued',false);
END $$;

CREATE FUNCTION public.brand_finance_invoice_order_source(p_cafe_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; source public.bf_invoice_order_sources%ROWTYPE;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_document_id AND kind='sale') THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501';END IF;
  SELECT * INTO source FROM public.bf_invoice_order_sources WHERE cafe_id=p_cafe_id AND document_id=p_document_id;
  RETURN jsonb_build_object('sourceId',source.source_id,'name',source.source_name,'recorded',source.document_id IS NOT NULL);
END $$;

-- Only the public manual-sales entry changes. POS and the internal/recurring issuer stay byte-identical.
CREATE OR REPLACE FUNCTION public.brand_finance_issue_company_invoice(p_cafe_id uuid,p_draft_id uuid,p_revision integer,p_expected_total numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; config jsonb; selected_id uuid; selected_name text; result jsonb; draft_revision integer;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  SELECT snapshot INTO result FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF FOUND THEN RETURN result;END IF;
  SELECT revision INTO draft_revision FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
  IF draft_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001';END IF;
  config:=brand_finance_private.order_source_settings(p_cafe_id);
  SELECT source_id INTO selected_id FROM public.bf_invoice_order_source_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF selected_id IS NULL AND (config->>'required')::boolean THEN RAISE EXCEPTION 'اختر مصدر الطلب قبل إصدار الفاتورة' USING ERRCODE='22023';END IF;
  IF selected_id IS NOT NULL THEN
    SELECT s->>'name' INTO selected_name FROM jsonb_array_elements(config->'sources') s WHERE (s->>'id')::uuid=selected_id AND (s->>'active')::boolean;
    IF selected_name IS NULL THEN RAISE EXCEPTION 'مصدر الطلب غير متاح اختر مصدرًا نشطًا' USING ERRCODE='22023';END IF;
  END IF;
  result:=brand_finance_private.issue_company_invoice(p_cafe_id,p_draft_id,p_revision,p_expected_total,NULL,'');
  INSERT INTO public.bf_invoice_order_sources(cafe_id,document_id,source_id,source_name,created_by) VALUES(p_cafe_id,(result->>'id')::uuid,selected_id,selected_name,auth.uid());
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.brand_finance_order_sources(uuid,text,jsonb,integer),public.brand_finance_invoice_order_source_context(uuid,uuid),public.brand_finance_set_invoice_order_source(uuid,uuid,integer,uuid,integer),public.brand_finance_invoice_order_source(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_order_sources(uuid,text,jsonb,integer),public.brand_finance_invoice_order_source_context(uuid,uuid),public.brand_finance_set_invoice_order_source(uuid,uuid,integer,uuid,integer),public.brand_finance_invoice_order_source(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
