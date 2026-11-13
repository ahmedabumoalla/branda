BEGIN;
CREATE TABLE erp_settings_private.number_contexts(context text PRIMARY KEY,label text NOT NULL,table_name text NOT NULL,column_path text NOT NULL,filter_key text,filter_value text);
CREATE TABLE public.erp_system_numbering(cafe_id uuid NOT NULL REFERENCES public.cafes(id),context text NOT NULL REFERENCES erp_settings_private.number_contexts(context),payload jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,PRIMARY KEY(cafe_id,context));
CREATE TABLE erp_settings_private.number_counters(cafe_id uuid NOT NULL,context text NOT NULL,bucket text NOT NULL,next_number bigint NOT NULL,last_prefix text NOT NULL,PRIMARY KEY(cafe_id,context,bucket),FOREIGN KEY(cafe_id,context) REFERENCES public.erp_system_numbering(cafe_id,context));
CREATE TABLE erp_settings_private.numbers(cafe_id uuid NOT NULL,context text NOT NULL,record_id uuid NOT NULL,value text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,context,record_id),UNIQUE(cafe_id,context,value));
CREATE FUNCTION erp_settings_private.format_number(p_number bigint,p_mode text,p_padding integer,p_prefix text,p_time timestamptz,p_timezone text DEFAULT 'Asia/Riyadh') RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE alphabet text:=CASE WHEN p_mode='alpha' THEN 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' ELSE '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' END;n bigint:=p_number;v text:='';prefix text:=p_prefix;d timestamp:=p_time AT TIME ZONE p_timezone;base integer:=length(alphabet);BEGIN
 IF p_number NOT BETWEEN 1 AND 999999999999 OR p_padding NOT BETWEEN 1 AND 12 OR p_mode NOT IN('numeric','alpha','alphanumeric') THEN RAISE EXCEPTION 'تنسيق الرقم غير صالح';END IF;
 IF p_mode='numeric' THEN v:=n::text;ELSE IF p_mode='alpha' THEN n:=n-1;END IF;LOOP v:=substr(alphabet,(n%base)::integer+1,1)||v;n:=n/base;EXIT WHEN n=0;END LOOP;END IF;
 prefix:=replace(replace(replace(replace(prefix,'{YYYY}',to_char(d,'YYYY')),'{YY}',to_char(d,'YY')),'{MM}',to_char(d,'MM')),'{DD}',to_char(d,'DD'));
 RETURN prefix||repeat(CASE WHEN p_mode='alpha' THEN 'A' ELSE '0' END,greatest(0,p_padding-length(v)))||v;
