BEGIN;
DO $$ BEGIN
  IF md5(pg_get_functiondef('public.brand_finance_issue_company_invoice(uuid,uuid,integer,numeric)'::regprocedure))<>'441e42fcba80b8ec967cacc0fd0dc0f8' THEN RAISE EXCEPTION 'Unexpected manual issuer baseline after order sources';END IF;
END $$;

-- Administrative invoice suggestions only. No POS or financial posting function is changed.
CREATE TABLE public.bf_invoice_line_note_settings (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id), settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
  revision integer NOT NULL CHECK(revision>0), updated_by uuid NOT NULL REFERENCES auth.users(id), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.bf_invoice_line_note_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id), revision integer NOT NULL CHECK(revision>0),
  before_settings jsonb NOT NULL, after_settings jsonb NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(cafe_id,revision)
);
ALTER TABLE public.bf_invoice_line_note_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_line_note_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_line_note_settings,public.bf_invoice_line_note_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_invoice_line_note_events_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_line_note_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.validate_invoice_line_notes(p_settings jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE note jsonb;
BEGIN
  IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع إعدادات ملاحظات البنود' USING ERRCODE='22023';END IF;
  IF octet_length(p_settings::text)>40000 OR (SELECT count(*) FROM jsonb_object_keys(p_settings))<>2
    OR NOT p_settings ?& ARRAY['enabled','notes'] OR jsonb_typeof(p_settings->'enabled') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_settings->'notes') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'راجع إعدادات ملاحظات البنود' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(p_settings->'notes')>100 THEN RAISE EXCEPTION 'الحد الأقصى ١٠٠ ملاحظة' USING ERRCODE='22023';END IF;
  FOR note IN SELECT value FROM jsonb_array_elements(p_settings->'notes') LOOP
    IF jsonb_typeof(note) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع بيانات الملاحظة' USING ERRCODE='22023';END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(note))<>3 OR NOT note ?& ARRAY['id','text','active']
      OR jsonb_typeof(note->'id') IS DISTINCT FROM 'string' OR coalesce(note->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(note->'text') IS DISTINCT FROM 'string' OR coalesce(length(note->>'text'),0) NOT BETWEEN 1 AND 50
      OR note->>'text' !~ '[^[:space:]]' OR jsonb_typeof(note->'active') IS DISTINCT FROM 'boolean'
    THEN RAISE EXCEPTION 'نص الملاحظة مطلوب وبحد أقصى ٥٠ حرفًا مع المسافات' USING ERRCODE='22023';END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'notes') n GROUP BY (n->>'id')::uuid HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings->'notes') n GROUP BY lower(btrim(n->>'text')) HAVING count(*)>1)
  THEN RAISE EXCEPTION 'لا يمكن تكرار الملاحظة أو معرفها' USING ERRCODE='22023';END IF;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.validate_invoice_line_notes(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_invoice_line_notes(p_cafe_id uuid,p_action text DEFAULT 'get',p_settings jsonb DEFAULT NULL,p_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; current_settings jsonb; current_revision integer; options jsonb;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF p_action IS NULL OR p_action NOT IN('get','save','options') THEN RAISE EXCEPTION 'Invalid notes action' USING ERRCODE='22023';END IF;
  IF p_action='save' THEN
    IF role_name<>'owner' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
    IF p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'Invalid notes revision' USING ERRCODE='22023';END IF;
    PERFORM brand_finance_private.validate_invoice_line_notes(p_settings);
    PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60621));
  END IF;
  SELECT settings,revision INTO current_settings,current_revision FROM public.bf_invoice_line_note_settings WHERE cafe_id=p_cafe_id;
  current_settings:=coalesce(current_settings,'{"enabled":false,"notes":[]}'::jsonb);current_revision:=coalesce(current_revision,0);
  IF p_action='save' AND current_settings IS DISTINCT FROM p_settings THEN
    IF current_revision<>p_revision THEN RAISE EXCEPTION 'Invoice line notes conflict' USING ERRCODE='40001';END IF;
    INSERT INTO public.bf_invoice_line_note_settings(cafe_id,settings,revision,updated_by) VALUES(p_cafe_id,p_settings,current_revision+1,auth.uid())
      ON CONFLICT(cafe_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
    INSERT INTO public.bf_invoice_line_note_events(cafe_id,revision,before_settings,after_settings,created_by) VALUES(p_cafe_id,current_revision+1,current_settings,p_settings,auth.uid());
    current_settings:=p_settings;current_revision:=current_revision+1;
  END IF;
  IF p_action='options' THEN
    IF (current_settings->>'enabled')::boolean THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.value->>'id','text',n.value->>'text') ORDER BY n.ordinality),'[]'::jsonb) INTO options FROM jsonb_array_elements(current_settings->'notes') WITH ORDINALITY n(value,ordinality) WHERE (n.value->>'active')::boolean;
    END IF;
    RETURN jsonb_build_object('enabled',(current_settings->>'enabled')::boolean,'notes',coalesce(options,'[]'::jsonb),'revision',current_revision);
  END IF;
  RETURN jsonb_build_object('settings',current_settings,'revision',current_revision);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_invoice_line_notes(uuid,text,jsonb,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_invoice_line_notes(uuid,text,jsonb,integer) TO authenticated;

CREATE FUNCTION public.brand_finance_add_invoice_line_notes(p_cafe_id uuid,p_texts jsonb,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state jsonb; settings jsonb; entry_value jsonb; notes jsonb; added boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_texts) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'راجع الملاحظات المراد حفظها' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(p_texts) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'الحد الأقصى ١٠ ملاحظات في المرة الواحدة' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60621));
  state:=public.brand_finance_invoice_line_notes(p_cafe_id);settings:=state->'settings';notes:=settings->'notes';
  FOR entry_value IN SELECT x FROM jsonb_array_elements(p_texts) x LOOP
    IF jsonb_typeof(entry_value) IS DISTINCT FROM 'string' OR length(entry_value#>>'{}') NOT BETWEEN 1 AND 50 OR entry_value#>>'{}' !~ '[^[:space:]]' THEN RAISE EXCEPTION 'نص الملاحظة مطلوب وبحد أقصى ٥٠ حرفًا مع المسافات' USING ERRCODE='22023';END IF;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(notes) n WHERE lower(btrim(n->>'text'))=lower(btrim(entry_value#>>'{}'))) THEN
      notes:=notes||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'text',entry_value#>>'{}','active',true));added:=true;
    END IF;
  END LOOP;
  IF NOT added THEN RETURN state;END IF;
  RETURN public.brand_finance_invoice_line_notes(p_cafe_id,'save',jsonb_set(settings,'{notes}',notes),p_revision);
END $$;

CREATE TABLE public.bf_invoice_line_note_drafts (
  draft_id uuid PRIMARY KEY REFERENCES public.bf_invoice_drafts(id) ON DELETE CASCADE,cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),revision integer NOT NULL CHECK(revision>0),draft_revision integer NOT NULL CHECK(draft_revision>0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bf_invoice_line_note_drafts_cafe ON public.bf_invoice_line_note_drafts(cafe_id,draft_id);
CREATE TABLE public.bf_invoice_line_notes (
  document_id uuid PRIMARY KEY,cafe_id uuid NOT NULL,lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),
  created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_invoice_line_notes_cafe ON public.bf_invoice_line_notes(cafe_id,document_id);
ALTER TABLE public.bf_invoice_line_note_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_line_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_line_note_drafts,public.bf_invoice_line_notes FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_invoice_line_notes_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_line_notes FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.validate_invoice_line_note_selection(p_lines jsonb,p_draft_lines jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE line jsonb; note jsonb; result jsonb;
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_typeof(p_draft_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'راجع ملاحظات بنود المسودة' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(p_lines)>100 OR octet_length(p_lines::text)>250000 THEN RAISE EXCEPTION 'تجاوزت ملاحظات الفاتورة الحد المسموح' USING ERRCODE='22023';END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع مفتاح بند الملاحظة' USING ERRCODE='22023';END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(line))<>2 OR NOT line ?& ARRAY['key','notes'] OR jsonb_typeof(line->'key') IS DISTINCT FROM 'number'
      OR (line->>'key')::numeric NOT BETWEEN 0 AND 9007199254740991 OR (line->>'key')::numeric<>trunc((line->>'key')::numeric)
      OR jsonb_typeof(line->'notes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'راجع مفتاح بند الملاحظة' USING ERRCODE='22023';END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(p_draft_lines) d WHERE (d->>'key')::numeric=(line->>'key')::numeric)<>1 THEN RAISE EXCEPTION 'تعذر ربط الملاحظة ببند المسودة أعد تحميل البيانات' USING ERRCODE='22023';END IF;
    IF jsonb_array_length(line->'notes') NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'اختر من ملاحظة واحدة إلى ١٠ ملاحظات لكل بند' USING ERRCODE='22023';END IF;
    FOR note IN SELECT value FROM jsonb_array_elements(line->'notes') LOOP
      IF jsonb_typeof(note) IS DISTINCT FROM 'string' OR length(note#>>'{}') NOT BETWEEN 1 AND 50 OR note#>>'{}' !~ '[^[:space:]]' THEN RAISE EXCEPTION 'نص الملاحظة مطلوب وبحد أقصى ٥٠ حرفًا مع المسافات' USING ERRCODE='22023';END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(line->'notes') n GROUP BY lower(btrim(n)) HAVING count(*)>1) THEN RAISE EXCEPTION 'لا يمكن تكرار الملاحظة داخل البند' USING ERRCODE='22023';END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) l GROUP BY (l->>'key')::numeric HAVING count(*)>1) THEN RAISE EXCEPTION 'تكرر مفتاح بند الملاحظة' USING ERRCODE='22023';END IF;
  SELECT coalesce(jsonb_agg(l ORDER BY (l->>'key')::numeric),'[]'::jsonb) INTO result FROM jsonb_array_elements(p_lines) l;
  RETURN result;
END $$;

CREATE FUNCTION public.brand_finance_invoice_line_note_context(p_cafe_id uuid,p_draft_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE options jsonb; selection public.bf_invoice_line_note_drafts%ROWTYPE; issued_id uuid; selected_lines jsonb;
BEGIN
  options:=public.brand_finance_invoice_line_notes(p_cafe_id,'options');
  IF p_draft_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id) THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
    SELECT * INTO selection FROM public.bf_invoice_line_note_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
    SELECT document_id INTO issued_id FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
    IF issued_id IS NOT NULL THEN
      SELECT coalesce(jsonb_agg(l-'lineIndex' ORDER BY (l->>'key')::numeric),'[]'::jsonb) INTO selected_lines FROM public.bf_invoice_line_notes n CROSS JOIN LATERAL jsonb_array_elements(n.lines) l WHERE n.cafe_id=p_cafe_id AND n.document_id=issued_id;
    END IF;
  END IF;
  RETURN jsonb_build_object('enabled',options->'enabled','notes',options->'notes','settingsRevision',options->'revision','lines',coalesce(selected_lines,selection.lines,'[]'::jsonb),'revision',coalesce(selection.revision,0),'hasSelection',selection.draft_id IS NOT NULL,'issued',issued_id IS NOT NULL);
END $$;

CREATE FUNCTION public.brand_finance_set_invoice_line_notes(p_cafe_id uuid,p_draft_id uuid,p_draft_revision integer,p_revision integer,p_lines jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;draft public.bf_invoice_drafts%ROWTYPE;selection public.bf_invoice_line_note_drafts%ROWTYPE;issued_id uuid;historical jsonb;normalized jsonb;next_revision integer;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF p_draft_revision IS NULL OR p_draft_revision<1 OR p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'Invalid notes revision' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  SELECT * INTO draft FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
  SELECT * INTO selection FROM public.bf_invoice_line_note_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  SELECT document_id INTO issued_id FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF issued_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(l-'lineIndex' ORDER BY (l->>'key')::numeric),'[]'::jsonb) INTO historical FROM public.bf_invoice_line_notes n CROSS JOIN LATERAL jsonb_array_elements(n.lines) l WHERE n.cafe_id=p_cafe_id AND n.document_id=issued_id;
    normalized:=brand_finance_private.validate_invoice_line_note_selection(p_lines,coalesce(selection.lines,'[]'::jsonb));
    IF normalized IS DISTINCT FROM historical THEN RAISE EXCEPTION 'لا يمكن تغيير ملاحظات فاتورة صادرة' USING ERRCODE='22023';END IF;
    RETURN jsonb_build_object('revision',coalesce(selection.revision,0),'lines',historical,'issued',true);
  END IF;
  IF draft.revision<>p_draft_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001';END IF;
  normalized:=brand_finance_private.validate_invoice_line_note_selection(p_lines,draft.payload#>'{invoice,lines}');
  IF selection.draft_id IS NOT NULL AND selection.lines=normalized THEN
    UPDATE public.bf_invoice_line_note_drafts SET draft_revision=p_draft_revision,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
    RETURN jsonb_build_object('revision',selection.revision,'lines',normalized,'issued',false);
  END IF;
  IF coalesce(selection.revision,0)<>p_revision THEN RAISE EXCEPTION 'Invoice line notes conflict' USING ERRCODE='40001';END IF;
  next_revision:=coalesce(selection.revision,0)+1;
  INSERT INTO public.bf_invoice_line_note_drafts(cafe_id,draft_id,lines,revision,draft_revision,updated_by) VALUES(p_cafe_id,p_draft_id,normalized,next_revision,p_draft_revision,auth.uid())
    ON CONFLICT(draft_id) DO UPDATE SET lines=excluded.lines,revision=excluded.revision,draft_revision=excluded.draft_revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  RETURN jsonb_build_object('revision',next_revision,'lines',normalized,'issued',false);
END $$;

CREATE FUNCTION public.brand_finance_issued_line_notes(p_cafe_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;selection public.bf_invoice_line_notes%ROWTYPE;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_document_id AND kind='sale') THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501';END IF;
  SELECT * INTO selection FROM public.bf_invoice_line_notes WHERE cafe_id=p_cafe_id AND document_id=p_document_id;
  RETURN jsonb_build_object('recorded',selection.document_id IS NOT NULL,'lines',coalesce(selection.lines,'[]'::jsonb));
END $$;

CREATE FUNCTION public.brand_finance_copy_invoice_line_notes(p_cafe_id uuid,p_source_document_id uuid,p_draft_id uuid,p_draft_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb;draft public.bf_invoice_drafts%ROWTYPE;historical jsonb;copied jsonb;
BEGIN
  IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  historical:=public.brand_finance_issued_line_notes(p_cafe_id,p_source_document_id)->'lines';
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  SELECT * INTO draft FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
  IF draft.revision IS DISTINCT FROM p_draft_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001';END IF;
  IF jsonb_array_length(historical)>0 THEN
    SELECT snapshot INTO source FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND document_id=p_source_document_id;
    IF source IS NULL OR jsonb_array_length(draft.payload#>'{invoice,lines}')<>jsonb_array_length(source->'lines')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(source->'lines') WITH ORDINALITY s(value,position) WHERE (SELECT count(*) FROM jsonb_array_elements(draft.payload#>'{invoice,lines}') d WHERE (d->>'key')::numeric=s.position-1 AND coalesce(d->>'productId','')=coalesce(s.value->>'productId','') AND d->>'name'=s.value->>'name' AND (d->>'quantity')::numeric=(s.value->>'quantity')::numeric)<>1)
    THEN RAISE EXCEPTION 'تعذر مطابقة ملاحظات البنود مع مسودة النسخة' USING ERRCODE='22023';END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('key',h->'lineIndex','notes',h->'notes') ORDER BY (h->>'lineIndex')::integer),'[]'::jsonb) INTO copied FROM jsonb_array_elements(historical) h;
  RETURN public.brand_finance_set_invoice_line_notes(p_cafe_id,p_draft_id,p_draft_revision,0,copied);
END $$;

CREATE FUNCTION brand_finance_private.capture_invoice_line_notes(p_cafe_id uuid,p_draft_id uuid,p_document_id uuid,p_snapshot_lines jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE selection public.bf_invoice_line_note_drafts%ROWTYPE;draft public.bf_invoice_drafts%ROWTYPE;historical jsonb:='[]'::jsonb;normalized jsonb;
BEGIN
  SELECT * INTO draft FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id;
  SELECT * INTO selection FROM public.bf_invoice_line_note_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF selection.draft_id IS NOT NULL THEN
    IF selection.draft_revision<>draft.revision THEN RAISE EXCEPTION 'أعد حفظ ملاحظات البنود بعد تحديث المسودة' USING ERRCODE='40001';END IF;
    normalized:=brand_finance_private.validate_invoice_line_note_selection(selection.lines,draft.payload#>'{invoice,lines}');
    IF jsonb_array_length(p_snapshot_lines)<>jsonb_array_length(draft.payload#>'{invoice,lines}') THEN RAISE EXCEPTION 'تعذر مطابقة ملاحظات البنود مع الفاتورة' USING ERRCODE='22023';END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('lineIndex',d.position-1,'key',n->'key','notes',n->'notes') ORDER BY d.position),'[]'::jsonb) INTO historical
      FROM jsonb_array_elements(draft.payload#>'{invoice,lines}') WITH ORDINALITY d(value,position) JOIN jsonb_array_elements(normalized) n ON (n->>'key')::numeric=(d.value->>'key')::numeric;
  END IF;
  INSERT INTO public.bf_invoice_line_notes(cafe_id,document_id,lines,created_by) VALUES(p_cafe_id,p_document_id,historical,auth.uid());
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.validate_invoice_line_note_selection(jsonb,jsonb),brand_finance_private.capture_invoice_line_notes(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_add_invoice_line_notes(uuid,jsonb,integer),public.brand_finance_invoice_line_note_context(uuid,uuid),public.brand_finance_set_invoice_line_notes(uuid,uuid,integer,integer,jsonb),public.brand_finance_issued_line_notes(uuid,uuid),public.brand_finance_copy_invoice_line_notes(uuid,uuid,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_add_invoice_line_notes(uuid,jsonb,integer),public.brand_finance_invoice_line_note_context(uuid,uuid),public.brand_finance_set_invoice_line_notes(uuid,uuid,integer,integer,jsonb),public.brand_finance_issued_line_notes(uuid,uuid),public.brand_finance_copy_invoice_line_notes(uuid,uuid,uuid,integer) TO authenticated;

-- Append the historical notes atomically after the unchanged canonical issuer and source snapshot.
DO $$ DECLARE definition text; replacement text; BEGIN
  definition:=pg_get_functiondef('public.brand_finance_issue_company_invoice(uuid,uuid,integer,numeric)'::regprocedure);
  replacement:=replace(definition,'  RETURN result;',E'  PERFORM brand_finance_private.capture_invoice_line_notes(p_cafe_id,p_draft_id,(result->>''id'')::uuid,result->''lines'');\n  RETURN result;');
  IF definition=replacement THEN RAISE EXCEPTION 'Manual issuer insertion point missing';END IF;
  EXECUTE replacement;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
