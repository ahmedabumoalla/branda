BEGIN;
CREATE TABLE public.erp_contracting_documents(
 id uuid NOT NULL,cafe_id uuid NOT NULL REFERENCES public.cafes(id),kind text NOT NULL CHECK(kind IN('bid','project','cost_sheet','quotation','contract','certificate','work_item')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),number text NOT NULL CHECK(length(number) BETWEEN 1 AND 40),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 status text NOT NULL CHECK(status IN('draft','issued','approved','active','closed','cancelled','rejected')),customer_id uuid,project_id uuid,source_id uuid,
 subtotal numeric(18,2) NOT NULL DEFAULT 0,tax numeric(18,2) NOT NULL DEFAULT 0,total numeric(18,2) NOT NULL DEFAULT 0,cost numeric(18,2) NOT NULL DEFAULT 0,
 retention_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK(retention_rate BETWEEN 0 AND 100),recovery_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK(recovery_rate BETWEEN 0 AND 100),advance_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(advance_amount>=0),
 retention numeric(18,2) NOT NULL DEFAULT 0,recovery numeric(18,2) NOT NULL DEFAULT 0,net_due numeric(18,2) NOT NULL DEFAULT 0,
 details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(details)='object' AND octet_length(details::text)<=100000),invoice_id uuid,invoice_draft_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),actor uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,kind,number),FOREIGN KEY(cafe_id,customer_id) REFERENCES public.bf_parties(cafe_id,id),FOREIGN KEY(cafe_id,project_id) REFERENCES public.erp_contracting_documents(cafe_id,id),FOREIGN KEY(cafe_id,source_id) REFERENCES public.erp_contracting_documents(cafe_id,id),FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX erp_contracting_list ON public.erp_contracting_documents(cafe_id,kind,updated_at DESC);
