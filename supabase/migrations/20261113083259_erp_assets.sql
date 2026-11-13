BEGIN;
CREATE SCHEMA erp_asset_private;
REVOKE ALL ON SCHEMA erp_asset_private FROM PUBLIC,anon,authenticated;
-- Extend the account classification without weakening existing account controls.
ALTER TABLE public.bf_accounts DROP CONSTRAINT bf_accounts_kind_check;
ALTER TABLE public.bf_accounts ADD CONSTRAINT bf_accounts_kind_check CHECK(kind IN('cash','bank','pos','employee','receivable','payable','inventory','revenue','expense','equity','vat_input','vat_output','fixed_asset','accumulated_depreciation'));
CREATE TABLE public.erp_asset_locations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),revision integer NOT NULL DEFAULT 1,UNIQUE(cafe_id,id),UNIQUE(cafe_id,name));
CREATE TABLE public.erp_assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL,code text NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','in_service','disposed')),revision integer NOT NULL DEFAULT 1,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=524288),
 purchase_cost numeric(18,2) NOT NULL CHECK(purchase_cost>0 AND purchase_cost<>'NaN'),residual_value numeric(18,2) NOT NULL CHECK(residual_value>=0 AND residual_value<purchase_cost),useful_life_months integer NOT NULL CHECK(useful_life_months BETWEEN 1 AND 1200),acquired_on date NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 500),remaining_quantity integer NOT NULL CHECK(remaining_quantity BETWEEN 0 AND quantity),gross_value numeric(18,2) NOT NULL DEFAULT 0 CHECK(gross_value>=0 AND gross_value<>'NaN'),accumulated_depreciation numeric(18,2) NOT NULL DEFAULT 0 CHECK(accumulated_depreciation>=0 AND accumulated_depreciation<=gross_value),consumed_units numeric(18,3) NOT NULL DEFAULT 0 CHECK(consumed_units>=0),
 next_depreciation_on date,purchase_document_id uuid,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,code),FOREIGN KEY(cafe_id,purchase_document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX erp_asset_history ON public.erp_assets(cafe_id,updated_at DESC,id);
CREATE INDEX erp_asset_due ON public.erp_assets(next_depreciation_on,cafe_id) WHERE status='in_service';
CREATE TABLE public.erp_asset_units(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,asset_id uuid NOT NULL,unit_index integer NOT NULL,serial text NOT NULL DEFAULT '',barcode text NOT NULL DEFAULT '',employee_id uuid,location_id uuid,description text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'in_service' CHECK(status IN('in_service','disposed')),
 UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,asset_id) REFERENCES public.erp_assets(cafe_id,id),FOREIGN KEY(cafe_id,employee_id) REFERENCES public.bf_staff(cafe_id,user_id),FOREIGN KEY(cafe_id,location_id) REFERENCES public.erp_asset_locations(cafe_id,id));
