BEGIN;
CREATE SCHEMA erp_work_private;
REVOKE ALL ON SCHEMA erp_work_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_work_order_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,value jsonb NOT NULL CHECK(jsonb_typeof(value)='object'));
CREATE TABLE public.erp_work_orders(
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 80),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 customer_id uuid,start_date date NOT NULL,end_date date,description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),tags text[] NOT NULL DEFAULT '{}',staff_ids uuid[] NOT NULL DEFAULT '{}',
 budget numeric(16,2) NOT NULL CHECK(budget BETWEEN 0 AND 1000000000 AND budget<>'NaN'),budget_mode text NOT NULL CHECK(budget_mode IN('expense','invoice')),status text NOT NULL,draft boolean NOT NULL DEFAULT false,
 custom_values jsonb NOT NULL DEFAULT '{}',revision integer NOT NULL DEFAULT 1,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,code),FOREIGN KEY(cafe_id,customer_id) REFERENCES public.bf_parties(cafe_id,id),CHECK(end_date IS NULL OR end_date>=start_date),CHECK(cardinality(tags)<=20 AND cardinality(staff_ids)<=100)
);
CREATE INDEX erp_work_orders_customer ON public.erp_work_orders(cafe_id,customer_id);
CREATE INDEX erp_work_orders_list ON public.erp_work_orders(cafe_id,updated_at DESC,id);
CREATE TABLE public.erp_work_order_links(cafe_id uuid NOT NULL,order_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('document','quotation','credit_note','task')),target_id uuid NOT NULL,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,kind,target_id),FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_work_orders(cafe_id,id));
CREATE INDEX erp_work_order_links_order ON public.erp_work_order_links(cafe_id,order_id);
CREATE TABLE public.erp_work_order_drafts(cafe_id uuid NOT NULL,order_id uuid NOT NULL,draft_id uuid NOT NULL,PRIMARY KEY(cafe_id,draft_id),FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_work_orders(cafe_id,id),FOREIGN KEY(draft_id) REFERENCES public.bf_invoice_drafts(id));
CREATE INDEX erp_work_order_drafts_order ON public.erp_work_order_drafts(cafe_id,order_id);
CREATE TABLE public.erp_work_order_activities(id uuid PRIMARY KEY,cafe_id uuid NOT NULL,order_id uuid NOT NULL,title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),note text NOT NULL CHECK(length(note)<=20000),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,staff_ids uuid[] NOT NULL,status text NOT NULL CHECK(status IN('planned','done','cancelled')),action_id uuid,shared boolean NOT NULL DEFAULT false,series_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_work_orders(cafe_id,id),CHECK(ends_at>starts_at),CHECK(cardinality(staff_ids)<=100));
CREATE INDEX erp_work_order_activities_order ON public.erp_work_order_activities(cafe_id,order_id,starts_at);
CREATE TABLE public.erp_work_order_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),order_id uuid,action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',actor uuid NOT NULL REFERENCES auth.users(id),at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_work_order_events_order ON public.erp_work_order_events(cafe_id,order_id,at DESC);
CREATE TABLE public.erp_work_order_requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_work_order_settings','erp_work_orders','erp_work_order_links','erp_work_order_drafts','erp_work_order_activities','erp_work_order_events','erp_work_order_requests'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$$;
CREATE FUNCTION erp_work_private.permission(c uuid,a text) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$DECLARE domains text[];result boolean;BEGIN IF to_regprocedure('erp_access_private.domains()') IS NULL THEN RETURN true;END IF;EXECUTE 'SELECT erp_access_private.domains()' INTO domains;IF NOT('work_orders'=ANY(domains)) THEN RETURN true;END IF;EXECUTE 'SELECT erp_access_private.allowed($1,''work_orders'',$2)' INTO result USING c,a;RETURN coalesce(result,false);END$$;
CREATE FUNCTION erp_work_private.authorize(c uuid,w boolean DEFAULT false,a text DEFAULT 'read') RETURNS text LANGUAGE plpgsql SET search_path='' AS $$DECLARE r text:=brand_finance_private.role_for(c);BEGIN IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','accountant','auditor') OR(w AND r='auditor') OR NOT erp_work_private.permission(c,a) THEN RAISE EXCEPTION 'لا تملك صلاحية أوامر الشغل' USING ERRCODE='42501';END IF;RETURN r;END$$;
CREATE FUNCTION erp_work_private.settings(c uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$SELECT coalesce((SELECT value||jsonb_build_object('revision',revision) FROM public.erp_work_order_settings WHERE cafe_id=c),'{"revision":0,"nextNumber":1,"budgetMode":"expense","statuses":[{"id":"open","name":"مفتوح","closed":false,"color":"#b99545"},{"id":"closed","name":"مغلق","closed":true,"color":"#528159"}],"actions":[],"fields":[],"shareEnabled":false,"shareMessage":"{{العنوان}} — {{رقم_المستند}}"}'::jsonb)$$;
CREATE FUNCTION erp_work_private.staff(c uuid,ids uuid[]) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$BEGIN IF cardinality(ids)>100 OR EXISTS(SELECT 1 FROM unnest(ids) i WHERE NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=c AND user_id=i AND active) AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND owner_user_id=i)) THEN RAISE EXCEPTION 'الموظف غير متاح لهذه العلامة' USING ERRCODE='22023';END IF;END$$;
CREATE FUNCTION erp_work_private.target(c uuid,k text,i uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE r jsonb;BEGIN
 IF k='document' THEN SELECT jsonb_build_object('id',d.id,'kind',d.kind,'label',d.kind||' #'||d.number,'amount',coalesce((brand_finance_private.document_state(c,d.id)->>'total')::numeric,CASE WHEN d.kind='journal' AND d.total=0 THEN (SELECT coalesce(sum(j.debit),0) FROM public.bf_journal j WHERE j.cafe_id=c AND j.document_id=d.id) ELSE d.total END),'partyId',d.party_id,'outstanding',(brand_finance_private.document_state(c,d.id)->>'outstanding')::numeric,'refunded',coalesce((brand_finance_private.document_state(c,d.id)->>'refunded_total')::numeric,0)) INTO r FROM public.bf_documents d WHERE cafe_id=c AND id=i;
 ELSIF k='quotation' THEN SELECT jsonb_build_object('id',id,'kind','quotation','label','عرض سعر #'||number,'amount',total,'partyId',payload#>>'{invoice,partyId}') INTO r FROM public.bf_quotes WHERE cafe_id=c AND id=i;
 ELSIF k='credit_note' THEN SELECT jsonb_build_object('id',id,'kind','credit_note','label','إشعار دائن #'||number,'amount',CASE WHEN status='issued' THEN total ELSE 0 END,'partyId',party_id) INTO r FROM public.bf_credit_notes WHERE cafe_id=c AND id=i AND status<>'deleted';
 ELSIF k='task' THEN SELECT jsonb_build_object('id',id,'kind','task','label',title,'amount',0) INTO r FROM public.erp_tasks WHERE cafe_id=c AND id=i;
 END IF;RETURN r;END$$;
CREATE FUNCTION erp_work_private.link(c uuid,o uuid,k text,i uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE t jsonb;customer uuid;BEGIN
 t:=erp_work_private.target(c,k,i);IF t IS NULL THEN RAISE EXCEPTION 'المعاملة غير متاحة لهذه العلامة' USING ERRCODE='22023';END IF;
 SELECT customer_id INTO customer FROM public.erp_work_orders WHERE cafe_id=c AND id=o;
 IF t->>'kind' IN('sale','quotation','credit_note') AND nullif(t->>'partyId','')::uuid IS DISTINCT FROM customer THEN RAISE EXCEPTION 'عميل المعاملة لا يطابق عميل أمر الشغل' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.erp_work_order_links WHERE cafe_id=c AND kind=k AND target_id=i AND order_id<>o) THEN RAISE EXCEPTION 'المعاملة مرتبطة بأمر شغل آخر' USING ERRCODE='23505';END IF;
 INSERT INTO public.erp_work_order_links(cafe_id,order_id,kind,target_id) VALUES(c,o,k,i) ON CONFLICT DO NOTHING;
END$$;
CREATE FUNCTION public.erp_work_order_targets(p_cafe_id uuid,p_kind text,p_query text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 PERFORM erp_work_private.authorize(p_cafe_id);IF length(p_query)>120 THEN RAISE EXCEPTION 'اختصر نص البحث';END IF;
 IF p_kind='document' THEN SELECT coalesce(jsonb_agg(erp_work_private.target(p_cafe_id,p_kind,id)),'[]') INTO result FROM(SELECT id FROM public.bf_documents WHERE cafe_id=p_cafe_id AND(number::text ILIKE '%'||p_query||'%' OR note ILIKE '%'||p_query||'%') ORDER BY created_at DESC LIMIT 100)d;
 ELSIF p_kind='quotation' THEN SELECT coalesce(jsonb_agg(erp_work_private.target(p_cafe_id,p_kind,id)),'[]') INTO result FROM(SELECT id FROM public.bf_quotes WHERE cafe_id=p_cafe_id AND(number::text ILIKE '%'||p_query||'%' OR customer_name ILIKE '%'||p_query||'%') ORDER BY created_at DESC LIMIT 100)d;
 ELSIF p_kind='credit_note' THEN SELECT coalesce(jsonb_agg(erp_work_private.target(p_cafe_id,p_kind,id)),'[]') INTO result FROM(SELECT id FROM public.bf_credit_notes WHERE cafe_id=p_cafe_id AND status<>'deleted' AND(number::text ILIKE '%'||p_query||'%' OR customer_name ILIKE '%'||p_query||'%') ORDER BY created_at DESC LIMIT 100)d;
 ELSIF p_kind='task' THEN SELECT coalesce(jsonb_agg(erp_work_private.target(p_cafe_id,p_kind,id)),'[]') INTO result FROM(SELECT id FROM public.erp_tasks WHERE cafe_id=p_cafe_id AND(title ILIKE '%'||p_query||'%' OR code ILIKE '%'||p_query||'%') ORDER BY created_at DESC LIMIT 100)d;
 ELSE RAISE EXCEPTION 'نوع المعاملة غير صالح';END IF;RETURN result;
END$$;
CREATE FUNCTION public.erp_work_orders_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r text;links jsonb;BEGIN
 r:=erp_work_private.authorize(p_cafe_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('orderId',order_id,'kind',kind,'targetId',target_id,'at',at,'title',t->>'label','amount',coalesce(t->'amount','0'),'outstanding',coalesce(t->'outstanding','0'),'documentKind',t->>'kind')),'[]') INTO links FROM public.erp_work_order_links l CROSS JOIN LATERAL erp_work_private.target(l.cafe_id,l.kind,l.target_id)t WHERE l.cafe_id=p_cafe_id;
 RETURN jsonb_build_object('canWrite',r<>'auditor' AND erp_work_private.permission(p_cafe_id,'update'),'canSettings',r IN('owner','manager') AND erp_work_private.permission(p_cafe_id,'settings'),'canCreate',r<>'auditor' AND erp_work_private.permission(p_cafe_id,'create'),'canUpdate',r<>'auditor' AND erp_work_private.permission(p_cafe_id,'update'),'canDelete',r<>'auditor' AND erp_work_private.permission(p_cafe_id,'delete'),'canApprove',r<>'auditor' AND erp_work_private.permission(p_cafe_id,'approve'),'canFiles',r<>'auditor' AND erp_work_private.permission(p_cafe_id,'files'),'settings',erp_work_private.settings(p_cafe_id),'links',links,
 'records',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'revision',w.revision,'title',title,'code',code,'start',start_date,'end',end_date,'customerId',customer_id,'customerName',(SELECT name FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=w.customer_id),'description',description,'tags',tags,'staffIds',staff_ids,'budget',budget,'budgetMode',budget_mode,'status',status,'draft',draft,'customValues',custom_values,'createdAt',created_at,'updatedAt',updated_at,'createdBy',created_by,'spent',coalesce((SELECT sum(greatest(0,(t->>'amount')::numeric-coalesce((t->>'refunded')::numeric,0))) FROM public.erp_work_order_links l CROSS JOIN LATERAL erp_work_private.target(l.cafe_id,l.kind,l.target_id)t WHERE l.cafe_id=w.cafe_id AND l.order_id=w.id AND l.kind='document' AND (w.budget_mode='expense' AND t->>'kind' IN('expense','purchase') OR w.budget_mode='invoice' AND t->>'kind'='sale')),0)) ORDER BY updated_at DESC) FROM public.erp_work_orders w WHERE cafe_id=p_cafe_id),'[]'),
 'activities',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'orderId',order_id,'title',title,'note',note,'start',starts_at,'end',ends_at,'staffIds',staff_ids,'status',status,'actionId',action_id,'repeatCount',1,'repeatDays',7,'shared',shared) ORDER BY starts_at) FROM public.erp_work_order_activities WHERE cafe_id=p_cafe_id),'[]'),
 'drafts',coalesce((SELECT jsonb_agg(jsonb_build_object('orderId',order_id,'draftId',draft_id)) FROM public.erp_work_order_drafts d WHERE cafe_id=p_cafe_id AND NOT EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=d.draft_id)),'[]'),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'orderId',e.order_id,'action',e.action,'at',e.at,'actorName',coalesce(s.name,'المالك'),'detail',e.detail) ORDER BY e.at DESC) FROM public.erp_work_order_events e LEFT JOIN public.bf_staff s ON s.cafe_id=e.cafe_id AND s.user_id=e.actor WHERE e.cafe_id=p_cafe_id),'[]'),
 'taskTypes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.erp_task_types WHERE cafe_id=p_cafe_id AND active),'[]'));
