BEGIN;
CREATE TABLE public.erp_document_templates(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,kind text NOT NULL CHECK(kind~'^[a-z][a-z0-9_-]{0,79}$'),channel text NOT NULL CHECK(channel IN('print','invoice','email','sms','terms','document')),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),layout jsonb NOT NULL CHECK(jsonb_typeof(layout)='object' AND octet_length(layout::text)<=250000),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(cafe_id,id));
CREATE INDEX erp_templates_kind ON public.erp_document_templates(cafe_id,channel,kind);
CREATE UNIQUE INDEX erp_templates_default ON public.erp_document_templates(cafe_id,kind,channel) WHERE layout@>'{"isDefault":true}';
CREATE TABLE public.erp_template_rules(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),template_id uuid NOT NULL,active boolean NOT NULL,revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<15000),PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,template_id) REFERENCES public.erp_document_templates(cafe_id,id));
CREATE INDEX erp_template_rules_template ON public.erp_template_rules(cafe_id,template_id);
CREATE TABLE public.erp_template_deliveries(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL DEFAULT gen_random_uuid(),rule_id uuid,template_id uuid NOT NULL,entity_id uuid NOT NULL,entity text NOT NULL,occurrence text NOT NULL,channel text NOT NULL CHECK(channel IN('email','sms','whatsapp','system')),recipient text NOT NULL,subject text NOT NULL,body text NOT NULL,values jsonb NOT NULL,cc jsonb NOT NULL DEFAULT '[]',bcc jsonb NOT NULL DEFAULT '[]',status text NOT NULL CHECK(status IN('queued','sending','sent','failed','unknown','blocked','cancelled')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),scheduled_at timestamptz NOT NULL,expires_at timestamptz,last_error text NOT NULL DEFAULT '',provider_id text,lease_id uuid,lease_until timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(cafe_id,id),UNIQUE(cafe_id,rule_id,entity_id,occurrence),FOREIGN KEY(cafe_id,template_id) REFERENCES public.erp_document_templates(cafe_id,id));
CREATE INDEX erp_template_due ON public.erp_template_deliveries(cafe_id,status,scheduled_at);
CREATE INDEX erp_template_delivery_template ON public.erp_template_deliveries(cafe_id,template_id);
CREATE TABLE public.erp_template_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid,action text NOT NULL,actor uuid REFERENCES auth.users(id),at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX erp_template_event_tenant ON public.erp_template_events(cafe_id,record_id,at DESC);
CREATE TABLE public.erp_template_requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid NOT NULL,command jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,id));
ALTER TABLE public.erp_document_templates ENABLE ROW LEVEL SECURITY;ALTER TABLE public.erp_template_rules ENABLE ROW LEVEL SECURITY;ALTER TABLE public.erp_template_deliveries ENABLE ROW LEVEL SECURITY;ALTER TABLE public.erp_template_events ENABLE ROW LEVEL SECURITY;ALTER TABLE public.erp_template_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_document_templates,public.erp_template_rules,public.erp_template_deliveries,public.erp_template_events,public.erp_template_requests FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_template_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_template_requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.template_context(c uuid,e text,i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE d jsonb;p jsonb;table_name text;customer uuid;person uuid;person_data jsonb;finance jsonb;booking_data jsonb;
BEGIN
 table_name:=CASE e WHEN 'invoice' THEN 'bf_documents' WHEN 'debit' THEN 'bf_documents' WHEN 'refund' THEN 'bf_documents' WHEN 'quotation' THEN 'bf_quotes' WHEN 'credit_note' THEN 'bf_credit_notes' WHEN 'appointment' THEN 'erp_bookings' WHEN 'work_order' THEN 'erp_work_orders' END;
 IF table_name IS NULL OR to_regclass('public.'||table_name) IS NULL THEN RETURN NULL;END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE cafe_id=$1 AND id=$2',table_name) INTO d USING c,i;
 IF d IS NULL THEN RETURN NULL;END IF;
 IF e='appointment' AND to_regclass('public.erp_booking_lines') IS NOT NULL THEN EXECUTE 'SELECT jsonb_build_object(''starts_at'',min(starts_at),''total'',sum(price*(1+tax_rate/100)),''assigned_to'',(array_agg(staff_id ORDER BY starts_at,position) FILTER(WHERE staff_id IS NOT NULL))[1]) FROM public.erp_booking_lines WHERE cafe_id=$1 AND booking_id=$2' INTO booking_data USING c,i;IF booking_data->>'starts_at' IS NULL THEN RETURN NULL;END IF;d:=d||booking_data;END IF;
 customer:=coalesce(nullif(d->>'party_id',''),nullif(d->>'customer_id',''),nullif(d#>>'{payload,invoice,partyId}',''),nullif(d#>>'{payload,partyId}',''))::uuid;
 SELECT to_jsonb(x) INTO p FROM public.bf_parties x WHERE cafe_id=c AND id=customer AND kind='customer';
 IF e IN('invoice','debit','refund') THEN finance:=brand_finance_private.document_state(c,i);END IF;
 person:=coalesce(nullif(d->>'assigned_to',''),nullif(d#>>'{payload,assigned_to}',''),nullif(d#>>'{assigned_users,0}',''))::uuid;
 IF person IS NOT NULL THEN SELECT jsonb_build_object('name',s.name,'email',u.email,'phone',u.phone) INTO person_data FROM public.bf_staff s JOIN auth.users u ON u.id=s.user_id WHERE s.cafe_id=c AND s.user_id=person AND s.active;END IF;
 RETURN jsonb_build_object('date',coalesce(d->>'date',d->>'starts_at',d#>>'{payload,date}',d->>'created_at'),'created',d->>'created_at','updated',coalesce(d->>'updated_at',d->>'created_at'),'status',coalesce(d->>'status',d#>>'{payload,status}',''),'customer_email',coalesce(p->>'email',''),'customer_phone',coalesce(p->>'phone',''),'employee_email',coalesce(person_data->>'email',''),'employee_phone',coalesce(person_data->>'phone',''),'total',coalesce((d->>'total')::numeric,(d#>>'{totals,total}')::numeric,0),'paid',coalesce((d->>'total')::numeric,0)-coalesce((finance->>'outstanding')::numeric,0),'outstanding',coalesce((finance->>'outstanding')::numeric,0),'values',jsonb_build_object('العلامة',(SELECT name FROM public.cafes WHERE id=c),'العميل',coalesce(p->>'name',''),'رقم_الفاتورة',coalesce(d->>'number',''),'رقم_المستند',coalesce(d->>'number',''),'العنوان',coalesce(d->>'title',d->>'name','مستند'),'التاريخ',coalesce(d->>'date',left(d->>'created_at',10)),'تاريخ_الاستحقاق',coalesce(d->>'due_date',d#>>'{payload,expiryDate}',''),'المبلغ',coalesce(d->>'total',d#>>'{totals,total}','0'),'المدفوع',coalesce(((d->>'total')::numeric-(finance->>'outstanding')::numeric)::text,d->>'paid','0'),'المتبقي',coalesce(finance->>'outstanding','0'),'الوصف',coalesce(d->>'note',d->>'description',''),'الضريبة',coalesce(d->>'tax','0'),'الجوال',coalesce(p->>'phone',''),'البريد',coalesce(p->>'email',''),'الموظف',coalesce(person_data->>'name','')));
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.template_context(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION brand_finance_private.template_enqueue(c uuid,e text,i uuid) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE context jsonb;r public.erp_template_rules%ROWTYPE;t public.erp_document_templates%ROWTYPE;anchor timestamptz;due_at timestamptz;expires timestamptz;span interval;target text;counted integer:=0;inserted integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.erp_template_rules WHERE cafe_id=c AND active AND payload->>'entity'=e) THEN RETURN 0;END IF;
 context:=brand_finance_private.template_context(c,e,i);IF context IS NULL THEN RETURN 0;END IF;
 FOR r IN SELECT * FROM public.erp_template_rules WHERE cafe_id=c AND active AND payload->>'entity'=e LOOP
  SELECT * INTO t FROM public.erp_document_templates WHERE cafe_id=c AND id=r.template_id AND layout@>'{"active":true}';IF NOT FOUND THEN CONTINUE;END IF;
  IF coalesce(r.payload->>'status','')<>'' AND r.payload->>'status'<>context->>'status' THEN UPDATE public.erp_template_deliveries SET status='cancelled',last_error='تغيرت حالة المستند' WHERE cafe_id=c AND rule_id=r.id AND entity_id=i AND status IN('queued','blocked','failed');CONTINUE;END IF;
  IF (r.payload->>'payment'='unpaid' AND (context->>'paid')::numeric>0) OR (r.payload->>'payment'='partial' AND NOT((context->>'paid')::numeric>0 AND (context->>'outstanding')::numeric>0)) OR (r.payload->>'payment'='paid' AND (context->>'outstanding')::numeric>0) THEN UPDATE public.erp_template_deliveries SET status='cancelled',last_error='تغيرت حالة السداد' WHERE cafe_id=c AND rule_id=r.id AND entity_id=i AND status IN('queued','blocked','failed');CONTINUE;END IF;
  anchor:=coalesce(nullif(context->>(r.payload->>'anchor'),'')::timestamptz,clock_timestamp());
  span:=CASE r.payload->>'unit' WHEN 'months' THEN make_interval(months=>(r.payload->>'offset')::integer) WHEN 'days' THEN make_interval(days=>(r.payload->>'offset')::integer) ELSE make_interval(hours=>(r.payload->>'offset')::integer) END;
  due_at:=CASE r.payload->>'timing' WHEN 'before' THEN anchor-span WHEN 'after' THEN anchor+span ELSE anchor END;
  expires:=CASE WHEN (r.payload->>'expires_after')::integer>0 THEN due_at+CASE r.payload->>'expires_unit' WHEN 'months' THEN make_interval(months=>(r.payload->>'expires_after')::integer) WHEN 'days' THEN make_interval(days=>(r.payload->>'expires_after')::integer) ELSE make_interval(hours=>(r.payload->>'expires_after')::integer) END ELSE NULL END;
  target:=coalesce(context->>((r.payload->>'recipient')||CASE WHEN r.payload->>'channel'='email' THEN '_email' ELSE '_phone' END),'');
  UPDATE public.erp_template_deliveries SET status='cancelled',last_error='تغير موعد المستند' WHERE cafe_id=c AND rule_id=r.id AND entity_id=i AND occurrence<>anchor::text AND status IN('queued','blocked','failed');
  INSERT INTO public.erp_template_deliveries(cafe_id,rule_id,template_id,entity_id,entity,occurrence,channel,recipient,subject,body,values,cc,bcc,status,scheduled_at,expires_at,last_error)
  VALUES(c,r.id,t.id,i,e,anchor::text,r.payload->>'channel',target,t.layout->>'subject',t.layout->>'body',context->'values',coalesce(t.layout->'cc','[]'),coalesce(t.layout->'bcc','[]')||CASE WHEN t.layout@>'{"bccSelf":true}' AND nullif(t.layout->>'bccSelfEmail','') IS NOT NULL THEN jsonb_build_array(t.layout->>'bccSelfEmail') ELSE '[]'::jsonb END,CASE WHEN target='' AND r.payload->>'channel'<>'system' THEN 'blocked' ELSE 'queued' END,due_at,expires,CASE WHEN target='' AND r.payload->>'channel'<>'system' THEN 'بيانات المستلم غير متاحة' ELSE '' END) ON CONFLICT(cafe_id,rule_id,entity_id,occurrence) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;counted:=counted+inserted;
 END LOOP;RETURN counted;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.template_enqueue(uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_templates(p_cafe_id uuid,p_action text DEFAULT 'read',p_input jsonb DEFAULT '{}',p_request_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;prior public.erp_template_requests%ROWTYPE;t public.erp_document_templates%ROWTYPE;r public.erp_template_rules%ROWTYPE;cmd jsonb;answer jsonb;layout_data jsonb;row jsonb;doc_id uuid;draft_id uuid;old_revision integer;channel_name text;entity_name text;new_revision integer;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_action='templates' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id' ORDER BY updated_at DESC) FROM public.erp_document_templates x WHERE cafe_id=p_cafe_id AND (nullif(p_input->>'kind','') IS NULL OR kind=p_input->>'kind')),'[]'::jsonb);END IF;
 IF p_action='read' THEN RETURN jsonb_build_object('templates',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id' ORDER BY updated_at DESC) FROM public.erp_document_templates x WHERE cafe_id=p_cafe_id),'[]'::jsonb),'rules',coalesce((SELECT jsonb_agg(payload||jsonb_build_object('revision',revision)) FROM public.erp_template_rules WHERE cafe_id=p_cafe_id),'[]'::jsonb),'deliveries',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'-'lease_id'-'lease_until'-'values'-'cc'-'bcc' ORDER BY created_at DESC) FROM (SELECT * FROM public.erp_template_deliveries WHERE cafe_id=p_cafe_id ORDER BY created_at DESC LIMIT 300) x),'[]'::jsonb));END IF;
 IF role_name NOT IN('owner','manager','accountant') OR p_request_id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>300000 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,67152));cmd:=jsonb_build_object('action',p_action,'input',p_input);
 SELECT * INTO prior FROM public.erp_template_requests WHERE cafe_id=p_cafe_id AND id=p_request_id;IF FOUND THEN IF prior.command<>cmd THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;RETURN prior.result;END IF;
 doc_id:=nullif(p_input->>'id','')::uuid;
 IF p_action='save' THEN
  SELECT * INTO t FROM public.erp_document_templates WHERE cafe_id=p_cafe_id AND id=doc_id FOR UPDATE;
  IF coalesce(t.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer OR (t.id IS NOT NULL AND (t.kind<>p_input->>'kind' OR t.channel<>p_input->>'channel')) THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
  layout_data:=p_input->'layout';IF layout_data@>'{"bccSelf":true}' THEN layout_data:=layout_data||jsonb_build_object('bccSelfEmail',(SELECT email FROM auth.users WHERE id=auth.uid()));ELSE layout_data:=layout_data-'bccSelfEmail';END IF;
  IF jsonb_typeof(layout_data) IS DISTINCT FROM 'object' OR coalesce((layout_data->>'fontSize')::numeric,0) NOT BETWEEN 6 AND 40 OR coalesce((layout_data->>'margin')::numeric,-1) NOT BETWEEN 0 AND 50 OR coalesce((layout_data->>'width')::numeric,0) NOT BETWEEN 20 AND 420 OR coalesce((layout_data->>'height')::numeric,0) NOT BETWEEN 10 AND 594 OR coalesce(layout_data->>'paper','') NOT IN('A4','A3','A5','thermal','custom') OR coalesce(layout_data->>'language','') NOT IN('ar','en') OR coalesce(layout_data->>'font','') NOT IN('Tajawal','Arial','Tahoma','Verdana') OR coalesce(layout_data->>'orientation','') NOT IN('portrait','landscape') OR coalesce(layout_data->>'accent','')!~'^#[0-9a-fA-F]{6}$' OR coalesce(layout_data->>'tableStyle','') NOT IN('lines','striped','plain') OR length(coalesce(layout_data->>'body',''))>150000 OR length(coalesce(layout_data->>'footer',''))>5000 THEN RAISE EXCEPTION 'راجع مقاس الورق وتنسيق القالب' USING ERRCODE='22023';END IF;
  FOREACH channel_name IN ARRAY ARRAY['active','isDefault','showTable','showHeader','bccSelf'] LOOP IF jsonb_typeof(layout_data->channel_name) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid flags' USING ERRCODE='22023';END IF;END LOOP;
  FOREACH channel_name IN ARRAY ARRAY['cc','bcc','columns','invoiceLines'] LOOP IF jsonb_typeof(layout_data->channel_name) IS DISTINCT FROM 'array' OR jsonb_array_length(layout_data->channel_name)>100 THEN RAISE EXCEPTION 'Invalid list' USING ERRCODE='22023';END IF;END LOOP;
  FOR row IN SELECT value FROM jsonb_array_elements(layout_data->'invoiceLines') LOOP IF length(btrim(coalesce(row->>'name',''))) NOT BETWEEN 1 AND 160 OR coalesce((row->>'quantity')::numeric,0) NOT BETWEEN 0.001 AND 9999 OR coalesce((row->>'price')::numeric,-1) NOT BETWEEN 0 AND 1e9 OR coalesce((row->>'vatRate')::numeric,-1) NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'راجع بنود قالب الفاتورة' USING ERRCODE='22023';END IF;END LOOP;
  IF (layout_data->>'isDefault')::boolean THEN UPDATE public.erp_document_templates SET layout=jsonb_set(layout,'{isDefault}','false'),revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND kind=p_input->>'kind' AND channel=p_input->>'channel' AND id<>doc_id AND layout@>'{"isDefault":true}';END IF;
  INSERT INTO public.erp_document_templates(cafe_id,id,kind,channel,name,layout) VALUES(p_cafe_id,doc_id,p_input->>'kind',p_input->>'channel',p_input->>'name',layout_data) ON CONFLICT(cafe_id,id) DO UPDATE SET name=excluded.name,layout=excluded.layout,revision=erp_document_templates.revision+1,updated_at=clock_timestamp() RETURNING revision INTO new_revision;
  IF NOT (layout_data->>'active')::boolean THEN UPDATE public.erp_template_deliveries SET status='cancelled',last_error='تم تعطيل القالب' WHERE cafe_id=p_cafe_id AND template_id=doc_id AND status IN('queued','blocked','failed');END IF;
  answer:=jsonb_build_object('id',doc_id,'revision',new_revision);
 ELSIF p_action='delete' THEN
  DELETE FROM public.erp_document_templates WHERE cafe_id=p_cafe_id AND id=doc_id AND revision=(p_input->>'revision')::integer RETURNING revision INTO new_revision;IF new_revision IS NULL THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;answer:=jsonb_build_object('id',doc_id,'revision',new_revision);
 ELSIF p_action='rule' THEN
  SELECT * INTO r FROM public.erp_template_rules WHERE cafe_id=p_cafe_id AND id=doc_id FOR UPDATE;
  IF coalesce(r.revision,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
  SELECT * INTO t FROM public.erp_document_templates WHERE cafe_id=p_cafe_id AND id=(p_input->>'template_id')::uuid;
  IF t.id IS NULL OR (p_input->>'channel'='email' AND t.channel<>'email') OR (p_input->>'channel' IN('sms','whatsapp','system') AND t.channel NOT IN('sms','email')) THEN RAISE EXCEPTION 'اختر قالبًا مناسبًا لطريقة الإرسال' USING ERRCODE='22023';END IF;
  IF coalesce(p_input->>'entity','') NOT IN('invoice','appointment','work_order','refund','debit','quotation','credit_note') OR coalesce(p_input->>'channel','') NOT IN('email','sms','whatsapp','system') OR coalesce(p_input->>'recipient','') NOT IN('customer','employee') OR coalesce(p_input->>'anchor','') NOT IN('created','date','updated') OR coalesce(p_input->>'timing','') NOT IN('immediate','before','after') OR coalesce(p_input->>'payment','') NOT IN('any','unpaid','partial','paid') OR coalesce(p_input->>'unit','') NOT IN('hours','days','months') OR coalesce(p_input->>'expires_unit','') NOT IN('hours','days','months') OR coalesce((p_input->>'offset')::integer,-1) NOT BETWEEN 0 AND 8760 OR coalesce((p_input->>'expires_after')::integer,-1) NOT BETWEEN 0 AND 8760 OR jsonb_typeof(p_input->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع توقيت القاعدة وطريقة الإرسال' USING ERRCODE='22023';END IF;
  INSERT INTO public.erp_template_rules(cafe_id,id,name,template_id,active,payload) VALUES(p_cafe_id,doc_id,p_input->>'name',t.id,(p_input->>'active')::boolean,p_input) ON CONFLICT(cafe_id,id) DO UPDATE SET name=excluded.name,template_id=excluded.template_id,active=excluded.active,payload=excluded.payload,revision=erp_template_rules.revision+1 RETURNING revision INTO new_revision;
  IF NOT (p_input->>'active')::boolean THEN UPDATE public.erp_template_deliveries SET status='cancelled',last_error='تم تعطيل قاعدة الإرسال' WHERE cafe_id=p_cafe_id AND rule_id=doc_id AND status IN('queued','failed','blocked');END IF;
  answer:=jsonb_build_object('id',doc_id,'revision',new_revision);
 ELSIF p_action='rule_delete' THEN
  DELETE FROM public.erp_template_rules WHERE cafe_id=p_cafe_id AND id=doc_id AND revision=(p_input->>'revision')::integer RETURNING revision INTO new_revision;IF new_revision IS NULL THEN RAISE EXCEPTION 'Conflict' USING ERRCODE='40001';END IF;
  UPDATE public.erp_template_deliveries SET status='cancelled',last_error='تم حذف قاعدة الإرسال' WHERE cafe_id=p_cafe_id AND rule_id=doc_id AND status IN('queued','failed','blocked');answer:=jsonb_build_object('id',doc_id,'revision',new_revision);
 ELSIF p_action='enqueue' THEN
  answer:=jsonb_build_object('queued',brand_finance_private.template_enqueue(p_cafe_id,p_input->>'entity',(p_input->>'entity_id')::uuid));
 ELSIF p_action='retry' THEN
  UPDATE public.erp_template_deliveries SET status='queued',scheduled_at=clock_timestamp(),last_error='' WHERE cafe_id=p_cafe_id AND id=doc_id AND status IN('failed','blocked') AND attempts<5 AND (expires_at IS NULL OR expires_at>now()) AND EXISTS(SELECT 1 FROM public.erp_template_rules WHERE cafe_id=p_cafe_id AND id=rule_id AND active);IF NOT FOUND THEN RAISE EXCEPTION 'لا يمكن إعادة هذه الرسالة أو انتهت صلاحيتها' USING ERRCODE='22023';END IF;answer:=jsonb_build_object('id',doc_id);
 ELSIF p_action='cancel' THEN
  UPDATE public.erp_template_deliveries SET status='cancelled',last_error='إلغاء بواسطة المستخدم' WHERE cafe_id=p_cafe_id AND id=doc_id AND status IN('queued','failed','blocked','unknown');IF NOT FOUND THEN RAISE EXCEPTION 'الرسالة أرسلت أو قيد المعالجة' USING ERRCODE='22023';END IF;answer:=jsonb_build_object('id',doc_id);
 ELSIF p_action='invoice' THEN
  SELECT * INTO t FROM public.erp_document_templates WHERE cafe_id=p_cafe_id AND id=doc_id AND channel='invoice' AND layout@>'{"active":true}';IF t.id IS NULL OR jsonb_array_length(t.layout->'invoiceLines')=0 OR NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=(p_input->>'customer_id')::uuid AND kind='customer' AND active) THEN RAISE EXCEPTION 'اختر العميل وقالب فاتورة يحتوي على بنود' USING ERRCODE='22023';END IF;
  SELECT jsonb_agg(jsonb_build_object('key',ord,'productId','','name',v->>'name','description',v->>'description','kind','service','quantity',v->'quantity','price',v->'price','vatRate',v->'vatRate','taxCategory',CASE WHEN (v->>'vatRate')::numeric=0 THEN 'O' ELSE 'S' END,'exemptionReason',CASE WHEN (v->>'vatRate')::numeric=0 THEN 'خارج نطاق الضريبة حسب القالب' ELSE '' END)) INTO layout_data FROM jsonb_array_elements(t.layout->'invoiceLines') WITH ORDINALITY AS j(v,ord);
  layout_data:=jsonb_build_object('invoice',jsonb_build_object('lines',layout_data,'warehouseId','','partyId',p_input->>'customer_id','accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','taxInclusive',false,'note',left(t.layout->>'footer',500)),'template','standard','deliveryMethod','print','deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'shipping','none','delivery',jsonb_build_object('confirmed',false,'date',''),'attachments','[]'::jsonb,'extraFields','[]'::jsonb);
  draft_id:=gen_random_uuid();PERFORM public.brand_finance_save_invoice_draft(p_cafe_id,draft_id,0,layout_data);answer:=jsonb_build_object('id',doc_id,'draftId',draft_id);
 ELSE RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023';END IF;
 INSERT INTO public.erp_template_events(cafe_id,record_id,action,actor) VALUES(p_cafe_id,doc_id,p_action,auth.uid());INSERT INTO public.erp_template_requests VALUES(p_cafe_id,p_request_id,cmd,answer);RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.erp_templates(uuid,text,jsonb,uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.erp_templates(uuid,text,jsonb,uuid) TO authenticated;

CREATE FUNCTION brand_finance_private.template_claim_jobs(p_cafe uuid,p_limit integer) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d public.erp_template_deliveries%ROWTYPE;r public.erp_template_rules%ROWTYPE;t public.erp_document_templates%ROWTYPE;context jsonb;target text;answer jsonb:='[]';anchor timestamptz;
BEGIN
 UPDATE public.erp_template_deliveries SET status='unknown',last_error='انتهت مهلة تأكيد المزوّد ولن يكرر الإرسال تلقائيًا',lease_id=NULL,lease_until=NULL WHERE (p_cafe IS NULL OR cafe_id=p_cafe) AND status='sending' AND lease_until<now();
 UPDATE public.erp_template_deliveries SET status='cancelled',last_error='انتهت صلاحية الرسالة' WHERE (p_cafe IS NULL OR cafe_id=p_cafe) AND status IN('queued','blocked','failed') AND expires_at<now();
 FOR d IN SELECT * FROM public.erp_template_deliveries WHERE (p_cafe IS NULL OR cafe_id=p_cafe) AND status='queued' AND scheduled_at<=now() AND attempts<5 ORDER BY scheduled_at LIMIT greatest(1,least(p_limit,20)) FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   SELECT * INTO r FROM public.erp_template_rules WHERE cafe_id=d.cafe_id AND id=d.rule_id AND active;
   SELECT * INTO t FROM public.erp_document_templates WHERE cafe_id=d.cafe_id AND id=d.template_id AND layout@>'{"active":true}';
   IF r.id IS NULL OR t.id IS NULL THEN UPDATE public.erp_template_deliveries SET status='cancelled',last_error='القالب أو القاعدة غير نشطة' WHERE cafe_id=d.cafe_id AND id=d.id;CONTINUE;END IF;
   context:=brand_finance_private.template_context(d.cafe_id,d.entity,d.entity_id);
   anchor:=nullif(context->>(r.payload->>'anchor'),'')::timestamptz;
   IF context IS NULL OR (coalesce(r.payload->>'status','')<>'' AND r.payload->>'status'<>context->>'status') OR (r.payload->>'payment'='unpaid' AND (context->>'paid')::numeric>0) OR (r.payload->>'payment'='partial' AND NOT((context->>'paid')::numeric>0 AND (context->>'outstanding')::numeric>0)) OR (r.payload->>'payment'='paid' AND (context->>'outstanding')::numeric>0) OR (anchor IS NOT NULL AND anchor IS DISTINCT FROM d.occurrence::timestamptz) THEN
    UPDATE public.erp_template_deliveries SET status='cancelled',last_error='لم تعد شروط الإرسال مطابقة لحالة المستند الحالية' WHERE cafe_id=d.cafe_id AND id=d.id;CONTINUE;
   END IF;
   target:=coalesce(context->>((r.payload->>'recipient')||CASE WHEN d.channel='email' THEN '_email' ELSE '_phone' END),'');
   IF target='' AND d.channel<>'system' THEN UPDATE public.erp_template_deliveries SET status='blocked',last_error='بيانات المستلم غير متاحة' WHERE cafe_id=d.cafe_id AND id=d.id;CONTINUE;END IF;
   UPDATE public.erp_template_deliveries SET status='sending',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '5 minutes',recipient=target,values=context->'values' WHERE cafe_id=d.cafe_id AND id=d.id RETURNING * INTO d;
   answer:=answer||jsonb_build_array(to_jsonb(d));
  EXCEPTION WHEN OTHERS THEN
   UPDATE public.erp_template_deliveries SET status='blocked',last_error='تعذر التحقق من حالة المستند الحالية' WHERE cafe_id=d.cafe_id AND id=d.id;
  END;
 END LOOP;RETURN answer;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.template_claim_jobs(uuid,integer) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.erp_template_claim(p_cafe_id uuid,p_limit integer DEFAULT 10) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 answer:=brand_finance_private.template_claim_jobs(p_cafe_id,p_limit);RETURN coalesce((SELECT jsonb_agg(value-'cafe_id') FROM jsonb_array_elements(answer)),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.erp_template_claim(uuid,integer) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.erp_template_claim(uuid,integer) TO authenticated;
CREATE FUNCTION public.erp_template_finish(p_cafe_id uuid,p_id uuid,p_lease uuid,p_status text,p_error text DEFAULT '',p_provider_id text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN('sent','failed','unknown','blocked') THEN RAISE EXCEPTION 'Invalid delivery state';END IF;
 UPDATE public.erp_template_deliveries SET status=p_status,last_error=left(coalesce(p_error,''),300),provider_id=left(p_provider_id,200),lease_id=NULL,lease_until=NULL WHERE cafe_id=p_cafe_id AND id=p_id AND lease_id=p_lease AND status='sending';RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.erp_template_finish(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.erp_template_finish(uuid,uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION brand_finance_private.template_source_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb:=to_jsonb(NEW);c uuid;target uuid;entity_name text;payment_doc jsonb;
BEGIN
 c:=(row_data->>'cafe_id')::uuid;target:=coalesce(nullif(row_data->>'document_id',''),nullif(row_data->>'id',''))::uuid;
 entity_name:=CASE TG_TABLE_NAME WHEN 'bf_company_invoices' THEN CASE WHEN row_data#>>'{snapshot,documentType}'='debit' THEN 'debit' ELSE 'invoice' END WHEN 'erp_bookings' THEN 'appointment' WHEN 'erp_booking_lines' THEN 'appointment' WHEN 'bf_quotes' THEN 'quotation' WHEN 'bf_credit_notes' THEN 'credit_note' WHEN 'erp_work_orders' THEN 'work_order' WHEN 'bf_documents' THEN CASE WHEN row_data->>'kind'='refund' THEN 'refund' WHEN row_data->>'kind'='settlement' THEN 'invoice' END END;
 IF TG_TABLE_NAME='erp_booking_lines' THEN target:=(row_data->>'booking_id')::uuid;END IF;
 IF TG_TABLE_NAME='bf_invoice_payments' THEN
  SELECT to_jsonb(d) INTO payment_doc FROM public.bf_documents d WHERE d.cafe_id=c AND d.id=(row_data->>'source_id')::uuid;
  target:=CASE WHEN payment_doc->>'kind'='settlement' THEN (payment_doc->>'reference_id')::uuid ELSE (payment_doc->>'id')::uuid END;
  IF payment_doc->>'kind' IN('sale','settlement') THEN entity_name:=CASE WHEN brand_finance_private.document_state(c,target)->>'document_type'='debit' THEN 'debit' ELSE 'invoice' END;END IF;
 END IF;
 IF TG_TABLE_NAME='bf_documents' AND row_data->>'kind'='settlement' THEN target:=(row_data->>'reference_id')::uuid;END IF;
 IF entity_name IS NOT NULL AND target IS NOT NULL THEN PERFORM brand_finance_private.template_enqueue(c,entity_name,target);END IF;RETURN NEW;
EXCEPTION WHEN OTHERS THEN INSERT INTO public.erp_template_events(cafe_id,record_id,action,actor) VALUES(c,target,'enqueue_failed:'||SQLSTATE,auth.uid());RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.template_source_event() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tbl text;BEGIN FOREACH tbl IN ARRAY ARRAY['bf_company_invoices','bf_documents','bf_invoice_payments','erp_bookings','erp_booking_lines','bf_quotes','bf_credit_notes','erp_work_orders'] LOOP IF to_regclass('public.'||tbl) IS NOT NULL THEN IF tbl='bf_documents' THEN EXECUTE format('CREATE CONSTRAINT TRIGGER erp_template_event AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION brand_finance_private.template_source_event()',tbl);ELSE EXECUTE format('CREATE TRIGGER erp_template_event AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_finance_private.template_source_event()',tbl);END IF;END IF;END LOOP;END $$;
CREATE OR REPLACE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tbl text;found_record boolean;r text;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجل الدخول أولًا' USING ERRCODE='42501';END IF;r:=brand_finance_private.role_for(p_cafe);
 IF NOT coalesce(r IN('owner','manager','accountant','auditor') OR (r='warehouse' AND p_type LIKE 'manufacturing_%'),false) OR (p_write AND NOT(r IN('owner','manager') OR (r='accountant' AND (p_type IN('contracting_document','asset','document_template') OR p_type LIKE 'manufacturing_%')) OR (r='warehouse' AND p_type LIKE 'manufacturing_%'))) THEN RAISE EXCEPTION 'لا تملك صلاحية الوصول إلى مرفقات هذا السجل' USING ERRCODE='42501';END IF;
 tbl:=CASE p_type WHEN 'task' THEN 'erp_tasks' WHEN 'task_flow' THEN 'erp_task_flows' WHEN 'manufacturing_order' THEN 'erp_mfg_orders' WHEN 'manufacturing_plan' THEN 'erp_mfg_plans' WHEN 'manufacturing_bom' THEN 'erp_mfg_boms' WHEN 'manufacturing_workstation' THEN 'erp_mfg_workstations' WHEN 'manufacturing_routing' THEN 'erp_mfg_routings' WHEN 'manufacturing_overhead' THEN 'erp_mfg_overheads' WHEN 'booking' THEN 'erp_bookings' WHEN 'contracting_document' THEN 'erp_contracting_documents' WHEN 'asset' THEN 'erp_assets' WHEN 'document_template' THEN 'erp_document_templates' END;
 IF tbl IS NULL OR to_regclass('public.'||tbl) IS NULL OR p_record IS NULL THEN RAISE EXCEPTION 'نوع السجل غير متاح للمرفقات' USING ERRCODE='22023';END IF;
 IF p_write THEN EXECUTE format('SELECT true FROM public.%I WHERE cafe_id=$1 AND id=$2 FOR KEY SHARE',tbl) INTO found_record USING p_cafe,p_record;ELSE EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id=$2)',tbl) INTO found_record USING p_cafe,p_record;END IF;
 IF NOT coalesce(found_record,false) THEN RAISE EXCEPTION 'السجل غير موجود في هذه العلامة' USING ERRCODE='42501';END IF;
END $$;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_document_templates FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('document_template');
ALTER TABLE public.erp_files DROP CONSTRAINT erp_files_mime_check;
ALTER TABLE public.erp_files ADD CONSTRAINT erp_files_mime_check CHECK(mime IN('image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR (entity_type='document_template' AND mime IN('text/csv','text/plain','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')));
UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/csv','text/plain','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] WHERE id='erp-record-files';
CREATE OR REPLACE FUNCTION public.erp_file(p_cafe_id uuid,p_action text,p_type text,p_record_id uuid,p_id uuid DEFAULT NULL,p_metadata jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.erp_files; result jsonb; suffix text;
BEGIN
 PERFORM erp_file_private.assert_record(p_cafe_id,p_type,p_record_id,p_action IN('prepare','complete','remove'));
 IF p_action='list' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'-'created_by'-'sha256' ORDER BY created_at) FROM public.erp_files x WHERE cafe_id=p_cafe_id AND entity_type=p_type AND record_id=p_record_id),'[]'); END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'معرف الملف مطلوب' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO f FROM public.erp_files WHERE id=p_id FOR UPDATE;
 IF FOUND AND (f.cafe_id<>p_cafe_id OR f.entity_type<>p_type OR f.record_id<>p_record_id) THEN RAISE EXCEPTION 'الملف غير متاح' USING ERRCODE='42501'; END IF;
 IF p_action='prepare' THEN
  IF p_type<>'document_template' AND p_metadata->>'mime' IN('text/csv','text/plain','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') THEN RAISE EXCEPTION 'نوع الملف غير مسموح لهذا السجل' USING ERRCODE='22023';END IF;
  IF f.id IS NOT NULL THEN
   IF f.sha256 IS DISTINCT FROM p_metadata->>'sha256' OR f.size_bytes IS DISTINCT FROM (p_metadata->>'size')::integer OR f.name IS DISTINCT FROM p_metadata->>'name' OR f.mime IS DISTINCT FROM p_metadata->>'mime' OR f.created_by<>auth.uid() THEN RAISE EXCEPTION 'معرف الملف مستخدم لمحتوى آخر' USING ERRCODE='22023'; END IF;
   RETURN to_jsonb(f)-'cafe_id'-'created_by';
  END IF;
  suffix:=CASE p_metadata->>'mime' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'application/pdf' THEN 'pdf' WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx' WHEN 'text/csv' THEN 'csv' WHEN 'text/plain' THEN 'txt' WHEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' THEN 'xlsx' END;
  IF suffix IS NULL THEN RAISE EXCEPTION 'نوع الملف غير مسموح' USING ERRCODE='22023'; END IF;
  INSERT INTO public.erp_files(id,cafe_id,entity_type,record_id,name,mime,size_bytes,sha256,path,created_by) VALUES(p_id,p_cafe_id,p_type,p_record_id,p_metadata->>'name',p_metadata->>'mime',(p_metadata->>'size')::integer,p_metadata->>'sha256',p_cafe_id::text||'/'||p_id::text||'.'||suffix,auth.uid()) RETURNING * INTO f;
 ELSIF f.id IS NULL THEN RAISE EXCEPTION 'الملف غير موجود' USING ERRCODE='22023';
 ELSIF p_action='complete' THEN
  IF f.created_by<>auth.uid() THEN RAISE EXCEPTION 'لا تملك صلاحية إكمال هذا الرفع' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='erp-record-files' AND name=f.path AND (metadata->>'size')::bigint=f.size_bytes AND metadata->>'mimetype'=f.mime) THEN RAISE EXCEPTION 'لم يكتمل رفع الملف' USING ERRCODE='22023'; END IF;
  UPDATE public.erp_files SET uploaded=true WHERE id=p_id RETURNING * INTO f;
 ELSIF p_action='remove' THEN
  -- Physical Storage deletion is performed through its API before removing the link.
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='erp-record-files' AND name=f.path) THEN RAISE EXCEPTION 'أكمل حذف الملف من التخزين أولًا' USING ERRCODE='22023'; END IF;
  DELETE FROM public.erp_files WHERE id=p_id;
 ELSIF p_action<>'get' THEN RAISE EXCEPTION 'إجراء ملف غير معروف' USING ERRCODE='22023'; END IF;
 RETURN to_jsonb(f)-'cafe_id'-'created_by';
END $$;

CREATE FUNCTION public.erp_template_claim_due(p_limit integer DEFAULT 5) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN brand_finance_private.template_claim_jobs(NULL,greatest(1,least(p_limit,5)));END $$;
REVOKE ALL ON FUNCTION public.erp_template_claim_due(integer) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.erp_template_claim_due(integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