CREATE INDEX erp_contracting_project ON public.erp_contracting_documents(cafe_id,project_id);
CREATE INDEX erp_contracting_source ON public.erp_contracting_documents(cafe_id,source_id,status);
CREATE INDEX erp_contracting_customer ON public.erp_contracting_documents(cafe_id,customer_id);
CREATE TABLE public.erp_contracting_lines(
 cafe_id uuid NOT NULL,document_id uuid NOT NULL,id uuid NOT NULL,position integer NOT NULL,parent_id uuid,source_line_id uuid,
 kind text NOT NULL CHECK(kind IN('heading','subheading','work')),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),unit text NOT NULL CHECK(length(unit)<=30),note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 quantity numeric(18,6) NOT NULL CHECK(quantity>=0 AND quantity<=1e9),unit_price numeric(18,6) NOT NULL CHECK(unit_price>=0 AND unit_price<=1e9),markup numeric(18,6) NOT NULL DEFAULT 0 CHECK(markup>=0),tax_rate numeric(8,4) NOT NULL CHECK(tax_rate BETWEEN 0 AND 100),
 PRIMARY KEY(cafe_id,document_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.erp_contracting_documents(cafe_id,id) ON DELETE CASCADE
);
CREATE INDEX erp_contracting_line_source ON public.erp_contracting_lines(cafe_id,source_line_id);
CREATE TABLE public.erp_contracting_resources(
 cafe_id uuid NOT NULL,document_id uuid NOT NULL,line_id uuid NOT NULL,id uuid NOT NULL,item_id uuid,kind text NOT NULL CHECK(kind IN('material','labor')),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),unit text NOT NULL CHECK(length(unit) BETWEEN 1 AND 30),consumption numeric(18,6) NOT NULL CHECK(consumption>=0 AND consumption<=1e9),unit_cost numeric(18,6) NOT NULL CHECK(unit_cost>=0 AND unit_cost<=1e9),
 PRIMARY KEY(cafe_id,document_id,id),FOREIGN KEY(cafe_id,document_id,line_id) REFERENCES public.erp_contracting_lines(cafe_id,document_id,id) ON DELETE CASCADE,FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id)
);
CREATE INDEX erp_contracting_resource_line ON public.erp_contracting_resources(cafe_id,document_id,line_id);
CREATE INDEX erp_contracting_resource_item ON public.erp_contracting_resources(cafe_id,item_id);
CREATE TABLE public.erp_contracting_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 0,settings jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.erp_contracting_links(cafe_id uuid NOT NULL,project_id uuid NOT NULL,document_id uuid NOT NULL,relation text NOT NULL CHECK(length(relation)<=80),amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(amount>=0),PRIMARY KEY(cafe_id,project_id,document_id),FOREIGN KEY(cafe_id,project_id) REFERENCES public.erp_contracting_documents(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX erp_contracting_links_finance ON public.erp_contracting_links(cafe_id,document_id);
CREATE TABLE public.erp_contracting_invoice_drafts(cafe_id uuid NOT NULL,project_id uuid NOT NULL,draft_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('invoice','advance')),PRIMARY KEY(cafe_id,draft_id),FOREIGN KEY(cafe_id,project_id) REFERENCES public.erp_contracting_documents(cafe_id,id));
CREATE INDEX erp_contracting_draft_project ON public.erp_contracting_invoice_drafts(cafe_id,project_id);
CREATE TABLE public.erp_contracting_activities(cafe_id uuid NOT NULL,project_id uuid NOT NULL,id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('appointment','time','action')),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),note text NOT NULL DEFAULT '' CHECK(length(note)<=5000),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,staff_id uuid REFERENCES auth.users(id),status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','done','cancelled')),revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,project_id) REFERENCES public.erp_contracting_documents(cafe_id,id),CHECK(ends_at>=starts_at));
CREATE INDEX erp_contracting_activities_project ON public.erp_contracting_activities(cafe_id,project_id,starts_at);
CREATE TABLE public.erp_contracting_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),document_id uuid,action text NOT NULL,note text NOT NULL DEFAULT '',actor uuid NOT NULL REFERENCES auth.users(id),at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX erp_contracting_events_history ON public.erp_contracting_events(cafe_id,document_id,at DESC);
CREATE TABLE public.erp_contracting_requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,command jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,id));
ALTER TABLE public.erp_contracting_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_contracting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_contracting_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_contracting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_contracting_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_contracting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_contracting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_contracting_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_contracting_invoice_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_contracting_activities,public.erp_contracting_invoice_drafts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.erp_contracting_documents,public.erp_contracting_lines,public.erp_contracting_resources,public.erp_contracting_settings,public.erp_contracting_links,public.erp_contracting_events,public.erp_contracting_requests FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_contracting_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_contracting_requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.contracting_record(p_cafe uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
SELECT d.details||(to_jsonb(d)-'details'-'actor'-'cafe_id')||jsonb_build_object('lines',coalesce((SELECT jsonb_agg((to_jsonb(l)-'cafe_id'-'document_id'-'position')||jsonb_build_object('resources',coalesce((SELECT jsonb_agg(to_jsonb(r)-'cafe_id'-'document_id'-'line_id' ORDER BY r.id) FROM public.erp_contracting_resources r WHERE r.cafe_id=l.cafe_id AND r.document_id=l.document_id AND r.line_id=l.id),'[]'::jsonb)) ORDER BY l.position) FROM public.erp_contracting_lines l WHERE l.cafe_id=d.cafe_id AND l.document_id=d.id),'[]'::jsonb)) FROM public.erp_contracting_documents d WHERE d.cafe_id=p_cafe AND d.id=p_id
$$;
REVOKE ALL ON FUNCTION brand_finance_private.contracting_record(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_contracting(p_cafe_id uuid,p_action text DEFAULT 'read',p_input jsonb DEFAULT '{}',p_request_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
<<erp_contracting>>
DECLARE role_name text; d public.erp_contracting_documents%ROWTYPE; src public.erp_contracting_documents%ROWTYPE; old public.erp_contracting_documents%ROWTYPE; line jsonb; resource jsonb; source_line public.erp_contracting_lines%ROWTYPE; result jsonb; previous jsonb; cmd jsonb; config jsonb; kind_name text; doc_id uuid; source_id uuid; project_id uuid; customer_id uuid; number_code text; next_number bigint; n integer:=0; q numeric; used numeric; amount numeric; cost_total numeric; sub numeric; tax_total numeric; ret numeric; rec numeric; note_text text; payload jsonb; draft_result jsonb; status_name text;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_action='read' THEN
   SELECT settings||jsonb_build_object('revision',revision) INTO config FROM public.erp_contracting_settings WHERE cafe_id=p_cafe_id;
   RETURN jsonb_build_object('documents',coalesce((SELECT jsonb_agg(brand_finance_private.contracting_record(p_cafe_id,id) ORDER BY updated_at DESC) FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id),'[]'::jsonb),'settings',coalesce(config,'{}'::jsonb),'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'cafe_id'-'actor' ORDER BY at DESC) FROM public.erp_contracting_events e WHERE cafe_id=p_cafe_id),'[]'::jsonb),'links',coalesce((SELECT jsonb_agg(to_jsonb(l)-'cafe_id') FROM public.erp_contracting_links l WHERE cafe_id=p_cafe_id),'[]'::jsonb),'activities',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id' ORDER BY starts_at) FROM public.erp_contracting_activities a WHERE cafe_id=p_cafe_id),'[]'::jsonb),'drafts',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id') FROM public.erp_contracting_invoice_drafts a WHERE cafe_id=p_cafe_id AND NOT EXISTS(SELECT 1 FROM public.bf_company_invoices i WHERE i.cafe_id=a.cafe_id AND i.draft_id=a.draft_id)),'[]'::jsonb));
 END IF;
 IF role_name NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>700000 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023';END IF;
 -- Same lock ordering as the invoice issuer and customer credit ledger
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,67131));
 cmd:=jsonb_build_object('action',p_action,'input',p_input);
 SELECT command,result INTO previous,result FROM public.erp_contracting_requests WHERE cafe_id=p_cafe_id AND id=p_request_id;
 IF FOUND THEN IF previous<>cmd THEN RAISE EXCEPTION 'Request changed' USING ERRCODE='40001';END IF;RETURN result;END IF;
 INSERT INTO public.erp_contracting_settings(cafe_id) VALUES(p_cafe_id) ON CONFLICT DO NOTHING;
 SELECT settings INTO config FROM public.erp_contracting_settings WHERE cafe_id=p_cafe_id;
 IF p_action='settings' THEN
  IF role_name<>'owner' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  IF (SELECT revision FROM public.erp_contracting_settings WHERE cafe_id=p_cafe_id) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
  IF coalesce(p_input->>'price_mode','') NOT IN('average','purchase') OR coalesce(p_input->>'alert_mode','') NOT IN('days','percent') OR coalesce((p_input->>'alert_threshold')::numeric,-1) NOT BETWEEN 0 AND (CASE WHEN p_input->>'alert_mode'='percent' THEN 100 ELSE 365 END) OR jsonb_typeof(p_input->'statuses') IS DISTINCT FROM 'array' OR jsonb_typeof(p_input->'fields') IS DISTINCT FROM 'array' OR jsonb_typeof(p_input->'actions') IS DISTINCT FROM 'array' OR length(coalesce(p_input->>'print_footer',''))>3000 THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';END IF;
  FOREACH kind_name IN ARRAY ARRAY['statuses','fields','actions'] LOOP
   IF jsonb_array_length(p_input->kind_name)>50 OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_input->kind_name) x)<>jsonb_array_length(p_input->kind_name) THEN RAISE EXCEPTION 'راجع عناصر الإعدادات' USING ERRCODE='22023';END IF;
   FOR line IN SELECT value FROM jsonb_array_elements(p_input->kind_name) LOOP
    IF (line->>'id')::uuid IS NULL OR length(btrim(coalesce(line->>'name',''))) NOT BETWEEN 1 AND 80 OR jsonb_typeof(line->'active') IS DISTINCT FROM 'boolean' OR (kind_name='statuses' AND (coalesce(line->>'type','') NOT IN('open','closed') OR coalesce(line->>'color','')!~'^#[0-9a-fA-F]{6}$')) OR (kind_name='fields' AND (coalesce(line->>'type','') NOT IN('text','number','date','textarea') OR jsonb_typeof(line->'required') IS DISTINCT FROM 'boolean')) OR (kind_name='actions' AND length(coalesce(line->>'description',''))>500) THEN RAISE EXCEPTION 'راجع تفاصيل عناصر الإعدادات' USING ERRCODE='22023';END IF;
   END LOOP;
  END LOOP;
  FOREACH kind_name IN ARRAY ARRAY['bid','project','cost_sheet','quotation','contract','certificate','work_item'] LOOP IF coalesce((p_input#>>ARRAY['numbering',kind_name])::bigint,0) NOT BETWEEN 1 AND 999999999 THEN RAISE EXCEPTION 'Invalid numbering' USING ERRCODE='22023';END IF;END LOOP;
  UPDATE public.erp_contracting_settings SET settings=p_input-'revision',revision=revision+1 WHERE cafe_id=p_cafe_id RETURNING jsonb_build_object('revision',revision) INTO result;
 ELSE
  doc_id:=(p_input->>'id')::uuid;
  SELECT * INTO old FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND id=doc_id FOR UPDATE;
  IF p_action='save' THEN
   kind_name:=p_input->>'kind';source_id:=nullif(p_input->>'source_id','')::uuid;project_id:=nullif(p_input->>'project_id','')::uuid;customer_id:=nullif(p_input->>'customer_id','')::uuid;
   IF doc_id IS NULL OR kind_name NOT IN('bid','project','cost_sheet','quotation','contract','certificate','work_item') OR coalesce((p_input->>'revision')::integer,-1)<>coalesce(old.revision,0) THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
   IF old.id IS NOT NULL AND (old.kind<>kind_name OR (old.status NOT IN('draft','issued') AND NOT(old.kind IN('project','work_item') AND old.status='active')) OR EXISTS(SELECT 1 FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND source_id=old.id)) THEN RAISE EXCEPTION 'المستند معتمد أو مرتبط بمستند آخر ولا يقبل التعديل' USING ERRCODE='22023';END IF;
   IF customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=customer_id AND kind='customer' AND active) THEN RAISE EXCEPTION 'Invalid customer' USING ERRCODE='22023';END IF;
   IF kind_name<>'work_item' AND customer_id IS NULL THEN RAISE EXCEPTION 'اختر العميل' USING ERRCODE='22023';END IF;
   IF project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_contracting_documents pr WHERE pr.cafe_id=p_cafe_id AND pr.id=erp_contracting.project_id AND pr.kind='project' AND pr.customer_id=erp_contracting.customer_id AND pr.status NOT IN('closed','cancelled')) THEN RAISE EXCEPTION 'راجع المشروع والعميل المرتبط به' USING ERRCODE='22023';END IF;
   IF source_id IS NOT NULL THEN
    SELECT * INTO src FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND id=erp_contracting.source_id;
    IF src.id IS NULL OR src.customer_id IS DISTINCT FROM customer_id OR src.status IN('draft','rejected','cancelled','closed') OR NOT((kind_name='cost_sheet' AND src.kind='bid') OR (kind_name='quotation' AND src.kind='cost_sheet' AND src.status='approved') OR (kind_name='contract' AND src.kind='quotation' AND src.status='approved') OR (kind_name='certificate' AND src.kind='contract' AND src.status='active') OR (kind_name='project' AND src.kind='bid')) THEN RAISE EXCEPTION 'مصدر التحويل أو حالته غير صالح' USING ERRCODE='22023';END IF;
    IF src.project_id IS NOT NULL AND src.project_id IS DISTINCT FROM project_id THEN RAISE EXCEPTION 'المشروع لا يطابق مصدر التحويل' USING ERRCODE='22023';END IF;
   ELSIF kind_name='certificate' THEN RAISE EXCEPTION 'اختر عقدًا نشطًا' USING ERRCODE='22023';END IF;
   IF kind_name='project' AND length(btrim(coalesce(p_input->>'cost_center','')))=0 THEN RAISE EXCEPTION 'أدخل مركز التكلفة' USING ERRCODE='22023';END IF;
   IF project_id=doc_id OR source_id=doc_id THEN RAISE EXCEPTION 'لا يمكن ربط المستند بنفسه' USING ERRCODE='22023';END IF;
   IF jsonb_typeof(p_input->'assigned_users') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'assigned_users')>50 OR jsonb_typeof(p_input->'custom_fields') IS DISTINCT FROM 'object' OR length(coalesce(p_input->>'description',''))>5000 OR coalesce((p_input->>'budget')::numeric,-1) NOT BETWEEN 0 AND 1e9 OR coalesce((p_input->>'duration')::numeric,-1) NOT BETWEEN 0 AND 1e9 OR p_input->>'duration_unit' NOT IN('days','weeks','months','years') THEN RAISE EXCEPTION 'راجع بيانات المشروع' USING ERRCODE='22023';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_input->'assigned_users') u WHERE NOT EXISTS(SELECT 1 FROM public.bf_staff s WHERE s.cafe_id=p_cafe_id AND s.user_id=u::uuid AND s.active) AND NOT EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=p_cafe_id AND c.owner_user_id=u::uuid)) THEN RAISE EXCEPTION 'الموظف غير متاح لهذه العلامة' USING ERRCODE='22023';END IF;
   FOR resource IN SELECT value FROM jsonb_array_elements(coalesce(config->'fields','[]')) LOOP
    IF (resource->>'active')::boolean AND (resource->>'required')::boolean AND length(btrim(coalesce(p_input#>>ARRAY['custom_fields',resource->>'id'],'')))=0 THEN RAISE EXCEPTION 'أكمل حقول المشروع المطلوبة' USING ERRCODE='22023';END IF;
   END LOOP;
   IF nullif(p_input->>'end_date','')::date<nullif(p_input->>'start_date','')::date THEN RAISE EXCEPTION 'تاريخ الانتهاء يسبق البداية' USING ERRCODE='22023';END IF;
   IF jsonb_typeof(p_input->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'lines')>100 OR (kind_name<>'project' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'lines') l WHERE l->>'kind'='work' AND (l->>'quantity')::numeric>0)) THEN RAISE EXCEPTION 'أضف بنود الأعمال والكميات' USING ERRCODE='22023';END IF;
   number_code:=coalesce(old.number,nullif(btrim(p_input->>'number'),''));
   IF number_code IS NULL THEN next_number:=coalesce((config#>>ARRAY['numbering',kind_name])::bigint,1);WHILE EXISTS(SELECT 1 FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND kind=kind_name AND number=lpad(next_number::text,6,'0')) LOOP next_number:=next_number+1;END LOOP;number_code:=lpad(next_number::text,6,'0');UPDATE public.erp_contracting_settings SET settings=jsonb_set(jsonb_set(settings,'{numbering}',coalesce(settings->'numbering','{}'),true),ARRAY['numbering',kind_name],to_jsonb(next_number+1),true) WHERE cafe_id=p_cafe_id;END IF;
   status_name:=CASE WHEN coalesce((p_input->>'draft')::boolean,false) THEN 'draft' WHEN kind_name IN('project','work_item') THEN 'active' ELSE 'issued' END;
   INSERT INTO public.erp_contracting_documents(id,cafe_id,kind,title,number,status,customer_id,project_id,source_id,retention_rate,recovery_rate,advance_amount,details,actor)
   VALUES(doc_id,p_cafe_id,kind_name,p_input->>'title',number_code,status_name,customer_id,project_id,source_id,coalesce((p_input->>'retention_rate')::numeric,0),coalesce((p_input->>'recovery_rate')::numeric,0),coalesce((p_input->>'advance_amount')::numeric,0),p_input-ARRAY['id','kind','title','number','revision','status','customer_id','project_id','source_id','lines','draft','retention_rate','recovery_rate','advance_amount'],auth.uid())
   ON CONFLICT(cafe_id,id) DO UPDATE SET title=excluded.title,status=excluded.status,customer_id=excluded.customer_id,project_id=excluded.project_id,source_id=excluded.source_id,retention_rate=excluded.retention_rate,recovery_rate=excluded.recovery_rate,advance_amount=excluded.advance_amount,details=excluded.details,revision=erp_contracting_documents.revision+1,updated_at=clock_timestamp(),actor=auth.uid();
   DELETE FROM public.erp_contracting_lines WHERE cafe_id=p_cafe_id AND document_id=doc_id;
   FOR line IN SELECT value FROM jsonb_array_elements(p_input->'lines') LOOP
    n:=n+1;
    IF nullif(line->>'parent_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'lines') p WHERE p->>'id'=line->>'parent_id' AND p->>'kind' IN('heading','subheading') AND p->>'id'<>line->>'id') THEN RAISE EXCEPTION 'راجع ترتيب البنود' USING ERRCODE='22023';END IF;
    IF EXISTS(WITH RECURSIVE parents AS(SELECT line->>'id' id,line->>'parent_id' parent,ARRAY[line->>'id'] seen,false cycle UNION ALL SELECT p->>'id',p->>'parent_id',a.seen||(p->>'id'),(p->>'id')=ANY(a.seen) FROM parents a JOIN jsonb_array_elements(p_input->'lines') p ON p->>'id'=a.parent WHERE NOT a.cycle) SELECT 1 FROM parents WHERE cycle) THEN RAISE EXCEPTION 'يوجد ارتباط دائري بين البنود' USING ERRCODE='22023';END IF;
    IF kind_name<>'certificate' AND nullif(line->>'source_line_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_contracting_lines WHERE cafe_id=p_cafe_id AND document_id=erp_contracting.source_id AND id=(line->>'source_line_id')::uuid) THEN RAISE EXCEPTION 'بند المصدر غير متاح' USING ERRCODE='22023';END IF;
    IF kind_name='certificate' AND line->>'kind'='work' THEN
      SELECT * INTO source_line FROM public.erp_contracting_lines WHERE cafe_id=p_cafe_id AND document_id=source_id AND id=(line->>'source_line_id')::uuid AND kind='work';
      IF source_line.id IS NULL THEN RAISE EXCEPTION 'بند المستخلص غير موجود في العقد' USING ERRCODE='22023';END IF;
      line:=line||jsonb_build_object('unit_price',source_line.unit_price,'tax_rate',source_line.tax_rate,'unit',source_line.unit,'name',source_line.name);
    END IF;
    INSERT INTO public.erp_contracting_lines(cafe_id,document_id,id,position,parent_id,source_line_id,kind,name,unit,note,quantity,unit_price,markup,tax_rate) VALUES(p_cafe_id,doc_id,(line->>'id')::uuid,n,nullif(line->>'parent_id','')::uuid,nullif(line->>'source_line_id','')::uuid,line->>'kind',line->>'name',line->>'unit',coalesce(line->>'note',''),(line->>'quantity')::numeric,(line->>'unit_price')::numeric,(line->>'markup')::numeric,(line->>'tax_rate')::numeric);
    IF jsonb_typeof(line->'resources') IS DISTINCT FROM 'array' OR jsonb_array_length(line->'resources')>100 THEN RAISE EXCEPTION 'Invalid resources' USING ERRCODE='22023';END IF;
    FOR resource IN SELECT value FROM jsonb_array_elements(line->'resources') LOOP
      INSERT INTO public.erp_contracting_resources(cafe_id,document_id,line_id,id,item_id,kind,name,unit,consumption,unit_cost) VALUES(p_cafe_id,doc_id,(line->>'id')::uuid,(resource->>'id')::uuid,nullif(resource->>'item_id','')::uuid,resource->>'kind',resource->>'name',resource->>'unit',(resource->>'consumption')::numeric,(resource->>'unit_cost')::numeric);
    END LOOP;
   END LOOP;
   SELECT coalesce(sum(round(quantity*unit_price,2)),0),coalesce(sum(round(round(quantity*unit_price,2)*tax_rate/100,2)),0) INTO sub,tax_total FROM public.erp_contracting_lines WHERE cafe_id=p_cafe_id AND document_id=doc_id AND kind='work';
   SELECT coalesce(sum(round(l.quantity*r.consumption*r.unit_cost,2)),0) INTO cost_total FROM public.erp_contracting_lines l JOIN public.erp_contracting_resources r ON r.cafe_id=l.cafe_id AND r.document_id=l.document_id AND r.line_id=l.id WHERE l.cafe_id=p_cafe_id AND l.document_id=doc_id;
   ret:=0;rec:=0;
   IF kind_name='certificate' THEN ret:=round(sub*src.retention_rate/100,2);SELECT coalesce(sum(recovery),0) INTO used FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND source_id=src.id AND kind='certificate' AND status='approved';rec:=least(round(sub*src.recovery_rate/100,2),greatest(0,src.advance_amount-used));END IF;
   UPDATE public.erp_contracting_documents SET subtotal=sub,tax=tax_total,total=sub+tax_total,cost=cost_total,retention=ret,recovery=rec,net_due=sub+tax_total-ret-rec WHERE cafe_id=p_cafe_id AND id=doc_id;
   IF kind_name='work_item' AND coalesce((p_input->>'is_default')::boolean,false) THEN UPDATE public.erp_contracting_documents SET details=jsonb_set(details,'{is_default}','false'),revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND id<>doc_id AND kind='work_item' AND details->>'is_default'='true';END IF;
   result:=jsonb_build_object('id',doc_id,'revision',coalesce(old.revision,0)+1);
  ELSE
   IF old.id IS NULL THEN RAISE EXCEPTION 'المستند غير متاح' USING ERRCODE='42501';END IF;
   IF old.revision IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
   IF p_action='transition' THEN
    status_name:=p_input->>'status';
    IF NOT((old.status='issued' AND status_name='approved' AND old.kind IN('cost_sheet','quotation','certificate')) OR (old.kind='contract' AND old.status='issued' AND status_name='active') OR (old.kind IN('project','contract') AND old.status='active' AND status_name='closed') OR (old.status='issued' AND status_name='rejected' AND old.kind='quotation') OR (old.status IN('draft','issued','active') AND status_name='cancelled')) THEN RAISE EXCEPTION 'انتقال الحالة غير مسموح' USING ERRCODE='22023';END IF;
    IF status_name='cancelled' AND EXISTS(SELECT 1 FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND source_id=old.id AND status NOT IN('cancelled','rejected')) THEN RAISE EXCEPTION 'يوجد مستند مرتبط يمنع الإلغاء' USING ERRCODE='22023';END IF;
    IF old.kind='certificate' AND status_name='approved' THEN
     SELECT * INTO src FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND id=old.source_id FOR UPDATE;
     IF src.status<>'active' THEN RAISE EXCEPTION 'العقد غير نشط' USING ERRCODE='22023';END IF;
     FOR source_line IN SELECT * FROM public.erp_contracting_lines WHERE cafe_id=p_cafe_id AND document_id=src.id AND kind='work' LOOP
       SELECT coalesce(sum(l.quantity),0) INTO used FROM public.erp_contracting_lines l JOIN public.erp_contracting_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id WHERE d.cafe_id=p_cafe_id AND d.kind='certificate' AND d.source_id=src.id AND (d.status='approved' OR d.id=old.id) AND l.source_line_id=source_line.id;
       IF used>source_line.quantity THEN RAISE EXCEPTION 'كمية المستخلص تتجاوز المتبقي في العقد' USING ERRCODE='22023';END IF;
     END LOOP;
     SELECT coalesce(sum(recovery),0) INTO used FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND source_id=src.id AND kind='certificate' AND status='approved';
     rec:=least(round(old.subtotal*src.recovery_rate/100,2),greatest(0,src.advance_amount-used));
     UPDATE public.erp_contracting_documents SET recovery=rec,net_due=total-retention-rec WHERE cafe_id=p_cafe_id AND id=old.id;
    END IF;
    UPDATE public.erp_contracting_documents SET status=status_name,revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND id=old.id;
    result:=jsonb_build_object('id',old.id);
   ELSIF p_action='delete' THEN
    IF old.status NOT IN('draft','issued') OR old.invoice_draft_id IS NOT NULL THEN RAISE EXCEPTION 'يمكن حذف المستندات غير المعتمدة فقط' USING ERRCODE='22023';END IF;
    DELETE FROM public.erp_contracting_documents WHERE cafe_id=p_cafe_id AND id=old.id;result:=jsonb_build_object('id',old.id,'deleted',true);
   ELSIF p_action='note' THEN
    note_text:=btrim(p_input->>'note');IF length(note_text) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'أدخل الملاحظة' USING ERRCODE='22023';END IF;result:=jsonb_build_object('id',old.id);
   ELSIF p_action='activity' THEN
    IF old.kind<>'project' OR p_input->>'kind' NOT IN('appointment','time','action') OR coalesce(p_input->>'status','') NOT IN('planned','done','cancelled') OR (p_input->>'ends_at')::timestamptz<(p_input->>'starts_at')::timestamptz THEN RAISE EXCEPTION 'راجع بيانات الموعد أو الوقت' USING ERRCODE='22023';END IF;
    IF nullif(p_input->>'staff_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=(p_input->>'staff_id')::uuid AND active) AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=(p_input->>'staff_id')::uuid) THEN RAISE EXCEPTION 'الموظف غير متاح' USING ERRCODE='22023';END IF;
    SELECT to_jsonb(a) INTO previous FROM public.erp_contracting_activities a WHERE cafe_id=p_cafe_id AND id=(p_input->>'activity_id')::uuid;
    IF coalesce((previous->>'revision')::integer,0) IS DISTINCT FROM (p_input->>'activity_revision')::integer OR (previous IS NOT NULL AND previous->>'project_id'<>old.id::text) THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
    INSERT INTO public.erp_contracting_activities(cafe_id,project_id,id,kind,title,note,starts_at,ends_at,staff_id,status) VALUES(p_cafe_id,old.id,(p_input->>'activity_id')::uuid,p_input->>'kind',p_input->>'title',p_input->>'note',(p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,nullif(p_input->>'staff_id','')::uuid,p_input->>'status') ON CONFLICT(cafe_id,id) DO UPDATE SET title=excluded.title,note=excluded.note,starts_at=excluded.starts_at,ends_at=excluded.ends_at,staff_id=excluded.staff_id,status=excluded.status,revision=erp_contracting_activities.revision+1;
    note_text:=p_input->>'title';result:=jsonb_build_object('id',old.id);
   ELSIF p_action='advance' THEN
    IF old.kind<>'project' OR old.status<>'active' THEN RAISE EXCEPTION 'المشروع غير نشط' USING ERRCODE='22023';END IF;
    result:=public.brand_finance_customer_credit(p_cafe_id,'receive',jsonb_build_object('partyId',old.customer_id,'requestId',p_request_id,'accountId',p_input->>'account_id','amount',p_input->'amount','note','دفعة مقدمة للمشروع '||old.number||' — '||coalesce(p_input->>'note','')));
    INSERT INTO public.erp_contracting_links(cafe_id,project_id,document_id,relation,amount) VALUES(p_cafe_id,old.id,(result->>'id')::uuid,'advance_credit',(p_input->>'amount')::numeric) ON CONFLICT DO NOTHING;
    result:=jsonb_build_object('id',old.id,'credit',result);
   ELSIF p_action='project_invoice' THEN
    IF old.kind<>'project' OR old.status<>'active' OR p_input->>'invoice_kind' IS DISTINCT FROM 'invoice' THEN RAISE EXCEPTION 'المشروع غير نشط' USING ERRCODE='22023';END IF;
    amount:=coalesce((p_input->>'amount')::numeric,0);IF amount<=0 OR amount>1e9 OR coalesce((p_input->>'tax_rate')::numeric,-1) NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'أدخل مبلغ الفاتورة والضريبة' USING ERRCODE='22023';END IF;
    payload:=jsonb_build_object('invoice',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('key',1,'productId','','quantity',1,'price',amount,'name',CASE WHEN p_input->>'invoice_kind'='advance' THEN 'دفعة مقدمة — ' ELSE 'أعمال — ' END||old.title,'kind','service','vatRate',(p_input->>'tax_rate')::numeric,'taxCategory',CASE WHEN (p_input->>'tax_rate')::numeric=0 THEN 'O' ELSE 'S' END,'exemptionReason',CASE WHEN (p_input->>'tax_rate')::numeric=0 THEN 'خارج نطاق الضريبة حسب المشروع' ELSE '' END)),'warehouseId','','partyId',old.customer_id,'accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','taxInclusive',false,'note','مشروع مقاولات '||old.number,'currency','SAR','exchangeRate',1),'template','standard','deliveryMethod','print','deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'shipping','none','delivery',jsonb_build_object('confirmed',false,'date',''),'attachments','[]'::jsonb,'extraFields','[]'::jsonb);
    source_id:=gen_random_uuid();PERFORM public.brand_finance_save_invoice_draft(p_cafe_id,source_id,0,payload);INSERT INTO public.erp_contracting_invoice_drafts VALUES(p_cafe_id,old.id,source_id,p_input->>'invoice_kind');result:=jsonb_build_object('id',old.id,'draft_id',source_id);
   ELSIF p_action='invoice' THEN
    IF old.kind<>'certificate' OR old.status<>'approved' OR old.total<=0 THEN RAISE EXCEPTION 'اعتمد المستخلص قبل إنشاء الفاتورة' USING ERRCODE='22023';END IF;
    IF old.invoice_draft_id IS NOT NULL THEN result:=jsonb_build_object('id',old.id,'draft_id',old.invoice_draft_id,'invoice_id',old.invoice_id);
    ELSE
     SELECT jsonb_agg(jsonb_build_object('key',position,'productId','','quantity',quantity,'price',unit_price,'description',note,'name',name,'kind','service','vatRate',tax_rate,'taxCategory',CASE WHEN tax_rate=0 THEN 'O' ELSE 'S' END,'exemptionReason',CASE WHEN tax_rate=0 THEN 'خارج نطاق الضريبة حسب بند العقد' ELSE '' END) ORDER BY position) INTO payload FROM public.erp_contracting_lines WHERE cafe_id=p_cafe_id AND document_id=old.id AND kind='work' AND quantity>0;
     payload:=jsonb_build_object('invoice',jsonb_build_object('lines',payload,'warehouseId','','partyId',old.customer_id,'accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','taxInclusive',false,'note','مستخلص مقاولات '||old.number||' | خصم ضمان الأعمال '||old.retention||' | استرداد الدفعة المقدمة '||old.recovery,'currency','SAR','exchangeRate',1),'template','standard','deliveryMethod','print','deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'shipping','none','delivery',jsonb_build_object('confirmed',false,'date',''),'attachments','[]'::jsonb,'extraFields','[]'::jsonb);
     source_id:=gen_random_uuid();draft_result:=public.brand_finance_save_invoice_draft(p_cafe_id,source_id,0,payload);
     UPDATE public.erp_contracting_documents SET invoice_draft_id=erp_contracting.source_id,revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND id=old.id;
     result:=jsonb_build_object('id',old.id,'draft_id',source_id,'invoice_id',NULL);
    END IF;
   ELSIF p_action='financial' THEN
    IF old.kind<>'project' OR old.status<>'active' OR p_input->>'operation' NOT IN('treasury','settlement','refund','stock_adjust','stock_transfer','journal','purchase') THEN RAISE EXCEPTION 'المعاملة غير متاحة للمشروع' USING ERRCODE='22023';END IF;
    payload:=p_input->'payload';
    IF p_input->>'operation' IN('settlement','refund') AND NOT EXISTS(SELECT 1 FROM public.erp_contracting_links WHERE cafe_id=p_cafe_id AND project_id=old.id AND document_id=(payload->>'documentId')::uuid) THEN RAISE EXCEPTION 'اربط الفاتورة بالمشروع أولًا' USING ERRCODE='22023';END IF;
    result:=public.brand_finance_execute(p_cafe_id,p_input->>'operation',payload,p_request_id);
    source_id:=coalesce(nullif(result->>'id','')::uuid,nullif(result->>'documentId','')::uuid);
    IF source_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=source_id) THEN INSERT INTO public.erp_contracting_links(cafe_id,project_id,document_id,relation) VALUES(p_cafe_id,old.id,source_id,p_input->>'operation') ON CONFLICT DO NOTHING;END IF;
    result:=jsonb_build_object('id',old.id,'financial',result);
   ELSIF p_action='link' THEN
    IF old.kind<>'project' OR NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=(p_input->>'document_id')::uuid) THEN RAISE EXCEPTION 'المعاملة غير متاحة' USING ERRCODE='22023';END IF;
    INSERT INTO public.erp_contracting_links(cafe_id,project_id,document_id,relation) VALUES(p_cafe_id,old.id,(p_input->>'document_id')::uuid,'linked') ON CONFLICT DO NOTHING;result:=jsonb_build_object('id',old.id);
   ELSE RAISE EXCEPTION 'Unknown action' USING ERRCODE='22023';END IF;
  END IF;
 END IF;
 INSERT INTO public.erp_contracting_events(cafe_id,document_id,action,note,actor) VALUES(p_cafe_id,doc_id,p_action||CASE WHEN p_action='transition' THEN ':'||status_name ELSE '' END,coalesce(note_text,''),auth.uid());
 INSERT INTO public.erp_contracting_requests(cafe_id,id,command,result) VALUES(p_cafe_id,p_request_id,cmd,result);
 RETURN result;
END $$;
CREATE FUNCTION brand_finance_private.contracting_invoice_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cert public.erp_contracting_documents%ROWTYPE;actual public.bf_documents%ROWTYPE;expected jsonb;received jsonb;applied numeric;remaining numeric;payment_id uuid;
BEGIN
 SELECT * INTO cert FROM public.erp_contracting_documents WHERE cafe_id=NEW.cafe_id AND invoice_draft_id=NEW.draft_id FOR UPDATE;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM public.erp_contracting_invoice_drafts l JOIN public.erp_contracting_documents p ON p.cafe_id=l.cafe_id AND p.id=l.project_id JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=NEW.document_id WHERE l.cafe_id=NEW.cafe_id AND l.draft_id=NEW.draft_id AND p.customer_id IS DISTINCT FROM d.party_id) THEN RAISE EXCEPTION 'عميل الفاتورة لا يطابق عميل المشروع' USING ERRCODE='22023';END IF;
  INSERT INTO public.erp_contracting_links(cafe_id,project_id,document_id,relation) SELECT cafe_id,project_id,NEW.document_id,CASE WHEN kind='advance' THEN 'advance_invoice' ELSE 'project_invoice' END FROM public.erp_contracting_invoice_drafts WHERE cafe_id=NEW.cafe_id AND draft_id=NEW.draft_id ON CONFLICT DO NOTHING;
  RETURN NEW;
 END IF;
 IF cert.invoice_id IS NOT NULL AND cert.invoice_id<>NEW.document_id THEN RAISE EXCEPTION 'تمت فوترة المستخلص بالفعل' USING ERRCODE='22023';END IF;
 SELECT * INTO actual FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id;
 IF cert.kind<>'certificate' OR cert.status<>'approved' OR actual.party_id IS DISTINCT FROM cert.customer_id OR actual.total<>cert.total OR actual.tax<>cert.tax OR actual.subtotal<>cert.subtotal OR actual.discount<>0 OR (NEW.snapshot->>'currency') IS DISTINCT FROM 'SAR' THEN RAISE EXCEPTION 'يجب أن تطابق فاتورة المستخلص البنود والعميل والقيم المعتمدة' USING ERRCODE='22023';END IF;
 SELECT jsonb_agg(jsonb_build_array(name,quantity,round(unit_price,2),round(quantity*unit_price,2),round(round(quantity*unit_price,2)*tax_rate/100,2)) ORDER BY name,quantity,unit_price) INTO expected FROM public.erp_contracting_lines WHERE cafe_id=cert.cafe_id AND document_id=cert.id AND kind='work' AND quantity>0;
 SELECT jsonb_agg(jsonb_build_array(name,quantity,unit_price,net,tax) ORDER BY name,quantity,unit_price) INTO received FROM public.bf_document_lines WHERE cafe_id=NEW.cafe_id AND document_id=NEW.document_id;
 IF expected IS DISTINCT FROM received THEN RAISE EXCEPTION 'بنود الفاتورة لا تطابق المستخلص المعتمد' USING ERRCODE='22023';END IF;
 applied:=coalesce((NEW.snapshot->>'creditApplied')::numeric,0);remaining:=cert.recovery-applied;
 IF remaining<0 OR coalesce((NEW.snapshot->>'paid')::numeric,0)+remaining>cert.total-cert.retention THEN RAISE EXCEPTION 'الدفعة تتجاوز صافي المستخلص أو مقدار الاسترداد المعتمد' USING ERRCODE='22023';END IF;
 IF remaining>0 THEN
  payment_id:=brand_finance_private.customer_credit_apply(cert.cafe_id,NEW.document_id,remaining);
  NEW.snapshot:=NEW.snapshot||jsonb_build_object('paid',coalesce((NEW.snapshot->>'paid')::numeric,0)+remaining,'creditApplied',cert.recovery,'sar',coalesce(NEW.snapshot->'sar','{}')||jsonb_build_object('paid',coalesce((NEW.snapshot#>>'{sar,paid}')::numeric,0)+remaining,'creditApplied',cert.recovery));
  IF cert.project_id IS NOT NULL THEN INSERT INTO public.erp_contracting_links(cafe_id,project_id,document_id,relation) VALUES(cert.cafe_id,cert.project_id,payment_id,'advance_recovery') ON CONFLICT DO NOTHING;END IF;
 END IF;
 UPDATE public.erp_contracting_documents SET invoice_id=NEW.document_id,revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=cert.cafe_id AND id=cert.id;
 IF cert.project_id IS NOT NULL THEN INSERT INTO public.erp_contracting_links(cafe_id,project_id,document_id,relation) VALUES(cert.cafe_id,cert.project_id,NEW.document_id,'certificate_invoice') ON CONFLICT DO NOTHING;END IF;
 INSERT INTO public.erp_contracting_events(cafe_id,document_id,action,note,actor) VALUES(cert.cafe_id,cert.id,'invoice_issued',actual.number::text,auth.uid());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.contracting_invoice_link() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER erp_contracting_invoice_link BEFORE INSERT ON public.bf_company_invoices FOR EACH ROW EXECUTE FUNCTION brand_finance_private.contracting_invoice_link();
REVOKE ALL ON FUNCTION public.erp_contracting(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_contracting(uuid,text,jsonb,uuid) TO authenticated;
DO $$ BEGIN IF to_regprocedure('erp_file_private.prevent_orphans()') IS NOT NULL THEN CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_contracting_documents FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('contracting_document');END IF;END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
