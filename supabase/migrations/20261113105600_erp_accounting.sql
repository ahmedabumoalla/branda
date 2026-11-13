BEGIN;
CREATE SCHEMA erp_accounting_private;
REVOKE ALL ON SCHEMA erp_accounting_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_accounting_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),payload jsonb NOT NULL DEFAULT '{}',revision integer NOT NULL DEFAULT 1);
CREATE TABLE public.erp_cost_centers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),code text NOT NULL,name text NOT NULL,parent_id uuid,is_group boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,UNIQUE(cafe_id,id),UNIQUE(cafe_id,code),FOREIGN KEY(cafe_id,parent_id) REFERENCES public.erp_cost_centers(cafe_id,id),CHECK(length(btrim(code)) BETWEEN 1 AND 60 AND length(btrim(name)) BETWEEN 1 AND 150));
CREATE INDEX erp_cost_centers_parent ON public.erp_cost_centers(cafe_id,parent_id);
CREATE TABLE public.erp_accounting_metadata(cafe_id uuid NOT NULL,draft_id uuid NOT NULL,payload jsonb NOT NULL,PRIMARY KEY(cafe_id,draft_id),FOREIGN KEY(cafe_id,draft_id) REFERENCES public.bf_gl_drafts(cafe_id,id));
CREATE TABLE public.erp_accounting_allocations(cafe_id uuid NOT NULL,draft_id uuid NOT NULL,line_index integer NOT NULL,cost_center_id uuid NOT NULL,percentage numeric(8,5) NOT NULL CHECK(percentage>0 AND percentage<=100),PRIMARY KEY(cafe_id,draft_id,line_index,cost_center_id),FOREIGN KEY(cafe_id,draft_id) REFERENCES public.bf_gl_drafts(cafe_id,id),FOREIGN KEY(cafe_id,cost_center_id) REFERENCES public.erp_cost_centers(cafe_id,id));
CREATE TABLE erp_accounting_private.requests(cafe_id uuid NOT NULL,id uuid NOT NULL,actor uuid NOT NULL,command jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,id));
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON erp_accounting_private.requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
DO $$DECLARE domains text[];t text;BEGIN
 SELECT array_agg(domain ORDER BY position) INTO domains FROM(SELECT domain,min(position) position FROM unnest(erp_access_private.domains()||ARRAY['accounting']) WITH ORDINALITY x(domain,position) GROUP BY domain)y;
 EXECUTE format('CREATE OR REPLACE FUNCTION erp_access_private.domains() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='''' AS $f$SELECT %L::text[]$f$',domains);
 UPDATE public.erp_roles SET permissions=jsonb_build_object('accounting',jsonb_build_object('read',false,'create',false,'update',false,'delete',false,'approve',false,'settings',false,'files',false))||permissions;
 FOREACH t IN ARRAY ARRAY['erp_accounting_settings','erp_cost_centers','erp_accounting_metadata','erp_accounting_allocations'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;
END $$;
CREATE FUNCTION erp_accounting_private.authorize(c uuid,a text DEFAULT 'read') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE r text;BEGIN
 r:=brand_finance_private.role_for(c);IF coalesce(r,'') NOT IN('owner','manager','accountant','auditor') OR(a<>'read' AND r='auditor') OR(a='settings' AND r<>'owner') THEN RAISE EXCEPTION 'لا تملك صلاحية الحسابات العامة' USING ERRCODE='42501';END IF;PERFORM erp_access_private.assert_allowed(c,'accounting',a);RETURN r;
END $$;
-- Reuse the installed ledger implementation and its maker/checker, reversal,
-- version and idempotency rules. The legacy pilot routes remain unchanged.
CREATE FUNCTION erp_accounting_private.fiscal_year(c uuid,d date) RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$SELECT extract(year FROM d)::integer-CASE WHEN extract(month FROM d)<coalesce((SELECT (payload->>'fiscalMonth')::integer FROM public.erp_accounting_settings WHERE cafe_id=c),1) THEN 1 ELSE 0 END$$;
DO $$DECLARE source text;name text;signature text;BEGIN
 FOREACH signature IN ARRAY ARRAY['execute(uuid,text,jsonb,uuid)','snapshot(uuid,integer)','events(uuid,uuid,bigint)','document(uuid,uuid)','report(uuid,date,date,uuid,integer)'] LOOP
  name:=split_part(signature,'(',1);SELECT pg_get_functiondef(('public.brand_finance_gl_'||signature)::regprocedure) INTO source;
  source:=replace(source,'public.brand_finance_gl_'||name||'(','erp_accounting_private.gl_'||name||'(');
  IF position('PERFORM brand_finance_private.assert_gl_enabled(p_cafe_id);' IN source)=0 THEN RAISE EXCEPTION 'Ledger adapter changed; review before applying';END IF;
  source:=replace(source,'PERFORM brand_finance_private.assert_gl_enabled(p_cafe_id);','PERFORM erp_accounting_private.authorize(p_cafe_id);');
  IF name='execute' THEN source:=replace(source,'extract(year FROM dt)','erp_accounting_private.fiscal_year(p_cafe_id,dt)');END IF;EXECUTE source;
 END LOOP;
END $$;
-- Once this tenant uses ERP accounting, all posting paths respect its closed
-- periods and frozen accounts without changing the old manual-journal routing.
CREATE FUNCTION erp_accounting_private.document_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_accounting_settings WHERE cafe_id=NEW.cafe_id) THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));PERFORM brand_finance_private.gl_date_open(NEW.cafe_id,(NEW.created_at AT TIME ZONE 'Asia/Riyadh')::date);END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_accounting_date BEFORE INSERT ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION erp_accounting_private.document_guard();
CREATE FUNCTION erp_accounting_private.line_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE account public.bf_accounts;dated timestamptz;BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_accounting_settings WHERE cafe_id=NEW.cafe_id) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));SELECT * INTO account FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND id=NEW.account_id FOR SHARE;
  IF NOT FOUND OR NOT account.active OR account.frozen OR account.is_group THEN RAISE EXCEPTION 'الحساب غير متاح للترحيل';END IF;
  SELECT created_at INTO dated FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id;PERFORM brand_finance_private.gl_date_open(NEW.cafe_id,(dated AT TIME ZONE 'Asia/Riyadh')::date);NEW.created_at:=dated;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_accounting_line BEFORE INSERT ON public.bf_journal FOR EACH ROW EXECUTE FUNCTION erp_accounting_private.line_guard();
CREATE FUNCTION public.erp_accounting_read(p_cafe_id uuid,p_query jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE answer jsonb;r text;BEGIN
 r:=erp_accounting_private.authorize(p_cafe_id);answer:=erp_accounting_private.gl_snapshot(p_cafe_id,coalesce((p_query->>'offset')::integer,0));
 IF p_query->>'id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(answer->'drafts') d WHERE d->>'id'=p_query->>'id') THEN
  answer:=jsonb_set(answer,'{drafts}',(answer->'drafts')||coalesce((SELECT jsonb_build_array(to_jsonb(d)-'cafe_id') FROM public.bf_gl_drafts d WHERE cafe_id=p_cafe_id AND id=(p_query->>'id')::uuid),'[]'::jsonb));
 END IF;
 answer:=answer||jsonb_build_object('canWrite',r<>'auditor','canSettings',r='owner','canApprove',r IN('owner','manager','accountant'),'costCenters',coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id' ORDER BY code) FROM public.erp_cost_centers x WHERE cafe_id=p_cafe_id),'[]'),'metadata',coalesce((SELECT jsonb_object_agg(draft_id,payload) FROM public.erp_accounting_metadata WHERE cafe_id=p_cafe_id),'{}'),'configuration',coalesce((SELECT payload||jsonb_build_object('revision',revision) FROM public.erp_accounting_settings WHERE cafe_id=p_cafe_id),'{"revision":0,"journalFields":[],"assetFields":[],"fiscalMonth":1}'::jsonb));
 RETURN erp_access_private.mask_snapshot(p_cafe_id,'accounting',answer);
END $$;
CREATE FUNCTION erp_accounting_private.save_cost_center(c uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE old public.erp_cost_centers;answer public.erp_cost_centers;rid uuid:=coalesce((p->>'id')::uuid,gen_random_uuid());parent uuid:=(p->>'parentId')::uuid;BEGIN
 IF p->>'id' IS NOT NULL THEN SELECT * INTO old FROM public.erp_cost_centers WHERE cafe_id=c AND id=rid FOR UPDATE;IF NOT FOUND OR old.revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير مركز التكلفة' USING ERRCODE='40001';END IF;END IF;
 IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_cost_centers WHERE cafe_id=c AND id=parent AND active AND is_group) THEN RAISE EXCEPTION 'اختر مركز تكلفة رئيسيًا نشطًا';END IF;
 IF parent=rid OR EXISTS(WITH RECURSIVE ancestors AS(SELECT id,parent_id FROM public.erp_cost_centers WHERE cafe_id=c AND id=parent UNION ALL SELECT x.id,x.parent_id FROM public.erp_cost_centers x JOIN ancestors a ON x.id=a.parent_id WHERE x.cafe_id=c) SELECT 1 FROM ancestors WHERE id=rid) THEN RAISE EXCEPTION 'لا يمكن إنشاء دورة في شجرة مراكز التكلفة';END IF;
 IF NOT coalesce((p->>'isGroup')::boolean,false) AND EXISTS(SELECT 1 FROM public.erp_cost_centers WHERE cafe_id=c AND parent_id=rid) THEN RAISE EXCEPTION 'المركز الرئيسي مرتبط بمراكز فرعية';END IF;
 IF coalesce((p->>'isGroup')::boolean,false) AND EXISTS(SELECT 1 FROM public.erp_accounting_allocations WHERE cafe_id=c AND cost_center_id=rid) THEN RAISE EXCEPTION 'المركز مستخدم في قيود ولا يمكن تحويله إلى رئيسي';END IF;
 INSERT INTO public.erp_cost_centers(id,cafe_id,code,name,parent_id,is_group,active) VALUES(rid,c,btrim(p->>'code'),btrim(p->>'name'),parent,(p->>'isGroup')::boolean,(p->>'active')::boolean) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,parent_id=excluded.parent_id,is_group=excluded.is_group,active=excluded.active,revision=erp_cost_centers.revision+1 RETURNING * INTO answer;RETURN to_jsonb(answer)-'cafe_id';
END $$;
DO $$DECLARE source text;BEGIN
 SELECT pg_get_functiondef('erp_payroll_private.validate_custom_values(jsonb,jsonb,uuid,uuid,text,integer,boolean)'::regprocedure) INTO source;
 source:=replace(source,'erp_payroll_private.validate_custom_values','erp_accounting_private.validate_custom_values');source:=replace(source,'''payroll_record''','''journal_draft''');source:=replace(source,'''contract''','''journal''');source:=replace(source,'''erp_payroll_records''','''erp_accounting_metadata''');source:=replace(source,'AND id IS DISTINCT FROM $2 AND payload','AND draft_id IS DISTINCT FROM $2 AND payload');EXECUTE source;
END $$;
CREATE FUNCTION erp_accounting_private.allocations(c uuid,d uuid,lines jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE line jsonb;allocation jsonb;i integer:=0;total numeric;seen uuid[];cid uuid;percentage numeric;BEGIN
 DELETE FROM public.erp_accounting_allocations WHERE cafe_id=c AND draft_id=d;
 FOR line IN SELECT * FROM jsonb_array_elements(lines) LOOP
  total:=0;seen:='{}';IF jsonb_typeof(coalesce(line->'costCenters','[]'))<>'array' OR jsonb_array_length(coalesce(line->'costCenters','[]'))>100 THEN RAISE EXCEPTION 'توزيع مراكز التكلفة غير صالح';END IF;
  FOR allocation IN SELECT * FROM jsonb_array_elements(coalesce(line->'costCenters','[]')) LOOP
   cid:=(allocation->>'id')::uuid;percentage:=(allocation->>'percentage')::numeric;
   IF cid=ANY(seen) OR NOT EXISTS(SELECT 1 FROM public.erp_cost_centers WHERE cafe_id=c AND id=cid AND active AND NOT is_group) OR percentage IS NULL OR percentage<=0 OR percentage>100 OR percentage='NaN'::numeric THEN RAISE EXCEPTION 'اختر مركز تكلفة فرعيًا نشطًا ونسبة صحيحة';END IF;
   seen:=array_append(seen,cid);total:=total+percentage;INSERT INTO public.erp_accounting_allocations(cafe_id,draft_id,line_index,cost_center_id,percentage) VALUES(c,d,i,cid,percentage);
  END LOOP;
  IF total<>0 AND total<>100 THEN RAISE EXCEPTION 'مجموع نسب توزيع السطر يجب أن يساوي مئة بالمئة';END IF;i:=i+1;
 END LOOP;
END $$;
CREATE FUNCTION public.erp_accounting_write(p_cafe_id uuid,p_action text,p_data jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;permission text;prior erp_accounting_private.requests;cmd jsonb:=jsonb_build_object('action',p_action,'data',p_data);result jsonb;payload jsonb;line jsonb;converted jsonb:='[]';rate numeric;currency text;rid uuid;revision integer;metadata jsonb;cfg jsonb;BEGIN
 permission:=CASE WHEN p_action IN('configuration','settings','period_close','period_reopen') THEN 'settings' WHEN p_action='cost_center_delete' THEN 'delete' WHEN p_action IN('save','account_save','cost_center') THEN CASE WHEN nullif(p_data->>'id','') IS NULL THEN 'create' ELSE 'update' END WHEN p_action IN('submit','approve','post','reverse','cancel') THEN 'approve' ELSE 'update' END;
 role_name:=erp_accounting_private.authorize(p_cafe_id,permission);
 IF p_request_id IS NULL OR p_action NOT IN('configuration','cost_center','cost_center_delete','save','submit','approve','post','reverse','cancel','account_save','period_close','period_reopen','settings') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>400000 THEN RAISE EXCEPTION 'عملية الحسابات غير صالحة';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO prior FROM erp_accounting_private.requests WHERE cafe_id=p_cafe_id AND id=p_request_id;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.command<>cmd THEN RAISE EXCEPTION 'معرف الطلب مستخدم ببيانات مختلفة';END IF;RETURN prior.result||'{"duplicate":true}'::jsonb;END IF;
 IF p_action='configuration' THEN
  PERFORM erp_manufacturing_private.validate_custom_fields(coalesce(p_data->'journalFields','[]'));PERFORM erp_manufacturing_private.validate_custom_fields(coalesce(p_data->'assetFields','[]'));
  IF coalesce((p_data->>'fiscalMonth')::integer,0) NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'اختر شهر بداية السنة المالية';END IF;
  IF (p_data->>'fiscalMonth')::integer<>coalesce((SELECT (s.payload->>'fiscalMonth')::integer FROM public.erp_accounting_settings s WHERE s.cafe_id=p_cafe_id),1) AND EXISTS(SELECT 1 FROM public.bf_gl_drafts WHERE cafe_id=p_cafe_id) THEN RAISE EXCEPTION 'تغيير بداية السنة متاح قبل تسجيل القيود للحفاظ على تسلسلها';END IF;
  SELECT s.revision INTO revision FROM public.erp_accounting_settings s WHERE cafe_id=p_cafe_id FOR UPDATE;IF coalesce(revision,0)<>coalesce((p_data->>'revision')::integer,0) THEN RAISE EXCEPTION 'تغيرت الإعدادات' USING ERRCODE='40001';END IF;
  INSERT INTO public.erp_accounting_settings(cafe_id,payload) VALUES(p_cafe_id,p_data) ON CONFLICT(cafe_id) DO UPDATE SET payload=excluded.payload,revision=erp_accounting_settings.revision+1 RETURNING jsonb_build_object('id',cafe_id,'revision',erp_accounting_settings.revision) INTO result;
 ELSIF p_action='cost_center' THEN result:=erp_accounting_private.save_cost_center(p_cafe_id,p_data);
 ELSIF p_action='cost_center_delete' THEN
  DELETE FROM public.erp_cost_centers WHERE cafe_id=p_cafe_id AND id=(p_data->>'id')::uuid AND erp_cost_centers.revision=(p_data->>'revision')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION 'تغير مركز التكلفة' USING ERRCODE='40001';END IF;result:=jsonb_build_object('id',p_data->>'id','deleted',true);
 ELSE
  IF p_action='account_save' AND role_name NOT IN('owner','accountant') THEN RAISE EXCEPTION 'إدارة دليل الحسابات للمالك والمحاسب' USING ERRCODE='42501';END IF;
  INSERT INTO public.erp_accounting_settings(cafe_id) VALUES(p_cafe_id) ON CONFLICT DO NOTHING;
  SELECT s.payload INTO cfg FROM public.erp_accounting_settings s WHERE cafe_id=p_cafe_id;
  IF p_action='save' THEN
   currency:=coalesce(p_data->>'currency','SAR');rate:=coalesce((p_data->>'exchangeRate')::numeric,1);
   IF currency!~'^[A-Z]{3}$' OR rate<=0 OR rate>1000000 OR rate='NaN'::numeric OR(currency='SAR' AND rate<>1) THEN RAISE EXCEPTION 'راجع العملة وسعر الصرف';END IF;
   IF jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'أضف بنود القيد';END IF;
   FOR line IN SELECT * FROM jsonb_array_elements(p_data->'lines') LOOP
    converted:=converted||jsonb_build_array((line-'costCenters')||jsonb_build_object('debit',round((line->>'debit')::numeric*rate,2),'credit',round((line->>'credit')::numeric*rate,2)));
   END LOOP;
   payload:=(p_data-'customValues'-'currency'-'exchangeRate')||jsonb_build_object('lines',converted);
   result:=erp_accounting_private.gl_execute(p_cafe_id,p_action,payload,p_request_id);rid:=(result->>'id')::uuid;
   PERFORM erp_accounting_private.validate_custom_values(coalesce(cfg->'journalFields','[]'),coalesce(p_data->'customValues','{}'),p_cafe_id,rid,'journal',0,true);
   metadata:=jsonb_build_object('currency',currency,'exchangeRate',rate,'lines',p_data->'lines','customValues',coalesce(p_data->'customValues','{}'));
   INSERT INTO public.erp_accounting_metadata(cafe_id,draft_id,payload) VALUES(p_cafe_id,rid,metadata) ON CONFLICT(cafe_id,draft_id) DO UPDATE SET payload=excluded.payload;
   PERFORM erp_accounting_private.allocations(p_cafe_id,rid,p_data->'lines');
  ELSE
   IF p_action IN('submit','approve','post') THEN
    SELECT m.payload INTO metadata FROM public.erp_accounting_metadata m WHERE m.cafe_id=p_cafe_id AND m.draft_id=(p_data->>'id')::uuid;
    PERFORM erp_accounting_private.validate_custom_values(coalesce(cfg->'journalFields','[]'),coalesce(metadata->'customValues','{}'),p_cafe_id,(p_data->>'id')::uuid,'journal');
    IF EXISTS(SELECT 1 FROM public.erp_accounting_allocations a JOIN public.erp_cost_centers c ON c.cafe_id=a.cafe_id AND c.id=a.cost_center_id WHERE a.cafe_id=p_cafe_id AND a.draft_id=(p_data->>'id')::uuid AND(NOT c.active OR c.is_group)) THEN RAISE EXCEPTION 'أحد مراكز التكلفة لم يعد متاحًا';END IF;
   END IF;
   result:=erp_accounting_private.gl_execute(p_cafe_id,p_action,p_data,p_request_id);
  END IF;
 END IF;
 INSERT INTO erp_accounting_private.requests VALUES(p_cafe_id,p_request_id,auth.uid(),cmd,result);
 IF p_action IN('configuration','cost_center','cost_center_delete') THEN INSERT INTO public.bf_gl_events(cafe_id,entity_id,action,details,created_by) VALUES(p_cafe_id,(result->>'id')::uuid,p_action,jsonb_build_object('after',p_data),auth.uid());END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.erp_accounting_detail(p_cafe_id uuid,p_kind text,p_id uuid,p_before bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 PERFORM erp_accounting_private.authorize(p_cafe_id);
 IF p_kind='document' THEN RETURN erp_accounting_private.gl_document(p_cafe_id,p_id);ELSIF p_kind='events' THEN RETURN erp_accounting_private.gl_events(p_cafe_id,p_id,p_before);ELSE RAISE EXCEPTION 'نوع السجل غير صالح';END IF;
END $$;
CREATE FUNCTION public.erp_accounting_report(p_cafe_id uuid,p_from date,p_to date,p_account_id uuid DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 PERFORM erp_accounting_private.authorize(p_cafe_id);RETURN erp_accounting_private.gl_report(p_cafe_id,p_from,p_to,p_account_id,p_offset);
END $$;
CREATE FUNCTION public.erp_accounting_cost_report(p_cafe_id uuid,p_from date,p_to date,p_center uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE answer jsonb;BEGIN
 PERFORM erp_accounting_private.authorize(p_cafe_id);
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_from>p_to OR p_to-p_from>3660 THEN RAISE EXCEPTION 'حدد فترة تقرير صحيحة لا تتجاوز عشر سنوات';END IF;
 IF p_center IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_cost_centers WHERE cafe_id=p_cafe_id AND id=p_center) THEN RAISE EXCEPTION 'مركز التكلفة غير متاح';END IF;
 WITH RECURSIVE selected AS(SELECT id FROM public.erp_cost_centers WHERE cafe_id=p_cafe_id AND id=p_center UNION ALL SELECT c.id FROM public.erp_cost_centers c JOIN selected s ON c.parent_id=s.id WHERE c.cafe_id=p_cafe_id),
 source AS(SELECT a.cost_center_id,(doc.created_at AT TIME ZONE 'Asia/Riyadh')::date dated,(line->>'debit')::numeric*a.percentage/100 debit,(line->>'credit')::numeric*a.percentage/100 credit FROM public.erp_accounting_allocations a JOIN public.bf_gl_drafts d ON d.cafe_id=a.cafe_id AND d.id=a.draft_id JOIN public.bf_documents doc ON doc.cafe_id=d.cafe_id AND doc.id=d.document_id CROSS JOIN LATERAL jsonb_array_elements(d.lines) WITH ORDINALITY x(line,n) WHERE a.cafe_id=p_cafe_id AND n=a.line_index+1
 UNION ALL SELECT a.cost_center_id,(doc.created_at AT TIME ZONE 'Asia/Riyadh')::date,(line->>'credit')::numeric*a.percentage/100,(line->>'debit')::numeric*a.percentage/100 FROM public.erp_accounting_allocations a JOIN public.bf_gl_drafts d ON d.cafe_id=a.cafe_id AND d.id=a.draft_id JOIN public.bf_documents doc ON doc.cafe_id=d.cafe_id AND doc.id=d.reversal_document_id CROSS JOIN LATERAL jsonb_array_elements(d.lines) WITH ORDINALITY x(line,n) WHERE a.cafe_id=p_cafe_id AND n=a.line_index+1),
 totals AS(SELECT c.id,c.code,c.name,c.is_group,c.parent_id,coalesce(sum(s.debit-s.credit) FILTER(WHERE s.dated<p_from),0) opening,coalesce(sum(s.debit) FILTER(WHERE s.dated BETWEEN p_from AND p_to),0) debit,coalesce(sum(s.credit) FILTER(WHERE s.dated BETWEEN p_from AND p_to),0) credit,coalesce(sum(s.debit-s.credit) FILTER(WHERE s.dated<=p_to),0) closing FROM public.erp_cost_centers c LEFT JOIN source s ON s.cost_center_id=c.id WHERE c.cafe_id=p_cafe_id AND(p_center IS NULL OR c.id IN(SELECT id FROM selected)) GROUP BY c.id)
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY code),'[]') INTO answer FROM totals t;
 RETURN jsonb_build_object('from',p_from,'to',p_to,'centerId',p_center,'currency','SAR','rows',answer);
END $$;
-- Extend the asset editor with the same validated field types. Existing asset
-- RPC authorization and depreciation/custody behavior remain authoritative.
DO $$DECLARE src text;BEGIN
 SELECT pg_get_functiondef('erp_payroll_private.validate_custom_values(jsonb,jsonb,uuid,uuid,text,integer,boolean)'::regprocedure) INTO src;
 src:=replace(src,'erp_payroll_private.validate_custom_values','erp_accounting_private.validate_asset_values');src:=replace(src,'''payroll_record''','''asset''');src:=replace(src,'''contract''','''asset''');src:=replace(src,'''erp_payroll_records''','''erp_assets''');EXECUTE src;
 SELECT pg_get_functiondef('public.erp_asset_read(uuid,uuid,text,text,integer)'::regprocedure) INTO src;EXECUTE replace(src,'public.erp_asset_read(','erp_accounting_private.asset_read_before_fields(');
END $$;
CREATE OR REPLACE FUNCTION public.erp_asset_read(p_cafe uuid,p_id uuid DEFAULT NULL,p_query text DEFAULT '',p_status text DEFAULT '',p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 result:=erp_accounting_private.asset_read_before_fields(p_cafe,p_id,p_query,p_status,p_page);
 RETURN result||jsonb_build_object('customFields',coalesce((SELECT payload->'assetFields' FROM public.erp_accounting_settings WHERE cafe_id=p_cafe),'[]'));
END $$;
CREATE FUNCTION erp_accounting_private.asset_fields_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF TG_OP='UPDATE' AND NEW.payload IS NOT DISTINCT FROM OLD.payload AND NOT(OLD.status='draft' AND NEW.status='in_service') THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
 PERFORM erp_accounting_private.validate_asset_values(coalesce((SELECT payload->'assetFields' FROM public.erp_accounting_settings WHERE cafe_id=NEW.cafe_id),'[]'),coalesce(NEW.payload->'customValues','{}'),NEW.cafe_id,NEW.id,'asset',0,NEW.status='draft');RETURN NEW;
END $$;
CREATE TRIGGER erp_accounting_asset_fields BEFORE INSERT OR UPDATE OF payload,status ON public.erp_assets FOR EACH ROW EXECUTE FUNCTION erp_accounting_private.asset_fields_guard();
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_accounting;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF p_type IS DISTINCT FROM 'journal_draft' THEN PERFORM erp_file_private.assert_record_before_accounting(p_cafe,p_type,p_record,p_write);RETURN;END IF;
 PERFORM erp_accounting_private.authorize(p_cafe,CASE WHEN p_write THEN 'files' ELSE 'read' END);
 PERFORM 1 FROM public.bf_gl_drafts WHERE cafe_id=p_cafe AND id=p_record FOR KEY SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'القيد غير متاح' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_accounting(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_accounting_private.file_referenced(c uuid,d uuid,f uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.erp_accounting_metadata WHERE cafe_id=c AND draft_id=d AND jsonb_path_exists(coalesce(payload->'customValues','{}'),'$.** ? (@ == $file)',jsonb_build_object('file',f::text))) OR EXISTS(SELECT 1 FROM public.erp_assets WHERE cafe_id=c AND id=d AND jsonb_path_exists(coalesce(payload->'customValues','{}'),'$.** ? (@ == $file)',jsonb_build_object('file',f::text)))$$;
CREATE FUNCTION erp_accounting_private.file_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN IF OLD.entity_type IN('journal_draft','asset') AND erp_accounting_private.file_referenced(OLD.cafe_id,OLD.record_id,OLD.id) THEN RAISE EXCEPTION 'الملف مرتبط ببيانات القيد أو الأصل';END IF;RETURN OLD;END $$;
CREATE TRIGGER erp_accounting_file_guard BEFORE DELETE ON public.erp_files FOR EACH ROW EXECUTE FUNCTION erp_accounting_private.file_guard();
DO $$DECLARE src text;BEGIN SELECT pg_get_functiondef('public.erp_file_delete_access(text)'::regprocedure) INTO src;EXECUTE replace(src,'public.erp_file_delete_access(','erp_accounting_private.file_delete_before_accounting(');END $$;
CREATE OR REPLACE FUNCTION public.erp_file_delete_access(p_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE file public.erp_files;BEGIN
 IF NOT erp_accounting_private.file_delete_before_accounting(p_path) THEN RETURN false;END IF;
 SELECT * INTO file FROM public.erp_files WHERE path=p_path FOR UPDATE;
 IF file.entity_type IN('journal_draft','asset') AND erp_accounting_private.file_referenced(file.cafe_id,file.record_id,file.id) THEN RETURN false;END IF;RETURN true;
END $$;
-- All writes enter the authenticated, tenant-scoped RPCs above.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_accounting_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_accounting_read(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_accounting_read(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_accounting_write(uuid,text,jsonb,uuid),public.erp_accounting_detail(uuid,text,uuid,bigint),public.erp_accounting_report(uuid,date,date,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_accounting_write(uuid,text,jsonb,uuid),public.erp_accounting_detail(uuid,text,uuid,bigint),public.erp_accounting_report(uuid,date,date,uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_accounting_cost_report(uuid,date,date,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_accounting_cost_report(uuid,date,date,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