CREATE INDEX erp_asset_units_parent ON public.erp_asset_units(cafe_id,asset_id,status);
CREATE INDEX erp_asset_units_employee ON public.erp_asset_units(cafe_id,employee_id);
CREATE INDEX erp_asset_units_location ON public.erp_asset_units(cafe_id,location_id);
CREATE UNIQUE INDEX erp_asset_serial ON public.erp_asset_units(cafe_id,serial) WHERE serial<>'';
CREATE TABLE public.erp_asset_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,asset_id uuid NOT NULL,action text NOT NULL,effective_on date NOT NULL,amount numeric(18,2) NOT NULL DEFAULT 0,quantity numeric(18,3) NOT NULL DEFAULT 0,note text NOT NULL DEFAULT '',payload jsonb NOT NULL DEFAULT '{}',document_id uuid,reversal_of uuid,manufacturing_order_id uuid,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,asset_id) REFERENCES public.erp_assets(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,reversal_of) REFERENCES public.erp_asset_events(cafe_id,id),FOREIGN KEY(cafe_id,manufacturing_order_id) REFERENCES public.erp_mfg_orders(cafe_id,id));
CREATE UNIQUE INDEX erp_asset_reversal_once ON public.erp_asset_events(cafe_id,reversal_of) WHERE reversal_of IS NOT NULL;
CREATE INDEX erp_asset_event_parent ON public.erp_asset_events(cafe_id,asset_id,effective_on,created_at);
CREATE INDEX erp_asset_event_order ON public.erp_asset_events(cafe_id,manufacturing_order_id) WHERE manufacturing_order_id IS NOT NULL;
CREATE TABLE public.erp_asset_requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(cafe_id,request_id));
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['erp_assets','erp_asset_locations','erp_asset_units','erp_asset_events','erp_asset_requests'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',n);
END LOOP;END $$;
CREATE FUNCTION erp_asset_private.authorize(p_cafe uuid,p_write boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r text;BEGIN r:=brand_finance_private.role_for(p_cafe);IF NOT coalesce(r IN('owner','manager','accountant','auditor'),false) OR (p_write AND r='auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية الأصول' USING ERRCODE='42501';END IF;RETURN r;END $$;
CREATE FUNCTION erp_asset_private.account(p_cafe uuid,p_id uuid,p_kinds text[]) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=p_id AND active AND NOT frozen AND NOT is_group AND kind=ANY(p_kinds)) THEN RAISE EXCEPTION 'الحساب غير متاح أو غير مناسب للعملية';END IF;END $$;
CREATE FUNCTION erp_asset_private.date_open(p_cafe uuid,p_date date) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF p_date IS NULL OR NOT isfinite(p_date) OR p_date>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'اختر تاريخ عملية غير مستقبلي';END IF;PERFORM brand_finance_private.gl_date_open(p_cafe,p_date);END $$;
CREATE FUNCTION erp_asset_private.document(p_cafe uuid,p_date date,p_amount numeric,p_note text,p_actor uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d uuid:=gen_random_uuid();BEGIN PERFORM erp_asset_private.date_open(p_cafe,p_date);INSERT INTO public.bf_documents(id,cafe_id,kind,total,note,created_by,created_at) VALUES(d,p_cafe,'journal',p_amount,p_note,p_actor,p_date::timestamp AT TIME ZONE 'Asia/Riyadh');RETURN d;END $$;
CREATE FUNCTION erp_asset_private.next_date(p_start date,p_current date,p_months integer) RETURNS date LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (p_start+make_interval(months=>((floor(((extract(year FROM p_current)-extract(year FROM p_start))*12+extract(month FROM p_current)-extract(month FROM p_start))/p_months)+1)*p_months)::integer))::date
$$;
CREATE FUNCTION erp_asset_private.line(p_cafe uuid,p_doc uuid,p_account uuid,p_debit numeric,p_credit numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF p_debit=0 AND p_credit=0 THEN RETURN;END IF;INSERT INTO public.bf_journal(cafe_id,document_id,account_id,debit,credit,created_at) SELECT p_cafe,p_doc,p_account,p_debit,p_credit,created_at FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_doc;END $$;
CREATE FUNCTION erp_asset_private.seed(p_cafe uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN PERFORM brand_finance_private.seed(p_cafe);INSERT INTO public.bf_accounts(cafe_id,name,code,kind) VALUES(p_cafe,'الأجهزة والمعدات','1500','fixed_asset'),(p_cafe,'مجمع إهلاك الأصول','1590','accumulated_depreciation'),(p_cafe,'مصروف إهلاك الأصول','5400','expense'),(p_cafe,'أرباح بيع الأصول','4100','revenue'),(p_cafe,'خسائر استبعاد الأصول','5410','expense'),(p_cafe,'فائض إعادة تقييم الأصول','3200','equity') ON CONFLICT(cafe_id,code) DO NOTHING;END $$;
CREATE FUNCTION erp_asset_private.validate(p_cafe uuid,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x jsonb;n numeric;qty integer;BEGIN
 IF coalesce(jsonb_typeof(p),'')<>'object' OR octet_length(p::text)>524288 OR length(btrim(coalesce(p->>'name',''))) NOT BETWEEN 1 AND 150 OR length(btrim(coalesce(p->>'code',''))) NOT BETWEEN 1 AND 60 OR length(coalesce(p->>'description',''))>4000 THEN RAISE EXCEPTION 'بيانات الأصل غير صالحة';END IF;
 qty:=erp_manufacturing_private.money(p->'quantity');IF qty NOT BETWEEN 1 AND 500 OR qty::numeric<>(p->>'quantity')::numeric THEN RAISE EXCEPTION 'كمية الأصل غير صالحة';END IF;
 n:=erp_manufacturing_private.money(p->'unitCost')*qty;IF n<=0 OR erp_manufacturing_private.money(p->'residualValue')>=n THEN RAISE EXCEPTION 'راجع سعر الشراء وقيمة الخردة';END IF;
 IF (p->>'usefulLifeMonths')::integer NOT BETWEEN 1 AND 1200 OR (p->>'intervalMonths')::integer NOT BETWEEN 1 AND 120 OR coalesce(p->>'method','') NOT IN('none','straight_line','declining','units') THEN RAISE EXCEPTION 'إعدادات الإهلاك غير صالحة';END IF;
 PERFORM erp_manufacturing_private.money(p->'depreciationAmount');PERFORM erp_manufacturing_private.money(p->'totalUnits');
 IF coalesce(jsonb_typeof(p->'autoEnabled'),'boolean')<>'boolean' OR (p->>'method'='declining' AND (coalesce((p->>'depreciationRate')::numeric,0)<=0 OR (p->>'depreciationRate')::numeric>100)) THEN RAISE EXCEPTION 'نسبة الإهلاك أو تفعيل الجدولة غير صالح';END IF;
 IF p->>'method'='straight_line' AND (p->>'depreciationAmount')::numeric<=0 OR p->>'method'='units' AND (p->>'totalUnits')::numeric<=0 THEN RAISE EXCEPTION 'أدخل قيمة الإهلاك أو الوحدات المتوقعة';END IF;
 IF coalesce(p->>'acquiredOn','')='' OR coalesce(p->>'inServiceOn','')='' OR coalesce(p->>'depreciationStarts','')='' OR (p->>'inServiceOn')::date<(p->>'acquiredOn')::date OR (p->>'depreciationStarts')::date<(p->>'inServiceOn')::date THEN RAISE EXCEPTION 'تسلسل تواريخ الأصل غير صحيح';END IF;
 PERFORM erp_asset_private.account(p_cafe,(p->>'assetAccountId')::uuid,ARRAY['fixed_asset']);PERFORM erp_asset_private.account(p_cafe,(p->>'cashAccountId')::uuid,ARRAY['cash','bank','pos']);PERFORM erp_asset_private.account(p_cafe,(p->>'accumulatedAccountId')::uuid,ARRAY['accumulated_depreciation']);PERFORM erp_asset_private.account(p_cafe,(p->>'expenseAccountId')::uuid,ARRAY['expense']);
 IF coalesce(jsonb_typeof(p->'taxes'),'')<>'array' OR jsonb_array_length(p->'taxes')>1 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'taxes') tr(value) WHERE tr.value<>'vat') THEN RAISE EXCEPTION 'الضريبة غير صالحة';END IF;
 IF coalesce(jsonb_typeof(p->'units'),'')<>'array' OR jsonb_array_length(p->'units') NOT BETWEEN 1 AND 500 OR ((p->>'individualUnits')::boolean AND jsonb_array_length(p->'units')<>qty) THEN RAISE EXCEPTION 'أكمل تفاصيل الوحدات';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p->'units') LOOP
  IF length(coalesce(x->>'serial',''))>100 OR length(coalesce(x->>'barcode',''))>100 OR length(coalesce(x->>'description',''))>1000 THEN RAISE EXCEPTION 'بيانات الوحدة طويلة';END IF;
  IF nullif(x->>'employeeId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=(x->>'employeeId')::uuid AND active) THEN RAISE EXCEPTION 'الموظف غير متاح';END IF;
  IF nullif(x->>'locationId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_asset_locations WHERE cafe_id=p_cafe AND id=(x->>'locationId')::uuid) THEN RAISE EXCEPTION 'الموقع غير متاح';END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.erp_asset_save(p_cafe uuid,p_payload jsonb,p_id uuid DEFAULT NULL,p_revision integer DEFAULT 0,p_post boolean DEFAULT false,p_request uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.erp_assets;rid uuid:=coalesce(p_id,gen_random_uuid());req jsonb;previous public.erp_asset_requests;result jsonb;x jsonb;BEGIN
 PERFORM erp_asset_private.authorize(p_cafe,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 IF p_request IS NULL THEN RAISE EXCEPTION 'معرف الطلب مطلوب';END IF;
 req:=jsonb_build_object('save',p_payload,'id',p_id,'revision',p_revision,'post',p_post);
 SELECT * INTO previous FROM public.erp_asset_requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF previous.payload<>req OR previous.actor_id<>auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لمحتوى آخر';END IF;RETURN previous.result||'{"duplicate":true}';END IF;
 PERFORM erp_asset_private.validate(p_cafe,p_payload);
 IF p_id IS NOT NULL THEN
  SELECT * INTO a FROM public.erp_assets WHERE cafe_id=p_cafe AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الأصل غير موجود' USING ERRCODE='42501';END IF;
  IF a.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'تغير الأصل أعد تحميله' USING ERRCODE='40001';END IF;
  IF a.status<>'draft' AND (p_payload-ARRAY['name','code','description','units','autoEnabled'])<>(a.payload-ARRAY['name','code','description','units','autoEnabled']) THEN RAISE EXCEPTION 'لا تعدل القيم المالية لأصل مرحل استخدم إعادة التقييم';END IF;
  IF a.status='disposed' THEN RAISE EXCEPTION 'الأصل مستبعد';END IF;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.erp_assets(id,cafe_id,name,code,payload,purchase_cost,residual_value,useful_life_months,acquired_on,quantity,remaining_quantity,next_depreciation_on,created_by) VALUES(rid,p_cafe,btrim(p_payload->>'name'),btrim(p_payload->>'code'),p_payload,round((p_payload->>'unitCost')::numeric*(p_payload->>'quantity')::integer,2),(p_payload->>'residualValue')::numeric,(p_payload->>'usefulLifeMonths')::integer,(p_payload->>'acquiredOn')::date,(p_payload->>'quantity')::integer,(p_payload->>'quantity')::integer,CASE WHEN p_payload->>'method' IN('straight_line','declining') THEN (p_payload->>'depreciationStarts')::date END,auth.uid());
 ELSE
  UPDATE public.erp_assets SET name=btrim(p_payload->>'name'),code=btrim(p_payload->>'code'),payload=p_payload,purchase_cost=round((p_payload->>'unitCost')::numeric*(p_payload->>'quantity')::integer,2),residual_value=(p_payload->>'residualValue')::numeric,useful_life_months=(p_payload->>'usefulLifeMonths')::integer,acquired_on=(p_payload->>'acquiredOn')::date,quantity=(p_payload->>'quantity')::integer,remaining_quantity=CASE WHEN status='draft' THEN (p_payload->>'quantity')::integer ELSE remaining_quantity END,next_depreciation_on=CASE WHEN status='draft' THEN CASE WHEN p_payload->>'method' IN('straight_line','declining') THEN (p_payload->>'depreciationStarts')::date END ELSE next_depreciation_on END,revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND id=rid;
  IF a.status='in_service' THEN
   UPDATE public.erp_asset_units u SET serial=CASE WHEN (p_payload->>'individualUnits')::boolean OR u.unit_index=0 THEN coalesce((CASE WHEN (p_payload->>'individualUnits')::boolean THEN p_payload->'units'->u.unit_index ELSE p_payload->'units'->0 END)->>'serial','') ELSE '' END,barcode=coalesce((CASE WHEN (p_payload->>'individualUnits')::boolean THEN p_payload->'units'->u.unit_index ELSE p_payload->'units'->0 END)->>'barcode',''),employee_id=nullif((CASE WHEN (p_payload->>'individualUnits')::boolean THEN p_payload->'units'->u.unit_index ELSE p_payload->'units'->0 END)->>'employeeId','')::uuid,location_id=nullif((CASE WHEN (p_payload->>'individualUnits')::boolean THEN p_payload->'units'->u.unit_index ELSE p_payload->'units'->0 END)->>'locationId','')::uuid,description=coalesce((CASE WHEN (p_payload->>'individualUnits')::boolean THEN p_payload->'units'->u.unit_index ELSE p_payload->'units'->0 END)->>'description','') WHERE cafe_id=p_cafe AND asset_id=rid AND status='in_service';
  END IF;
 END IF;
 INSERT INTO public.erp_asset_events(cafe_id,asset_id,action,effective_on,created_by) VALUES(p_cafe,rid,CASE WHEN p_id IS NULL THEN 'create' ELSE 'edit' END,(now() AT TIME ZONE 'Asia/Riyadh')::date,auth.uid());
 SELECT jsonb_build_object('id',id,'revision',revision) INTO result FROM public.erp_assets WHERE cafe_id=p_cafe AND id=rid;
 IF p_post AND coalesce(a.status,'draft')='draft' THEN result:=public.erp_asset_act(p_cafe,jsonb_build_object('action','purchase','id',rid,'revision',result->'revision','requestId',gen_random_uuid(),'date',p_payload->>'acquiredOn'));END IF;
 INSERT INTO public.erp_asset_requests(cafe_id,request_id,payload,result,actor_id) VALUES(p_cafe,p_request,req,result,auth.uid());RETURN result;
END $$;
CREATE FUNCTION public.erp_asset_act(p_cafe uuid,p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE a public.erp_assets;action text:=p_command->>'action';rid uuid:=(p_command->>'id')::uuid;request uuid:=(p_command->>'requestId')::uuid;opdate date:=(p_command->>'date')::date;previous public.erp_asset_requests;result jsonb;d uuid;x jsonb;i integer;amount numeric:=0;tax numeric:=0;rate numeric:=0;qty integer;gross numeric;accum numeric;carrying numeric;difference numeric;cash uuid;counter uuid;selected uuid[];e uuid;available numeric;units numeric:=0;loops integer:=0;BEGIN
 PERFORM erp_asset_private.authorize(p_cafe,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 IF request IS NULL OR rid IS NULL OR length(coalesce(p_command->>'note',''))>4000 OR octet_length(p_command::text)>131072 THEN RAISE EXCEPTION 'طلب الأصل غير صالح';END IF;
 SELECT * INTO previous FROM public.erp_asset_requests WHERE cafe_id=p_cafe AND request_id=request;
 IF FOUND THEN IF previous.payload<>p_command OR previous.actor_id<>auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لمحتوى آخر';END IF;RETURN previous.result||'{"duplicate":true}';END IF;
 SELECT * INTO a FROM public.erp_assets WHERE cafe_id=p_cafe AND id=rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الأصل غير موجود' USING ERRCODE='42501';END IF;
 IF a.revision IS DISTINCT FROM (p_command->>'revision')::integer THEN RAISE EXCEPTION 'تغير الأصل أعد تحميله' USING ERRCODE='40001';END IF;
 IF action NOT IN('note','delete') THEN PERFORM erp_asset_private.date_open(p_cafe,opdate);IF opdate<a.acquired_on THEN RAISE EXCEPTION 'تاريخ العملية يسبق شراء الأصل';END IF;END IF;
 result:=jsonb_build_object('id',rid);
 IF action='note' THEN IF length(btrim(coalesce(p_command->>'note','')))=0 THEN RAISE EXCEPTION 'أدخل الملاحظة';END IF;
 ELSIF action='delete' THEN
  IF a.status<>'draft' THEN RAISE EXCEPTION 'يمكن حذف المسودة فقط استخدم استبعاد للأصل المرحل';END IF;
  DELETE FROM public.erp_asset_events WHERE cafe_id=p_cafe AND asset_id=rid;DELETE FROM public.erp_assets WHERE cafe_id=p_cafe AND id=rid;result:=result||'{"deleted":true}';
 ELSIF action='purchase' THEN
  IF a.status<>'draft' THEN RAISE EXCEPTION 'تم ترحيل الشراء مسبقًا';END IF;
  PERFORM erp_asset_private.validate(p_cafe,a.payload);cash:=(a.payload->>'cashAccountId')::uuid;
  SELECT vat_rate INTO rate FROM public.bf_settings WHERE cafe_id=p_cafe;tax:=CASE WHEN a.payload->'taxes' @> '["vat"]' THEN round(a.purchase_cost*coalesce(rate,0)/100,2) ELSE 0 END;
  IF coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe AND account_id=cash),0)<a.purchase_cost+tax THEN RAISE EXCEPTION 'الرصيد النقدي غير كاف لشراء الأصل';END IF;
  d:=erp_asset_private.document(p_cafe,opdate,a.purchase_cost+tax,'شراء الأصل '||a.code,auth.uid());
  PERFORM erp_asset_private.line(p_cafe,d,(a.payload->>'assetAccountId')::uuid,a.purchase_cost,0);PERFORM erp_asset_private.line(p_cafe,d,brand_finance_private.account(p_cafe,'1300'),tax,0);PERFORM erp_asset_private.line(p_cafe,d,cash,0,a.purchase_cost+tax);
  FOR i IN 0..a.quantity-1 LOOP x:=CASE WHEN (a.payload->>'individualUnits')::boolean THEN a.payload->'units'->i ELSE a.payload->'units'->0 END;
   INSERT INTO public.erp_asset_units(cafe_id,asset_id,unit_index,serial,barcode,employee_id,location_id,description) VALUES(p_cafe,rid,i,CASE WHEN i=0 OR (a.payload->>'individualUnits')::boolean THEN coalesce(x->>'serial','') ELSE '' END,coalesce(x->>'barcode',''),nullif(x->>'employeeId','')::uuid,nullif(x->>'locationId','')::uuid,coalesce(x->>'description',''));
  END LOOP;
  UPDATE public.erp_assets SET status='in_service',gross_value=purchase_cost,purchase_document_id=d WHERE cafe_id=p_cafe AND id=rid;amount:=a.purchase_cost;
 ELSIF action IN('depreciate','run_due','edit_depreciation') THEN
  IF a.status<>'in_service' THEN RAISE EXCEPTION 'الأصل غير متاح للإهلاك';END IF;
  IF action IN('depreciate','edit_depreciation') THEN
   IF action='edit_depreciation' THEN
    SELECT id INTO e FROM public.erp_asset_events WHERE cafe_id=p_cafe AND asset_id=rid AND id=(p_command->>'eventId')::uuid AND manufacturing_order_id IS NULL;
    IF e IS NULL THEN RAISE EXCEPTION 'حركة الإهلاك غير موجودة في هذا الأصل';END IF;
    PERFORM erp_asset_private.reverse_depreciation(p_cafe,e,opdate,auth.uid());
   END IF;
   units:=erp_manufacturing_private.money(coalesce(p_command->'units','0'));
   amount:=CASE WHEN a.payload->>'method'='units' THEN round(units*(a.purchase_cost-a.residual_value)/(a.payload->>'totalUnits')::numeric,2) ELSE round(erp_manufacturing_private.money(p_command->'amount'),2) END;
   e:=erp_asset_private.depreciate(p_cafe,rid,amount,units,opdate,auth.uid());
  ELSE
   IF a.payload->>'method' NOT IN('straight_line','declining') OR a.next_depreciation_on IS NULL OR a.next_depreciation_on>opdate THEN RAISE EXCEPTION 'لا يوجد إهلاك دوري مستحق';END IF;
   WHILE a.next_depreciation_on<=opdate AND loops<1200 LOOP
    available:=a.gross_value-a.accumulated_depreciation-round(a.residual_value*a.remaining_quantity/a.quantity,2);EXIT WHEN available<=0;
    amount:=least(available,greatest(.01,CASE WHEN a.payload->>'method'='declining' THEN round((a.gross_value-a.accumulated_depreciation)*(a.payload->>'depreciationRate')::numeric/100,2) ELSE round((a.payload->>'depreciationAmount')::numeric*a.remaining_quantity/a.quantity,2) END));EXIT WHEN amount<=0;
    e:=erp_asset_private.depreciate(p_cafe,rid,amount,0,a.next_depreciation_on,auth.uid(),'scheduled_depreciation');
    UPDATE public.erp_assets SET next_depreciation_on=erp_asset_private.next_date((a.payload->>'depreciationStarts')::date,next_depreciation_on,(a.payload->>'intervalMonths')::integer) WHERE cafe_id=p_cafe AND id=rid;
    SELECT * INTO a FROM public.erp_assets WHERE cafe_id=p_cafe AND id=rid;loops:=loops+1;
   END LOOP;
   IF loops=0 THEN RAISE EXCEPTION 'اكتمل إهلاك القيمة القابلة للإهلاك';END IF;
  END IF;
 ELSIF action='reverse_depreciation' THEN
  SELECT id INTO e FROM public.erp_asset_events WHERE cafe_id=p_cafe AND asset_id=rid AND id=(p_command->>'eventId')::uuid AND manufacturing_order_id IS NULL;
  IF e IS NULL THEN RAISE EXCEPTION 'اختر إهلاكًا يدويًا أو دوريًا من هذا الأصل';END IF;e:=erp_asset_private.reverse_depreciation(p_cafe,e,opdate,auth.uid());
 ELSIF action IN('sell','write_off','revalue') THEN
  IF a.status<>'in_service' THEN RAISE EXCEPTION 'الأصل غير متاح للعملية';END IF;
  qty:=(p_command->>'quantity')::integer;IF qty NOT BETWEEN 1 AND a.remaining_quantity THEN RAISE EXCEPTION 'الكمية تتجاوز الوحدات المتاحة';END IF;
  IF action IN('sell','write_off') AND EXISTS(SELECT 1 FROM public.erp_mfg_orders o JOIN public.erp_mfg_workstations w ON w.cafe_id=o.cafe_id AND w.payload->>'assetId'=rid::text WHERE o.cafe_id=p_cafe AND o.status IN('ready','in_progress') AND o.payload->'operations' @> jsonb_build_array(jsonb_build_object('workstationId',w.id))) THEN RAISE EXCEPTION 'الأصل مرتبط بأمر تصنيع مفتوح';END IF;
  gross:=CASE WHEN qty=a.remaining_quantity THEN a.gross_value ELSE round(a.gross_value*qty/a.remaining_quantity,2) END;accum:=CASE WHEN qty=a.remaining_quantity THEN a.accumulated_depreciation ELSE round(a.accumulated_depreciation*qty/a.remaining_quantity,2) END;carrying:=gross-accum;
  amount:=round(erp_manufacturing_private.money(coalesce(p_command->'amount','0')),2);counter:=nullif(p_command->>'accountId','')::uuid;
  IF action='revalue' THEN
   difference:=amount-carrying;IF difference=0 OR amount<round(a.residual_value*qty/a.quantity,2) THEN RAISE EXCEPTION 'قيمة التقييم غير صالحة';END IF;
   PERFORM erp_asset_private.account(p_cafe,counter,CASE WHEN difference>0 THEN ARRAY['equity'] ELSE ARRAY['expense'] END);
   d:=erp_asset_private.document(p_cafe,opdate,abs(difference),'إعادة تقييم الأصل '||a.code,auth.uid());PERFORM erp_asset_private.line(p_cafe,d,(a.payload->>'assetAccountId')::uuid,greatest(difference,0),greatest(-difference,0));PERFORM erp_asset_private.line(p_cafe,d,counter,greatest(-difference,0),greatest(difference,0));
   UPDATE public.erp_assets SET gross_value=gross_value+difference WHERE cafe_id=p_cafe AND id=rid;
  ELSE
   SELECT coalesce(array_agg(id),'{}') INTO selected FROM (SELECT id FROM public.erp_asset_units WHERE cafe_id=p_cafe AND asset_id=rid AND status='in_service' AND (coalesce(jsonb_array_length(p_command->'unitIds'),0)=0 OR id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_command->'unitIds'))) ORDER BY unit_index LIMIT qty) u;
   IF cardinality(selected)<>qty OR (coalesce(jsonb_array_length(p_command->'unitIds'),0)>0 AND jsonb_array_length(p_command->'unitIds')<>qty) THEN RAISE EXCEPTION 'اختر الوحدات المطلوب استبعادها';END IF;
   IF action='sell' THEN
    cash:=counter;PERFORM erp_asset_private.account(p_cafe,cash,ARRAY['cash','bank','pos']);SELECT vat_rate INTO rate FROM public.bf_settings WHERE cafe_id=p_cafe;
    IF coalesce(jsonb_typeof(p_command->'taxes'),'array')<>'array' OR coalesce(jsonb_array_length(p_command->'taxes'),0)>1 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_command->'taxes','[]')) x WHERE x<>'vat') THEN RAISE EXCEPTION 'الضريبة غير صالحة';END IF;
    tax:=CASE WHEN p_command->'taxes' @> '["vat"]' THEN round(amount*coalesce(rate,0)/100,2) ELSE 0 END;
   ELSE amount:=0;PERFORM erp_asset_private.account(p_cafe,counter,ARRAY['expense']);END IF;
   d:=erp_asset_private.document(p_cafe,opdate,greatest(gross,amount+tax),CASE WHEN action='sell' THEN 'بيع الأصل ' ELSE 'تكهين الأصل ' END||a.code,auth.uid());
   PERFORM erp_asset_private.line(p_cafe,d,(a.payload->>'accumulatedAccountId')::uuid,accum,0);PERFORM erp_asset_private.line(p_cafe,d,(a.payload->>'assetAccountId')::uuid,0,gross);
   IF action='sell' THEN PERFORM erp_asset_private.line(p_cafe,d,cash,amount+tax,0);PERFORM erp_asset_private.line(p_cafe,d,brand_finance_private.account(p_cafe,'2100'),0,tax);counter:=brand_finance_private.account(p_cafe,CASE WHEN amount>=carrying THEN '4100' ELSE '5410' END);END IF;
   PERFORM erp_asset_private.line(p_cafe,d,counter,greatest(carrying-amount,0),greatest(amount-carrying,0));
   UPDATE public.erp_asset_units SET status='disposed' WHERE cafe_id=p_cafe AND id=ANY(selected);
   UPDATE public.erp_assets SET gross_value=gross_value-gross,accumulated_depreciation=accumulated_depreciation-accum,remaining_quantity=remaining_quantity-qty,status=CASE WHEN remaining_quantity=qty THEN 'disposed' ELSE 'in_service' END WHERE cafe_id=p_cafe AND id=rid;
  END IF;
 ELSE RAISE EXCEPTION 'إجراء أصل غير معروف';END IF;
 IF action<>'delete' THEN
  UPDATE public.erp_assets SET revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND id=rid;
  IF action NOT IN('depreciate','edit_depreciation','run_due','reverse_depreciation') THEN INSERT INTO public.erp_asset_events(cafe_id,asset_id,action,effective_on,amount,quantity,note,payload,document_id,created_by) VALUES(p_cafe,rid,action,coalesce(opdate,(now() AT TIME ZONE 'Asia/Riyadh')::date),amount,coalesce(qty,0),coalesce(p_command->>'note',''),p_command,d,auth.uid());END IF;
  SELECT result||jsonb_build_object('revision',revision,'eventId',e,'documentId',d) INTO result FROM public.erp_assets WHERE cafe_id=p_cafe AND id=rid;
 END IF;
 INSERT INTO public.erp_asset_requests(cafe_id,request_id,payload,result,actor_id) VALUES(p_cafe,request,p_command,result,auth.uid());RETURN result;
END $$;
CREATE FUNCTION erp_asset_private.depreciate(p_cafe uuid,p_asset uuid,p_amount numeric,p_units numeric,p_date date,p_actor uuid,p_action text DEFAULT 'depreciate',p_order uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.erp_assets;d uuid;e uuid:=gen_random_uuid();available numeric;BEGIN
 SELECT * INTO a FROM public.erp_assets WHERE cafe_id=p_cafe AND id=p_asset FOR UPDATE;
 IF NOT FOUND OR a.status<>'in_service' OR p_date<(a.payload->>'inServiceOn')::date THEN RAISE EXCEPTION 'الأصل غير متاح للإهلاك في هذا التاريخ';END IF;
 available:=a.gross_value-a.accumulated_depreciation-round(a.residual_value*a.remaining_quantity/a.quantity,2);
 IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_amount>available OR p_units<0 THEN RAISE EXCEPTION 'الإهلاك يتجاوز القيمة القابلة للإهلاك';END IF;
 PERFORM erp_asset_private.account(p_cafe,(a.payload->>'expenseAccountId')::uuid,ARRAY['expense']);PERFORM erp_asset_private.account(p_cafe,(a.payload->>'accumulatedAccountId')::uuid,ARRAY['accumulated_depreciation']);
 d:=erp_asset_private.document(p_cafe,p_date,p_amount,'إهلاك الأصل '||a.code,p_actor);
 PERFORM erp_asset_private.line(p_cafe,d,(a.payload->>'expenseAccountId')::uuid,p_amount,0);PERFORM erp_asset_private.line(p_cafe,d,(a.payload->>'accumulatedAccountId')::uuid,0,p_amount);
 UPDATE public.erp_assets SET accumulated_depreciation=accumulated_depreciation+p_amount,consumed_units=consumed_units+p_units,revision=revision+1,updated_at=now() WHERE id=p_asset AND cafe_id=p_cafe;
 INSERT INTO public.erp_asset_events(id,cafe_id,asset_id,action,effective_on,amount,quantity,document_id,manufacturing_order_id,created_by) VALUES(e,p_cafe,p_asset,p_action,p_date,p_amount,p_units,d,p_order,p_actor);RETURN e;
END $$;
CREATE FUNCTION erp_asset_private.reverse_depreciation(p_cafe uuid,p_event uuid,p_date date,p_actor uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e public.erp_asset_events;a public.erp_assets;d uuid;line record;rid uuid:=gen_random_uuid();BEGIN
 SELECT * INTO e FROM public.erp_asset_events WHERE cafe_id=p_cafe AND id=p_event;
 IF NOT FOUND OR e.action NOT IN('depreciate','scheduled_depreciation','manufacturing_depreciation') OR EXISTS(SELECT 1 FROM public.erp_asset_events WHERE cafe_id=p_cafe AND reversal_of=p_event) THEN RAISE EXCEPTION 'حركة الإهلاك غير قابلة للعكس';END IF;
 SELECT * INTO a FROM public.erp_assets WHERE cafe_id=p_cafe AND id=e.asset_id FOR UPDATE;
 IF a.status<>'in_service' OR a.accumulated_depreciation<e.amount OR p_date<e.effective_on OR EXISTS(SELECT 1 FROM public.erp_asset_events x WHERE x.cafe_id=p_cafe AND x.asset_id=a.id AND x.action IN('sell','write_off') AND x.created_at>e.created_at) THEN RAISE EXCEPTION 'لا يمكن عكس الإهلاك بعد الاستبعاد أو قبل تاريخه';END IF;
 d:=erp_asset_private.document(p_cafe,p_date,e.amount,'عكس إهلاك الأصل '||a.code,p_actor);
 FOR line IN SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe AND document_id=e.document_id LOOP PERFORM erp_asset_private.line(p_cafe,d,line.account_id,line.credit,line.debit);END LOOP;
 UPDATE public.erp_assets SET accumulated_depreciation=accumulated_depreciation-e.amount,consumed_units=greatest(0,consumed_units-e.quantity),revision=revision+1,updated_at=now() WHERE cafe_id=p_cafe AND id=a.id;
 INSERT INTO public.erp_asset_events(id,cafe_id,asset_id,action,effective_on,amount,quantity,document_id,reversal_of,manufacturing_order_id,created_by) VALUES(rid,p_cafe,a.id,'reverse_depreciation',p_date,e.amount,e.quantity,d,e.id,e.manufacturing_order_id,p_actor);RETURN rid;
END $$;
CREATE FUNCTION public.erp_asset_read(p_cafe uuid,p_id uuid DEFAULT NULL,p_query text DEFAULT '',p_status text DEFAULT '',p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role text;BEGIN
 role:=erp_asset_private.authorize(p_cafe);IF p_page NOT BETWEEN 1 AND 100000 OR length(p_query)>150 THEN RAISE EXCEPTION 'طلب القراءة غير صالح';END IF;PERFORM erp_asset_private.seed(p_cafe);
 RETURN jsonb_build_object('records',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id'-'created_by') FROM(SELECT * FROM public.erp_assets WHERE cafe_id=p_cafe AND (p_id IS NULL OR id=p_id) AND (p_query='' OR name ILIKE '%'||p_query||'%' OR code ILIKE '%'||p_query||'%') AND (p_status='' OR status=p_status) ORDER BY updated_at DESC,id LIMIT 50 OFFSET (p_page-1)*50)a),'[]'),
 'total',(SELECT count(*) FROM public.erp_assets WHERE cafe_id=p_cafe AND (p_id IS NULL OR id=p_id) AND (p_query='' OR name ILIKE '%'||p_query||'%' OR code ILIKE '%'||p_query||'%') AND (p_status='' OR status=p_status)),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'cafe_id'-'created_by' ORDER BY effective_on DESC,created_at DESC) FROM public.erp_asset_events e WHERE cafe_id=p_cafe AND asset_id=p_id),'[]'),
 'units',coalesce((SELECT jsonb_agg(to_jsonb(u)-'cafe_id' ORDER BY unit_index) FROM public.erp_asset_units u WHERE cafe_id=p_cafe AND asset_id=p_id),'[]'),
 'locations',coalesce((SELECT jsonb_agg(to_jsonb(l)-'cafe_id' ORDER BY name) FROM public.erp_asset_locations l WHERE cafe_id=p_cafe),'[]'),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'kind',kind) ORDER BY code) FROM public.bf_accounts WHERE cafe_id=p_cafe AND active AND NOT frozen AND NOT is_group),'[]'),
 'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',name)) FROM public.bf_staff WHERE cafe_id=p_cafe AND active),'[]'),
 'assetOptions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'payload',jsonb_build_object('method',payload->>'method','expenseAccountId',payload->>'expenseAccountId','unitDepreciation',CASE WHEN payload->>'method'='units' THEN round((purchase_cost-residual_value)/(payload->>'totalUnits')::numeric,6) ELSE 0 END,'available',gross_value-accumulated_depreciation-round(residual_value*remaining_quantity/quantity,2)))) FROM public.erp_assets WHERE cafe_id=p_cafe AND status='in_service'),'[]'),
 'vatRate',(SELECT vat_rate FROM public.bf_settings WHERE cafe_id=p_cafe),'role',role,'canWrite',role<>'auditor','automationAvailable',to_regnamespace('cron') IS NOT NULL);