END$$;
CREATE FUNCTION erp_work_private.validate_values(fields jsonb,vals jsonb,p_cafe uuid DEFAULT NULL,p_record uuid DEFAULT NULL,depth integer DEFAULT 0,p_draft boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE f jsonb;v jsonb;t text;x jsonb;txt text;tbl text;col text;valid boolean;metric numeric;BEGIN
 IF coalesce(jsonb_typeof(vals),'')<>'object' OR octet_length(vals::text)>262144 OR depth>2 THEN RAISE EXCEPTION 'بيانات الحقول الإضافية غير صالحة';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(coalesce(fields,'[]')) LOOP
  t:=f->>'type';IF t IN('static','separator') THEN CONTINUE;END IF;
  v:=coalesce(vals->(f->>'id'),f->'defaultValue');
  IF coalesce((f->>'required')::boolean,false) AND NOT p_draft AND (v IS NULL OR v='null'::jsonb OR v='""'::jsonb OR v='[]'::jsonb OR (t='checkbox' AND v<>'true')) THEN RAISE EXCEPTION 'أكمل الحقل المطلوب: %',f->>'label';END IF;
  IF v IS NULL OR v='null'::jsonb OR v='""'::jsonb THEN CONTINUE;END IF;
  IF t='subform' THEN
   IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)>100 OR jsonb_array_length(v)<coalesce((f->>'minimumRows')::integer,0) THEN RAISE EXCEPTION 'عدد صفوف النموذج غير صالح';END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(v) LOOP PERFORM erp_work_private.validate_values(f->'fields',x,p_cafe,p_record,depth+1,p_draft);END LOOP;CONTINUE;
  END IF;
  IF t='location' THEN
   IF jsonb_typeof(v)<>'object' OR jsonb_typeof(v->'latitude')<>'number' OR jsonb_typeof(v->'longitude')<>'number' OR abs((v->>'latitude')::numeric)>90 OR abs((v->>'longitude')::numeric)>180 THEN RAISE EXCEPTION 'إحداثيات الموقع غير صالحة';END IF;CONTINUE;
  END IF;
  IF (t IN('number','currency') AND jsonb_typeof(v)<>'number') OR (t='checkbox' AND jsonb_typeof(v)<>'boolean') OR (t IN('multiselect','multidynamic') AND jsonb_typeof(v)<>'array') OR (t NOT IN('number','currency','checkbox','multiselect','multidynamic') AND jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'نوع قيمة الحقل غير صالح';END IF;
  txt:=v#>>'{}';
  IF length(txt)>20000 THEN RAISE EXCEPTION 'قيمة الحقل طويلة';END IF;
  IF (t='select' AND NOT(f->'options' @> jsonb_build_array(v))) OR (t='multiselect' AND NOT(f->'options' @> v)) THEN RAISE EXCEPTION 'اختيارات الحقل غير صالحة';END IF;
  IF t='email' AND txt!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'البريد الإلكتروني غير صالح';END IF;
  IF t='url' AND txt!~'^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'الرابط غير صالح';END IF;
  IF t='time' AND txt!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'الوقت غير صالح';END IF;
  IF t='date' THEN IF txt!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'التاريخ غير صالح';END IF;PERFORM txt::date;END IF;
  IF t IN('number','currency','text','textarea','formatted') THEN
   metric:=CASE WHEN t IN('number','currency') THEN txt::numeric ELSE length(txt) END;
   IF metric<nullif(f->>'minimum','')::numeric OR metric>nullif(f->>'maximum','')::numeric THEN RAISE EXCEPTION 'قيمة الحقل خارج الحدود: %',f->>'label';END IF;
  END IF;
  IF t IN('dynamic','multidynamic') THEN
   tbl:=CASE f->>'entity' WHEN 'items' THEN 'bf_items' WHEN 'customers' THEN 'bf_parties' WHEN 'employees' THEN 'bf_staff' WHEN 'warehouses' THEN 'bf_warehouses' WHEN 'accounts' THEN 'bf_accounts' WHEN 'bom' THEN 'erp_mfg_boms' WHEN 'routings' THEN 'erp_mfg_routings' WHEN 'workstations' THEN 'erp_mfg_workstations' WHEN 'orders' THEN 'erp_mfg_orders' WHEN 'sources' THEN 'bf_documents' END;
   IF tbl IS NULL OR p_cafe IS NULL THEN RAISE EXCEPTION 'الكيان المرتبط غير صالح';END IF;col:=CASE WHEN tbl='bf_staff' THEN 'user_id' ELSE 'id' END;
   FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN t='dynamic' THEN jsonb_build_array(v) ELSE v END) LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND %I=$2)',tbl,col) INTO valid USING p_cafe,(x#>>'{}')::uuid;
    IF NOT valid THEN RAISE EXCEPTION 'القيمة المرتبطة غير موجودة في العلامة';END IF;
   END LOOP;
  END IF;
  IF t IN('file','image') THEN
   IF p_record IS NULL OR to_regclass('public.erp_files') IS NULL THEN RAISE EXCEPTION 'احفظ السجل وأضف المرفق أولًا';END IF;
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=$1 AND record_id=$2 AND id=$3 AND entity_type=$4 AND uploaded AND ($5<>''image'' OR mime IN(''image/jpeg'',''image/png'')))' INTO valid USING p_cafe,p_record,txt::uuid,'work_order',t;
   IF NOT valid THEN RAISE EXCEPTION 'المرفق غير موجود في هذا السجل';END IF;
  END IF;
  IF coalesce((f->>'unique')::boolean,false) AND depth=0 THEN
   tbl:='erp_work_orders';
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id IS DISTINCT FROM $2 AND custom_values->$3=$4)',tbl) INTO valid USING p_cafe,p_record,f->>'id',v;
   IF valid THEN RAISE EXCEPTION 'قيمة الحقل مستخدمة مسبقًا: %',f->>'label';END IF;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.erp_work_orders_write(p_cafe_id uuid,p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;cfg jsonb;old public.erp_work_orders%ROWTYPE;req public.erp_work_order_requests%ROWTYPE;a public.erp_work_order_activities%ROWTYPE;rid uuid;rev integer;customer uuid;ids uuid[];st text;result jsonb;next_num bigint;next_code text;vals jsonb;target uuid;payload jsonb;x jsonb;idx integer;repeat_count integer;start_at timestamptz;end_at timestamptz;
BEGIN
 r:=erp_work_private.authorize(p_cafe_id,true,CASE WHEN p_action='settings' THEN 'settings' WHEN p_action='delete' THEN 'delete' WHEN p_action='save' AND coalesce((p_payload->>'revision')::integer,0)=0 OR p_action='copy' THEN 'create' WHEN p_action IN('status','financial','invoice','advance','debit') THEN 'approve' ELSE 'update' END);
 IF p_request_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>500000 THEN RAISE EXCEPTION 'طلب غير صالح' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO req FROM public.erp_work_order_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF req.actor<>auth.uid() OR req.action<>p_action OR req.payload<>p_payload THEN RAISE EXCEPTION 'معرف العملية مستخدم لبيانات أخرى' USING ERRCODE='22023';END IF;RETURN req.result;END IF;
 cfg:=erp_work_private.settings(p_cafe_id);rid:=nullif(p_payload->>'id','')::uuid;rev:=(p_payload->>'revision')::integer;
 IF p_action='settings' THEN
  IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'لا تملك صلاحية الإعدادات' USING ERRCODE='42501';END IF;
  IF rev IS DISTINCT FROM (cfg->>'revision')::integer THEN RAISE EXCEPTION 'الإعدادات تغيرت' USING ERRCODE='40001';END IF;
  IF coalesce(p_payload->>'budgetMode','') NOT IN('expense','invoice') OR coalesce((p_payload->>'nextNumber')::bigint,0) NOT BETWEEN 1 AND 999999999 OR coalesce(jsonb_typeof(p_payload->'statuses'),'')<>'array' OR jsonb_array_length(p_payload->'statuses') NOT BETWEEN 1 AND 50 OR coalesce(jsonb_typeof(p_payload->'actions'),'')<>'array' OR jsonb_array_length(p_payload->'actions')>100 OR coalesce(jsonb_typeof(p_payload->'shareEnabled'),'')<>'boolean' OR length(coalesce(p_payload->>'shareMessage',''))>2000 THEN RAISE EXCEPTION 'راجع إعدادات أوامر الشغل' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'statuses') s WHERE coalesce(s->>'id','')!~'^[a-z][a-z0-9_-]{0,59}$' OR length(btrim(coalesce(s->>'name',''))) NOT BETWEEN 1 AND 100 OR coalesce(jsonb_typeof(s->'closed'),'')<>'boolean' OR coalesce(s->>'color','')!~'^#[a-fA-F0-9]{6}$') OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'statuses') s GROUP BY s->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'الحالات غير صالحة';END IF;
  IF EXISTS(SELECT 1 FROM public.erp_work_orders w WHERE cafe_id=p_cafe_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'statuses') s WHERE s->>'id'=w.status)) THEN RAISE EXCEPTION 'لا تحذف حالة مستخدمة في أمر شغل';END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_payload->'actions') LOOP PERFORM (x->>'id')::uuid;IF length(btrim(coalesce(x->>'name',''))) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'اسم الإجراء غير صالح';END IF;END LOOP;
  PERFORM erp_manufacturing_private.validate_custom_fields(p_payload->'fields');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'actions') config_action GROUP BY config_action->>'id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM public.erp_work_order_activities appointment_row WHERE cafe_id=p_cafe_id AND action_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'actions') config_entry WHERE (config_entry->>'id')::uuid=appointment_row.action_id)) THEN RAISE EXCEPTION 'لا تكرر الإجراءات أو تحذف إجراء مستخدمًا';END IF;
  INSERT INTO public.erp_work_order_settings(cafe_id,revision,value) VALUES(p_cafe_id,rev+1,p_payload-'revision') ON CONFLICT(cafe_id) DO UPDATE SET revision=excluded.revision,value=excluded.value;
  result:=jsonb_build_object('id',p_cafe_id);
 ELSIF p_action='save' THEN
  IF rid IS NULL OR rev IS NULL OR coalesce(jsonb_typeof(p_payload->'draft'),'')<>'boolean' OR coalesce(jsonb_typeof(p_payload->'staffIds'),'')<>'array' OR coalesce(jsonb_typeof(p_payload->'tags'),'')<>'array' THEN RAISE EXCEPTION 'بيانات أمر الشغل غير صالحة';END IF;
  SELECT * INTO old FROM public.erp_work_orders WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;
  IF coalesce(old.revision,0)<>rev THEN RAISE EXCEPTION 'أمر الشغل تغير' USING ERRCODE='40001';END IF;
  customer:=nullif(p_payload->>'customerId','')::uuid;
  IF customer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=customer AND kind='customer' AND active) THEN RAISE EXCEPTION 'العميل غير متاح';END IF;
  IF old.id IS NOT NULL AND old.customer_id IS DISTINCT FROM customer AND (EXISTS(SELECT 1 FROM public.erp_work_order_links WHERE cafe_id=p_cafe_id AND order_id=rid AND kind<>'task') OR EXISTS(SELECT 1 FROM public.erp_work_order_drafts WHERE cafe_id=p_cafe_id AND order_id=rid)) THEN RAISE EXCEPTION 'لا تغير عميل أمر مرتبط بمعاملات';END IF;
  SELECT coalesce(array_agg(value::uuid),'{}') INTO ids FROM jsonb_array_elements_text(p_payload->'staffIds');PERFORM erp_work_private.staff(p_cafe_id,ids);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'tags') t WHERE length(btrim(t)) NOT BETWEEN 1 AND 60) THEN RAISE EXCEPTION 'الوسم غير صالح';END IF;
  vals:=erp_manufacturing_private.custom_defaults(cfg->'fields',coalesce(p_payload->'customValues','{}'));PERFORM erp_work_private.validate_values(cfg->'fields',vals,p_cafe_id,rid,0,(p_payload->>'draft')::boolean);
  next_code:=btrim(coalesce(p_payload->>'code',''));next_num:=(cfg->>'nextNumber')::bigint;
  IF next_code='' THEN LOOP next_code:=lpad(next_num::text,6,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.erp_work_orders WHERE cafe_id=p_cafe_id AND code=next_code);next_num:=next_num+1;END LOOP;cfg:=jsonb_set(cfg,'{nextNumber}',to_jsonb(next_num+1));INSERT INTO public.erp_work_order_settings(cafe_id,revision,value) VALUES(p_cafe_id,(cfg->>'revision')::integer+1,cfg-'revision') ON CONFLICT(cafe_id) DO UPDATE SET revision=excluded.revision,value=excluded.value;END IF;
  INSERT INTO public.erp_work_orders(id,cafe_id,code,title,customer_id,start_date,end_date,description,tags,staff_ids,budget,budget_mode,status,draft,custom_values,created_by)
  VALUES(rid,p_cafe_id,next_code,p_payload->>'title',customer,(p_payload->>'start')::date,nullif(p_payload->>'end','')::date,coalesce(p_payload->>'description',''),ARRAY(SELECT jsonb_array_elements_text(p_payload->'tags')),ids,(p_payload->>'budget')::numeric,coalesce(old.budget_mode,cfg->>'budgetMode'),coalesce(old.status,cfg#>>'{statuses,0,id}'),(p_payload->>'draft')::boolean,vals,auth.uid())
  ON CONFLICT(id) DO UPDATE SET code=excluded.code,title=excluded.title,customer_id=excluded.customer_id,start_date=excluded.start_date,end_date=excluded.end_date,description=excluded.description,tags=excluded.tags,staff_ids=excluded.staff_ids,budget=excluded.budget,draft=excluded.draft,custom_values=excluded.custom_values,revision=erp_work_orders.revision+1,updated_at=clock_timestamp() WHERE erp_work_orders.cafe_id=p_cafe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'السجل غير متاح' USING ERRCODE='42501';END IF;result:=jsonb_build_object('id',rid);
 ELSE
  IF p_action='activity' THEN rid:=(p_payload->>'orderId')::uuid;END IF;
  SELECT * INTO old FROM public.erp_work_orders WHERE cafe_id=p_cafe_id AND id=rid FOR UPDATE;
  IF old.id IS NULL THEN RAISE EXCEPTION 'أمر الشغل غير متاح' USING ERRCODE='42501';END IF;
  IF p_action<>'activity' AND old.revision IS DISTINCT FROM rev THEN RAISE EXCEPTION 'أمر الشغل تغير' USING ERRCODE='40001';END IF;
  result:=jsonb_build_object('id',rid);
  IF p_action='delete' THEN
   IF EXISTS(SELECT 1 FROM public.erp_work_order_links WHERE cafe_id=p_cafe_id AND order_id=rid) OR EXISTS(SELECT 1 FROM public.erp_work_order_drafts WHERE cafe_id=p_cafe_id AND order_id=rid) OR EXISTS(SELECT 1 FROM public.erp_work_order_activities WHERE cafe_id=p_cafe_id AND order_id=rid) THEN RAISE EXCEPTION 'ألغ الارتباطات والمواعيد قبل الحذف أو أغلق أمر الشغل';END IF;
   DELETE FROM public.erp_work_orders WHERE cafe_id=p_cafe_id AND id=rid;
  ELSIF p_action='copy' THEN
   target:=gen_random_uuid();next_num:=(cfg->>'nextNumber')::bigint;LOOP next_code:=lpad(next_num::text,6,'0');EXIT WHEN NOT EXISTS(SELECT 1 FROM public.erp_work_orders WHERE cafe_id=p_cafe_id AND code=next_code);next_num:=next_num+1;END LOOP;
   INSERT INTO public.erp_work_orders(id,cafe_id,code,title,customer_id,start_date,end_date,description,tags,staff_ids,budget,budget_mode,status,draft,custom_values,created_by) VALUES(target,p_cafe_id,next_code,old.title,old.customer_id,current_date,NULL,old.description,old.tags,old.staff_ids,old.budget,cfg->>'budgetMode',cfg#>>'{statuses,0,id}',true,'{}',auth.uid());
   INSERT INTO public.erp_work_order_settings(cafe_id,revision,value) VALUES(p_cafe_id,(cfg->>'revision')::integer+1,jsonb_set(cfg-'revision','{nextNumber}',to_jsonb(next_num+1))) ON CONFLICT(cafe_id) DO UPDATE SET revision=excluded.revision,value=excluded.value;result:=jsonb_build_object('id',target);
  ELSIF p_action IN('status','note') THEN
   IF nullif(p_payload->>'actionId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'actions') config_action WHERE config_action->>'id'=p_payload->>'actionId') THEN RAISE EXCEPTION 'الإجراء غير متاح';END IF;
   st:=nullif(p_payload->>'status','');IF st IS NOT NULL THEN IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'statuses') s WHERE s->>'id'=st) OR old.draft THEN RAISE EXCEPTION 'احفظ أمر الشغل واختر حالة متاحة';END IF;UPDATE public.erp_work_orders SET status=st WHERE cafe_id=p_cafe_id AND id=rid;END IF;
   IF p_action='note' AND (length(btrim(coalesce(p_payload->>'note',''))) NOT BETWEEN 1 AND 20000 OR nullif(p_payload->>'occurredAt','')::timestamptz IS NULL) THEN RAISE EXCEPTION 'أدخل الملاحظة وتاريخها';END IF;
  ELSIF p_action IN('link','unlink') THEN
   IF p_action='link' THEN PERFORM erp_work_private.link(p_cafe_id,rid,p_payload->>'kind',(p_payload->>'targetId')::uuid);
   ELSE DELETE FROM public.erp_work_order_links WHERE cafe_id=p_cafe_id AND order_id=rid AND kind=p_payload->>'kind' AND target_id=(p_payload->>'targetId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'الارتباط غير متاح';END IF;END IF;
  ELSIF p_action='activity' THEN
   IF nullif(p_payload->>'actionId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'actions') config_entry WHERE config_entry->>'id'=p_payload->>'actionId') THEN RAISE EXCEPTION 'الإجراء غير متاح';END IF;
   target:=(p_payload->>'id')::uuid;SELECT * INTO a FROM public.erp_work_order_activities WHERE cafe_id=p_cafe_id AND id=target FOR UPDATE;
   IF coalesce(a.revision,0) IS DISTINCT FROM rev OR a.order_id IS NOT NULL AND a.order_id<>rid THEN RAISE EXCEPTION 'الموعد تغير' USING ERRCODE='40001';END IF;
   SELECT coalesce(array_agg(value::uuid),'{}') INTO ids FROM jsonb_array_elements_text(p_payload->'staffIds');PERFORM erp_work_private.staff(p_cafe_id,ids);
   start_at:=(p_payload->>'start')::timestamptz;end_at:=(p_payload->>'end')::timestamptz;repeat_count:=(p_payload->>'repeatCount')::integer;
   IF repeat_count IS NULL OR repeat_count NOT BETWEEN 1 AND 52 OR coalesce((p_payload->>'repeatDays')::integer,0) NOT BETWEEN 1 AND 365 OR(a.id IS NOT NULL AND repeat_count<>1) THEN RAISE EXCEPTION 'تكرار الموعد غير صالح';END IF;
   FOR idx IN 0..repeat_count-1 LOOP INSERT INTO public.erp_work_order_activities(id,cafe_id,order_id,title,note,starts_at,ends_at,staff_ids,status,action_id,shared,series_id) VALUES(CASE WHEN idx=0 THEN target ELSE gen_random_uuid() END,p_cafe_id,rid,p_payload->>'title',coalesce(p_payload->>'note',''),start_at+make_interval(days=>idx*(p_payload->>'repeatDays')::integer),end_at+make_interval(days=>idx*(p_payload->>'repeatDays')::integer),ids,p_payload->>'status',nullif(p_payload->>'actionId','')::uuid,(p_payload->>'shared')::boolean,coalesce(a.series_id,target)) ON CONFLICT(id) DO UPDATE SET title=excluded.title,note=excluded.note,starts_at=excluded.starts_at,ends_at=excluded.ends_at,staff_ids=excluded.staff_ids,status=excluded.status,action_id=excluded.action_id,shared=excluded.shared,revision=erp_work_order_activities.revision+1 WHERE erp_work_order_activities.cafe_id=p_cafe_id;IF NOT FOUND THEN RAISE EXCEPTION 'الموعد غير متاح' USING ERRCODE='42501';END IF;END LOOP;
  ELSIF p_action='financial' THEN
   IF old.draft OR coalesce(p_payload->>'operation','') NOT IN('purchase','treasury','stock_adjust','stock_transfer','journal','refund','settlement') OR jsonb_typeof(p_payload->'values') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع نوع المعاملة واحفظ الأمر أولًا';END IF;
   payload:=p_payload->'values';IF p_payload->>'operation' IN('refund','settlement') AND NOT EXISTS(SELECT 1 FROM public.erp_work_order_links WHERE cafe_id=p_cafe_id AND order_id=rid AND kind='document' AND target_id=(payload->>'documentId')::uuid) THEN RAISE EXCEPTION 'اربط الفاتورة أولًا';END IF;
   x:=public.brand_finance_execute(p_cafe_id,p_payload->>'operation',payload,p_request_id);target:=nullif(x->>'id','')::uuid;
   IF target IS NULL OR x->>'status'='pending' THEN RAISE EXCEPTION 'المعاملة لم تعتمد ماليًا بعد';END IF;PERFORM erp_work_private.link(p_cafe_id,rid,'document',target);
  ELSIF p_action='debit' THEN
   IF old.draft OR NOT EXISTS(SELECT 1 FROM public.erp_work_order_links WHERE cafe_id=p_cafe_id AND order_id=rid AND kind='document' AND target_id=(p_payload->>'sourceId')::uuid) THEN RAISE EXCEPTION 'اختر فاتورة مرتبطة بأمر محفوظ';END IF;
   x:=public.brand_finance_invoice_extensions(p_cafe_id,(p_payload->>'sourceId')::uuid,'debit',jsonb_build_object('requestId',p_request_id,'amount',p_payload->'amount','vatRate',p_payload->'taxRate','description',p_payload->>'description','reason',p_payload->>'reason'));
   PERFORM erp_work_private.link(p_cafe_id,rid,'document',(x->>'id')::uuid);
  ELSIF p_action='advance' THEN
   IF old.draft OR old.customer_id IS NULL THEN RAISE EXCEPTION 'احفظ الأمر واختر العميل أولًا';END IF;
   x:=public.brand_finance_customer_credit(p_cafe_id,'receive',jsonb_build_object('partyId',old.customer_id,'requestId',p_request_id,'accountId',p_payload->>'accountId','amount',p_payload->'amount','note',left('دفعة أمر شغل '||old.code||' '||coalesce(p_payload->>'note',''),1000)));PERFORM erp_work_private.link(p_cafe_id,rid,'document',(x->>'id')::uuid);
  ELSIF p_action='invoice' THEN
   IF old.draft OR old.customer_id IS NULL OR coalesce((p_payload->>'amount')::numeric,0)<=0 OR coalesce((p_payload->>'taxRate')::numeric,-1) NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'اختر العميل وأدخل قيمة الفاتورة والضريبة';END IF;
   target:=gen_random_uuid();payload:=jsonb_build_object('invoice',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('key',1,'productId','','quantity',1,'price',p_payload->'amount','name',left(old.title,160),'kind','service','vatRate',p_payload->'taxRate','taxCategory',CASE WHEN(p_payload->>'taxRate')::numeric=0 THEN 'O' ELSE 'S' END,'exemptionReason',coalesce(p_payload->>'taxReason',''))),'warehouseId','','partyId',old.customer_id,'accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','taxInclusive',false,'note','أمر شغل '||old.code,'currency','SAR','exchangeRate',1),'issuer',jsonb_build_object('name','','address','','vatNumber',''),'supplyDate',current_date,'template','standard','deliveryMethod','print','deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'shipping','none','delivery',jsonb_build_object('confirmed',false,'date',''),'attachments','[]'::jsonb,'extraFields','[]'::jsonb);
   PERFORM public.brand_finance_save_invoice_draft(p_cafe_id,target,0,payload);INSERT INTO public.erp_work_order_drafts VALUES(p_cafe_id,rid,target);result:=result||jsonb_build_object('draftId',target);
  ELSIF p_action='task' THEN
   x:=public.erp_tasks_execute(p_cafe_id,'save',jsonb_build_object('id',NULL,'revision',0,'title',p_payload->>'title','code','','priority','medium','typeId',p_payload->>'typeId','assigneeId',p_payload->>'assigneeId','dueDate',p_payload->'dueDate','description',p_payload->>'note','targetKind',CASE WHEN old.customer_id IS NOT NULL THEN 'customer' END,'targetId',old.customer_id),p_request_id);
   PERFORM erp_work_private.link(p_cafe_id,rid,'task',(x->>'id')::uuid);
  ELSE RAISE EXCEPTION 'الإجراء غير متاح' USING ERRCODE='22023';END IF;
  IF p_action NOT IN('delete','copy') THEN UPDATE public.erp_work_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND id=rid;END IF;
 END IF;
 INSERT INTO public.erp_work_order_events(cafe_id,order_id,action,detail,actor) VALUES(p_cafe_id,rid,p_action,p_payload,auth.uid());
 INSERT INTO public.erp_work_order_requests VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_payload,result);RETURN result;
END$$;
CREATE FUNCTION erp_work_private.invoice_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE o uuid;BEGIN SELECT order_id INTO o FROM public.erp_work_order_drafts WHERE cafe_id=NEW.cafe_id AND draft_id=NEW.draft_id;IF o IS NOT NULL THEN PERFORM erp_work_private.link(NEW.cafe_id,o,'document',NEW.document_id);UPDATE public.erp_work_orders SET revision=revision+1,updated_at=clock_timestamp() WHERE cafe_id=NEW.cafe_id AND id=o;INSERT INTO public.erp_work_order_events(cafe_id,order_id,action,detail,actor) VALUES(NEW.cafe_id,o,'invoice_issued',jsonb_build_object('invoiceId',NEW.document_id),auth.uid());END IF;RETURN NEW;END$$;
CREATE TRIGGER erp_work_order_invoice AFTER INSERT ON public.bf_company_invoices FOR EACH ROW EXECUTE FUNCTION erp_work_private.invoice_link();
CREATE FUNCTION erp_work_private.source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text:=CASE TG_TABLE_NAME WHEN 'bf_documents' THEN 'document' WHEN 'bf_quotes' THEN 'quotation' WHEN 'bf_credit_notes' THEN 'credit_note' ELSE 'task' END;data jsonb;customer uuid;linked public.erp_work_order_links%ROWTYPE;
BEGIN
 SELECT * INTO linked FROM public.erp_work_order_links WHERE cafe_id=OLD.cafe_id AND kind=k AND target_id=OLD.id;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ألغ ارتباط المعاملة بأمر الشغل قبل حذفها' USING ERRCODE='23503';END IF;
 data:=to_jsonb(NEW);
 IF NEW.cafe_id IS DISTINCT FROM OLD.cafe_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'لا تغير ملكية معاملة مرتبطة' USING ERRCODE='23503';END IF;
 IF k IN('quotation','credit_note') OR(k='document' AND data->>'kind'='sale') THEN
  customer:=nullif(CASE WHEN k='quotation' THEN data#>>'{payload,invoice,partyId}' ELSE data->>'party_id' END,'')::uuid;
  IF EXISTS(SELECT 1 FROM public.erp_work_orders WHERE cafe_id=linked.cafe_id AND id=linked.order_id AND customer_id IS DISTINCT FROM customer) THEN RAISE EXCEPTION 'عميل المعاملة لا يطابق أمر الشغل' USING ERRCODE='22023';END IF;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER erp_work_order_source_guard BEFORE DELETE OR UPDATE ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION erp_work_private.source_guard();
CREATE TRIGGER erp_work_order_source_guard BEFORE DELETE OR UPDATE ON public.bf_quotes FOR EACH ROW EXECUTE FUNCTION erp_work_private.source_guard();
CREATE TRIGGER erp_work_order_source_guard BEFORE DELETE OR UPDATE ON public.bf_credit_notes FOR EACH ROW EXECUTE FUNCTION erp_work_private.source_guard();
CREATE TRIGGER erp_work_order_source_guard BEFORE DELETE OR UPDATE ON public.erp_tasks FOR EACH ROW EXECUTE FUNCTION erp_work_private.source_guard();
-- Preserve all installed file scopes including the HR/rentals chain.
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_work_orders;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF p_type IS DISTINCT FROM 'work_order' THEN PERFORM erp_file_private.assert_record_before_work_orders(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 PERFORM erp_work_private.authorize(p_cafe,p_write,CASE WHEN p_write THEN 'files' ELSE 'read' END);
 IF p_write THEN PERFORM 1 FROM public.erp_work_orders WHERE cafe_id=p_cafe AND id=p_record FOR KEY SHARE;ELSE PERFORM 1 FROM public.erp_work_orders WHERE cafe_id=p_cafe AND id=p_record;END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'أمر الشغل غير متاح' USING ERRCODE='42501';END IF;
END$$;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_work_orders(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_work_orders FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('work_order');
-- Add the newly created source to the existing template event engine without sending messages.
DO $template$
DECLARE definition text;
BEGIN
 IF to_regprocedure('brand_finance_private.template_context(uuid,text,uuid)') IS NOT NULL THEN
  SELECT pg_get_functiondef('brand_finance_private.template_context(uuid,text,uuid)'::regprocedure) INTO definition;
  definition:=replace(definition,'coalesce(d->>''number'','''')','coalesce(d->>''number'',d->>''code'','''')');
  definition:=replace(definition,'d->>''date'',d->>''starts_at''','d->>''date'',d->>''start_date'',d->>''starts_at''');
  definition:=replace(definition,'d->>''date'',left(d->>''created_at'',10)','d->>''date'',d->>''start_date'',left(d->>''created_at'',10)');
  definition:=replace(definition,'nullif(d#>>''{assigned_users,0}'','''')','nullif(d#>>''{assigned_users,0}'',''''),nullif(d#>>''{staff_ids,0}'','''')');
  EXECUTE definition;
 END IF;
 IF to_regprocedure('brand_finance_private.template_source_event()') IS NOT NULL THEN
  CREATE TRIGGER erp_template_event AFTER INSERT OR UPDATE ON public.erp_work_orders FOR EACH ROW EXECUTE FUNCTION brand_finance_private.template_source_event();
 END IF;
END $template$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_work_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_work_orders_read(uuid),public.erp_work_orders_write(uuid,text,jsonb,uuid),public.erp_work_order_targets(uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_work_orders_read(uuid),public.erp_work_orders_write(uuid,text,jsonb,uuid),public.erp_work_order_targets(uuid,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