END $$;
CREATE FUNCTION erp_settings_private.allocate_number(p_cafe uuid,p_context text,p_record uuid,p_time timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$DECLARE cfg jsonb;v text;n bigint;prefix text;v_bucket text;last text;zone text;ctx erp_settings_private.number_contexts;present boolean;tries integer:=0;BEGIN
 SELECT payload INTO cfg FROM public.erp_system_numbering WHERE cafe_id=p_cafe AND context=p_context FOR UPDATE;IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT value INTO v FROM erp_settings_private.numbers WHERE cafe_id=p_cafe AND context=p_context AND record_id=p_record;IF FOUND THEN RETURN v;END IF;
 SELECT * INTO ctx FROM erp_settings_private.number_contexts WHERE context=p_context;
 zone:=coalesce((SELECT payload->>'timezone' FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='general'),'Asia/Riyadh');
 prefix:=erp_settings_private.format_number(1,'numeric',1,cfg->>'prefix',p_time,zone);prefix:=left(prefix,length(prefix)-1);v_bucket:=CASE WHEN cfg->>'reset'='separate' THEN prefix ELSE '*' END;
 SELECT next_number,last_prefix INTO n,last FROM erp_settings_private.number_counters WHERE cafe_id=p_cafe AND context=p_context AND erp_settings_private.number_counters.bucket=v_bucket FOR UPDATE;
 IF n IS NULL THEN n:=(cfg->>'next')::bigint;ELSIF cfg->>'reset'='change' AND last<>prefix THEN n:=1;END IF;
 LOOP
  v:=erp_settings_private.format_number(n,cfg->>'mode',(cfg->>'padding')::integer,cfg->>'prefix',p_time,zone);
  IF length(v)>40 THEN RAISE EXCEPTION 'الرقم المنسق يتجاوز 40 حرفًا';END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I r WHERE cafe_id=$1 AND (to_jsonb(r)#>>$2::text[])=$3 AND ($4::text IS NULL OR to_jsonb(r)->>$4=$5))',ctx.table_name) INTO present USING p_cafe,string_to_array(ctx.column_path,'.'),v,ctx.filter_key,ctx.filter_value;
  EXIT WHEN NOT present AND NOT EXISTS(SELECT 1 FROM erp_settings_private.numbers WHERE cafe_id=p_cafe AND context=p_context AND value=v);
  n:=n+1;tries:=tries+1;IF tries>10000 THEN RAISE EXCEPTION 'اختر رقم بداية أعلى من الأرقام المستخدمة';END IF;
 END LOOP;
 INSERT INTO erp_settings_private.number_counters VALUES(p_cafe,p_context,v_bucket,n+1,prefix) ON CONFLICT(cafe_id,context,bucket) DO UPDATE SET next_number=excluded.next_number,last_prefix=excluded.last_prefix;
 UPDATE public.erp_system_numbering SET payload=jsonb_set(payload,'{next}',to_jsonb(n+1)),revision=revision+1 WHERE cafe_id=p_cafe AND context=p_context;
 INSERT INTO erp_settings_private.numbers(cafe_id,context,record_id,value) VALUES(p_cafe,p_context,p_record,v);RETURN v;
END $$;
CREATE FUNCTION erp_settings_private.assign_number() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE ctx erp_settings_private.number_contexts;j jsonb:=to_jsonb(NEW);v text;present boolean;BEGIN
 IF j->>'cafe_id' IS NULL OR j->>'id' IS NULL THEN RETURN NEW;END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id=$2)',TG_TABLE_NAME) INTO present USING (j->>'cafe_id')::uuid,(j->>'id')::uuid;IF present THEN RETURN NEW;END IF;
 FOR ctx IN SELECT * FROM erp_settings_private.number_contexts WHERE table_name=TG_TABLE_NAME AND (filter_key IS NULL OR j->>filter_key=filter_value) LOOP
  v:=erp_settings_private.allocate_number((j->>'cafe_id')::uuid,ctx.context,(j->>'id')::uuid,coalesce((j->>'created_at')::timestamptz,now()));
  IF v IS NOT NULL THEN j:=jsonb_set(j,string_to_array(ctx.column_path,'.'),to_jsonb(v));IF ctx.column_path IN('code','number') AND j->'payload' ? ctx.column_path THEN j:=jsonb_set(j,ARRAY['payload',ctx.column_path],to_jsonb(v));END IF;NEW:=jsonb_populate_record(NEW,j);END IF;
 END LOOP;RETURN NEW;
END $$;
CREATE FUNCTION public.erp_system_numbering(p_cafe uuid,p_action text DEFAULT 'get',p_input jsonb DEFAULT '{}',p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE cfg jsonb;rev integer;ctx text:=p_input->>'context';prior erp_settings_private.requests;result jsonb;BEGIN
 PERFORM erp_settings_private.authorize(p_cafe);
 IF p_action='get' THEN RETURN coalesce((SELECT jsonb_agg(payload||jsonb_build_object('context',context,'revision',revision) ORDER BY context) FROM public.erp_system_numbering WHERE cafe_id=p_cafe),'[]');END IF;
 IF p_action<>'save' OR p_request IS NULL OR p_input->>'revision' IS NULL OR NOT EXISTS(SELECT 1 FROM erp_settings_private.number_contexts WHERE context=ctx) THEN RAISE EXCEPTION 'سياق الترقيم غير صالح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text||':system-settings',0));
 SELECT * INTO prior FROM erp_settings_private.requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.action<>'numbering' OR prior.fingerprint<>md5(p_input::text) THEN RAISE EXCEPTION 'معرف العملية مستخدم';END IF;RETURN prior.result;END IF;
 SELECT revision INTO rev FROM public.erp_system_numbering WHERE cafe_id=p_cafe AND context=ctx FOR UPDATE;
 IF coalesce(rev,0) IS DISTINCT FROM (p_input->>'revision')::integer THEN RAISE EXCEPTION 'تغير التسلسل بعد إنشاء سجل أعد تحميله' USING ERRCODE='40001';END IF;
 cfg:=p_input-'context'-'revision';
 IF coalesce(cfg->>'mode','') NOT IN('numeric','alpha','alphanumeric') OR coalesce(cfg->>'reset','') NOT IN('continue','separate','change') OR (cfg->>'next')::bigint NOT BETWEEN 1 AND 999999999999 OR cfg->>'next' IS NULL OR (cfg->>'padding')::integer NOT BETWEEN 1 AND 12 OR cfg->>'padding' IS NULL OR length(coalesce(cfg->>'prefix',''))>27 OR cfg->>'prefix'~'[^A-Za-z0-9ء-ي{}_\-]' OR replace(replace(replace(replace(cfg->>'prefix','{YYYY}',''),'{YY}',''),'{MM}',''),'{DD}','')~'[{}]' OR cfg->'unique' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'راجع صيغة الترقيم والرقم التالي';END IF;
 INSERT INTO public.erp_system_numbering(cafe_id,context,payload) VALUES(p_cafe,ctx,cfg) ON CONFLICT(cafe_id,context) DO UPDATE SET payload=excluded.payload,revision=erp_system_numbering.revision+1;
 DELETE FROM erp_settings_private.number_counters WHERE cafe_id=p_cafe AND context=ctx;
 result:=jsonb_build_object('context',ctx,'revision',coalesce(rev,0)+1);
 INSERT INTO public.erp_system_events(cafe_id,actor,action,target) VALUES(p_cafe,auth.uid(),'numbering',ctx);
 INSERT INTO erp_settings_private.requests VALUES(p_cafe,p_request,auth.uid(),'numbering',md5(p_input::text),result);RETURN result;
END $$;
ALTER TABLE public.erp_system_numbering ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_settings_private.number_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_settings_private.number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_settings_private.numbers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER erp_system_numbers_immutable BEFORE UPDATE OR DELETE ON erp_settings_private.numbers FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
REVOKE ALL ON public.erp_system_numbering FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_settings_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_settings_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_system_numbering(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_system_numbering(uuid,text,jsonb,uuid) TO authenticated;
INSERT INTO erp_settings_private.number_contexts VALUES
('customer','العميل','erp_customer_profiles','code',NULL,NULL),
('supplier','المورد','erp_purchase_suppliers','payload.code',NULL,NULL),
('expense','مصروف','erp_finance_vouchers','code','kind','expense'),
('receipt','سند قبض','erp_finance_vouchers','code','kind','receipt'),
('inventory_receipt','إذن إضافة مخزن','erp_inventory_documents','code','kind','receipt'),
('inventory_issue','إذن صرف مخزن','erp_inventory_documents','code','kind','issue'),
('inventory_transfer','إذن تحويل مخزني','erp_inventory_documents','code','kind','transfer'),
('inventory_stocktake','ورق الجرد','erp_inventory_documents','code','kind','stocktake'),
('product','المنتجات','bf_items','sku',NULL,NULL),
('purchase_request','طلب الشراء','erp_purchase_documents','number','kind','request'),
('purchase_rfq','طلب عرض أسعار','erp_purchase_documents','number','kind','rfq'),
('purchase_quotation','عرض سعر مشتريات','erp_purchase_documents','number','kind','quotation'),
('purchase_order','أمر شراء','erp_purchase_documents','number','kind','order'),
('purchase_invoice','فاتورة شراء','erp_purchase_documents','number','kind','invoice'),
('asset','أصل','erp_assets','code',NULL,NULL),
('routing','مسارات الإنتاج','erp_mfg_routings','code',NULL,NULL),
('workstation','محطات العمل','erp_mfg_workstations','code',NULL,NULL),
('bom','قوائم مواد الإنتاج','erp_mfg_boms','code',NULL,NULL),
('manufacturing_order','أوامر التصنيع','erp_mfg_orders','code',NULL,NULL),
('manufacturing_plan','خطة إنتاج','erp_mfg_plans','code',NULL,NULL),
('employee','الموظفون','erp_hr_employees','code',NULL,NULL),
('rental_contract','عقود الإيجار','erp_rental_contracts','code',NULL,NULL),
('contracting_bid','المناقصات','erp_contracting_documents','number','kind','bid'),
('contracting_work_item','قالب بند أعمال','erp_contracting_documents','number','kind','work_item'),
('contracting_cost_sheet','جداول التكاليف','erp_contracting_documents','number','kind','cost_sheet'),
('contracting_quotation','عروض أسعار المقاولات','erp_contracting_documents','number','kind','quotation'),
('contracting_project','مشاريع المقاولات','erp_contracting_documents','number','kind','project'),
('contracting_contract','عقود المقاولات','erp_contracting_documents','number','kind','contract'),
('contracting_certificate','المستخلصات','erp_contracting_documents','number','kind','certificate'),
('work_order','أمر الشغل','erp_work_orders','code',NULL,NULL),
('employee_asset','أصول الموظفين','erp_employee_assets','code',NULL,NULL),
('custody','عهد الموظفين','erp_finance_custodies','code',NULL,NULL),
('task','مهمة','erp_tasks','code',NULL,NULL),
('task_flow','مسار المهام','erp_task_flows','code',NULL,NULL),
('workflow','دورة العمل','erp_workflow_records','code',NULL,NULL),
('payroll_contract','عقود المرتبات','erp_payroll_records','code','kind','contract');
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_customer_profiles FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_purchase_suppliers FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_finance_vouchers FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_inventory_documents FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.bf_items FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_purchase_documents FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_assets FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_mfg_routings FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_mfg_workstations FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_mfg_boms FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_mfg_orders FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_mfg_plans FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_hr_employees FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_rental_contracts FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_contracting_documents FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_work_orders FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_employee_assets FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_finance_custodies FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_tasks FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_task_flows FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_workflow_records FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_payroll_records FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
NOTIFY pgrst,'reload schema';
COMMIT;
