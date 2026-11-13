BEGIN;
CREATE TABLE erp_branch_private.procedures(name text PRIMARY KEY,oid oid NOT NULL,domain text NOT NULL,mutates boolean NOT NULL);
CREATE TABLE public.erp_branch_records(cafe_id uuid NOT NULL,table_name text NOT NULL,record_id uuid NOT NULL,branch_id uuid NOT NULL,PRIMARY KEY(cafe_id,table_name,record_id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id));
ALTER TABLE public.erp_branch_records ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.erp_branch_records FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX erp_branch_records_id ON public.erp_branch_records(cafe_id,record_id,branch_id);
CREATE FUNCTION erp_branch_private.assert_context(c uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE s jsonb:=erp_branch_private.scope(c);expected jsonb;BEGIN
 IF (s->>'revision')::integer=0 THEN RETURN;END IF;
 BEGIN expected:=nullif(current_setting('erp.branch_expected',true),'')::jsonb;EXCEPTION WHEN OTHERS THEN expected:=NULL;END;
 IF expected IS NULL OR expected->'branchId' IS DISTINCT FROM s->'branchId' OR expected->'revision' IS DISTINCT FROM s->'revision' THEN RAISE EXCEPTION 'تغير فرع العمل أعد تحميل الصفحة قبل الحفظ' USING ERRCODE='40001';END IF;
END $$;
CREATE FUNCTION erp_branch_private.row_allowed(c uuid,b uuid,j jsonb,k text DEFAULT '') RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE key text;v jsonb;rid uuid;kind text;scoped uuid;BEGIN
 IF b IS NULL THEN RETURN true;END IF;IF jsonb_typeof(j)<>'object' THEN RETURN true;END IF;
 IF coalesce(j->>'branchId',j->>'branch_id','')~'^[0-9a-f-]{36}$' AND coalesce(j->>'branchId',j->>'branch_id')::uuid<>b THEN RETURN false;END IF;
 IF coalesce(j->>'id','')~'^[0-9a-f-]{36}$' THEN
  rid:=(j->>'id')::uuid;
  IF k<>'' AND NOT erp_branch_private.allowed_resource(c,b,k,rid) THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM public.erp_branch_resources x WHERE x.cafe_id=c AND x.record_id=rid AND NOT erp_branch_private.allowed_resource(c,b,x.kind,rid)) THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM public.erp_branch_records WHERE cafe_id=c AND record_id=rid AND branch_id<>b) OR EXISTS(SELECT 1 FROM public.erp_branch_documents WHERE cafe_id=c AND document_id=rid AND branch_id<>b) THEN RETURN false;END IF;
 END IF;
 FOR key,v IN SELECT * FROM jsonb_each(j) LOOP
  IF jsonb_typeof(v)='string' AND(v#>>'{}')~'^[0-9a-f-]{36}$' THEN
   rid:=(v#>>'{}')::uuid;kind:=CASE WHEN key IN('customerId','customer_id') THEN 'customer' WHEN key IN('supplierId','supplier_id') THEN 'supplier' WHEN key IN('itemId','item_id','productId','product_id','inventory_item_id','bundleItemId') THEN 'item' WHEN key IN('accountId','account_id','cashAccountId','counterAccountId','adjustmentAccountId','defaultAdjustmentAccountId') THEN 'account' WHEN key IN('costCenterId','cost_center_id','centerId') THEN 'cost_center' WHEN key IN('unitTemplateId','unit_template_id') THEN 'unit_template' ELSE '' END;
   IF key IN('partyId','party_id') THEN SELECT p.kind INTO kind FROM public.bf_parties p WHERE p.cafe_id=c AND p.id=rid;END IF;
   IF coalesce(kind,'')<>'' AND NOT erp_branch_private.allowed_resource(c,b,kind,rid) THEN RETURN false;END IF;
   IF EXISTS(SELECT 1 FROM public.erp_branch_resources x WHERE x.cafe_id=c AND x.record_id=rid AND NOT erp_branch_private.allowed_resource(c,b,x.kind,rid)) THEN RETURN false;END IF;
   IF EXISTS(SELECT 1 FROM public.erp_branch_records WHERE cafe_id=c AND record_id=rid AND branch_id<>b) THEN RETURN false;END IF;
   IF key IN('documentId','document_id','invoiceId','financeId','finance_document_id','source_document_id','reference_id') AND EXISTS(SELECT 1 FROM public.erp_branch_documents WHERE cafe_id=c AND document_id=rid AND branch_id<>b) THEN RETURN false;END IF;
  ELSIF jsonb_typeof(v)='object' THEN IF NOT erp_branch_private.row_allowed(c,b,v,'') THEN RETURN false;END IF;
  END IF;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION erp_branch_private.assert_input(c uuid,j jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE v jsonb;b uuid:=erp_branch_private.current_branch(c);BEGIN
 IF NOT erp_branch_private.row_allowed(c,b,j,'') THEN RAISE EXCEPTION 'يتضمن المستند سجلًا غير متاح في الفرع المختار' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(j)='object' THEN FOR v IN SELECT value FROM jsonb_each(j) LOOP IF jsonb_typeof(v) IN('array','object') THEN PERFORM erp_branch_private.assert_input(c,v);END IF;END LOOP;
 ELSIF jsonb_typeof(j)='array' THEN FOR v IN SELECT value FROM jsonb_array_elements(j) LOOP PERFORM erp_branch_private.assert_input(c,v);END LOOP;END IF;
END $$;
CREATE FUNCTION erp_branch_private.filter_json(c uuid,b uuid,j jsonb,context text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE result jsonb;key text;v jsonb;k text;filtered jsonb;BEGIN
 IF b IS NULL OR j IS NULL THEN RETURN j;END IF;
 k:=CASE context WHEN 'customers' THEN 'customer' WHEN 'suppliers' THEN 'supplier' WHEN 'items' THEN 'item' WHEN 'products' THEN 'item' WHEN 'accounts' THEN 'account' WHEN 'costCenters' THEN 'cost_center' WHEN 'centers' THEN 'cost_center' WHEN 'unitTemplates' THEN 'unit_template' ELSE '' END;
 IF jsonb_typeof(j)='array' THEN result:='[]';FOR v IN SELECT value FROM jsonb_array_elements(j) LOOP IF erp_branch_private.row_allowed(c,b,v,k) THEN filtered:=erp_branch_private.filter_json(c,b,v,context);IF filtered IS NOT NULL THEN result:=result||jsonb_build_array(filtered);END IF;END IF;END LOOP;RETURN result;
 ELSIF jsonb_typeof(j)='object' THEN
  IF NOT erp_branch_private.row_allowed(c,b,j,k) THEN RETURN NULL;END IF;
  result:='{}';FOR key,v IN SELECT * FROM jsonb_each(j) LOOP result:=result||jsonb_build_object(key,erp_branch_private.filter_json(c,b,v,key));END LOOP;RETURN result;
 END IF;RETURN j;
END $$;
CREATE FUNCTION erp_branch_private.capture_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE c uuid:=NEW.cafe_id;b uuid;row jsonb:=to_jsonb(NEW);rid uuid;kind text;BEGIN
 IF nullif(current_setting('erp.branch_cafe',true),'') IS DISTINCT FROM c::text THEN RETURN NEW;END IF;b:=nullif(current_setting('erp.branch_id',true),'')::uuid;IF b IS NULL THEN RETURN NEW;END IF;
 IF NOT erp_branch_private.row_allowed(c,b,row,'') THEN RAISE EXCEPTION 'سجل خارج الفرع المختار' USING ERRCODE='42501';END IF;
 rid:=coalesce(nullif(row->>'id',''),nullif(row->>'item_id',''))::uuid;
 IF TG_TABLE_NAME='bf_documents' THEN
  IF NEW.reference_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_branch_documents WHERE cafe_id=c AND document_id=NEW.reference_id AND branch_id<>b) THEN RAISE EXCEPTION 'المستند الأصلي تابع لفرع آخر' USING ERRCODE='42501';END IF;
  INSERT INTO public.erp_branch_documents(cafe_id,document_id,branch_id) VALUES(c,rid,b);
 ELSE
  kind:=CASE TG_TABLE_NAME WHEN 'bf_parties' THEN row->>'kind' WHEN 'bf_items' THEN 'item' WHEN 'erp_cost_centers' THEN 'cost_center' WHEN 'erp_inventory_catalogs' THEN CASE WHEN row->>'kind'='unit_template' THEN 'unit_template' END ELSE NULL END;
  IF TG_TABLE_NAME='erp_inventory_catalogs' AND kind IS NULL THEN RETURN NEW;END IF;
  IF kind IS NOT NULL THEN INSERT INTO public.erp_branch_resources VALUES(c,kind,rid,b) ON CONFLICT DO NOTHING;ELSE INSERT INTO public.erp_branch_records VALUES(c,TG_TABLE_NAME,rid,b) ON CONFLICT DO NOTHING;END IF;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION erp_branch_private.guard_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE c uuid:=OLD.cafe_id;b uuid;row jsonb:=to_jsonb(OLD);kind text;BEGIN
 IF nullif(current_setting('erp.branch_cafe',true),'') IS DISTINCT FROM c::text THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;b:=nullif(current_setting('erp.branch_id',true),'')::uuid;
 kind:=CASE TG_TABLE_NAME WHEN 'bf_parties' THEN row->>'kind' WHEN 'bf_items' THEN 'item' WHEN 'bf_accounts' THEN 'account' WHEN 'erp_cost_centers' THEN 'cost_center' WHEN 'erp_inventory_catalogs' THEN CASE WHEN row->>'kind'='unit_template' THEN 'unit_template' ELSE '' END ELSE '' END;
 IF NOT erp_branch_private.row_allowed(c,b,row,kind) THEN RAISE EXCEPTION 'لا يمكن تعديل سجل خارج الفرع المختار' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE PERFORM erp_branch_private.assert_input(c,to_jsonb(NEW));RETURN NEW;END IF;
END $$;
CREATE FUNCTION erp_branch_private.cleanup_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE row jsonb:=to_jsonb(OLD);rid uuid;k text;BEGIN
 rid:=coalesce(nullif(row->>'id',''),nullif(row->>'item_id',''))::uuid;k:=CASE TG_TABLE_NAME WHEN 'bf_parties' THEN row->>'kind' WHEN 'bf_items' THEN 'item' WHEN 'bf_accounts' THEN 'account' WHEN 'erp_cost_centers' THEN 'cost_center' WHEN 'erp_inventory_catalogs' THEN CASE WHEN row->>'kind'='unit_template' THEN 'unit_template' END END;
 DELETE FROM public.erp_branch_records WHERE cafe_id=OLD.cafe_id AND table_name=TG_TABLE_NAME AND record_id=rid;
 IF k IS NOT NULL THEN DELETE FROM public.erp_branch_resources WHERE cafe_id=OLD.cafe_id AND kind=k AND record_id=rid;END IF;RETURN OLD;
END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['bf_documents','bf_parties','bf_items','erp_inventory_catalogs','erp_cost_centers','erp_inventory_documents','erp_purchase_documents','erp_mfg_orders','erp_mfg_plans','erp_mfg_boms','erp_finance_vouchers','erp_finance_custodies','bf_gl_drafts','erp_assets','erp_rental_units','erp_rental_reservations','erp_rental_contracts','erp_work_orders','erp_workflow_records','erp_contracting_documents','erp_bookings','erp_time_entries','erp_memberships','erp_credit_charges','erp_credit_usages','erp_insurance_enrollments','erp_cheques','erp_payroll_records','erp_tasks','erp_saved_reports','erp_sales_requisitions','erp_time_batches','erp_customer_attendance','erp_finance_schedules','bf_recurring_invoices'] LOOP
 IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('CREATE TRIGGER erp_branch_cleanup AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_branch_private.cleanup_record()',t);EXECUTE format('CREATE TRIGGER erp_branch_capture AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_branch_private.capture_record()',t);EXECUTE format('CREATE TRIGGER erp_branch_guard BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_branch_private.guard_record()',t);END IF;END LOOP;
 CREATE TRIGGER erp_branch_account_cleanup AFTER DELETE ON public.bf_accounts FOR EACH ROW EXECUTE FUNCTION erp_branch_private.cleanup_record();
 CREATE TRIGGER erp_branch_account_guard BEFORE UPDATE OR DELETE ON public.bf_accounts FOR EACH ROW EXECUTE FUNCTION erp_branch_private.guard_record();
END $$;
-- Preserve public function OIDs/grants and delegate complete original authorization
DO $$DECLARE p record;args text;callargs text;source text;copy_name text;body text;mutates boolean;domain text;guards text;BEGIN
 FOR p IN SELECT proc.*,n.nspname FROM pg_proc proc JOIN pg_namespace n ON n.oid=proc.pronamespace WHERE n.nspname='public' AND proc.prorettype='jsonb'::regtype AND proc.proargtypes[0]='uuid'::regtype AND(proc.proname~'^erp_(inventory|purchases|customers|customer|accounting|finance|manufacturing)_(read|write|save|act|detail|report|statement|opening|import|cost_report)$' OR proc.proname~'^erp_(asset|bookings|booking|rentals|work_orders|work_order|workflows|workflow|installments|credits|credit|memberships|customer_attendance|insurance|cheques|customer_options|time|payroll|tasks|reports|report|sales_requisitions)_(read|write|save|act|detail|report|import|location|quote|targets|customers|purchase|execute|run|export|cost_report)$' OR proc.proname='erp_contracting') LOOP
  domain:=split_part(p.proname,'_',2);mutates:=p.proname~'_(write|save|act|opening|import|location|purchase|execute)$' OR p.proname='erp_contracting';copy_name:=p.proname||'_before_scope';SELECT pg_get_functiondef(p.oid) INTO source;EXECUTE replace(source,'public.'||p.proname||'(','erp_branch_private.'||copy_name||'(');
  SELECT string_agg('$'||i,',' ORDER BY i) INTO callargs FROM generate_series(1,p.pronargs)i;
  guards:='';FOR i IN 2..p.pronargs LOOP IF p.proargtypes[i-1]='uuid'::regtype AND p.proargnames[i] NOT LIKE '%request%' THEN guards:=guards||format('PERFORM erp_branch_private.assert_input($1,jsonb_build_object(''id'',$%s));',i);END IF;END LOOP;IF mutates OR p.proname IN('erp_report_run','erp_report_export') THEN guards:=guards||'PERFORM erp_branch_private.assert_context($1);';FOR i IN 2..p.pronargs LOOP IF p.proargtypes[i-1]='jsonb'::regtype THEN guards:=guards||format('PERFORM erp_branch_private.assert_input($1,$%s);',i);END IF;END LOOP;END IF;
  IF p.proname='erp_contracting' THEN guards:='IF $2<>''read'' THEN '||guards||' END IF;';END IF;
  body:=format('DECLARE result jsonb;BEGIN PERFORM erp_branch_private.enter($1);%s result:=erp_branch_private.%I(%s);%s END',guards,copy_name,callargs,CASE WHEN mutates AND p.proname<>'erp_contracting' THEN 'RETURN result;' ELSE 'result:=erp_branch_private.filter_json($1,erp_branch_private.current_branch($1),result);IF jsonb_typeof(result)=''object'' THEN result:=result||jsonb_build_object(''branchScope'',erp_branch_private.scope($1));END IF;RETURN result;' END);
  EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS %L',p.proname,pg_get_function_arguments(p.oid),body);
  INSERT INTO erp_branch_private.procedures VALUES(p.proname,p.oid,domain,mutates);
 END LOOP;
END $$;
CREATE FUNCTION public.erp_branch_execute(p_cafe uuid,p_function text,p_arguments jsonb,p_scope jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE f record;p record;sql text;arg text;expr text;result jsonb;old_scope text;BEGIN
 SELECT * INTO f FROM erp_branch_private.procedures WHERE name=p_function AND(mutates OR name IN('erp_report_run','erp_report_export'));IF NOT FOUND OR jsonb_typeof(p_arguments)<>'object' OR octet_length(p_arguments::text)>3000000 THEN RAISE EXCEPTION 'عملية الفرع غير صالحة';END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=f.oid;IF (p_arguments->>p.proargnames[1])::uuid IS DISTINCT FROM p_cafe THEN RAISE EXCEPTION 'سياق علامة غير متطابق' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));old_scope:=current_setting('erp.branch_expected',true);PERFORM set_config('erp.branch_expected',coalesce(p_scope::text,''),true);PERFORM erp_branch_private.assert_context(p_cafe);
 sql:='SELECT public.'||quote_ident(p_function)||'(';FOR i IN 1..p.pronargs LOOP
  arg:=p.proargnames[i];IF NOT p_arguments?arg THEN IF i<=p.pronargs-p.pronargdefaults THEN RAISE EXCEPTION 'بيانات العملية ناقصة';ELSE CONTINUE;END IF;END IF;
  expr:=CASE WHEN p.proargtypes[i-1]='jsonb'::regtype THEN format('($1->%L)',arg) ELSE format('($1->>%L)::%s',arg,p.proargtypes[i-1]::regtype) END;
  IF right(sql,1)<>'(' THEN sql:=sql||',';END IF;sql:=sql||quote_ident(arg)||'=>'||expr;
 END LOOP;sql:=sql||')';EXECUTE sql INTO result USING p_arguments;PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN result;
END $$;
CREATE FUNCTION public.erp_branch_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 PERFORM erp_branch_private.enter(p_cafe_id);result:=public.brand_finance_snapshot(p_cafe_id);RETURN erp_branch_private.filter_json(p_cafe_id,erp_branch_private.current_branch(p_cafe_id),result);
END $$;
REVOKE ALL ON FUNCTION public.erp_branch_finance_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_branch_finance_snapshot(uuid) TO authenticated;
CREATE FUNCTION public.erp_branch_invoice_detail(p_cafe_id uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 PERFORM erp_branch_private.enter(p_cafe_id);PERFORM erp_branch_private.assert_input(p_cafe_id,jsonb_build_object('id',p_id));result:=public.brand_finance_invoice_detail(p_cafe_id,p_id);result:=erp_branch_private.filter_json(p_cafe_id,erp_branch_private.current_branch(p_cafe_id),result);IF result IS NULL THEN RAISE EXCEPTION 'المستند غير متاح في الفرع المختار' USING ERRCODE='42501';END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_branch_invoice_detail(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_branch_invoice_detail(uuid,uuid) TO authenticated;
CREATE FUNCTION erp_branch_private.guard_line() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF current_setting('erp.branch_cafe',true)=NEW.cafe_id::text THEN PERFORM erp_branch_private.assert_input(NEW.cafe_id,to_jsonb(NEW));END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_branch_journal_scope BEFORE INSERT ON public.bf_journal FOR EACH ROW EXECUTE FUNCTION erp_branch_private.guard_line();
CREATE TRIGGER erp_branch_line_scope BEFORE INSERT ON public.bf_document_lines FOR EACH ROW EXECUTE FUNCTION erp_branch_private.guard_line();
ALTER FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean) RENAME TO assert_record_before_branch_scope;
CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE visible boolean;BEGIN
 PERFORM erp_file_private.assert_record_before_branch_scope(p_cafe,p_type,p_record,p_write);
 IF p_type<>'branch' AND NOT erp_branch_private.row_allowed(p_cafe,erp_branch_private.current_branch(p_cafe),jsonb_build_object('id',p_record),'') THEN RAISE EXCEPTION 'مرفقات السجل غير متاحة في الفرع المختار' USING ERRCODE='42501';END IF;
 IF p_type='task' AND to_regprocedure('erp_task_private.task_visible(uuid,uuid)') IS NOT NULL THEN EXECUTE 'SELECT erp_task_private.task_visible($1,$2)' INTO visible USING p_cafe,p_record;IF NOT visible THEN RAISE EXCEPTION 'المهمة المرتبطة غير متاحة في الفرع المختار' USING ERRCODE='42501';END IF;END IF;
END $$;
REVOKE ALL ON FUNCTION erp_file_private.assert_record(uuid,text,uuid,boolean),erp_file_private.assert_record_before_branch_scope(uuid,text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- Reports filter facts before grouping, aggregation, pagination or export
DO $$DECLARE source text;BEGIN
 SELECT pg_get_functiondef('erp_reports_private.facts(uuid,text,date,date)'::regprocedure) INTO source;EXECUTE replace(source,'erp_reports_private.facts(','erp_branch_private.report_facts_before_scope(');
 SELECT pg_get_functiondef('erp_reports_private.document_branch(uuid,jsonb)'::regprocedure) INTO source;EXECUTE replace(source,'erp_reports_private.document_branch(','erp_branch_private.report_document_branch_before_scope(');
END $$;
CREATE OR REPLACE FUNCTION erp_reports_private.document_branch(c uuid,d jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE b uuid;n text;BEGIN
 SELECT x.branch_id,br.name INTO b,n FROM public.erp_branch_documents x JOIN public.branches br ON br.cafe_id=x.cafe_id AND br.id=x.branch_id WHERE x.cafe_id=c AND x.document_id=(d->>'id')::uuid;
 IF b IS NOT NULL THEN RETURN jsonb_build_object('branchId',b,'branch',n);END IF;RETURN erp_branch_private.report_document_branch_before_scope(c,d);
END $$;
CREATE OR REPLACE FUNCTION erp_reports_private.facts(c uuid,s text,f date,t date) RETURNS SETOF jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE r jsonb;b uuid;BEGIN
 PERFORM erp_branch_private.enter(c);b:=erp_branch_private.current_branch(c);FOR r IN SELECT * FROM erp_branch_private.report_facts_before_scope(c,s,f,t) LOOP IF erp_branch_private.row_allowed(c,b,r,'') THEN RETURN NEXT r;END IF;END LOOP;RETURN;
END $$;
-- Filter actual read sources before pagination and totals, while leaving legacy POS readers untouched
DO $$DECLARE t record;f record;src text;next_src text;k text;BEGIN
 FOR t IN SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE ns.nspname='public' AND cl.relkind='r' AND cl.relname NOT LIKE 'erp_branch_%' AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=cl.oid AND a.attname='cafe_id' AND NOT a.attisdropped) LOOP
  k:=CASE t.relname WHEN 'bf_parties' THEN '' WHEN 'bf_items' THEN 'item' WHEN 'bf_accounts' THEN 'account' WHEN 'erp_cost_centers' THEN 'cost_center' ELSE '' END;
  EXECUTE format('CREATE VIEW erp_branch_private.%I WITH (security_barrier=true) AS SELECT source.* FROM public.%I source WHERE nullif(current_setting(''erp.branch_cafe'',true),'''') IS DISTINCT FROM source.cafe_id::text OR erp_branch_private.row_allowed(source.cafe_id,erp_branch_private.current_branch(source.cafe_id),to_jsonb(source),%L)',t.relname,t.relname,k);
 END LOOP;
 FOR f IN SELECT proc.oid FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace WHERE ns.nspname LIKE 'erp_%_private' AND ns.nspname<>'erp_branch_private' AND proc.proname~'(^|_)(read|snapshot|rows)(_|$)' UNION SELECT proc.oid FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace WHERE ns.nspname='erp_branch_private' AND proc.proname~'(^|_)(read|snapshot|rows)(_|$)' LOOP
  SELECT pg_get_functiondef(f.oid) INTO src;next_src:=src;
  FOR t IN SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE ns.nspname='erp_branch_private' AND cl.relkind='v' LOOP
   next_src:=regexp_replace(next_src,'(FROM|JOIN)([[:space:]]+)public\.'||t.relname||'([[:space:]]|$|\))','\1\2erp_branch_private.'||t.relname||'\3','gi');
  END LOOP;
  next_src:=replace(next_src,'erp_customer_private.profile(p)','erp_customer_private.profile(jsonb_populate_record(NULL::public.bf_parties,to_jsonb(p)))');next_src:=replace(next_src,'erp_customer_private.fingerprint(p)','erp_customer_private.fingerprint(jsonb_populate_record(NULL::public.bf_parties,to_jsonb(p)))');
  IF src LIKE '%erp_manufacturing_read%' THEN next_src:=replace(next_src,'FROM public.%I WHERE','FROM erp_branch_private.%I WHERE');END IF;
  IF next_src<>src THEN EXECUTE next_src;END IF;
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_branch_private FROM PUBLIC,anon,authenticated,service_role;
-- A scheduled job is scoped by its persisted source, never the owner's open tab
CREATE FUNCTION erp_branch_private.enter_job(c uuid,t text,r uuid,actor uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE prior jsonb;b uuid;found_record boolean;BEGIN
 IF t NOT IN('erp_assets','erp_payroll_records','erp_finance_schedules','bf_recurring_invoices') THEN RAISE EXCEPTION 'Unsupported scheduled branch source';END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id=$2)',t) INTO found_record USING c,r;IF NOT found_record THEN RAISE EXCEPTION 'Scheduled branch source missing';END IF;
 SELECT branch_id INTO b FROM public.erp_branch_records WHERE cafe_id=c AND table_name=t AND record_id=r;
 prior:=jsonb_build_object('job',current_setting('erp.branch_job',true),'cafe',current_setting('erp.branch_cafe',true),'branch',current_setting('erp.branch_id',true),'expected',current_setting('erp.branch_expected',true),'sub',current_setting('request.jwt.claim.sub',true),'claims',current_setting('request.jwt.claims',true));
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
 PERFORM set_config('erp.branch_job',jsonb_build_object('cafe',c,'table',t,'record',r,'branchId',b,'actor',actor)::text,true);PERFORM set_config('erp.branch_cafe',c::text,true);PERFORM set_config('erp.branch_id',coalesce(b::text,''),true);
 IF b IS NOT NULL AND NOT erp_branch_private.branch_allowed(c,b) THEN RAISE EXCEPTION 'Scheduled branch is no longer authorized' USING ERRCODE='42501';END IF;RETURN prior;
END $$;
CREATE FUNCTION erp_branch_private.exit_job(prior jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 PERFORM set_config('erp.branch_job',coalesce(prior->>'job',''),true);PERFORM set_config('erp.branch_cafe',coalesce(prior->>'cafe',''),true);PERFORM set_config('erp.branch_id',coalesce(prior->>'branch',''),true);PERFORM set_config('erp.branch_expected',coalesce(prior->>'expected',''),true);PERFORM set_config('request.jwt.claim.sub',coalesce(prior->>'sub',''),true);PERFORM set_config('request.jwt.claims',coalesce(prior->>'claims',''),true);
END $$;
CREATE FUNCTION erp_branch_private.job_context(c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE j jsonb;actual uuid;BEGIN
 j:=nullif(current_setting('erp.branch_job',true),'')::jsonb;IF j IS NULL OR j->>'cafe'<>c::text OR j->>'actor' IS DISTINCT FROM auth.uid()::text THEN RETURN NULL;END IF;
 SELECT branch_id INTO actual FROM public.erp_branch_records WHERE cafe_id=c AND table_name=j->>'table' AND record_id=(j->>'record')::uuid;
 IF to_jsonb(actual) IS DISTINCT FROM nullif(j->'branchId','null'::jsonb) THEN RAISE EXCEPTION 'Scheduled branch source changed' USING ERRCODE='40001';END IF;RETURN j;
END $$;
DO $$DECLARE src text;needle text;BEGIN
 SELECT pg_get_functiondef('erp_branch_private.current_branch(uuid)'::regprocedure) INTO src;IF position('DECLARE b uuid;BEGIN' IN src)=0 THEN RAISE EXCEPTION 'Branch job context anchor missing';END IF;src:=replace(src,'DECLARE b uuid;BEGIN','DECLARE b uuid;j jsonb;BEGIN j:=erp_branch_private.job_context(c);IF j IS NOT NULL THEN b:=(j->>''branchId'')::uuid;IF b IS NOT NULL AND NOT erp_branch_private.branch_allowed(c,b) THEN RAISE EXCEPTION ''Scheduled branch unauthorized'' USING ERRCODE=''42501'';END IF;RETURN b;END IF;');EXECUTE src;
 SELECT pg_get_functiondef('erp_branch_private.assert_context(uuid)'::regprocedure) INTO src;needle:='IF (s->>''revision'')::integer=0 THEN RETURN;END IF;';IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Branch expected context baseline mismatch';END IF;EXECUTE replace(src,needle,'IF erp_branch_private.job_context(c) IS NOT NULL THEN RETURN;END IF;'||needle);
 IF to_regprocedure('erp_asset_private.run_automatic()') IS NOT NULL THEN
  SELECT pg_get_functiondef('erp_asset_private.run_automatic()'::regprocedure) INTO src;src:=replace(src,'DECLARE row record;','DECLARE branch_prior jsonb;row record;');needle:='PERFORM public.erp_asset_act(row.cafe_id';IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Asset job branch anchor missing';END IF;src:=replace(src,needle,'branch_prior:=erp_branch_private.enter_job(row.cafe_id,''erp_assets'',row.id,row.owner_user_id);'||needle);src:=replace(src,'processed:=processed+1;','PERFORM erp_branch_private.exit_job(branch_prior);processed:=processed+1;');EXECUTE src;
 END IF;
 IF to_regprocedure('public.erp_payroll_renew_due(integer)') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.erp_payroll_renew_due(integer)'::regprocedure) INTO src;src:=replace(src,'DECLARE item record;','DECLARE branch_prior jsonb;item record;');needle:='rid:=erp_payroll_private.renew(item.cafe_id,item.id);';IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Payroll job branch anchor missing';END IF;EXECUTE replace(src,needle,'branch_prior:=erp_branch_private.enter_job(item.cafe_id,''erp_payroll_records'',item.id,item.owner_user_id);'||needle||'PERFORM erp_branch_private.exit_job(branch_prior);');
 END IF;
 IF to_regprocedure('public.erp_finance_generate_due(integer)') IS NOT NULL THEN
  SELECT pg_get_functiondef('public.erp_finance_generate_due(integer)'::regprocedure) INTO src;src:=replace(src,'DECLARE s public.erp_finance_schedules;','DECLARE branch_prior jsonb;s public.erp_finance_schedules;');needle:='PERFORM erp_finance_private.generate_schedule(s.cafe_id,s.id);';IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Finance job branch anchor missing';END IF;EXECUTE replace(src,needle,'branch_prior:=erp_branch_private.enter_job(s.cafe_id,''erp_finance_schedules'',s.id,s.created_by);'||needle||'PERFORM erp_branch_private.exit_job(branch_prior);');
 END IF;
 IF to_regprocedure('brand_finance_private.recurring_run_one(uuid)') IS NOT NULL THEN
  SELECT pg_get_functiondef('brand_finance_private.recurring_run_one(uuid)'::regprocedure) INTO src;EXECUTE replace(src,'brand_finance_private.recurring_run_one(','erp_branch_private.recurring_run_before_scope(');
  EXECUTE $fn$CREATE OR REPLACE FUNCTION brand_finance_private.recurring_run_one(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$DECLARE r public.bf_recurring_invoices;prior jsonb;result jsonb;BEGIN SELECT * INTO r FROM public.bf_recurring_invoices WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RETURN erp_branch_private.recurring_run_before_scope(p_id);END IF;prior:=erp_branch_private.enter_job(r.cafe_id,'bf_recurring_invoices',r.id,r.actor_id);result:=erp_branch_private.recurring_run_before_scope(p_id);PERFORM erp_branch_private.exit_job(prior);RETURN result;END $body$ $fn$;
 END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_branch_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_branch_execute(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_branch_execute(uuid,text,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
