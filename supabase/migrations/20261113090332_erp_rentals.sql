BEGIN;
CREATE SCHEMA erp_rental_private;
REVOKE ALL ON SCHEMA erp_rental_private FROM PUBLIC,anon,authenticated;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['rules','types','units','seasons'] LOOP
 EXECUTE format('CREATE TABLE public.erp_rental_%I(id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL CHECK(jsonb_typeof(payload)=''object''),UNIQUE(cafe_id,id))',t);
END LOOP;END $$;
CREATE TABLE public.erp_rental_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL DEFAULT '{"lineMode":"single","invoiceStatus":"draft","onlineBooking":false,"fields":[]}');
CREATE TABLE public.erp_rental_reservations(id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,customer_id uuid NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','closed','cancelled')),payload jsonb NOT NULL,total numeric(14,2) NOT NULL CHECK(total BETWEEN 0 AND 1000000000),breakdown jsonb NOT NULL,draft_id uuid,recurring_id uuid,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,customer_id) REFERENCES public.bf_parties(cafe_id,id),CHECK(ends_at>starts_at AND ends_at-starts_at<=interval '366 days'));
CREATE TABLE public.erp_rental_contracts(id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),customer_id uuid NOT NULL,unit_id uuid NOT NULL,starts_at date NOT NULL,ends_at date NOT NULL,revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','closed','cancelled')),code text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id),UNIQUE(cafe_id,code),FOREIGN KEY(cafe_id,customer_id) REFERENCES public.bf_parties(cafe_id,id),FOREIGN KEY(cafe_id,unit_id) REFERENCES public.erp_rental_units(cafe_id,id),CHECK(ends_at>starts_at));
CREATE TABLE public.erp_rental_reservation_units(cafe_id uuid NOT NULL,unit_id uuid NOT NULL,reservation_id uuid,contract_id uuid,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,active boolean NOT NULL DEFAULT true,FOREIGN KEY(cafe_id,unit_id) REFERENCES public.erp_rental_units(cafe_id,id),FOREIGN KEY(cafe_id,reservation_id) REFERENCES public.erp_rental_reservations(cafe_id,id),FOREIGN KEY(cafe_id,contract_id) REFERENCES public.erp_rental_contracts(cafe_id,id),CHECK((reservation_id IS NULL)<>(contract_id IS NULL)),CHECK(ends_at>starts_at));
CREATE INDEX erp_rental_occupancy ON public.erp_rental_reservation_units(cafe_id,unit_id,starts_at,ends_at) WHERE active;
CREATE TABLE public.erp_rental_installments(id uuid PRIMARY KEY,cafe_id uuid NOT NULL,contract_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1,due date NOT NULL,amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount<=1000000000),note text NOT NULL DEFAULT '',draft_id uuid,UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,contract_id) REFERENCES public.erp_rental_contracts(cafe_id,id));
CREATE INDEX erp_rental_installments_contract ON public.erp_rental_installments(cafe_id,contract_id,due);
CREATE TABLE public.erp_rental_invoice_accounts(cafe_id uuid NOT NULL,document_id uuid PRIMARY KEY REFERENCES public.bf_documents(id),account_id uuid NOT NULL,FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id));
CREATE TABLE public.erp_rental_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),record_id uuid NOT NULL,entity text NOT NULL,action text NOT NULL,actor uuid REFERENCES auth.users(id),details jsonb NOT NULL DEFAULT '{}',at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.erp_rental_requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['rules','types','units','seasons','settings','reservations','reservation_units','contracts','installments','invoice_accounts','events','requests'] LOOP EXECUTE format('ALTER TABLE public.erp_rental_%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.erp_rental_%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;

CREATE FUNCTION erp_rental_private.cost(method text,minutes numeric,rates jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v numeric;BEGIN
 IF minutes<=0 OR minutes>527040 THEN RAISE EXCEPTION 'مدة الحجز خارج النطاق' USING ERRCODE='22023';END IF;
 v:=CASE method WHEN 'minute' THEN ceil(minutes)*(rates->>'minute')::numeric WHEN 'hour' THEN ceil(minutes/60)*(rates->>'hour')::numeric WHEN 'day' THEN ceil(minutes/1440)*(rates->>'day')::numeric WHEN 'mixed' THEN floor(minutes/1440)*(rates->>'day')::numeric+ceil(mod(minutes,1440)/60)*(rates->>'hour')::numeric END;
 IF v IS NULL OR v<0 OR v>1000000000 OR v='NaN'::numeric THEN RAISE EXCEPTION 'قاعدة التسعير غير صالحة' USING ERRCODE='22023';END IF;RETURN round(v,2);
END $$;
CREATE FUNCTION erp_rental_private.effective_tax(c uuid,rate numeric) RETURNS numeric LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE prefs jsonb:=brand_finance_private.invoice_settings(c);BEGIN RETURN CASE prefs#>>'{advanced,taxMode}' WHEN 'none' THEN 0 WHEN 'specific' THEN(prefs#>>'{advanced,specificTaxRate}')::numeric ELSE rate END;END $$;
CREATE FUNCTION public.erp_rentals_write(p_cafe_id uuid,p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;old_request public.erp_rental_requests;oid uuid;table_name text;old_revision integer;data jsonb;item jsonb;val numeric;ids uuid[];start_at timestamptz;end_at timestamptz;q jsonb;result jsonb;old_res public.erp_rental_reservations;old_contract public.erp_rental_contracts;entity text;state text;has_invoice boolean;amount numeric;affected integer;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Rental write denied' USING ERRCODE='42501';END IF;
 IF p_action='settings' AND role_name NOT IN('owner','manager') THEN RAISE EXCEPTION 'Rental settings denied' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>500000 THEN RAISE EXCEPTION 'طلب غير صالح' USING ERRCODE='22023';END IF;
 -- Financial lock first: invoices, corrections and occupancy writes share one order.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO old_request FROM public.erp_rental_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF old_request.actor<>auth.uid() OR old_request.action IS DISTINCT FROM p_action OR old_request.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'طلب متكرر ببيانات مختلفة' USING ERRCODE='40001';END IF;RETURN old_request.result;END IF;
 oid:=coalesce((p_payload->>'id')::uuid,p_cafe_id);entity:=p_action;
 IF NOT p_payload?'revision' OR jsonb_typeof(p_payload->'revision') IS DISTINCT FROM 'number' OR (p_payload->>'revision')::integer<0 OR (p_action<>'settings' AND (p_payload->>'id') IS NULL) THEN RAISE EXCEPTION 'معرف السجل وإصداره مطلوبان' USING ERRCODE='22023';END IF;
 IF p_action IN('rule','type','unit','season') AND (jsonb_typeof(p_payload->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'الاسم والحالة مطلوبان' USING ERRCODE='22023';END IF;
 IF p_action='rule' AND (p_payload->>'method' IS NULL OR jsonb_typeof(p_payload->'weekRates') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'rates') IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'طريقة التسعير والأسعار مطلوبة' USING ERRCODE='22023';END IF;
 IF p_action='season' AND (jsonb_typeof(p_payload->'typeIds') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'days') IS DISTINCT FROM 'array' OR p_payload->>'from' IS NULL OR p_payload->>'to' IS NULL OR (p_payload->>'priority')::integer NOT BETWEEN 0 AND 9999) THEN RAISE EXCEPTION 'أكمل فترة الموسم وأيامه ووحداته' USING ERRCODE='22023';END IF;
 IF p_action='contract' AND (jsonb_typeof(p_payload->'installments') IS DISTINCT FROM 'array' OR p_payload->>'code' IS NULL OR p_payload->>'taxRate' IS NULL OR p_payload->>'deposit' IS NULL) THEN RAISE EXCEPTION 'أكمل بيانات العقد وأقساطه' USING ERRCODE='22023';END IF;
 IF p_action='settings' AND (p_payload->>'lineMode' IS NULL OR p_payload->>'invoiceStatus' IS NULL OR jsonb_typeof(p_payload->'fields') IS DISTINCT FROM 'array') THEN RAISE EXCEPTION 'أكمل إعدادات الفواتير والحقول' USING ERRCODE='22023';END IF;
 IF p_action IN('rule','type','unit','season') THEN
  table_name:=CASE p_action WHEN 'rule' THEN 'rules' WHEN 'type' THEN 'types' WHEN 'unit' THEN 'units' ELSE 'seasons' END;
  EXECUTE format('SELECT revision FROM public.erp_rental_%I WHERE cafe_id=$1 AND id=$2',table_name) INTO old_revision USING p_cafe_id,oid;
  IF coalesce(old_revision,0) IS DISTINCT FROM (p_payload->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل' USING ERRCODE='40001';END IF;
  IF length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 160 OR jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع الاسم والحالة' USING ERRCODE='22023';END IF;
  IF p_action='rule' THEN
   IF p_payload->>'method' NOT IN('minute','hour','day','mixed') OR jsonb_array_length(p_payload->'weekRates')<>7 THEN RAISE EXCEPTION 'راجع طريقة التسعير وأيام الأسبوع' USING ERRCODE='22023';END IF;
   FOR item IN SELECT p_payload->'rates' UNION ALL SELECT x FROM jsonb_array_elements(p_payload->'weekRates') x WHERE x<>'null' LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'أدخل الأسعار' USING ERRCODE='22023';END IF;
    FOREACH state IN ARRAY ARRAY['day','hour','minute'] LOOP val:=(item->>state)::numeric;IF val IS NULL OR val<0 OR val>1000000000 OR val<>round(val,2) OR val='NaN'::numeric THEN RAISE EXCEPTION 'سعر غير صالح' USING ERRCODE='22023';END IF;END LOOP;
   END LOOP;
  ELSIF p_action IN('type','season') THEN
   IF NOT EXISTS(SELECT 1 FROM public.erp_rental_rules WHERE cafe_id=p_cafe_id AND id=(p_payload->>'ruleId')::uuid) THEN RAISE EXCEPTION 'اختر قاعدة تسعير في هذه العلامة' USING ERRCODE='42501';END IF;
   IF p_action='type' AND ((p_payload->>'taxRate')::numeric NOT IN(0,15) OR p_payload->>'taxRate' IS NULL) THEN RAISE EXCEPTION 'الضريبة غير صالحة' USING ERRCODE='22023';END IF;
   IF p_action='season' THEN
    IF (p_payload->>'to')::date<(p_payload->>'from')::date OR jsonb_array_length(p_payload->'days') NOT BETWEEN 1 AND 7 OR jsonb_array_length(p_payload->'typeIds') NOT BETWEEN 1 AND 1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'days') x WHERE x::integer NOT BETWEEN 0 AND 6) THEN RAISE EXCEPTION 'راجع فترة الموسم وأيامه وأنواع الوحدات' USING ERRCODE='22023';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'typeIds') x WHERE NOT EXISTS(SELECT 1 FROM public.erp_rental_types WHERE cafe_id=p_cafe_id AND id=x::uuid)) THEN RAISE EXCEPTION 'نوع وحدة غير متاح' USING ERRCODE='42501';END IF;
   END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.erp_rental_types WHERE cafe_id=p_cafe_id AND id=(p_payload->>'typeId')::uuid) THEN RAISE EXCEPTION 'اختر نوع الوحدة' USING ERRCODE='42501';END IF;
  END IF;
  data:=p_payload-'revision';EXECUTE format('INSERT INTO public.erp_rental_%I(id,cafe_id,revision,payload) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,payload=EXCLUDED.payload WHERE erp_rental_%I.cafe_id=EXCLUDED.cafe_id',table_name,table_name) USING oid,p_cafe_id,coalesce(old_revision,0)+1,data;
  GET DIAGNOSTICS affected=ROW_COUNT;IF affected<>1 THEN RAISE EXCEPTION 'معرف السجل مستخدم' USING ERRCODE='42501';END IF;result:=jsonb_build_object('id',oid);
 ELSIF p_action='settings' THEN
  SELECT revision INTO old_revision FROM public.erp_rental_settings WHERE cafe_id=p_cafe_id;
  IF coalesce(old_revision,0) IS DISTINCT FROM (p_payload->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت الإعدادات' USING ERRCODE='40001';END IF;
  IF p_payload->>'lineMode' NOT IN('single','daily') OR p_payload->>'invoiceStatus' NOT IN('draft','issued') OR jsonb_typeof(p_payload->'onlineBooking') IS DISTINCT FROM 'boolean' OR jsonb_array_length(p_payload->'fields')>30 THEN RAISE EXCEPTION 'راجع الإعدادات' USING ERRCODE='22023';END IF;
  IF (SELECT count(DISTINCT f->>'key') FROM jsonb_array_elements(p_payload->'fields') f)<>jsonb_array_length(p_payload->'fields') THEN RAISE EXCEPTION 'معرفات الحقول الإضافية يجب ألا تتكرر' USING ERRCODE='22023';END IF;
  FOR item IN SELECT f FROM jsonb_array_elements(p_payload->'fields') f LOOP IF coalesce(item->>'key','')!~'^[a-z][a-z0-9_]{0,39}$' OR coalesce(length(btrim(item->>'label')),0) NOT BETWEEN 1 AND 100 OR coalesce(item->>'type','') NOT IN('text','number','date','checkbox') OR jsonb_typeof(item->'required') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع أسماء الحقول وأنواعها وحالتها' USING ERRCODE='22023';END IF;END LOOP;
  IF nullif(p_payload->>'warehouseId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=(p_payload->>'warehouseId')::uuid AND active) THEN RAISE EXCEPTION 'اختر مستودعًا نشطًا في العلامة' USING ERRCODE='42501';END IF;
  IF nullif(p_payload->>'orderSourceId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(brand_finance_private.order_source_settings(p_cafe_id)->'sources') x WHERE x->>'id'=p_payload->>'orderSourceId' AND (x->>'active')::boolean) THEN RAISE EXCEPTION 'مصدر الطلب غير متاح' USING ERRCODE='22023';END IF;
  INSERT INTO public.erp_rental_settings VALUES(p_cafe_id,coalesce(old_revision,0)+1,p_payload-'revision') ON CONFLICT(cafe_id) DO UPDATE SET revision=EXCLUDED.revision,payload=EXCLUDED.payload;result:=jsonb_build_object('id',p_cafe_id);
 ELSIF p_action IN('reservation','contract') THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=(p_payload->>'customerId')::uuid AND kind='customer' AND active) THEN RAISE EXCEPTION 'اختر عميلًا نشطًا في العلامة' USING ERRCODE='42501';END IF;
  IF p_action='reservation' THEN
   SELECT * INTO old_res FROM public.erp_rental_reservations WHERE cafe_id=p_cafe_id AND id=oid FOR UPDATE;old_revision:=old_res.revision;
   IF old_revision IS NOT NULL AND(old_res.status NOT IN('pending','confirmed') OR old_res.draft_id IS NOT NULL) THEN RAISE EXCEPTION 'لا يمكن تعديل حجز مغلق أو مفوتر' USING ERRCODE='22023';END IF;
   ids:=ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p_payload->'unitIds') x);start_at:=(p_payload->>'startsAt')::timestamptz;end_at:=(p_payload->>'endsAt')::timestamptz;
   q:=erp_rental_private.quote(p_cafe_id,ids,start_at,end_at,oid);IF (q->>'total')::numeric IS DISTINCT FROM (p_payload->>'expectedTotal')::numeric THEN RAISE EXCEPTION 'تغير سعر الحجز اطلب تسعيرًا جديدًا' USING ERRCODE='40001';END IF;
  ELSE
   SELECT * INTO old_contract FROM public.erp_rental_contracts WHERE cafe_id=p_cafe_id AND id=oid FOR UPDATE;old_revision:=old_contract.revision;
   IF old_revision IS NOT NULL AND(old_contract.status<>'active' OR EXISTS(SELECT 1 FROM public.erp_rental_installments WHERE contract_id=oid AND draft_id IS NOT NULL)) THEN RAISE EXCEPTION 'العقد مغلق أو مرتبط بفاتورة لا يمكن تعديل قيمه' USING ERRCODE='22023';END IF;
   ids:=ARRAY[(p_payload->>'unitId')::uuid];start_at:=((p_payload->>'startsAt')::date::timestamp AT TIME ZONE 'Asia/Riyadh');end_at:=((p_payload->>'endsAt')::date::timestamp AT TIME ZONE 'Asia/Riyadh');
   IF start_at IS NULL OR end_at IS NULL OR end_at<=start_at OR end_at-start_at>interval '100 years' OR NOT EXISTS(SELECT 1 FROM public.erp_rental_units WHERE cafe_id=p_cafe_id AND id=ids[1] AND (payload->>'active')::boolean) THEN RAISE EXCEPTION 'راجع الوحدة وفترة العقد' USING ERRCODE='22023';END IF;
   IF jsonb_array_length(p_payload->'installments') NOT BETWEEN 1 AND 600 OR length(btrim(p_payload->>'code')) NOT BETWEEN 1 AND 80 OR (p_payload->>'deposit')::numeric NOT BETWEEN 0 AND 1000000000 OR (p_payload->>'taxRate')::numeric NOT IN(0,15) THEN RAISE EXCEPTION 'راجع قيم العقد والأقساط' USING ERRCODE='22023';END IF;
   IF erp_rental_private.effective_tax(p_cafe_id,(p_payload->>'taxRate')::numeric) IS DISTINCT FROM (p_payload->>'taxRate')::numeric THEN RAISE EXCEPTION 'نسبة ضريبة العقد لا تطابق النسبة المفروضة في إعدادات الفواتير' USING ERRCODE='22023';END IF;
   IF p_payload->>'salesAccountId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=(p_payload->>'salesAccountId')::uuid AND active AND kind='revenue' AND NOT frozen AND NOT is_group AND deleted_at IS NULL) THEN RAISE EXCEPTION 'اختر حساب إيرادات نشطًا' USING ERRCODE='22023';END IF;
   amount:=0;FOR item IN SELECT x FROM jsonb_array_elements(p_payload->'installments') x LOOP
    val:=(item->>'amount')::numeric;IF val IS NULL OR val<=0 OR val>1000000000 OR val<>round(val,2) OR (item->>'due')::date NOT BETWEEN (p_payload->>'startsAt')::date AND (p_payload->>'endsAt')::date OR item->>'due' IS NULL THEN RAISE EXCEPTION 'قيمة القسط أو استحقاقه غير صالح' USING ERRCODE='22023';END IF;amount:=amount+val;
   END LOOP;IF amount>1000000000 THEN RAISE EXCEPTION 'قيمة العقد تتجاوز الحد المسموح' USING ERRCODE='22023';END IF;
  END IF;
  IF coalesce(old_revision,0) IS DISTINCT FROM (p_payload->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل أعد تحميله' USING ERRCODE='40001';END IF;
  IF EXISTS(SELECT 1 FROM public.erp_rental_reservation_units o WHERE o.cafe_id=p_cafe_id AND o.unit_id=ANY(ids) AND o.active AND o.starts_at<end_at AND o.ends_at>start_at AND coalesce(o.reservation_id,o.contract_id)<>oid) THEN RAISE EXCEPTION 'الوحدة محجوزة خلال الفترة' USING ERRCODE='23P01';END IF;
  IF p_action='reservation' THEN
   INSERT INTO public.erp_rental_reservations(id,cafe_id,customer_id,starts_at,ends_at,revision,payload,total,breakdown) VALUES(oid,p_cafe_id,(p_payload->>'customerId')::uuid,start_at,end_at,coalesce(old_revision,0)+1,(CASE WHEN old_res.customer_id=(p_payload->>'customerId')::uuid THEN coalesce(old_res.payload,'{}') ELSE '{}'::jsonb END)||p_payload-'revision'||jsonb_build_object('invoiceLineMode',q->>'lineMode'),(q->>'total')::numeric,q->'lines') ON CONFLICT(id) DO UPDATE SET customer_id=EXCLUDED.customer_id,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,revision=EXCLUDED.revision,payload=EXCLUDED.payload,total=EXCLUDED.total,breakdown=EXCLUDED.breakdown WHERE erp_rental_reservations.cafe_id=EXCLUDED.cafe_id;
  ELSE
   INSERT INTO public.erp_rental_contracts(id,cafe_id,customer_id,unit_id,starts_at,ends_at,revision,code,payload) VALUES(oid,p_cafe_id,(p_payload->>'customerId')::uuid,ids[1],(p_payload->>'startsAt')::date,(p_payload->>'endsAt')::date,coalesce(old_revision,0)+1,p_payload->>'code',p_payload-'revision'-'installments') ON CONFLICT(id) DO UPDATE SET customer_id=EXCLUDED.customer_id,unit_id=EXCLUDED.unit_id,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,revision=EXCLUDED.revision,code=EXCLUDED.code,payload=EXCLUDED.payload WHERE erp_rental_contracts.cafe_id=EXCLUDED.cafe_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'السجل غير متاح' USING ERRCODE='42501';END IF;
  DELETE FROM public.erp_rental_reservation_units WHERE cafe_id=p_cafe_id AND coalesce(reservation_id,contract_id)=oid;
  INSERT INTO public.erp_rental_reservation_units SELECT p_cafe_id,x,CASE WHEN p_action='reservation' THEN oid END,CASE WHEN p_action='contract' THEN oid END,start_at,end_at,true FROM unnest(ids) x;
  IF p_action='contract' THEN DELETE FROM public.erp_rental_installments WHERE contract_id=oid;INSERT INTO public.erp_rental_installments(id,cafe_id,contract_id,due,amount,note) SELECT(x->>'id')::uuid,p_cafe_id,oid,(x->>'due')::date,(x->>'amount')::numeric,coalesce(x->>'note','') FROM jsonb_array_elements(p_payload->'installments') x;END IF;
  result:=jsonb_build_object('id',oid);
  IF p_action='reservation' AND coalesce((p_payload->>'autoInvoice')::boolean,false) THEN result:=erp_rental_private.invoice(p_cafe_id,'reservation',oid);END IF;
 ELSIF p_action IN('status','delete','invoice','recurring') THEN
  entity:=p_payload->>'entity';table_name:=CASE entity WHEN 'reservation' THEN 'reservations' WHEN 'contract' THEN 'contracts' WHEN 'installment' THEN 'installments' WHEN 'unit' THEN 'units' WHEN 'type' THEN 'types' WHEN 'rule' THEN 'rules' WHEN 'season' THEN 'seasons' END;
  IF table_name IS NULL THEN RAISE EXCEPTION 'نوع سجل غير صالح' USING ERRCODE='22023';END IF;
  EXECUTE format('SELECT revision FROM public.erp_rental_%I WHERE cafe_id=$1 AND id=$2',table_name) INTO old_revision USING p_cafe_id,oid;
  IF old_revision IS NULL THEN RAISE EXCEPTION 'السجل غير متاح' USING ERRCODE='42501';END IF;
  IF old_revision IS DISTINCT FROM (p_payload->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل' USING ERRCODE='40001';END IF;
  IF p_action='recurring' THEN
   IF entity<>'reservation' THEN RAISE EXCEPTION 'الفاتورة الدورية تخص أمر الحجز' USING ERRCODE='22023';END IF;
   SELECT * INTO old_res FROM public.erp_rental_reservations WHERE cafe_id=p_cafe_id AND id=oid;
   IF old_res.recurring_id IS NOT NULL THEN result:=jsonb_build_object('id',oid,'recurringId',old_res.recurring_id);
   ELSE
    result:=erp_rental_private.invoice(p_cafe_id,'reservation',oid,true);SELECT payload INTO data FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=(result->>'draftId')::uuid;
    state:=gen_random_uuid()::text;PERFORM public.brand_finance_save_recurring_invoice(p_cafe_id,state::uuid,0,jsonb_build_object('name','حجز وحدات #'||old_res.number,'active',false,'showPeriod',true,'unit','month','interval',1,'count',0,'leadDays',0,'paymentTermsDays',0,'firstDate',greatest((old_res.ends_at AT TIME ZONE 'Asia/Riyadh')::date,(now() AT TIME ZONE 'Asia/Riyadh')::date),'document',data));
    UPDATE public.erp_rental_reservations SET recurring_id=state::uuid,revision=revision+1 WHERE id=oid;result:=jsonb_build_object('id',oid,'recurringId',state::uuid);
   END IF;
  ELSIF p_action='invoice' THEN result:=erp_rental_private.invoice(p_cafe_id,entity,oid);
  ELSIF p_action='status' THEN
   state:=p_payload->>'status';IF (entity='reservation' AND state NOT IN('pending','confirmed','closed','cancelled')) OR (entity='contract' AND state NOT IN('active','closed','cancelled')) OR entity NOT IN('reservation','contract') OR state IS NULL THEN RAISE EXCEPTION 'الحالة غير صالحة' USING ERRCODE='22023';END IF;
   IF state NOT IN('closed','cancelled') AND EXISTS(SELECT 1 FROM public.erp_rental_reservation_units own JOIN public.erp_rental_reservation_units other ON own.cafe_id=other.cafe_id AND own.unit_id=other.unit_id AND own.starts_at<other.ends_at AND own.ends_at>other.starts_at WHERE own.cafe_id=p_cafe_id AND coalesce(own.reservation_id,own.contract_id)=oid AND coalesce(other.reservation_id,other.contract_id)<>oid AND other.active) THEN RAISE EXCEPTION 'تعارض إشغال عند إعادة الفتح' USING ERRCODE='23P01';END IF;
   EXECUTE format('UPDATE public.erp_rental_%I SET status=$1,revision=revision+1 WHERE cafe_id=$2 AND id=$3',table_name) USING state,p_cafe_id,oid;UPDATE public.erp_rental_reservation_units SET active=state NOT IN('closed','cancelled') WHERE cafe_id=p_cafe_id AND coalesce(reservation_id,contract_id)=oid;result:=jsonb_build_object('id',oid);
  ELSE
   IF entity='reservation' THEN SELECT draft_id IS NOT NULL INTO has_invoice FROM public.erp_rental_reservations WHERE id=oid;
   ELSIF entity='contract' THEN SELECT EXISTS(SELECT 1 FROM public.erp_rental_installments WHERE contract_id=oid AND draft_id IS NOT NULL) INTO has_invoice;
   ELSIF entity='installment' THEN RAISE EXCEPTION 'عدّل جدول الأقساط من العقد للحفاظ على إجماليه' USING ERRCODE='22023';END IF;
   IF has_invoice THEN RAISE EXCEPTION 'لا يمكن حذف سجل مرتبط بفاتورة استخدم الإلغاء مع مراجعة المالية' USING ERRCODE='22023';END IF;
   IF entity='rule' AND(EXISTS(SELECT 1 FROM public.erp_rental_types WHERE cafe_id=p_cafe_id AND payload->>'ruleId'=oid::text) OR EXISTS(SELECT 1 FROM public.erp_rental_seasons WHERE cafe_id=p_cafe_id AND payload->>'ruleId'=oid::text)) OR entity='type' AND(EXISTS(SELECT 1 FROM public.erp_rental_units WHERE cafe_id=p_cafe_id AND payload->>'typeId'=oid::text) OR EXISTS(SELECT 1 FROM public.erp_rental_seasons WHERE cafe_id=p_cafe_id AND payload->'typeIds'?oid::text)) THEN RAISE EXCEPTION 'السجل مستخدم عطل حالته بدلًا من حذفه' USING ERRCODE='22023';END IF;
   IF entity IN('reservation','contract') THEN DELETE FROM public.erp_rental_reservation_units WHERE cafe_id=p_cafe_id AND coalesce(reservation_id,contract_id)=oid;IF entity='contract' THEN DELETE FROM public.erp_rental_installments WHERE contract_id=oid;END IF;END IF;
   EXECUTE format('DELETE FROM public.erp_rental_%I WHERE cafe_id=$1 AND id=$2',table_name) USING p_cafe_id,oid;result:=jsonb_build_object('id',oid,'deleted',true);
  END IF;
 ELSE RAISE EXCEPTION 'الإجراء غير معروف' USING ERRCODE='22023';END IF;
 INSERT INTO public.erp_rental_events(cafe_id,record_id,entity,action,actor,details) VALUES(p_cafe_id,oid,entity,p_action,auth.uid(),jsonb_build_object('status',p_payload->>'status','result',result));
 INSERT INTO public.erp_rental_requests VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_payload,result);RETURN result;
END $$;
CREATE FUNCTION erp_rental_private.quote(c uuid,ids uuid[],s timestamptz,e timestamptz,exclude_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE uid uuid;u jsonb;t jsonb;r jsonb;season record;part timestamptz;stop timestamptz;d date;rates jsonb;price numeric;total numeric:=0;lines jsonb:='[]';rule_id uuid;season_id uuid;line_mode text;
BEGIN
 IF s IS NULL OR e IS NULL OR NOT isfinite(s) OR NOT isfinite(e) OR e<=s OR e-s>interval '366 days' OR cardinality(ids) NOT BETWEEN 1 AND 100 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'حدد الوحدات ومدة حجز لا تتجاوز سنة' USING ERRCODE='22023';END IF;
 FOREACH uid IN ARRAY ids LOOP
  SELECT payload INTO u FROM public.erp_rental_units WHERE cafe_id=c AND id=uid AND (payload->>'active')::boolean;IF NOT FOUND THEN RAISE EXCEPTION 'الوحدة غير متاحة' USING ERRCODE='22023';END IF;
  SELECT payload INTO t FROM public.erp_rental_types WHERE cafe_id=c AND id=(u->>'typeId')::uuid AND (payload->>'active')::boolean;IF NOT FOUND THEN RAISE EXCEPTION 'نوع الوحدة غير نشط' USING ERRCODE='22023';END IF;
  t:=jsonb_set(t,'{taxRate}',to_jsonb(erp_rental_private.effective_tax(c,(t->>'taxRate')::numeric)));
  IF EXISTS(SELECT 1 FROM public.erp_rental_reservation_units o WHERE o.cafe_id=c AND o.unit_id=uid AND o.active AND o.starts_at<e AND o.ends_at>s AND coalesce(o.reservation_id,o.contract_id) IS DISTINCT FROM exclude_id) THEN RAISE EXCEPTION 'الوحدة محجوزة خلال هذه الفترة' USING ERRCODE='23P01';END IF;
  part:=s;
  WHILE part<e LOOP
   stop:=least(part+interval '24 hours',e);d:=(part AT TIME ZONE 'Asia/Riyadh')::date;season_id:=NULL;rule_id:=(t->>'ruleId')::uuid;
   SELECT x.id,x.payload INTO season FROM public.erp_rental_seasons x WHERE x.cafe_id=c AND (x.payload->>'active')::boolean AND x.payload->'typeIds' ? (u->>'typeId') AND d BETWEEN (x.payload->>'from')::date AND (x.payload->>'to')::date AND x.payload->'days' @> to_jsonb(extract(dow FROM d)::integer) ORDER BY (x.payload->>'priority')::integer DESC,x.id LIMIT 1;
   IF FOUND THEN season_id:=season.id;rule_id:=(season.payload->>'ruleId')::uuid;END IF;
   SELECT payload INTO r FROM public.erp_rental_rules WHERE cafe_id=c AND id=rule_id AND (payload->>'active')::boolean;IF NOT FOUND THEN RAISE EXCEPTION 'قاعدة التسعير غير نشطة' USING ERRCODE='22023';END IF;
   rates:=coalesce(nullif(r->'weekRates'->extract(dow FROM d)::integer,'null'),r->'rates');price:=erp_rental_private.cost(r->>'method',extract(epoch FROM(stop-part))/60,rates);
   lines:=lines||jsonb_build_array(jsonb_build_object('unitId',uid,'name',u->>'name','from',part,'to',stop,'price',price,'taxRate',(t->>'taxRate')::numeric,'ruleId',rule_id,'seasonId',season_id));total:=total+price+round(price*(t->>'taxRate')::numeric/100,2);part:=stop;
  END LOOP;
 END LOOP;
 SELECT payload->>'lineMode' INTO line_mode FROM public.erp_rental_settings WHERE cafe_id=c;line_mode:=coalesce(line_mode,'single');
 IF line_mode='single' THEN SELECT sum(z.price+round(z.price*z.vat/100,2)) INTO total FROM(SELECT sum((x->>'price')::numeric) price,(x->>'taxRate')::numeric vat FROM jsonb_array_elements(lines) x GROUP BY x->>'unitId',x->>'taxRate') z;
 ELSIF jsonb_array_length(lines)>100 THEN RAISE EXCEPTION 'الفاتورة اليومية تقبل حتى 100 بند اختر عرض البنود المجمعة أو قسم الحجز' USING ERRCODE='22023';END IF;
 IF total>1000000000 THEN RAISE EXCEPTION 'إجمالي الحجز يتجاوز الحد المسموح' USING ERRCODE='22023';END IF;RETURN jsonb_build_object('total',total,'lines',lines,'lineMode',line_mode);
END $$;
CREATE FUNCTION public.erp_rentals_quote(p_cafe_id uuid,p_unit_ids uuid[],p_start timestamptz,p_end timestamptz,p_exclude uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Rental access denied' USING ERRCODE='42501';END IF;
 RETURN erp_rental_private.quote(p_cafe_id,p_unit_ids,p_start,p_end,p_exclude);
END $$;
CREATE FUNCTION erp_rental_private.invoice(c uuid,entity text,record_id uuid,draft_only boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r public.erp_rental_reservations;i public.erp_rental_installments;contract public.erp_rental_contracts;cfg jsonb;draft uuid;doc uuid;customer uuid;lines jsonb;title text;total numeric;save_result jsonb;result jsonb;tax numeric;
BEGIN
 SELECT payload INTO cfg FROM public.erp_rental_settings WHERE cafe_id=c;cfg:=coalesce(cfg,'{"lineMode":"single","invoiceStatus":"draft"}');
 IF entity='reservation' THEN
  SELECT * INTO r FROM public.erp_rental_reservations WHERE cafe_id=c AND id=record_id FOR UPDATE;IF NOT FOUND OR r.status='cancelled' THEN RAISE EXCEPTION 'الحجز غير متاح للفوترة' USING ERRCODE='22023';END IF;
  draft:=r.draft_id;customer:=r.customer_id;total:=r.total;title:='حجز وحدات #'||r.number;
  IF coalesce(r.payload->>'invoiceLineMode','single')='daily' THEN SELECT jsonb_agg(jsonb_build_object('key',ordinality,'productId','','name',left(x->>'name'||' '||left(x->>'from',10),160),'description',x->>'from'||' — '||x->>'to','kind','service','quantity',1,'price',(x->>'price')::numeric,'vatRate',(x->>'taxRate')::numeric,'exemptionReason',coalesce(cfg->>'taxReason',''),'taxCategory',CASE WHEN (x->>'taxRate')::numeric>0 THEN 'S' ELSE 'Z' END)) INTO lines FROM jsonb_array_elements(r.breakdown) WITH ORDINALITY z(x,ordinality);
  ELSE SELECT jsonb_agg(jsonb_build_object('key',position,'productId','','name',name,'description',title,'kind','service','quantity',1,'price',price,'vatRate',vat,'exemptionReason',coalesce(cfg->>'taxReason',''),'taxCategory',CASE WHEN vat>0 THEN 'S' ELSE 'Z' END)) INTO lines FROM(SELECT row_number() OVER() position,x->>'unitId' uid,x->>'name' name,(x->>'taxRate')::numeric vat,sum((x->>'price')::numeric) price FROM jsonb_array_elements(r.breakdown) x GROUP BY x->>'unitId',x->>'name',x->>'taxRate') g;END IF;
 ELSIF entity='installment' THEN
  SELECT * INTO i FROM public.erp_rental_installments WHERE cafe_id=c AND id=record_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'القسط غير متاح' USING ERRCODE='42501';END IF;SELECT * INTO contract FROM public.erp_rental_contracts WHERE cafe_id=c AND id=i.contract_id;IF contract.status='cancelled' THEN RAISE EXCEPTION 'العقد ملغي' USING ERRCODE='22023';END IF;
  draft:=i.draft_id;customer:=contract.customer_id;title:='قسط عقد إيجار '||contract.code||' '||i.due;tax:=(contract.payload->>'taxRate')::numeric;total:=i.amount+round(i.amount*tax/100,2);
  lines:=jsonb_build_array(jsonb_build_object('key',1,'productId','','name',title,'description',i.note,'kind','service','quantity',1,'price',i.amount,'vatRate',tax,'exemptionReason',coalesce(cfg->>'taxReason',''),'taxCategory',CASE WHEN tax>0 THEN 'S' ELSE 'Z' END));
 ELSE RAISE EXCEPTION 'نوع الفاتورة غير صالح' USING ERRCODE='22023';END IF;
 IF draft IS NOT NULL THEN SELECT document_id INTO doc FROM public.bf_company_invoices WHERE cafe_id=c AND draft_id=draft;RETURN jsonb_build_object('id',record_id,'draftId',draft,'invoiceId',doc);END IF;
 IF total<=0 THEN RAISE EXCEPTION 'قيمة الفاتورة يجب أن تكون موجبة' USING ERRCODE='22023';END IF;
 draft:=gen_random_uuid();save_result:=public.brand_finance_save_invoice_draft(c,draft,0,jsonb_build_object('issuer',jsonb_build_object('name',coalesce(cfg#>>'{issuer,name}',''),'address',coalesce(cfg#>>'{issuer,address}',''),'vatNumber',coalesce(cfg#>>'{issuer,vatNumber}','')),'supplyDate',(now() AT TIME ZONE 'Asia/Riyadh')::date::text,'template','standard','deliveryMethod','print','shipping','none','attachments','[]'::jsonb,'extraFields','[]'::jsonb,'deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'delivery',jsonb_build_object('confirmed',false,'date',''),'invoice',jsonb_build_object('partyId',customer,'warehouseId',coalesce(cfg->>'warehouseId',''),'accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','taxInclusive',false,'currency','SAR','note',title,'lines',lines)));
 IF nullif(cfg->>'orderSourceId','') IS NOT NULL THEN PERFORM public.brand_finance_set_invoice_order_source(c,draft,(save_result->>'revision')::integer,(cfg->>'orderSourceId')::uuid,0);END IF;
 IF entity='reservation' THEN UPDATE public.erp_rental_reservations SET draft_id=draft,revision=revision+1 WHERE id=record_id;ELSE UPDATE public.erp_rental_installments SET draft_id=draft,revision=revision+1 WHERE id=record_id;END IF;
 IF cfg->>'invoiceStatus'='issued' AND NOT draft_only THEN result:=public.brand_finance_issue_company_invoice(c,draft,(save_result->>'revision')::integer,total);SELECT document_id INTO doc FROM public.bf_company_invoices WHERE cafe_id=c AND draft_id=draft;IF doc IS NULL THEN RAISE EXCEPTION 'لم يثبت إصدار الفاتورة' USING ERRCODE='22023';END IF;END IF;

 RETURN jsonb_build_object('id',record_id,'draftId',draft,'invoiceId',doc);
END $$;
CREATE FUNCTION erp_rental_private.invoice_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE customer uuid;expected numeric;tax numeric;contract_status text;actual public.bf_documents;sales_account uuid;default_account uuid;net numeric;
BEGIN
 SELECT customer_id,total,status INTO customer,expected,contract_status FROM public.erp_rental_reservations WHERE cafe_id=NEW.cafe_id AND draft_id=NEW.draft_id;
 IF NOT FOUND THEN SELECT c.customer_id,i.amount+round(i.amount*(c.payload->>'taxRate')::numeric/100,2),c.status,(c.payload->>'salesAccountId')::uuid INTO customer,expected,contract_status,sales_account FROM public.erp_rental_installments i JOIN public.erp_rental_contracts c ON c.cafe_id=i.cafe_id AND c.id=i.contract_id WHERE i.cafe_id=NEW.cafe_id AND i.draft_id=NEW.draft_id;END IF;
 IF customer IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO actual FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id;
 IF actual.party_id IS DISTINCT FROM customer OR actual.total IS DISTINCT FROM expected OR actual.kind IS DISTINCT FROM 'sale' OR contract_status='cancelled' OR (NEW.snapshot->>'currency') IS DISTINCT FROM 'SAR' THEN RAISE EXCEPTION 'عميل الفاتورة وإجماليها وعملتها يجب أن تطابق الحجز أو قسط العقد' USING ERRCODE='22023';END IF;
 IF sales_account IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND id=sales_account AND kind='revenue' AND active AND NOT frozen AND NOT is_group AND deleted_at IS NULL) THEN RAISE EXCEPTION 'حساب إيرادات العقد غير متاح' USING ERRCODE='22023';END IF;
  default_account:=brand_finance_private.account(NEW.cafe_id,'4000');
  IF sales_account<>default_account THEN
   SELECT coalesce(sum(credit-debit),0) INTO net FROM public.bf_journal WHERE cafe_id=NEW.cafe_id AND document_id=NEW.document_id AND account_id=default_account;
   IF net>0 THEN PERFORM brand_finance_private.line(NEW.cafe_id,NEW.document_id,default_account,net,0);PERFORM brand_finance_private.line(NEW.cafe_id,NEW.document_id,sales_account,0,net);END IF;
   INSERT INTO public.erp_rental_invoice_accounts VALUES(NEW.cafe_id,NEW.document_id,sales_account);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION erp_rental_private.revenue_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND id=NEW.account_id AND code='4000') THEN RETURN NEW;END IF;
 SELECT a.account_id INTO target FROM public.bf_documents d JOIN public.erp_rental_invoice_accounts a ON a.cafe_id=d.cafe_id AND a.document_id=coalesce(d.reference_id,d.id) WHERE d.cafe_id=NEW.cafe_id AND d.id=NEW.document_id;
 IF target IS NOT NULL THEN NEW.account_id:=target;END IF;RETURN NEW;
END $$;
CREATE TRIGGER erp_rental_revenue BEFORE INSERT ON public.bf_journal FOR EACH ROW EXECUTE FUNCTION erp_rental_private.revenue_account();
CREATE TRIGGER erp_rental_invoice_guard BEFORE INSERT ON public.bf_company_invoices FOR EACH ROW EXECUTE FUNCTION erp_rental_private.invoice_guard();
CREATE FUNCTION public.erp_rentals_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;result jsonb:='{}';name text;items jsonb;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Rental read denied' USING ERRCODE='42501';END IF;
 FOREACH name IN ARRAY ARRAY['rules','types','units','seasons'] LOOP EXECUTE format('SELECT coalesce(jsonb_agg(payload||jsonb_build_object(''id'',id,''revision'',revision) ORDER BY payload->>''name''),''[]'') FROM public.erp_rental_%I WHERE cafe_id=$1',name) INTO items USING p_cafe_id;result:=result||jsonb_build_object(name,items);END LOOP;
 RETURN result||jsonb_build_object('warehouseOptions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name)) FROM public.bf_warehouses w WHERE w.cafe_id=p_cafe_id AND w.active),'[]'),'sourceOptions',brand_finance_private.order_source_settings(p_cafe_id)->'sources','sourceRequired',brand_finance_private.order_source_settings(p_cafe_id)->'required','salesAccounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY a.name) FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.kind='revenue' AND a.active AND NOT a.frozen AND NOT a.is_group AND a.deleted_at IS NULL),'[]'),'canWrite',role_name IN('owner','manager','accountant'),
 'settings',coalesce((SELECT payload||jsonb_build_object('revision',revision) FROM public.erp_rental_settings WHERE cafe_id=p_cafe_id),'{"revision":0,"lineMode":"single","invoiceStatus":"draft","onlineBooking":false,"fields":[]}'::jsonb),
 'reservations',coalesce((SELECT jsonb_agg(r.payload||jsonb_build_object('id',r.id,'revision',r.revision,'number',r.number,'status',r.status,'total',r.total,'draftId',r.draft_id,'recurringId',r.recurring_id,'invoiceId',i.document_id,'outstanding',CASE WHEN i.document_id IS NOT NULL THEN brand_finance_private.document_state(p_cafe_id,i.document_id)->'outstanding' END,'breakdown',r.breakdown,'customerName',p.name) ORDER BY r.created_at DESC) FROM public.erp_rental_reservations r JOIN public.bf_parties p ON p.cafe_id=r.cafe_id AND p.id=r.customer_id LEFT JOIN public.bf_company_invoices i ON i.cafe_id=r.cafe_id AND i.draft_id=r.draft_id WHERE r.cafe_id=p_cafe_id),'[]'),
 'contracts',coalesce((SELECT jsonb_agg(c.payload||jsonb_build_object('id',c.id,'revision',c.revision,'status',c.status,'customerName',p.name,'installments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'revision',x.revision,'contractId',x.contract_id,'due',x.due,'amount',x.amount,'note',x.note,'draftId',x.draft_id,'invoiceId',i.document_id,'invoiceTotal',d.total,'outstanding',CASE WHEN i.document_id IS NOT NULL THEN brand_finance_private.document_state(p_cafe_id,i.document_id)->'outstanding' END) ORDER BY x.due,x.id) FROM public.erp_rental_installments x LEFT JOIN public.bf_company_invoices i ON i.cafe_id=x.cafe_id AND i.draft_id=x.draft_id LEFT JOIN public.bf_documents d ON d.cafe_id=i.cafe_id AND d.id=i.document_id WHERE x.contract_id=c.id),'[]')) ORDER BY c.created_at DESC) FROM public.erp_rental_contracts c JOIN public.bf_parties p ON p.cafe_id=c.cafe_id AND p.id=c.customer_id WHERE c.cafe_id=p_cafe_id),'[]'),
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'entity',entity,'recordId',record_id,'action',action,'at',at,'details',details) ORDER BY at DESC) FROM public.erp_rental_events WHERE cafe_id=p_cafe_id),'[]'));
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_rental_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_rentals_read(uuid),public.erp_rentals_write(uuid,text,jsonb,uuid),public.erp_rentals_quote(uuid,uuid[],timestamptz,timestamptz,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_rentals_read(uuid),public.erp_rentals_write(uuid,text,jsonb,uuid),public.erp_rentals_quote(uuid,uuid[],timestamptz,timestamptz,uuid) TO authenticated;
-- Service-only adapter. Server derives p_profile from an authenticated customer session,
-- never from submitted identifiers. This API exposes only that profile's requests.
CREATE FUNCTION public.erp_rental_customer(p_cafe uuid,p_profile uuid,p_action text,p_input jsonb DEFAULT '{}',p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE profile public.customer_profiles;cfg jsonb;result jsonb;prior public.erp_rental_requests;party uuid;ids uuid[];s timestamptz;e timestamptz;oid uuid;q jsonb;f jsonb;value jsonb;old public.erp_rental_reservations;
BEGIN
 SELECT * INTO profile FROM public.customer_profiles WHERE cafe_id=p_cafe AND id=p_profile;IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='42501';END IF;
 SELECT payload INTO cfg FROM public.erp_rental_settings WHERE cafe_id=p_cafe;IF NOT coalesce((cfg->>'onlineBooking')::boolean,false) THEN RAISE EXCEPTION 'الحجز عبر واجهة العميل غير متاح حاليًا' USING ERRCODE='42501';END IF;
 IF p_action='read' THEN RETURN jsonb_build_object('units',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.payload->>'name','type',t.payload->>'name')) FROM public.erp_rental_units u JOIN public.erp_rental_types t ON t.cafe_id=u.cafe_id AND t.id=(u.payload->>'typeId')::uuid WHERE u.cafe_id=p_cafe AND (u.payload->>'active')::boolean AND (t.payload->>'active')::boolean),'[]'),'fields',cfg->'fields','reservations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'startsAt',r.starts_at,'endsAt',r.ends_at,'total',r.total,'status',r.status,'canCancel',r.status='pending' AND r.draft_id IS NULL) ORDER BY r.created_at DESC) FROM public.erp_rental_reservations r WHERE r.cafe_id=p_cafe AND r.payload->>'customerProfileId'=p_profile::text),'[]'));END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>20000 THEN RAISE EXCEPTION 'طلب الحجز غير صالح' USING ERRCODE='22023';END IF;
 IF p_action NOT IN('quote','book','cancel') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 IF p_action<>'quote' THEN
  IF p_request IS NULL THEN RAISE EXCEPTION 'Request id required' USING ERRCODE='22023';END IF;
  SELECT * INTO prior FROM public.erp_rental_requests WHERE cafe_id=p_cafe AND request_id=p_request;
  IF FOUND THEN IF prior.actor<>p_profile OR prior.action IS DISTINCT FROM 'customer_'||p_action OR prior.payload IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'تغير طلب الحجز' USING ERRCODE='40001';END IF;RETURN prior.result;END IF;
 END IF;
 IF p_action='cancel' THEN
  SELECT * INTO old FROM public.erp_rental_reservations WHERE cafe_id=p_cafe AND id=(p_input->>'id')::uuid AND payload->>'customerProfileId'=p_profile::text FOR UPDATE;
  IF NOT FOUND OR old.status<>'pending' OR old.draft_id IS NOT NULL THEN RAISE EXCEPTION 'لا يمكن إلغاء هذا الحجز من واجهة العميل تواصل مع الإدارة' USING ERRCODE='42501';END IF;
  oid:=old.id;UPDATE public.erp_rental_reservations SET status='cancelled',revision=revision+1 WHERE id=oid;UPDATE public.erp_rental_reservation_units SET active=false WHERE reservation_id=oid;result:=jsonb_build_object('id',oid);
 ELSE
  ids:=ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(p_input->'unitIds') x);s:=(p_input->>'start')::timestamptz;e:=(p_input->>'end')::timestamptz;
  IF cardinality(ids) NOT BETWEEN 1 AND 10 OR s<now() OR s>now()+interval '366 days' OR e-s>interval '90 days' THEN RAISE EXCEPTION 'اختر حتى عشر وحدات ومدة حجز مستقبلية حتى 90 يومًا' USING ERRCODE='22023';END IF;
  q:=erp_rental_private.quote(p_cafe,ids,s,e);IF p_action='quote' THEN RETURN jsonb_build_object('total',q->'total');END IF;
  IF (q->>'total')::numeric IS DISTINCT FROM (p_input->>'expectedTotal')::numeric THEN RAISE EXCEPTION 'تغير السعر أعد التحقق قبل الحجز' USING ERRCODE='40001';END IF;
  IF (SELECT count(*) FROM public.erp_rental_reservations WHERE cafe_id=p_cafe AND payload->>'customerProfileId'=p_profile::text AND status='pending')>=10 THEN RAISE EXCEPTION 'لديك عشرة طلبات معلقة تواصل مع الإدارة' USING ERRCODE='22023';END IF;
  FOR f IN SELECT x FROM jsonb_array_elements(coalesce(cfg->'fields','[]')) x LOOP
   value:=p_input->'fields'->(f->>'key');IF (f->>'required')::boolean AND(value IS NULL OR value='null' OR value='""' OR (f->>'type'='checkbox' AND value<>'true')) THEN RAISE EXCEPTION 'أكمل الحقول الإضافية المطلوبة' USING ERRCODE='22023';END IF;
   IF value IS NOT NULL AND value<>'null' AND value<>'""' THEN
    IF f->>'type'='number' AND jsonb_typeof(value)<>'number' OR f->>'type'='checkbox' AND jsonb_typeof(value)<>'boolean' OR f->>'type' IN('text','date') AND jsonb_typeof(value)<>'string' OR length(value::text)>2000 THEN RAISE EXCEPTION 'راجع نوع الحقل الإضافي' USING ERRCODE='22023';END IF;
    IF f->>'type'='date' THEN PERFORM(value#>>'{}')::date;END IF;
   END IF;
  END LOOP;
  IF profile.phone IS NULL OR length(regexp_replace(profile.phone,'[^0-9]','','g'))<8 THEN RAISE EXCEPTION 'أكمل رقم جوالك في حساب العميل' USING ERRCODE='22023';END IF;
  SELECT id INTO party FROM public.bf_parties WHERE cafe_id=p_cafe AND kind='customer' AND active AND regexp_replace(phone,'[^0-9]','','g')=regexp_replace(profile.phone,'[^0-9]','','g') ORDER BY id LIMIT 1;
  IF party IS NULL THEN party:=gen_random_uuid();INSERT INTO public.bf_parties(id,cafe_id,kind,name,phone) VALUES(party,p_cafe,'customer',coalesce(nullif(btrim(profile.full_name),''),'عميل الإيجارات'),profile.phone);END IF;
  oid:=gen_random_uuid();INSERT INTO public.erp_rental_reservations(id,cafe_id,customer_id,starts_at,ends_at,payload,total,breakdown) VALUES(oid,p_cafe,party,s,e,jsonb_build_object('id',oid,'customerId',party,'customerProfileId',p_profile,'unitIds',to_jsonb(ids),'startsAt',s,'endsAt',e,'notes',left(coalesce(p_input->>'notes',''),2000),'tags','[]'::jsonb,'autoInvoice',false,'expectedTotal',q->'total','invoiceLineMode',q->>'lineMode','fields',coalesce(p_input->'fields','{}')), (q->>'total')::numeric,q->'lines');
  INSERT INTO public.erp_rental_reservation_units SELECT p_cafe,x,oid,NULL,s,e,true FROM unnest(ids) x;result:=jsonb_build_object('id',oid);
 END IF;
 INSERT INTO public.erp_rental_events(cafe_id,record_id,entity,action,details) VALUES(p_cafe,oid,'reservation','customer_'||p_action,jsonb_build_object('customerProfileId',p_profile));INSERT INTO public.erp_rental_requests VALUES(p_cafe,p_request,p_profile,'customer_'||p_action,p_input,result);RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_rental_customer(uuid,uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erp_rental_customer(uuid,uuid,text,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