END $$;
CREATE FUNCTION public.erp_asset_location(p_cafe uuid,p_name text,p_description text DEFAULT '',p_id uuid DEFAULT NULL,p_revision integer DEFAULT 0,p_delete boolean DEFAULT false,p_request uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid:=coalesce(p_id,gen_random_uuid());previous public.erp_asset_requests;req jsonb;result jsonb;BEGIN
 PERFORM erp_asset_private.authorize(p_cafe,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 req:=jsonb_build_object('location',p_id,'name',p_name,'description',p_description,'revision',p_revision,'delete',p_delete);
 SELECT * INTO previous FROM public.erp_asset_requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF previous.payload<>req OR previous.actor_id<>auth.uid() THEN RAISE EXCEPTION 'تعارض معرف الطلب';END IF;RETURN previous.result||'{"duplicate":true}';END IF;
 IF p_request IS NULL OR length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 150 OR length(coalesce(p_description,''))>4000 THEN RAISE EXCEPTION 'أدخل اسم موقع ووصفًا صالحين';END IF;
 IF p_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_asset_locations WHERE cafe_id=p_cafe AND id=p_id AND revision=p_revision) THEN RAISE EXCEPTION 'الموقع غير موجود أو تغير أعد تحميله' USING ERRCODE='40001';END IF;
 IF p_delete THEN DELETE FROM public.erp_asset_locations WHERE cafe_id=p_cafe AND id=p_id;
 ELSIF p_id IS NULL THEN INSERT INTO public.erp_asset_locations(id,cafe_id,name,description) VALUES(rid,p_cafe,btrim(p_name),p_description);
 ELSE UPDATE public.erp_asset_locations SET name=btrim(p_name),description=p_description,revision=revision+1 WHERE cafe_id=p_cafe AND id=p_id;END IF;
 result:=jsonb_build_object('id',rid,'deleted',p_delete);INSERT INTO public.erp_asset_requests(cafe_id,request_id,payload,result,actor_id) VALUES(p_cafe,p_request,req,result,auth.uid());RETURN result;
END $$;

ALTER TABLE public.erp_mfg_workstations ADD COLUMN asset_id uuid,ADD FOREIGN KEY(cafe_id,asset_id) REFERENCES public.erp_assets(cafe_id,id);
CREATE INDEX erp_mfg_station_asset ON public.erp_mfg_workstations(cafe_id,asset_id);
CREATE FUNCTION erp_asset_private.workstation_asset() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.erp_assets;rate numeric;BEGIN
 NEW.asset_id:=nullif(NEW.payload->>'assetId','')::uuid;
 IF NEW.asset_id IS NULL THEN IF coalesce((NEW.payload->>'autoDepreciate')::boolean,false) THEN RAISE EXCEPTION 'اختر الأصل للإهلاك التلقائي';END IF;RETURN NEW;END IF;
 SELECT * INTO a FROM public.erp_assets WHERE cafe_id=NEW.cafe_id AND id=NEW.asset_id;
 IF NOT FOUND OR a.status<>'in_service' THEN RAISE EXCEPTION 'الأصل غير متاح لمحطة العمل';END IF;
 IF coalesce((NEW.payload->>'autoDepreciate')::boolean,false) THEN
  rate:=CASE WHEN a.payload->>'method'='units' THEN round((a.purchase_cost-a.residual_value)/(a.payload->>'totalUnits')::numeric,6) ELSE erp_manufacturing_private.money(NEW.payload->'assetsCost') END;
  IF rate<=0 THEN RAISE EXCEPTION 'أدخل تكلفة الإهلاك لكل وحدة';END IF;
  NEW.payload:=NEW.payload||jsonb_build_object('assetsCost',rate,'assetsAccountId',a.payload->>'expenseAccountId');
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_mfg_station_asset BEFORE INSERT OR UPDATE OF payload ON public.erp_mfg_workstations FOR EACH ROW EXECUTE FUNCTION erp_asset_private.workstation_asset();
CREATE FUNCTION erp_asset_private.manufacturing_depreciation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row record;dated date;BEGIN
 IF NEW.status='completed' AND OLD.status<>'completed' THEN
  SELECT (created_at AT TIME ZONE 'Asia/Riyadh')::date INTO dated FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.output_document_id;
  FOR row IN SELECT w.asset_id,sum((op->>'quantity')::numeric*(w.payload->>'assetsCost')::numeric) amount,sum((op->>'quantity')::numeric) units FROM jsonb_array_elements(NEW.payload->'operations') op JOIN public.erp_mfg_workstations w ON w.cafe_id=NEW.cafe_id AND w.id=(op->>'workstationId')::uuid WHERE w.asset_id IS NOT NULL AND w.payload->>'autoDepreciate'='true' GROUP BY w.asset_id LOOP
   PERFORM erp_asset_private.depreciate(NEW.cafe_id,row.asset_id,round(row.amount,2),row.units,dated,auth.uid(),'manufacturing_depreciation',NEW.id);
  END LOOP;
 ELSIF OLD.status='completed' AND NEW.status='in_progress' THEN
  FOR row IN SELECT id FROM public.erp_asset_events e WHERE cafe_id=NEW.cafe_id AND manufacturing_order_id=NEW.id AND action='manufacturing_depreciation' AND NOT EXISTS(SELECT 1 FROM public.erp_asset_events r WHERE r.cafe_id=e.cafe_id AND r.reversal_of=e.id) LOOP
   PERFORM erp_asset_private.reverse_depreciation(NEW.cafe_id,row.id,(now() AT TIME ZONE 'Asia/Riyadh')::date,auth.uid());
  END LOOP;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_mfg_asset_depreciation AFTER UPDATE OF status ON public.erp_mfg_orders FOR EACH ROW EXECUTE FUNCTION erp_asset_private.manufacturing_depreciation();
DO $$ DECLARE definition text;BEGIN
 SELECT pg_get_functiondef('erp_manufacturing_private.validate_custom_fields(jsonb,integer)'::regprocedure) INTO definition;
 IF position('''orders'',''sources'')' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected manufacturing field baseline';END IF;
 EXECUTE replace(definition,'''orders'',''sources'')','''orders'',''sources'',''assets'')');
 SELECT pg_get_functiondef('erp_manufacturing_private.validate_custom_values(jsonb,jsonb,uuid,uuid,text,integer,boolean)'::regprocedure) INTO definition;
 IF position('WHEN ''sources'' THEN ''bf_documents'' END' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected manufacturing dynamic baseline';END IF;
 EXECUTE replace(definition,'WHEN ''sources'' THEN ''bf_documents'' END','WHEN ''sources'' THEN ''bf_documents'' WHEN ''assets'' THEN ''erp_assets'' END');
 SELECT pg_get_functiondef('public.erp_manufacturing_save(uuid,text,jsonb,uuid,integer,boolean,uuid)'::regprocedure) INTO definition;
 IF position('(old->>''revision'')::integer<>p_revision' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected manufacturing revision baseline';END IF;
 EXECUTE replace(definition,'(old->>''revision'')::integer<>p_revision','(old->>''revision'')::integer IS DISTINCT FROM p_revision');
END $$;

CREATE OR REPLACE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tbl text;found_record boolean;r text;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجل الدخول أولًا' USING ERRCODE='42501';END IF;r:=brand_finance_private.role_for(p_cafe);
 IF NOT coalesce(r IN('owner','manager','accountant','auditor') OR (r='warehouse' AND p_type LIKE 'manufacturing_%'),false) OR (p_write AND NOT(r IN('owner','manager') OR (r='accountant' AND (p_type IN('contracting_document','asset') OR p_type LIKE 'manufacturing_%')) OR (r='warehouse' AND p_type LIKE 'manufacturing_%'))) THEN RAISE EXCEPTION 'لا تملك صلاحية الوصول إلى مرفقات هذا السجل' USING ERRCODE='42501';END IF;
 tbl:=CASE p_type WHEN 'task' THEN 'erp_tasks' WHEN 'task_flow' THEN 'erp_task_flows' WHEN 'manufacturing_order' THEN 'erp_mfg_orders' WHEN 'manufacturing_plan' THEN 'erp_mfg_plans' WHEN 'manufacturing_bom' THEN 'erp_mfg_boms' WHEN 'manufacturing_workstation' THEN 'erp_mfg_workstations' WHEN 'manufacturing_routing' THEN 'erp_mfg_routings' WHEN 'manufacturing_overhead' THEN 'erp_mfg_overheads' WHEN 'booking' THEN 'erp_bookings' WHEN 'contracting_document' THEN 'erp_contracting_documents' WHEN 'asset' THEN 'erp_assets' END;
 IF tbl IS NULL OR to_regclass('public.'||tbl) IS NULL OR p_record IS NULL THEN RAISE EXCEPTION 'نوع السجل غير متاح للمرفقات' USING ERRCODE='22023';END IF;
 IF p_write THEN EXECUTE format('SELECT true FROM public.%I WHERE cafe_id=$1 AND id=$2 FOR KEY SHARE',tbl) INTO found_record USING p_cafe,p_record;ELSE EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id=$2)',tbl) INTO found_record USING p_cafe,p_record;END IF;
 IF NOT coalesce(found_record,false) THEN RAISE EXCEPTION 'السجل غير موجود في هذه العلامة' USING ERRCODE='42501';END IF;
END $$;
CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.erp_assets FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans('asset');
CREATE FUNCTION public.erp_asset_import(p_cafe uuid,p_rows jsonb,p_post boolean DEFAULT false,p_request uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.erp_asset_requests;req jsonb;row jsonb;result jsonb;ids jsonb:='[]';BEGIN
 PERFORM erp_asset_private.authorize(p_cafe,true);PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 IF p_request IS NULL OR coalesce(jsonb_typeof(p_rows),'')<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 OR octet_length(p_rows::text)>2097152 THEN RAISE EXCEPTION 'بيانات استيراد الأصول غير صالحة';END IF;
 req:=jsonb_build_object('import',p_rows,'post',p_post);SELECT * INTO previous FROM public.erp_asset_requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF previous.payload<>req OR previous.actor_id<>auth.uid() THEN RAISE EXCEPTION 'تعارض معرف الاستيراد';END IF;RETURN previous.result||'{"duplicate":true}';END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP result:=public.erp_asset_save(p_cafe,row,NULL,0,p_post,gen_random_uuid());ids:=ids||jsonb_build_array(result->>'id');END LOOP;
 result:=jsonb_build_object('ids',ids,'count',jsonb_array_length(ids));INSERT INTO public.erp_asset_requests(cafe_id,request_id,payload,result,actor_id) VALUES(p_cafe,p_request,req,result,auth.uid());RETURN result;
END $$;
CREATE FUNCTION erp_asset_private.run_automatic() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row record;prior text:=current_setting('request.jwt.claim.sub',true);processed integer:=0;BEGIN
 FOR row IN SELECT a.id,a.cafe_id,a.revision,c.owner_user_id FROM public.erp_assets a JOIN public.cafes c ON c.id=a.cafe_id JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active' WHERE a.status='in_service' AND a.payload->>'autoEnabled'='true' AND a.next_depreciation_on<=(now() AT TIME ZONE 'Asia/Riyadh')::date AND a.gross_value-a.accumulated_depreciation>round(a.residual_value*a.remaining_quantity/a.quantity,2) ORDER BY a.next_depreciation_on,a.id LIMIT 100 LOOP
  BEGIN
   PERFORM set_config('request.jwt.claim.sub',row.owner_user_id::text,true);
   PERFORM public.erp_asset_act(row.cafe_id,jsonb_build_object('action','run_due','id',row.id,'revision',row.revision,'requestId',gen_random_uuid(),'date',(now() AT TIME ZONE 'Asia/Riyadh')::date));processed:=processed+1;
  EXCEPTION WHEN OTHERS THEN
   INSERT INTO public.erp_asset_events(cafe_id,asset_id,action,effective_on,note,created_by) VALUES(row.cafe_id,row.id,'automation_failed',(now() AT TIME ZONE 'Asia/Riyadh')::date,'تعذر ترحيل الإهلاك الدوري راجع الفترة المالية وصلاحيات الحسابات',row.owner_user_id);
  END;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',coalesce(prior,''),true);RETURN processed;
END $$;
-- Installing this job does not enable depreciation for any asset. Every asset
-- requires its own explicit autoEnabled setting; the default is false.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
 EXECUTE 'SELECT cron.schedule(''erp-assets-depreciation'',''15 0 * * *'',''SELECT erp_asset_private.run_automatic()'')';
END IF;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_asset_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_asset_read(uuid,uuid,text,text,integer),public.erp_asset_save(uuid,jsonb,uuid,integer,boolean,uuid),public.erp_asset_act(uuid,jsonb),public.erp_asset_location(uuid,text,text,uuid,integer,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_asset_read(uuid,uuid,text,text,integer),public.erp_asset_save(uuid,jsonb,uuid,integer,boolean,uuid),public.erp_asset_act(uuid,jsonb),public.erp_asset_location(uuid,text,text,uuid,integer,boolean,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_asset_import(uuid,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_asset_import(uuid,jsonb,boolean,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
