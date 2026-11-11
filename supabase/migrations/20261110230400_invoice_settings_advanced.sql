BEGIN;
DO $baseline$ BEGIN
IF md5(pg_get_functiondef('public.brand_finance_issue_company_invoice(uuid,uuid,integer,numeric)'::regprocedure))<>'f0e03f831358716002263df38f69b25e' THEN RAISE EXCEPTION 'Unexpected baseline: brand_finance_issue_company_invoice';END IF;
IF md5(pg_get_functiondef('public.brand_finance_invoice_settings(uuid,text,jsonb,integer)'::regprocedure))<>'cc9f52f942054e60185d7ecfebb26f4a' THEN RAISE EXCEPTION 'Unexpected baseline: brand_finance_invoice_settings';END IF;
IF md5(pg_get_functiondef('brand_finance_private.invoice_settings(uuid)'::regprocedure))<>'756b89b2b459dfe18a3c06978413514b' THEN RAISE EXCEPTION 'Unexpected baseline: invoice_settings';END IF;
IF md5(pg_get_functiondef('brand_finance_private.post_refund(uuid,jsonb,uuid)'::regprocedure))<>'0a38f1e635cfcac92224b4c8d46f17c5' THEN RAISE EXCEPTION 'Unexpected baseline: post_refund';END IF;
IF md5(pg_get_functiondef('brand_finance_private.payment_financial_guard(public.bf_documents,public.bf_documents,uuid,timestamptz)'::regprocedure))<>'e85dab4ce64771a0db656341ee1e998e' THEN RAISE EXCEPTION 'Unexpected baseline: payment_financial_guard';END IF;
IF md5(pg_get_functiondef('brand_finance_private.invoice_payment_record(public.bf_documents,public.bf_documents)'::regprocedure))<>'17f7f06b3d2d36960cb1b7af897c8aa9' THEN RAISE EXCEPTION 'Unexpected baseline: invoice_payment_record';END IF;
END $baseline$;
CREATE TABLE public.bf_invoice_number_counters(cafe_id uuid NOT NULL REFERENCES public.cafes(id),kind text NOT NULL CHECK(kind IN('invoice','debit')),next_value bigint NOT NULL CHECK(next_value>0),PRIMARY KEY(cafe_id,kind));
CREATE TABLE public.bf_invoice_extensions(
 cafe_id uuid NOT NULL,document_id uuid PRIMARY KEY,display_number text NOT NULL CHECK(length(display_number) BETWEEN 1 AND 80),source_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}',status_id uuid,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,display_number),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,source_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_invoice_extensions_source ON public.bf_invoice_extensions(cafe_id,source_id);
CREATE UNIQUE INDEX bf_invoice_extensions_normalized_number ON public.bf_invoice_extensions(cafe_id,lower(CASE WHEN display_number~'^[0-9]+$' THEN coalesce(nullif(ltrim(display_number,'0'),''),'0') ELSE display_number END));
CREATE INDEX bf_invoice_extensions_actor ON public.bf_invoice_extensions(created_by);
CREATE TABLE public.bf_invoice_extension_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,document_id uuid NOT NULL,action text NOT NULL,before_value jsonb,after_value jsonb,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX bf_invoice_extension_events_doc ON public.bf_invoice_extension_events(cafe_id,document_id,created_at DESC,id);
CREATE INDEX bf_invoice_extension_events_actor ON public.bf_invoice_extension_events(created_by);
CREATE TABLE public.bf_invoice_adjustment_lines(cafe_id uuid NOT NULL,document_id uuid NOT NULL,line_id uuid PRIMARY KEY,account_id uuid NOT NULL,net numeric(16,2) NOT NULL,tax numeric(16,2) NOT NULL,FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(line_id) REFERENCES public.bf_document_lines(id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id));
CREATE INDEX bf_invoice_adjustment_lines_doc ON public.bf_invoice_adjustment_lines(cafe_id,document_id);
CREATE INDEX bf_invoice_adjustment_lines_account ON public.bf_invoice_adjustment_lines(account_id);
CREATE TABLE public.bf_customer_credit_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,party_id uuid NOT NULL,document_id uuid NOT NULL,invoice_id uuid,application_id uuid,
 action text NOT NULL CHECK(action IN('receive','refund','apply','unapply')),amount numeric(16,2) NOT NULL CHECK(amount>0),delta numeric(16,2) NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(application_id) REFERENCES public.bf_customer_credit_events(id),UNIQUE(cafe_id,document_id),UNIQUE(application_id),
 CHECK(delta=CASE WHEN action IN('receive','unapply') THEN amount ELSE -amount END)
);
CREATE INDEX bf_customer_credit_events_party ON public.bf_customer_credit_events(cafe_id,party_id,created_at DESC,id);
CREATE INDEX bf_customer_credit_events_invoice ON public.bf_customer_credit_events(cafe_id,invoice_id);
CREATE INDEX bf_customer_credit_events_actor ON public.bf_customer_credit_events(created_by);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['bf_invoice_number_counters','bf_invoice_extensions','bf_invoice_extension_events','bf_invoice_adjustment_lines','bf_customer_credit_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['bf_invoice_extension_events','bf_invoice_adjustment_lines','bf_customer_credit_events'] LOOP
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable()',t);
 END LOOP;
END $$;
ALTER TABLE public.bf_invoice_settings DROP CONSTRAINT bf_invoice_settings_settings_check;
ALTER TABLE public.bf_invoice_settings ADD CHECK(jsonb_typeof(settings)='object' AND octet_length(settings::text)<=2000000);
CREATE FUNCTION brand_finance_private.invoice_line(cafe uuid,document uuid,account uuid,debit numeric,credit numeric,party uuid,memo text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=cafe AND account_id=account AND status='handover') THEN RAISE EXCEPTION 'الخزينة قيد تسليم الوردية انتظر قبول الاستلام';END IF;
 IF round(debit,2)=0 AND round(credit,2)=0 THEN RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=cafe AND a.id=account AND a.active AND a.deleted_at IS NULL AND NOT a.frozen AND NOT a.is_group) THEN RAISE EXCEPTION 'حساب القيد غير نشط أو مجمد';END IF;
 INSERT INTO public.bf_journal(cafe_id,document_id,account_id,debit,credit,party_id,memo) VALUES(cafe,document,account,round(debit,2),round(credit,2),party,left(coalesce(memo,''),300));
END $$;

CREATE FUNCTION brand_finance_private.invoice_advanced_defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"numbering":{"prefix":"","next":1,"padding":6,"manual":false},"debitNumbering":{"prefix":"DN-","next":1,"padding":6,"manual":false},"billingMethod":"print","customStatusesEnabled":false,"statuses":[],"profitEnabled":false,"showExchangeRate":false,"currencies":[{"code":"SAR","rate":1}],"socialEnabled":false,"socialPlatforms":[],"discountCapsEnabled":false,"discountCaps":[],"advancedPricing":false,"minimumIncludesTax":true,"productPolicies":[],"priceListsEnabled":false,"priceLists":[],"adjustmentsEnabled":false,"adjustments":[],"defaultPaymentKind":"cash","defaultAccountId":"","autoApplyCredit":false,"debitNotesEnabled":false,"excludedCategories":[],"activityKind":"both","journalTemplateEnabled":false,"journalTemplate":"","taxMode":"specific","specificTaxRate":15,"taxRequired":true,"exemptionReason":""}'::jsonb
$$;
CREATE FUNCTION brand_finance_private.invoice_number_valid(v jsonb,minimum numeric,maximum numeric,places integer DEFAULT NULL) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(v)='number' THEN (v#>>'{}')::numeric BETWEEN minimum AND maximum AND (places IS NULL OR (v#>>'{}')::numeric=round((v#>>'{}')::numeric,places)) ELSE false END
$$;
CREATE FUNCTION brand_finance_private.invoice_object_keys(v jsonb,keys text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(v)='object' THEN NOT EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE NOT(k=ANY(keys))) AND (SELECT count(*) FROM jsonb_object_keys(v))=cardinality(keys) ELSE false END
$$;
CREATE FUNCTION brand_finance_private.invoice_advanced_validate(cafe uuid,v jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE defaults jsonb:=brand_finance_private.invoice_advanced_defaults();k text;x jsonb;y jsonb;ids text[];r text;counter_kind text;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR octet_length(v::text)>1900000 OR (SELECT count(*) FROM jsonb_object_keys(v))<>(SELECT count(*) FROM jsonb_object_keys(defaults)) OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) t WHERE NOT(defaults ? t)) THEN RAISE EXCEPTION 'Invalid advanced invoice settings' USING ERRCODE='22023';END IF;
 FOR k IN SELECT jsonb_object_keys(defaults) LOOP
  IF jsonb_typeof(v->k) IS DISTINCT FROM jsonb_typeof(defaults->k) THEN RAISE EXCEPTION 'Invalid advanced setting type: %',k USING ERRCODE='22023';END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['numbering','debitNumbering'] LOOP
  x:=v->k;counter_kind:=CASE k WHEN 'numbering' THEN 'invoice' ELSE 'debit' END;
  IF NOT brand_finance_private.invoice_object_keys(x,ARRAY['prefix','next','padding','manual']) OR jsonb_typeof(x->'prefix') IS DISTINCT FROM 'string' OR length(x->>'prefix')>12 OR (x->>'prefix') ~ '[^A-Za-z0-9ء-ي_-]' OR jsonb_typeof(x->'manual') IS DISTINCT FROM 'boolean' OR NOT brand_finance_private.invoice_number_valid(x->'next',1,999999999999,0) OR NOT brand_finance_private.invoice_number_valid(x->'padding',1,12,0) THEN RAISE EXCEPTION 'Invalid invoice numbering' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM public.bf_invoice_number_counters WHERE cafe_id=cafe AND bf_invoice_number_counters.kind=counter_kind AND next_value>(x->>'next')::bigint) THEN RAISE EXCEPTION 'Invoice numbering cannot move backwards' USING ERRCODE='22023';END IF;
 END LOOP;
 IF v->>'billingMethod' NOT IN('print','email','both') OR v->>'defaultPaymentKind' NOT IN('cash','bank','pos','credit') OR v->>'activityKind' NOT IN('products','services','both') OR v->>'taxMode' NOT IN('product','none','specific') OR (v->>'specificTaxRate')::numeric NOT IN(0,15) OR length(v->>'exemptionReason')>250 OR length(v->>'journalTemplate')>500 OR (v->>'journalTemplate') ~ '\{(?!number\}|customer\}|date\}|total\})' THEN RAISE EXCEPTION 'Invalid advanced invoice option' USING ERRCODE='22023';END IF;
 IF v->>'defaultAccountId'<>'' AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=cafe AND id::text=v->>'defaultAccountId' AND active AND NOT is_cashier_drawer AND kind=v->>'defaultPaymentKind') THEN RAISE EXCEPTION 'Invalid default collection account' USING ERRCODE='22023';END IF;
 IF jsonb_array_length(v->'currencies') NOT BETWEEN 1 AND 5 OR (SELECT count(DISTINCT currency_row->>'code') FROM jsonb_array_elements(v->'currencies') currency_row)<>jsonb_array_length(v->'currencies') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'currencies') currency_row WHERE currency_row->>'code'='SAR' AND jsonb_typeof(currency_row->'rate')='number' AND (currency_row->>'rate')::numeric=1) THEN RAISE EXCEPTION 'Invalid invoice currencies' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(v->'currencies') LOOP
  IF NOT brand_finance_private.invoice_object_keys(x,ARRAY['code','rate']) OR x->>'code' NOT IN('SAR','USD','EUR','GBP','AED') OR NOT brand_finance_private.invoice_number_valid(x->'rate',0.000001,1000000,6) THEN RAISE EXCEPTION 'Invalid currency rate' USING ERRCODE='22023';END IF;
 END LOOP;
 IF jsonb_array_length(v->'socialPlatforms')>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(v->'socialPlatforms') platform_row WHERE platform_row NOT IN('whatsapp','email','native')) OR (SELECT count(DISTINCT platform_row) FROM jsonb_array_elements_text(v->'socialPlatforms') platform_row)<>jsonb_array_length(v->'socialPlatforms') THEN RAISE EXCEPTION 'Invalid social platforms' USING ERRCODE='22023';END IF;
 FOREACH k IN ARRAY ARRAY['statuses','discountCaps','productPolicies','priceLists','adjustments','excludedCategories'] LOOP
  IF jsonb_array_length(v->k)>(CASE k WHEN 'discountCaps' THEN 200 WHEN 'productPolicies' THEN 500 WHEN 'excludedCategories' THEN 100 ELSE 30 END) THEN RAISE EXCEPTION 'Invoice setting list too long' USING ERRCODE='22023';END IF;
  ids:='{}';
  FOR x IN SELECT value FROM jsonb_array_elements(v->k) LOOP
   IF k='excludedCategories' THEN
    IF jsonb_typeof(x)<>'string' OR length(btrim(x#>>'{}')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid category exclusion' USING ERRCODE='22023';END IF;
    r:=x#>>'{}';
   ELSIF k='statuses' THEN
    IF NOT brand_finance_private.invoice_object_keys(x,ARRAY['id','name','color']) OR jsonb_typeof(x->'name')<>'string' OR length(btrim(x->>'name')) NOT BETWEEN 1 AND 80 OR coalesce(x->>'color','')!~'^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Invalid invoice status' USING ERRCODE='22023';END IF;r:=(x->>'id')::uuid::text;
   ELSIF k='discountCaps' THEN
    IF NOT brand_finance_private.invoice_object_keys(x,ARRAY['userId','percent']) OR NOT brand_finance_private.invoice_number_valid(x->'percent',0,100) OR NOT(EXISTS(SELECT 1 FROM public.cafes WHERE id=cafe AND owner_user_id=(x->>'userId')::uuid) OR EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=cafe AND user_id=(x->>'userId')::uuid AND active AND role IN('manager','accountant'))) THEN RAISE EXCEPTION 'Invalid user discount cap' USING ERRCODE='22023';END IF;r:=(x->>'userId')::uuid::text;
   ELSIF k='productPolicies' THEN
    IF NOT brand_finance_private.invoice_object_keys(x,ARRAY['productId','kind','minimumPrice','vatRate','taxCategory','exemptionReason']) OR coalesce(x->>'kind','') NOT IN('product','service') OR NOT brand_finance_private.invoice_number_valid(x->'minimumPrice',0,1000000000,2) OR NOT brand_finance_private.invoice_number_valid(x->'vatRate',0,15) OR (x->>'vatRate')::numeric NOT IN(0,15) OR x->>'taxCategory' NOT IN('S','Z','E','O') OR ((x->>'vatRate')::numeric=15) IS DISTINCT FROM (x->>'taxCategory'='S') OR jsonb_typeof(x->'exemptionReason') IS DISTINCT FROM 'string' OR length(x->>'exemptionReason')>250 OR NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=cafe AND id=(x->>'productId')::uuid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid product pricing/tax policy' USING ERRCODE='22023';END IF;r:=(x->>'productId')::uuid::text;
   ELSIF k='priceLists' THEN
    IF NOT brand_finance_private.invoice_object_keys(x,ARRAY['id','name','active','prices','partyIds']) OR jsonb_typeof(x->'name')<>'string' OR length(btrim(x->>'name')) NOT BETWEEN 1 AND 80 OR jsonb_typeof(x->'active')<>'boolean' OR jsonb_typeof(x->'prices')<>'array' OR jsonb_array_length(x->'prices')>500 OR jsonb_typeof(x->'partyIds')<>'array' OR jsonb_array_length(x->'partyIds')>500 THEN RAISE EXCEPTION 'Invalid price list' USING ERRCODE='22023';END IF;r:=(x->>'id')::uuid::text;
    IF (SELECT count(DISTINCT z->>'productId') FROM jsonb_array_elements(x->'prices') z)<>jsonb_array_length(x->'prices') OR (SELECT count(DISTINCT z) FROM jsonb_array_elements_text(x->'partyIds') z)<>jsonb_array_length(x->'partyIds') THEN RAISE EXCEPTION 'Duplicate price list reference' USING ERRCODE='22023';END IF;
    FOR y IN SELECT value FROM jsonb_array_elements(x->'prices') LOOP
     IF NOT brand_finance_private.invoice_object_keys(y,ARRAY['productId','price']) OR NOT brand_finance_private.invoice_number_valid(y->'price',0,1000000000,2) OR NOT EXISTS(SELECT 1 FROM public.menu_products WHERE cafe_id=cafe AND id=(y->>'productId')::uuid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid listed product price' USING ERRCODE='22023';END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(x->'partyIds') p WHERE NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=cafe AND id=p::uuid AND kind='customer' AND active)) THEN RAISE EXCEPTION 'Invalid price list customer' USING ERRCODE='22023';END IF;
   ELSE
    IF NOT brand_finance_private.invoice_object_keys(x,ARRAY['id','name','accountId','kind','taxable']) OR jsonb_typeof(x->'name')<>'string' OR length(btrim(x->>'name')) NOT BETWEEN 1 AND 80 OR coalesce(x->>'kind','') NOT IN('addition','deduction') OR jsonb_typeof(x->'taxable')<>'boolean' OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=cafe AND id=(x->>'accountId')::uuid AND active AND kind IN('revenue','expense') AND code NOT IN('5000')) THEN RAISE EXCEPTION 'Invalid invoice adjustment account' USING ERRCODE='22023';END IF;r:=(x->>'id')::uuid::text;
   END IF;
   IF r IS NULL OR r=ANY(ids) THEN RAISE EXCEPTION 'Duplicate or missing invoice setting id' USING ERRCODE='22023';END IF;ids:=array_append(ids,r);
  END LOOP;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION brand_finance_private.invoice_settings(p_cafe_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(s.settings,'{"allowLineEditing":true,"previewBeforeSave":true,"priceHints":"last","copyNotesOnConversion":true,"decimalDisplay":"always","allowDeposits":true,"discountMode":"both","allowBelowCost":true,"defaultPaid":true}'::jsonb)
 ||jsonb_build_object('advanced',coalesce(s.settings->'advanced',brand_finance_private.invoice_advanced_defaults()))
 FROM (SELECT 1) seed LEFT JOIN public.bf_invoice_settings s ON s.cafe_id=p_cafe_id
$$;
CREATE FUNCTION brand_finance_private.invoice_number_next(cafe uuid,document_kind text,config jsonb) RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT greatest((config->>'next')::bigint,coalesce((SELECT next_value FROM public.bf_invoice_number_counters WHERE cafe_id=cafe AND kind=document_kind),1),coalesce((SELECT max(d.number)+1 FROM public.bf_documents d WHERE d.cafe_id=cafe AND d.kind='sale' AND NOT EXISTS(SELECT 1 FROM public.bf_invoice_extensions x WHERE x.document_id=d.id AND x.metadata<>'{}'::jsonb)),1))
$$;
CREATE FUNCTION brand_finance_private.invoice_number_allocate(cafe uuid,document_kind text,config jsonb,manual_value text DEFAULT '') RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n bigint;display text;BEGIN
 IF coalesce(manual_value,'')<>'' THEN
  IF NOT(config->>'manual')::boolean OR length(btrim(manual_value)) NOT BETWEEN 1 AND 80 OR manual_value ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'رقم الفاتورة اليدوي غير صالح أو غير مسموح';END IF;
  display:=btrim(manual_value);
 ELSE
  n:=brand_finance_private.invoice_number_next(cafe,document_kind,config);display:=(config->>'prefix')||lpad(n::text,greatest(length(n::text),(config->>'padding')::integer),'0');
  INSERT INTO public.bf_invoice_number_counters(cafe_id,kind,next_value) VALUES(cafe,document_kind,n+1) ON CONFLICT(cafe_id,kind) DO UPDATE SET next_value=excluded.next_value;
 END IF;
 IF EXISTS(SELECT 1 FROM public.bf_invoice_extensions WHERE cafe_id=cafe AND lower(CASE WHEN display_number~'^[0-9]+$' THEN coalesce(nullif(ltrim(display_number,'0'),''),'0') ELSE display_number END)=lower(CASE WHEN display~'^[0-9]+$' THEN coalesce(nullif(ltrim(display,'0'),''),'0') ELSE display END)) OR EXISTS(SELECT 1 FROM public.bf_documents d WHERE d.cafe_id=cafe AND d.kind='sale' AND d.number::text=CASE WHEN display~'^[0-9]+$' THEN ltrim(display,'0') ELSE display END AND NOT EXISTS(SELECT 1 FROM public.bf_invoice_extensions e WHERE e.document_id=d.id AND e.metadata<>'{}'::jsonb)) THEN RAISE EXCEPTION 'رقم الفاتورة مستخدم اختر رقمًا آخر' USING ERRCODE='23505';END IF;
 RETURN display;
END $$;
CREATE OR REPLACE FUNCTION public.brand_finance_invoice_settings(p_cafe_id uuid,p_action text DEFAULT 'get',p_settings jsonb DEFAULT NULL,p_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;stored public.bf_invoice_settings%ROWTYPE;current_settings jsonb;current_revision integer;key text;advanced jsonb;next_number bigint;debit_next bigint;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('get','save') THEN RAISE EXCEPTION 'Invalid settings action' USING ERRCODE='22023';END IF;
 IF p_action='save' THEN
  IF role_name<>'owner' THEN RAISE EXCEPTION 'Only the owner can change invoice settings' USING ERRCODE='42501';END IF;
  IF p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR octet_length(p_settings::text)>2000000 THEN RAISE EXCEPTION 'Invalid invoice settings' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_settings)) NOT IN(9,10) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_settings) k WHERE k NOT IN('allowLineEditing','previewBeforeSave','priceHints','copyNotesOnConversion','decimalDisplay','allowDeposits','discountMode','allowBelowCost','defaultPaid','advanced')) THEN RAISE EXCEPTION 'Invalid invoice settings keys' USING ERRCODE='22023';END IF;
  FOREACH key IN ARRAY ARRAY['allowLineEditing','previewBeforeSave','copyNotesOnConversion','allowDeposits','allowBelowCost','defaultPaid'] LOOP
   IF jsonb_typeof(p_settings->key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid invoice setting boolean' USING ERRCODE='22023';END IF;
  END LOOP;
  IF coalesce(p_settings->>'priceHints','') NOT IN('hidden','last') OR coalesce(p_settings->>'decimalDisplay','') NOT IN('always','never','auto') OR coalesce(p_settings->>'discountMode','') NOT IN('both','invoice','line') THEN RAISE EXCEPTION 'Invalid invoice setting option' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 END IF;
 SELECT * INTO stored FROM public.bf_invoice_settings WHERE cafe_id=p_cafe_id;
 current_settings:=coalesce(stored.settings,brand_finance_private.invoice_settings(NULL));
 advanced:=coalesce(current_settings->'advanced',brand_finance_private.invoice_advanced_defaults());
 next_number:=brand_finance_private.invoice_number_next(p_cafe_id,'invoice',advanced->'numbering');debit_next:=brand_finance_private.invoice_number_next(p_cafe_id,'debit',advanced->'debitNumbering');
 advanced:=jsonb_set(jsonb_set(advanced,'{numbering,next}',to_jsonb(next_number)),'{debitNumbering,next}',to_jsonb(debit_next));current_settings:=current_settings||jsonb_build_object('advanced',advanced);current_revision:=coalesce(stored.revision,0);
 IF p_action='save' THEN
  p_settings:=p_settings||jsonb_build_object('advanced',coalesce(p_settings->'advanced',advanced));
  PERFORM brand_finance_private.invoice_advanced_validate(p_cafe_id,p_settings->'advanced');
  IF p_settings IS DISTINCT FROM current_settings THEN
   IF p_revision<>current_revision THEN RAISE EXCEPTION 'Invoice settings conflict' USING ERRCODE='40001';END IF;
   INSERT INTO public.bf_invoice_settings(cafe_id,settings,revision,updated_by) VALUES(p_cafe_id,p_settings,current_revision+1,auth.uid()) ON CONFLICT(cafe_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
   INSERT INTO public.bf_invoice_settings_events(cafe_id,revision,before_settings,after_settings,created_by) VALUES(p_cafe_id,current_revision+1,current_settings,p_settings,auth.uid());current_settings:=p_settings;current_revision:=current_revision+1;
  END IF;
 END IF;
 next_number:=brand_finance_private.invoice_number_next(p_cafe_id,'invoice',current_settings#>'{advanced,numbering}');debit_next:=brand_finance_private.invoice_number_next(p_cafe_id,'debit',current_settings#>'{advanced,debitNumbering}');
 current_settings:=jsonb_set(jsonb_set(current_settings,'{advanced,numbering,next}',to_jsonb(next_number)),'{advanced,debitNumbering,next}',to_jsonb(debit_next));
 RETURN jsonb_build_object('settings',current_settings,'revision',current_revision,'nextNumber',next_number);
END $$;
CREATE FUNCTION public.brand_finance_invoice_context(p_cafe_id uuid,p_party_id uuid DEFAULT NULL,p_product_ids uuid[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE advanced jsonb;cap numeric:=100;rows jsonb:='[]';product public.menu_products%ROWTYPE;policy jsonb;cost numeric;known boolean;last_price numeric;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_party_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=p_party_id AND kind='customer' AND active) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_product_ids IS NULL OR cardinality(p_product_ids)>500 OR array_position(p_product_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Invalid product context' USING ERRCODE='22023';END IF;
 advanced:=brand_finance_private.invoice_settings(p_cafe_id)->'advanced';
 IF (advanced->>'discountCapsEnabled')::boolean THEN SELECT coalesce((x->>'percent')::numeric,100) INTO cap FROM jsonb_array_elements(advanced->'discountCaps') x WHERE x->>'userId'=auth.uid()::text;cap:=coalesce(cap,100);END IF;
 FOR product IN SELECT * FROM public.menu_products WHERE cafe_id=p_cafe_id AND id=ANY(p_product_ids) AND deleted_at IS NULL ORDER BY id LOOP
  SELECT x INTO policy FROM jsonb_array_elements(advanced->'productPolicies') x WHERE x->>'productId'=product.id::text;
  SELECT sum(l.quantity*s.average_cost),count(*)>0 AND bool_and(coalesce(s.cost_known,false)) INTO cost,known FROM public.bf_item_product_links l JOIN public.bf_items i ON i.cafe_id=l.cafe_id AND i.id=l.item_id AND i.active LEFT JOIN LATERAL(SELECT sum(abs(st.quantity)*st.average_cost)/nullif(sum(abs(st.quantity)),0) AS average_cost,bool_and(st.cost_known) AND sum(st.quantity)>0 AS cost_known FROM public.bf_stock st WHERE st.cafe_id=l.cafe_id AND st.item_id=l.item_id) s ON true WHERE l.cafe_id=p_cafe_id AND l.product_id=product.id;
  SELECT l.unit_price INTO last_price FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id WHERE l.cafe_id=p_cafe_id AND l.product_id=product.id AND d.kind='sale' AND d.party_id=p_party_id AND NOT coalesce((brand_finance_private.document_state(p_cafe_id,d.id)->>'refunded')::boolean,false) ORDER BY d.created_at DESC,d.id DESC,l.id DESC LIMIT 1;
  rows:=rows||jsonb_build_array(jsonb_build_object('productId',product.id,'minimumPrice',CASE WHEN (advanced->>'advancedPricing')::boolean THEN coalesce((policy->>'minimumPrice')::numeric,0) ELSE 0 END,'averageCost',CASE WHEN known THEN round(cost,2) ELSE NULL END,'costKnown',coalesce(known,false),'lastPrice',last_price,'kind',coalesce(policy->>'kind','product'),'vatRate',coalesce((policy->>'vatRate')::numeric,15),'taxCategory',coalesce(policy->>'taxCategory','S'),'exemptionReason',coalesce(policy->>'exemptionReason','')));
 END LOOP;
 IF jsonb_array_length(rows)<>(SELECT count(DISTINCT x) FROM unnest(p_product_ids) x) THEN RAISE EXCEPTION 'Product context unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('creditBalance',brand_finance_private.customer_credit_balance(p_cafe_id,p_party_id),'maxDiscountPercent',cap,'products',rows);
END $$;

CREATE FUNCTION brand_finance_private.customer_credit_balance(cafe uuid,party uuid) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(sum(delta),0) FROM public.bf_customer_credit_events WHERE cafe_id=cafe AND party_id=party
$$;
CREATE FUNCTION brand_finance_private.customer_credit_account(cafe uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE aid uuid;BEGIN
 INSERT INTO public.bf_accounts(cafe_id,code,name,kind) VALUES(cafe,'2055','دفعات العملاء المقدمة','payable') ON CONFLICT(cafe_id,code) DO NOTHING;
 SELECT id INTO aid FROM public.bf_accounts WHERE cafe_id=cafe AND code='2055' AND kind='payable' AND active AND deleted_at IS NULL AND NOT frozen AND NOT is_group;
 IF aid IS NULL THEN RAISE EXCEPTION 'حساب دفعات العملاء المقدمة غير متاح';END IF;RETURN aid;
END $$;
CREATE FUNCTION brand_finance_private.customer_credit_apply(cafe uuid,invoice uuid,amount numeric) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d public.bf_documents%ROWTYPE;payment uuid:=gen_random_uuid();aid uuid;BEGIN
 SELECT * INTO d FROM public.bf_documents WHERE cafe_id=cafe AND id=invoice AND kind='sale' FOR UPDATE;
 IF d.id IS NULL OR d.party_id IS NULL OR amount<=0 OR amount<>round(amount,2) OR amount>brand_finance_private.customer_credit_balance(cafe,d.party_id) OR amount>(brand_finance_private.document_state(cafe,invoice)->>'outstanding')::numeric THEN RAISE EXCEPTION 'رصيد العميل لا يكفي أو تغير المبلغ المستحق';END IF;
 aid:=brand_finance_private.customer_credit_account(cafe);
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,total,paid,reference_id,note,created_by) VALUES(payment,cafe,'settlement',d.party_id,amount,amount,invoice,'تطبيق رصيد العميل على الفاتورة',auth.uid());
 PERFORM brand_finance_private.invoice_line(cafe,payment,aid,amount,0,d.party_id,'تطبيق رصيد العميل');
 PERFORM brand_finance_private.invoice_line(cafe,payment,brand_finance_private.account(cafe,'1100'),0,amount,d.party_id,'تطبيق رصيد العميل');
 INSERT INTO public.bf_customer_credit_events(cafe_id,party_id,document_id,invoice_id,action,amount,delta,created_by) VALUES(cafe,d.party_id,payment,invoice,'apply',amount,-amount,auth.uid());
 RETURN payment;
END $$;
CREATE FUNCTION brand_finance_private.customer_credit_unapply_allowed(cafe uuid,payment uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.bf_customer_credit_events e JOIN public.bf_documents d ON d.cafe_id=e.cafe_id AND d.id=e.invoice_id WHERE e.cafe_id=cafe AND e.document_id=payment AND e.action='apply'
 AND NOT EXISTS(SELECT 1 FROM public.bf_customer_credit_events r WHERE r.application_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=cafe AND (closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date OR closed_through>=(e.created_at AT TIME ZONE 'Asia/Riyadh')::date))
 AND NOT EXISTS(SELECT 1 FROM public.bf_gl_periods WHERE cafe_id=cafe AND closed AND ((now() AT TIME ZONE 'Asia/Riyadh')::date BETWEEN period_start AND period_end OR (e.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN period_start AND period_end))
 AND NOT EXISTS(SELECT 1 FROM public.bf_refund_requests WHERE cafe_id=cafe AND document_id=e.invoice_id AND status='pending')
 AND (brand_finance_private.payment_document(d)).paid+coalesce((SELECT sum((brand_finance_private.payment_document(s)).total) FROM public.bf_documents s WHERE s.cafe_id=cafe AND s.reference_id=d.id AND s.kind='settlement'),0)-e.amount >= coalesce((brand_finance_private.document_state(cafe,d.id)->>'refunded_paid')::numeric,0))
$$;
CREATE FUNCTION public.brand_finance_customer_credit(p_cafe_id uuid,p_action text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;party uuid;request uuid;aid uuid;amount numeric;note text;journal_id uuid:=gen_random_uuid();prior public.bf_requests%ROWTYPE;account public.bf_accounts%ROWTYPE;
 application public.bf_customer_credit_events%ROWTYPE;source public.bf_documents%ROWTYPE;invoice public.bf_documents%ROWTYPE;answer jsonb;before_record jsonb;after_record jsonb;rev integer;balance numeric;offset_value integer:=0;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('list','receive','refund','unapply') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>5000 THEN RAISE EXCEPTION 'Invalid customer credit input' USING ERRCODE='22023';END IF;
 party:=(p_input->>'partyId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=party AND kind='customer' AND active) THEN RAISE EXCEPTION 'العميل غير متاح' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN
  offset_value:=coalesce((p_input->>'offset')::integer,0);IF offset_value<0 OR offset_value>1000000 THEN RAISE EXCEPTION 'Invalid offset' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('balance',brand_finance_private.customer_credit_balance(p_cafe_id,party),
   'entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'kind',e.action,'amount',e.amount,'createdAt',e.created_at,'documentId',e.invoice_id,'note',d.note) ORDER BY e.created_at DESC,e.id) FROM (SELECT * FROM public.bf_customer_credit_events WHERE cafe_id=p_cafe_id AND party_id=party ORDER BY created_at DESC,id LIMIT 200 OFFSET offset_value) e JOIN public.bf_documents d ON d.cafe_id=e.cafe_id AND d.id=e.document_id),'[]'::jsonb),
   'applications',coalesce((SELECT jsonb_agg(jsonb_build_object('paymentId',e.document_id,'documentId',e.invoice_id,'invoiceNumber',d.number,'displayNumber',x.display_number,'amount',e.amount,'reversible',brand_finance_private.customer_credit_unapply_allowed(p_cafe_id,e.document_id)) ORDER BY e.created_at DESC,e.id) FROM public.bf_customer_credit_events e JOIN public.bf_documents d ON d.cafe_id=e.cafe_id AND d.id=e.invoice_id LEFT JOIN public.bf_invoice_extensions x ON x.document_id=d.id WHERE e.cafe_id=p_cafe_id AND e.party_id=party AND e.action='apply' AND NOT EXISTS(SELECT 1 FROM public.bf_customer_credit_events r WHERE r.application_id=e.id)),'[]'::jsonb));
 END IF;
 IF role_name NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 request:=(p_input->>'requestId')::uuid;note:=btrim(coalesce(p_input->>'note',''));IF request IS NULL OR length(note) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'أكمل بيان عملية الرصيد' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=request;
 IF FOUND THEN IF prior.operation<>'customer_credit_'||p_action OR prior.payload<>p_input OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Credit request conflict' USING ERRCODE='40001';END IF;RETURN prior.result;END IF;
 PERFORM brand_finance_private.seed(p_cafe_id);PERFORM brand_finance_private.gl_date_open(p_cafe_id,(now() AT TIME ZONE 'Asia/Riyadh')::date);
 IF p_action='receive' AND NOT(brand_finance_private.invoice_settings(p_cafe_id)->>'allowDeposits')::boolean THEN RAISE EXCEPTION 'الدفعات المقدمة غير مفعلة في إعدادات الفواتير';END IF;
 balance:=brand_finance_private.customer_credit_balance(p_cafe_id,party);aid:=brand_finance_private.customer_credit_account(p_cafe_id);
 IF p_action='unapply' THEN
  SELECT * INTO application FROM public.bf_customer_credit_events WHERE cafe_id=p_cafe_id AND party_id=party AND document_id=(p_input->>'paymentId')::uuid AND action='apply';
  IF application.id IS NULL OR NOT brand_finance_private.customer_credit_unapply_allowed(p_cafe_id,application.document_id) THEN RAISE EXCEPTION 'لا يمكن إلغاء رصيد استندت إليه مبالغ معادة أو فترة مقفلة';END IF;
  SELECT * INTO source FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.id=application.document_id FOR UPDATE;
  SELECT * INTO invoice FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.id=application.invoice_id FOR UPDATE;
  amount:=application.amount;before_record:=brand_finance_private.invoice_payment_record(source,invoice);
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,reference_id,note,created_by) VALUES(journal_id,p_cafe_id,'journal',party,invoice.id,'إلغاء تطبيق رصيد العميل '||note,auth.uid());
  PERFORM brand_finance_private.invoice_line(p_cafe_id,journal_id,brand_finance_private.account(p_cafe_id,'1100'),amount,0,party,note);
  PERFORM brand_finance_private.invoice_line(p_cafe_id,journal_id,aid,0,amount,party,note);
  SELECT coalesce(max(revision),0)+1 INTO rev FROM public.bf_invoice_payments WHERE source_id=source.id;
  INSERT INTO public.bf_invoice_payments(cafe_id,source_id,invoice_id,revision,payload,status,financial_at,updated_by)
   VALUES(p_cafe_id,source.id,invoice.id,rev,jsonb_build_object('amount',amount,'date',(now() AT TIME ZONE 'Asia/Riyadh')::date,'accountId',null,'status','completed','collectorId',source.created_by,'reference','','details',source.note,'receiptNote','','attachments','[]'::jsonb),'deleted',clock_timestamp(),auth.uid())
   ON CONFLICT(source_id) DO UPDATE SET revision=excluded.revision,status='deleted',financial_at=excluded.financial_at,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  after_record:=brand_finance_private.invoice_payment_record(source,invoice);
  INSERT INTO public.bf_invoice_payment_events(cafe_id,source_id,invoice_id,revision,action,before_state,after_state,correction_id,reason,created_by) VALUES(p_cafe_id,source.id,invoice.id,rev,'delete',before_record,after_record,journal_id,note,auth.uid());
  INSERT INTO public.bf_customer_credit_events(cafe_id,party_id,document_id,invoice_id,application_id,action,amount,delta,created_by) VALUES(p_cafe_id,party,journal_id,invoice.id,application.id,'unapply',amount,amount,auth.uid());
 ELSE
  IF NOT brand_finance_private.invoice_number_valid(p_input->'amount',0.01,1000000000,2) THEN RAISE EXCEPTION 'راجع مبلغ رصيد العميل' USING ERRCODE='22023';END IF;amount:=(p_input->>'amount')::numeric;
  SELECT * INTO account FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.id=(p_input->>'accountId')::uuid AND a.active AND a.deleted_at IS NULL AND NOT a.frozen AND NOT a.is_group AND a.kind IN('cash','bank','pos') AND NOT a.is_cashier_drawer;
  IF account.id IS NULL OR EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND account_id=account.id AND status IN('open','handover')) THEN RAISE EXCEPTION 'اختر حساب تحصيل إداريًا خارج الورديات';END IF;
  IF p_action='refund' AND (amount>balance OR amount>brand_finance_private.treasury_balance(p_cafe_id,account.id)) THEN RAISE EXCEPTION 'رصيد العميل أو الحساب لا يكفي لإعادة المبلغ';END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,note,created_by) VALUES(journal_id,p_cafe_id,'journal',party,account.id,note,auth.uid());
  PERFORM brand_finance_private.invoice_line(p_cafe_id,journal_id,account.id,CASE WHEN p_action='receive' THEN amount ELSE 0 END,CASE WHEN p_action='refund' THEN amount ELSE 0 END,party,note);
  PERFORM brand_finance_private.invoice_line(p_cafe_id,journal_id,aid,CASE WHEN p_action='refund' THEN amount ELSE 0 END,CASE WHEN p_action='receive' THEN amount ELSE 0 END,party,note);
  IF p_action='receive' AND account.kind='pos' THEN PERFORM brand_finance_private.terminal_fee_accrue(p_cafe_id,account.id,journal_id,NULL,amount);END IF;
  INSERT INTO public.bf_customer_credit_events(cafe_id,party_id,document_id,action,amount,delta,created_by) VALUES(p_cafe_id,party,journal_id,p_action,amount,CASE WHEN p_action='receive' THEN amount ELSE -amount END,auth.uid());
 END IF;
 answer:=jsonb_build_object('id',journal_id,'balance',brand_finance_private.customer_credit_balance(p_cafe_id,party));
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,request,'customer_credit_'||p_action,p_input,answer,auth.uid());RETURN answer;
END $$;

ALTER TABLE public.bf_document_lines ADD COLUMN activity_kind text NOT NULL DEFAULT 'product' CHECK(activity_kind IN('product','service')),ADD COLUMN vat_rate numeric(5,2),ADD COLUMN tax_category text CHECK(tax_category IN('S','Z','E','O')),ADD COLUMN exemption_reason text;
DO $patch$ DECLARE body text;anchor text:='BEGIN'||chr(10);BEGIN
 SELECT pg_get_functiondef('brand_finance_private.inventory_line_components()'::regprocedure) INTO body;
 body:=replace(body,chr(13)||chr(10),chr(10));
 IF (length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected inventory service anchor';END IF;
 EXECUTE replace(body,anchor,anchor||$guard$ IF NEW.activity_kind='service' THEN NEW.cost:=0;NEW.allocated_cost:=0;NEW.item_id:=NULL;RETURN NEW;END IF;
$guard$);
END $patch$;

CREATE OR REPLACE FUNCTION brand_finance_private.issue_company_invoice(p_cafe_id uuid, p_draft_id uuid, p_revision integer, p_expected_total numeric,p_source_id uuid DEFAULT NULL,p_debit_reason text DEFAULT '')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE draft public.bf_invoice_drafts%ROWTYPE; customer public.bf_parties%ROWTYPE; cfg public.bf_settings%ROWTYPE;
  inv jsonb; seller jsonb; entry jsonb; product public.menu_products%ROWTYPE; existing jsonb; doc uuid:=gen_random_uuid();
  aid uuid; wid uuid; n bigint; issue_at timestamptz:=clock_timestamp(); supply_date date; rows jsonb:='[]'; final_rows jsonb:='[]';
  qty numeric; price numeric; gross numeric; row_discount numeric; rate numeric; row_after numeric; remaining numeric; base_left numeric;
  allocated numeric; taxable numeric; row_tax numeric; row_net numeric; row_total numeric; cost numeric; paid numeric;
  subtotal numeric:=0; after_rows numeric:=0; doc_discount numeric; tax numeric:=0; total numeric:=0; net numeric:=0;
  discount_value numeric; inclusive boolean; result jsonb; buyer_address text; seller_tax text; phone text; invoice_type text;
  deposit jsonb; deposit_value numeric; deposit_amount numeric; deposit_paid boolean; deposit_kind text;
  shipping_mode text; shipping_address text; delivery_confirmed boolean; delivery_date timestamptz;
  prefs jsonb;line_cost_status text;file_ids jsonb; file_id uuid; files jsonb:='[]'; attached public.bf_company_invoice_files%ROWTYPE;
  advanced jsonb;currency_code text;fx numeric;source_doc public.bf_documents%ROWTYPE;status_id uuid;list_id uuid;price_list jsonb;product_id uuid;policy jsonb;line_name text;line_kind text;catalog_price numeric;tax_category text;exemption text;cap numeric;
  adjustment_base numeric:=0;adjustment_id uuid;adjustment_rule jsonb;adjustment_amount numeric;adjustment_line_net numeric;adjustment_line_tax numeric;adjustment_net numeric:=0;adjustment_tax numeric:=0;
  sar_line_net numeric;sar_line_tax numeric;sar_net numeric:=0;sar_tax numeric:=0;sar_subtotal numeric:=0;sar_discount numeric;sar_total numeric;sar_adjustment_net numeric:=0;sar_adjustment_tax numeric:=0;
  credit_sar numeric;credit_foreign numeric;cash_sar numeric;display_number text;journal_note text;line_id uuid;
BEGIN
  IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant')
  THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  SELECT snapshot INTO existing FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF FOUND THEN RETURN existing; END IF;
  SELECT * INTO draft FROM public.bf_invoice_drafts WHERE id=p_draft_id AND cafe_id=p_cafe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501'; END IF;
  IF draft.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001'; END IF;
  prefs:=brand_finance_private.invoice_settings(p_cafe_id);
  inv:=draft.payload->'invoice'; seller:=draft.payload->'issuer';
  IF inv IS NULL OR jsonb_typeof(inv->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(inv->'lines') NOT BETWEEN 1 AND 100
    OR draft.payload::text ~* '"[-+]?(nan|infinity)"' THEN RAISE EXCEPTION 'Invalid invoice'; END IF;
  IF coalesce(length(btrim(seller->>'name')),0) NOT BETWEEN 2 AND 160 OR coalesce(length(btrim(seller->>'address')),0) NOT BETWEEN 8 AND 500
    OR octet_length(seller->>'name')>255 OR coalesce(seller->>'vatNumber','') !~ '^3[0-9]{13}3$' THEN RAISE EXCEPTION 'أكمل الاسم القانوني وعنوان البائع والرقم الضريبي الصحيح'; END IF;
  SELECT tax_number INTO seller_tax FROM public.cafe_settings WHERE cafe_id=p_cafe_id;
  IF nullif(btrim(seller_tax),'') IS NOT NULL AND btrim(seller_tax)<>seller->>'vatNumber' THEN RAISE EXCEPTION 'رقم البائع الضريبي لا يطابق إعدادات العلامة'; END IF;
  supply_date:=(draft.payload->>'supplyDate')::date;
  IF supply_date IS NULL OR NOT isfinite(supply_date) OR supply_date>(issue_at AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'اختر تاريخ توريد صالحًا'; END IF;
  PERFORM brand_finance_private.seed(p_cafe_id);
  SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=p_cafe_id FOR UPDATE;
  PERFORM brand_finance_private.gl_date_open(p_cafe_id,(issue_at AT TIME ZONE 'Asia/Riyadh')::date);
  SELECT * INTO customer FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id::text=(inv->>'partyId') AND active AND kind='customer';
  IF NOT FOUND THEN RAISE EXCEPTION 'اختر عميلًا نشطًا'; END IF;
  IF coalesce(customer.details->>'customerType','individual') NOT IN ('individual','business') THEN RAISE EXCEPTION 'حدد نوع العميل فردًا أو شركة'; END IF;
  invoice_type:=CASE WHEN coalesce(customer.details->>'customerType','individual')='individual' AND nullif(btrim(customer.tax_number),'') IS NULL THEN 'simplified' ELSE 'standard' END;
  IF invoice_type='standard' AND coalesce(customer.tax_number,'') !~ '^3[0-9]{13}3$' THEN RAISE EXCEPTION 'أكمل الرقم الضريبي الصحيح للعميل من ١٥ رقمًا'; END IF;
  buyer_address:=concat_ws(' ',nullif(customer.details->>'buildingNumber',''),nullif(customer.details->>'street',''),nullif(customer.details->>'district',''),nullif(customer.details->>'city',''),nullif(customer.details->>'postalCode',''),nullif(customer.details->>'country',''));
  IF invoice_type='standard' AND (coalesce(length(buyer_address),0)<8 OR nullif(customer.details->>'city','') IS NULL OR nullif(customer.details->>'street','') IS NULL) THEN RAISE EXCEPTION 'أكمل عنوان العميل في بياناته قبل الإصدار'; END IF;
  wid:=nullif(inv->>'warehouseId','')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=wid AND active) THEN RAISE EXCEPTION 'اختر مستودعًا نشطًا'; END IF;
  IF coalesce(inv->>'paymentKind','') NOT IN ('cash','bank','pos','credit') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  IF inv->>'paymentKind'<>'credit' THEN
    aid:=nullif(inv->>'accountId','')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=aid AND active AND kind=inv->>'paymentKind' AND NOT is_cashier_drawer)
      THEN RAISE EXCEPTION 'اختر حساب تحصيل إداريًا نشطًا خارج صناديق ورديات الكاشير'; END IF;
  END IF;
  deposit:=coalesce(draft.payload->'deposit','{"kind":"amount","value":0,"paid":false}'::jsonb);
  deposit_kind:=deposit->>'kind';deposit_value:=(deposit->>'value')::numeric;deposit_paid:=(deposit->>'paid')::boolean;
  IF jsonb_typeof(deposit)<>'object' OR deposit_kind IS NULL OR deposit_kind NOT IN ('amount','percent') OR deposit_value IS NULL OR deposit_paid IS NULL OR deposit_value<0 OR deposit_value>1000000000 OR deposit_value<>round(deposit_value,2) OR (deposit_kind='percent' AND deposit_value>100) THEN RAISE EXCEPTION 'راجع قيمة الدفعة المقدمة'; END IF;
  IF deposit_value>0 AND ((deposit_paid AND aid IS NULL) OR (NOT deposit_paid AND aid IS NOT NULL)) THEN RAISE EXCEPTION 'حدد حالة تحصيل الدفعة وحسابها'; END IF;
  IF NOT (prefs->>'allowDeposits')::boolean AND deposit_value>0 THEN RAISE EXCEPTION 'Invoice settings: deposits disabled' USING ERRCODE='22023';END IF;
  shipping_mode:=coalesce(draft.payload->>'shipping','none');
  IF shipping_mode NOT IN ('none','main','secondary') THEN RAISE EXCEPTION 'Invalid shipping mode'; END IF;
  shipping_address:=CASE shipping_mode WHEN 'main' THEN buyer_address WHEN 'secondary' THEN concat_ws(' ',nullif(customer.details->>'shippingBuildingNumber',''),nullif(customer.details->>'shippingStreet',''),nullif(customer.details->>'shippingDistrict',''),nullif(customer.details->>'shippingCity',''),nullif(customer.details->>'shippingPostalCode',''),nullif(customer.details->>'shippingCountry','')) ELSE '' END;
  IF shipping_mode<>'none' AND (length(shipping_address)<8 OR nullif(customer.details->>CASE WHEN shipping_mode='main' THEN 'street' ELSE 'shippingStreet' END,'') IS NULL OR nullif(customer.details->>CASE WHEN shipping_mode='main' THEN 'city' ELSE 'shippingCity' END,'') IS NULL) THEN RAISE EXCEPTION 'أكمل عنوان الشحن المختار في بيانات العميل'; END IF;
  delivery_confirmed:=coalesce((draft.payload#>>'{delivery,confirmed}')::boolean,false);
  delivery_date:=nullif(draft.payload#>>'{delivery,date}','')::timestamptz;
  IF delivery_confirmed AND (delivery_date IS NULL OR NOT isfinite(delivery_date) OR delivery_date>issue_at) THEN RAISE EXCEPTION 'اختر وقت تسليم صحيحًا لا يتجاوز الوقت الحالي'; END IF;
  IF NOT delivery_confirmed THEN delivery_date:=NULL; END IF;
  file_ids:=coalesce(draft.payload->'attachments','[]'::jsonb);
  IF jsonb_typeof(file_ids)<>'array' OR jsonb_array_length(file_ids)>20 OR (SELECT count(DISTINCT value)<>count(*) FROM jsonb_array_elements(file_ids)) THEN RAISE EXCEPTION 'Invalid attachments'; END IF;
  FOR file_id IN SELECT value::uuid FROM jsonb_array_elements_text(file_ids) LOOP
    SELECT * INTO attached FROM public.bf_company_invoice_files WHERE id=file_id AND cafe_id=p_cafe_id AND uploaded FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'أحد المستندات غير متاح أو لم يكتمل رفعه'; END IF;
    files:=files||jsonb_build_array(jsonb_build_object('id',attached.id,'name',attached.original_name,'size',attached.size_bytes));
  END LOOP;
  inclusive:=coalesce((inv->>'taxInclusive')::boolean,cfg.tax_inclusive);
  advanced:=prefs->'advanced';currency_code:=coalesce(nullif(inv->>'currency',''),'SAR');
  SELECT (c->>'rate')::numeric INTO fx FROM jsonb_array_elements(advanced->'currencies') c WHERE c->>'code'=currency_code;
  IF fx IS NULL THEN RAISE EXCEPTION 'عملة الفاتورة غير مفعلة';END IF;
  IF NOT(advanced->>'showExchangeRate')::boolean AND inv ? 'exchangeRate' AND (inv->>'exchangeRate')::numeric IS DISTINCT FROM fx THEN RAISE EXCEPTION 'تعديل سعر الصرف غير مسموح في إعدادات الفاتورة';END IF;
  fx:=coalesce((inv->>'exchangeRate')::numeric,fx);
  IF fx<=0 OR fx>1000000 OR fx<>round(fx,6) OR (currency_code='SAR' AND fx<>1) THEN RAISE EXCEPTION 'راجع سعر صرف العملة';END IF;
  IF p_source_id IS NOT NULL THEN
   SELECT * INTO source_doc FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_source_id AND kind='sale' FOR UPDATE;
   IF source_doc.id IS NULL OR NOT(advanced->>'debitNotesEnabled')::boolean OR source_doc.party_id<>customer.id OR EXISTS(SELECT 1 FROM public.bf_invoice_extensions WHERE document_id=p_source_id AND source_id IS NOT NULL) OR (brand_finance_private.document_state(p_cafe_id,p_source_id)->>'refunded')::boolean OR length(btrim(p_debit_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'الفاتورة غير متاحة لإشعار مدين';END IF;
  END IF;
  status_id:=nullif(inv->>'statusId','')::uuid;
  IF status_id IS NOT NULL AND (NOT(advanced->>'customStatusesEnabled')::boolean OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(advanced->'statuses') s WHERE s->>'id'=status_id::text)) THEN RAISE EXCEPTION 'حالة الفاتورة غير متاحة';END IF;
  list_id:=nullif(inv->>'priceListId','')::uuid;
  IF list_id IS NOT NULL THEN
   SELECT x INTO price_list FROM jsonb_array_elements(advanced->'priceLists') x WHERE x->>'id'=list_id::text AND (x->>'active')::boolean;
   IF NOT(advanced->>'priceListsEnabled')::boolean OR price_list IS NULL OR (jsonb_array_length(price_list->'partyIds')>0 AND NOT(price_list->'partyIds' ? customer.id::text)) THEN RAISE EXCEPTION 'قائمة الأسعار غير متاحة لهذا العميل';END IF;
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(inv->'lines') LOOP
   product:=NULL;policy:=NULL;product_id:=nullif(entry->>'productId','')::uuid;
   IF product_id IS NULL THEN
    IF p_source_id IS NULL AND NOT(prefs->>'allowLineEditing')::boolean THEN RAISE EXCEPTION 'البنود الحرة غير مسموحة في إعدادات الفاتورة';END IF;
    line_name:=btrim(coalesce(entry->>'name',''));line_kind:=coalesce(entry->>'kind','');
    IF length(line_name) NOT BETWEEN 1 AND 160 OR line_kind NOT IN('product','service') THEN RAISE EXCEPTION 'أكمل اسم البند الحر ونوعه';END IF;
   ELSE
    SELECT * INTO product FROM public.menu_products WHERE cafe_id=p_cafe_id AND id=product_id AND deleted_at IS NULL AND available FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'أحد المنتجات غير متاح حدّث الفاتورة';END IF;
    SELECT x INTO policy FROM jsonb_array_elements(advanced->'productPolicies') x WHERE x->>'productId'=product_id::text;
    line_name:=product.name;line_kind:=coalesce(policy->>'kind','product');
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(advanced->'excludedCategories') x WHERE x=product.category_id::text OR x=product.legacy_category OR x=(SELECT name FROM public.menu_categories WHERE id=product.category_id AND cafe_id=p_cafe_id)) THEN RAISE EXCEPTION 'صنف البند مستبعد من الفواتير';END IF;
   END IF;
   IF p_source_id IS NULL AND ((advanced->>'activityKind'='products' AND line_kind<>'product') OR (advanced->>'activityKind'='services' AND line_kind<>'service')) THEN RAISE EXCEPTION 'نوع البند لا يطابق نشاط الفواتير';END IF;
   catalog_price:=product.price;
   IF price_list IS NOT NULL THEN SELECT coalesce((x->>'price')::numeric,product.price) INTO catalog_price FROM jsonb_array_elements(price_list->'prices') x WHERE x->>'productId'=product_id::text;catalog_price:=coalesce(catalog_price,product.price);END IF;
   catalog_price:=round(catalog_price/fx,2);qty:=(entry->>'quantity')::numeric;price:=coalesce((entry->>'price')::numeric,catalog_price);
   IF qty IS NULL OR qty<=0 OR qty>9999 OR qty<>round(qty,3) OR price IS NULL OR price<0 OR price>10000000 OR price<>round(price,2) OR length(coalesce(entry->>'description',''))>500 THEN RAISE EXCEPTION 'راجع كميات وأسعار البنود';END IF;
   IF product_id IS NOT NULL AND NOT(prefs->>'allowLineEditing')::boolean AND (price IS DISTINCT FROM catalog_price OR (coalesce(entry->>'description','')<>'' AND coalesce(entry->>'description','') IS DISTINCT FROM coalesce(product.description,''))) THEN RAISE EXCEPTION 'Invoice settings: catalog line editing disabled' USING ERRCODE='22023';END IF;
   rate:=CASE WHEN p_source_id IS NOT NULL THEN coalesce((entry->>'vatRate')::numeric,15) WHEN advanced->>'taxMode'='none' THEN 0 WHEN advanced->>'taxMode'='specific' THEN (advanced->>'specificTaxRate')::numeric WHEN product_id IS NOT NULL THEN coalesce((policy->>'vatRate')::numeric,15) ELSE coalesce((entry->>'vatRate')::numeric,15) END;
   tax_category:=CASE WHEN rate=15 THEN 'S' WHEN advanced->>'taxMode'='none' AND p_source_id IS NULL THEN 'O' WHEN advanced->>'taxMode'='product' AND product_id IS NOT NULL THEN coalesce(policy->>'taxCategory','Z') ELSE coalesce(nullif(entry->>'taxCategory','S'),'Z') END;
   exemption:=coalesce(nullif(entry->>'exemptionReason',''),nullif(policy->>'exemptionReason',''),advanced->>'exemptionReason','');
   IF rate NOT IN(0,15) OR tax_category NOT IN('S','Z','E','O') OR (rate=15) IS DISTINCT FROM(tax_category='S') OR length(exemption)>250 OR (rate=0 AND (advanced->>'taxRequired')::boolean AND btrim(exemption)='') THEN RAISE EXCEPTION 'أكمل فئة الضريبة وسبب الإعفاء أو النسبة الصفرية';END IF;
   gross:=round(qty*price,2);discount_value:=coalesce((entry->>'discount')::numeric,0);
   IF coalesce(entry->>'discountKind','amount') NOT IN('amount','percent') OR discount_value<0 OR discount_value>1000000000 OR (entry->>'discountKind'='percent' AND discount_value>100) THEN RAISE EXCEPTION 'Invalid line discount';END IF;
   row_discount:=round(CASE WHEN entry->>'discountKind'='percent' THEN gross*discount_value/100 ELSE discount_value END,2);
   IF prefs->>'discountMode'='invoice' AND row_discount>0 THEN RAISE EXCEPTION 'Invoice settings: line discounts disabled' USING ERRCODE='22023';END IF;
   IF row_discount>gross THEN RAISE EXCEPTION 'خصم البند أكبر من قيمته';END IF;
   row_after:=gross-row_discount;subtotal:=subtotal+gross;after_rows:=after_rows+row_after;
   rows:=rows||jsonb_build_array(jsonb_build_object('productId',coalesce(product_id::text,''),'name',line_name,'kind',line_kind,'description',coalesce(entry->>'description',''),'quantity',qty,'price',price,'gross',gross,'rowDiscount',row_discount,'after',row_after,'vatRate',rate,'taxCategory',tax_category,'exemptionReason',exemption,'minimum',CASE WHEN (advanced->>'advancedPricing')::boolean THEN coalesce((policy->>'minimumPrice')::numeric,0) ELSE 0 END));
  END LOOP;
  discount_value:=CASE WHEN coalesce((inv->>'discountEnabled')::boolean,true) THEN coalesce((inv->>'discountValue')::numeric,0) ELSE 0 END;
  IF coalesce(inv->>'discountKind','amount') NOT IN('amount','percent') OR discount_value<0 OR discount_value>1000000000 OR (inv->>'discountKind'='percent' AND discount_value>100) THEN RAISE EXCEPTION 'Invalid invoice discount';END IF;
  doc_discount:=round(CASE WHEN inv->>'discountKind'='percent' THEN after_rows*discount_value/100 ELSE discount_value END,2);
  IF prefs->>'discountMode'='line' AND doc_discount>0 THEN RAISE EXCEPTION 'Invoice settings: invoice discounts disabled' USING ERRCODE='22023';END IF;
  IF doc_discount>after_rows THEN RAISE EXCEPTION 'خصم الفاتورة أكبر من قيمتها';END IF;
  cap:=100;IF (advanced->>'discountCapsEnabled')::boolean THEN SELECT (x->>'percent')::numeric INTO cap FROM jsonb_array_elements(advanced->'discountCaps') x WHERE x->>'userId'=auth.uid()::text;cap:=coalesce(cap,100);END IF;
  IF subtotal>0 AND subtotal-after_rows+doc_discount>round(subtotal*cap/100,2) THEN RAISE EXCEPTION 'الخصم يتجاوز الحد المسموح للمستخدم';END IF;
  remaining:=doc_discount;base_left:=after_rows;
  FOR entry IN SELECT value FROM jsonb_array_elements(rows) LOOP
   row_after:=(entry->>'after')::numeric;allocated:=least(row_after,remaining,CASE WHEN base_left=0 THEN 0 ELSE round(remaining*row_after/base_left,2) END);remaining:=remaining-allocated;base_left:=base_left-row_after;taxable:=row_after-allocated;rate:=(entry->>'vatRate')::numeric;
   row_tax:=CASE WHEN inclusive THEN round(taxable-taxable/(1+rate/100),2) ELSE round(taxable*rate/100,2) END;row_net:=CASE WHEN inclusive THEN taxable-row_tax ELSE taxable END;row_total:=row_net+row_tax;
   IF (CASE WHEN (advanced->>'minimumIncludesTax')::boolean THEN row_total ELSE row_net END)*fx < (entry->>'minimum')::numeric*(entry->>'quantity')::numeric THEN RAISE EXCEPTION 'سعر البند بعد الخصم أقل من الحد الأدنى';END IF;
   final_rows:=final_rows||jsonb_build_array(entry||jsonb_build_object('discount',(entry->>'rowDiscount')::numeric+allocated,'net',row_net,'tax',row_tax,'total',row_total));
   adjustment_base:=adjustment_base+CASE WHEN inclusive THEN row_total ELSE row_net END;
  END LOOP;
  adjustment_id:=nullif(inv#>>'{adjustment,typeId}','')::uuid;adjustment_amount:=coalesce((inv#>>'{adjustment,amount}')::numeric,0);
  IF adjustment_amount<0 OR adjustment_amount>1000000000 OR adjustment_amount<>round(adjustment_amount,2) OR (adjustment_id IS NULL AND adjustment_amount<>0) THEN RAISE EXCEPTION 'راجع قيمة التسوية';END IF;
  IF adjustment_id IS NOT NULL THEN
   SELECT x INTO adjustment_rule FROM jsonb_array_elements(advanced->'adjustments') x WHERE x->>'id'=adjustment_id::text;
   IF NOT(advanced->>'adjustmentsEnabled')::boolean OR adjustment_rule IS NULL OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=(adjustment_rule->>'accountId')::uuid AND active AND kind IN('revenue','expense') AND code<>'5000') THEN RAISE EXCEPTION 'حساب التسوية غير متاح';END IF;
   IF adjustment_rule->>'kind'='deduction' AND adjustment_amount>adjustment_base THEN RAISE EXCEPTION 'التسوية أكبر من قيمة الفاتورة';END IF;
   IF adjustment_rule->>'kind'='deduction' AND subtotal-after_rows+doc_discount+adjustment_amount>round(subtotal*cap/100,2) THEN RAISE EXCEPTION 'الخصم والتسوية يتجاوزان الحد المسموح للمستخدم';END IF;
  END IF;
  remaining:=adjustment_amount;base_left:=adjustment_base;rows:='[]';
  FOR entry IN SELECT value FROM jsonb_array_elements(final_rows) LOOP
   row_net:=(entry->>'net')::numeric;row_tax:=(entry->>'tax')::numeric;row_total:=(entry->>'total')::numeric;rate:=(entry->>'vatRate')::numeric;row_after:=CASE WHEN inclusive THEN row_total ELSE row_net END;
   allocated:=CASE WHEN base_left=0 THEN 0 ELSE round(remaining*row_after/base_left,2) END;remaining:=remaining-allocated;base_left:=base_left-row_after;
   IF adjustment_rule->>'kind'='deduction' THEN allocated:=-allocated;END IF;
   adjustment_line_tax:=CASE WHEN coalesce((adjustment_rule->>'taxable')::boolean,false) THEN CASE WHEN inclusive THEN round(allocated-allocated/(1+rate/100),2) ELSE round(allocated*rate/100,2) END ELSE 0 END;
   adjustment_line_net:=CASE WHEN inclusive AND coalesce((adjustment_rule->>'taxable')::boolean,false) THEN allocated-adjustment_line_tax ELSE allocated END;
   row_net:=row_net+adjustment_line_net;row_tax:=row_tax+adjustment_line_tax;row_total:=row_net+row_tax;
   IF row_net<0 OR row_tax<0 THEN RAISE EXCEPTION 'التسوية تنتج مبلغًا أو ضريبة سالبة';END IF;
   IF (CASE WHEN (advanced->>'minimumIncludesTax')::boolean THEN row_total ELSE row_net END)*fx < (entry->>'minimum')::numeric*(entry->>'quantity')::numeric THEN RAISE EXCEPTION 'سعر البند بعد التسوية أقل من الحد الأدنى';END IF;
   sar_line_net:=round(row_net*fx,2);sar_line_tax:=round(row_tax*fx,2);sar_net:=sar_net+sar_line_net;sar_tax:=sar_tax+sar_line_tax;sar_subtotal:=sar_subtotal+round((entry->>'gross')::numeric*fx,2);
   sar_adjustment_net:=sar_adjustment_net+round(adjustment_line_net*fx,2);sar_adjustment_tax:=sar_adjustment_tax+round(adjustment_line_tax*fx,2);
   net:=net+row_net;tax:=tax+row_tax;total:=total+row_total;adjustment_net:=adjustment_net+adjustment_line_net;adjustment_tax:=adjustment_tax+adjustment_line_tax;
   rows:=rows||jsonb_build_array(entry||jsonb_build_object('net',row_net,'tax',row_tax,'total',row_total,'sarNet',sar_line_net,'sarTax',sar_line_tax,'adjustmentNet',round(adjustment_line_net*fx,2),'adjustmentTax',round(adjustment_line_tax*fx,2)));
  END LOOP;
  final_rows:=rows;sar_total:=sar_net+sar_tax;sar_discount:=round((subtotal-after_rows+doc_discount)*fx,2);
  IF total<=0 OR total>1000000000 OR sar_total<=0 OR sar_total>1000000000 OR p_expected_total IS DISTINCT FROM total THEN RAISE EXCEPTION 'راجع إجمالي الفاتورة قبل الإصدار';END IF;
  credit_sar:=CASE WHEN p_source_id IS NULL AND coalesce((inv->>'applyCredit')::boolean,false) THEN least(sar_total,brand_finance_private.customer_credit_balance(p_cafe_id,customer.id)) ELSE 0 END;
  credit_foreign:=least(total,round(credit_sar/fx,2));deposit_amount:=round(CASE WHEN deposit_kind='percent' THEN total*deposit_value/100 ELSE deposit_value END,2);
  IF deposit_amount>total THEN RAISE EXCEPTION 'الدفعة المقدمة أكبر من إجمالي الفاتورة';END IF;
  paid:=CASE WHEN deposit_value>0 THEN CASE WHEN deposit_paid THEN deposit_amount ELSE 0 END WHEN aid IS NULL THEN 0 ELSE total-credit_foreign END;
  cash_sar:=CASE WHEN deposit_value=0 AND aid IS NOT NULL THEN sar_total-credit_sar ELSE round(paid*fx,2) END;
  IF cash_sar+credit_sar>sar_total THEN RAISE EXCEPTION 'الدفعة ورصيد العميل يتجاوزان المبلغ المستحق';END IF;
  display_number:=brand_finance_private.invoice_number_allocate(p_cafe_id,CASE WHEN p_source_id IS NULL THEN 'invoice' ELSE 'debit' END,advanced->CASE WHEN p_source_id IS NULL THEN 'numbering' ELSE 'debitNumbering' END,coalesce(inv->>'manualNumber',''));
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,reference_id,note,created_by,created_at,vat_rate,tax_inclusive)
   VALUES(doc,p_cafe_id,'sale',customer.id,aid,wid,sar_subtotal,sar_discount,sar_tax,sar_total,cash_sar,p_source_id,left(coalesce(inv->>'note',''),1000),auth.uid(),issue_at,CASE WHEN tax=0 THEN 0 ELSE 15 END,inclusive) RETURNING number INTO n;
  journal_note:=CASE WHEN (advanced->>'journalTemplateEnabled')::boolean THEN replace(replace(replace(replace(advanced->>'journalTemplate','{number}',display_number),'{customer}',customer.name),'{date}',(issue_at AT TIME ZONE 'Asia/Riyadh')::date::text),'{total}',sar_total::text) ELSE '' END;journal_note:=left(journal_note,300);
  FOR entry IN SELECT value FROM jsonb_array_elements(final_rows) LOOP
   line_id:=gen_random_uuid();
   INSERT INTO public.bf_document_lines(id,cafe_id,document_id,product_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason)
    VALUES(line_id,p_cafe_id,doc,nullif(entry->>'productId','')::uuid,entry->>'name',(entry->>'quantity')::numeric,round((entry->>'price')::numeric*fx,2),(entry->>'sarNet')::numeric,(entry->>'sarTax')::numeric,0,entry->>'kind',(entry->>'vatRate')::numeric,entry->>'taxCategory',entry->>'exemptionReason')
    RETURNING bf_document_lines.cost,bf_document_lines.cost_status INTO cost,line_cost_status;
   IF p_source_id IS NULL AND entry->>'kind'='product' AND NOT(prefs->>'allowBelowCost')::boolean THEN
    IF line_cost_status IS DISTINCT FROM 'known' THEN RAISE EXCEPTION 'Invoice settings: known inventory cost required' USING ERRCODE='22023';END IF;
    IF (entry->>'sarNet')::numeric<cost THEN RAISE EXCEPTION 'Invoice settings: below inventory cost' USING ERRCODE='22023';END IF;
   END IF;
   IF adjustment_id IS NOT NULL AND ((entry->>'adjustmentNet')::numeric<>0 OR (entry->>'adjustmentTax')::numeric<>0) THEN INSERT INTO public.bf_invoice_adjustment_lines(cafe_id,document_id,line_id,account_id,net,tax) VALUES(p_cafe_id,doc,line_id,(adjustment_rule->>'accountId')::uuid,(entry->>'adjustmentNet')::numeric,(entry->>'adjustmentTax')::numeric);END IF;
   PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'5000'),cost,0,NULL,journal_note);PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1200'),0,cost,NULL,journal_note);
  END LOOP;
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,aid,cash_sar,0,NULL,journal_note);
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1100'),sar_total-cash_sar,0,customer.id,journal_note);
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'4000'),0,sar_net-sar_adjustment_net,NULL,journal_note);
  IF sar_adjustment_net<>0 THEN PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,(adjustment_rule->>'accountId')::uuid,greatest(-sar_adjustment_net,0),greatest(sar_adjustment_net,0),NULL,journal_note);END IF;
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'2100'),0,sar_tax,NULL,journal_note);
  IF credit_sar>0 THEN PERFORM brand_finance_private.customer_credit_apply(p_cafe_id,doc,credit_sar);END IF;
  phone:=regexp_replace(translate(coalesce(customer.phone,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g');IF phone LIKE '00%' THEN phone:=substr(phone,3);END IF;IF phone~'^05[0-9]{8}$' THEN phone:='966'||substr(phone,2);ELSIF phone~'^5[0-9]{8}$' THEN phone:='966'||phone;END IF;
  IF coalesce(draft.payload->>'deliveryMethod','print') NOT IN('print','whatsapp','email','both') THEN RAISE EXCEPTION 'طريقة إرسال الفاتورة غير صالحة';END IF;
  IF draft.payload->>'deliveryMethod'='whatsapp' AND NOT((advanced->>'socialEnabled')::boolean AND advanced->'socialPlatforms' ? 'whatsapp') THEN RAISE EXCEPTION 'إرسال الواتساب غير مفعل في إعدادات الفواتير';END IF;
  IF draft.payload->>'deliveryMethod' IN('email','both') AND NOT(advanced->>'billingMethod' IN('email','both') OR ((advanced->>'socialEnabled')::boolean AND advanced->'socialPlatforms' ? 'email')) THEN RAISE EXCEPTION 'إرسال البريد الإلكتروني غير مفعل في إعدادات الفواتير';END IF;
  IF draft.payload->>'deliveryMethod'='whatsapp' AND phone!~'^9665[0-9]{8}$' THEN RAISE EXCEPTION 'أدخل رقم جوال سعودي صحيح للعميل قبل إرسال الواتساب';END IF;
  IF draft.payload->>'deliveryMethod' IN('email','both') AND coalesce(customer.email,'')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'أكمل البريد الإلكتروني الصحيح للعميل';END IF;
  SELECT coalesce(jsonb_agg(x-ARRAY['sarNet','sarTax','adjustmentNet','adjustmentTax','minimum']), '[]') INTO final_rows FROM jsonb_array_elements(final_rows) x;
  result:=jsonb_build_object('id',doc,'number',n,'displayNumber',display_number,'type',invoice_type,'documentType',CASE WHEN p_source_id IS NULL THEN 'invoice' ELSE 'debit' END,'sourceId',p_source_id,'sourceNumber',coalesce((SELECT e.display_number FROM public.bf_invoice_extensions e WHERE e.document_id=p_source_id),source_doc.number::text),'reason',p_debit_reason,'issuedAt',issue_at,'supplyDate',supply_date,'seller',seller,
   'customer',jsonb_build_object('name',coalesce(nullif(customer.details->>'legalName',''),customer.name),'vatNumber',customer.tax_number,'address',buyer_address,'phone',phone,'email',customer.email),
   'lines',final_rows,'subtotal',subtotal,'discount',subtotal-after_rows+doc_discount,'tax',tax,'total',total,'paid',paid+credit_foreign,'cashPaid',paid,'creditApplied',credit_foreign,'taxInclusive',inclusive,'currency',currency_code,'exchangeRate',fx,'decimalDisplay',prefs->>'decimalDisplay',
   'sar',jsonb_build_object('subtotal',sar_subtotal,'discount',sar_discount,'tax',sar_tax,'total',sar_total,'paid',cash_sar+credit_sar,'cashPaid',cash_sar,'creditApplied',credit_sar),
   'adjustment',CASE WHEN adjustment_id IS NULL THEN NULL ELSE jsonb_build_object('typeId',adjustment_id,'amount',adjustment_amount,'kind',adjustment_rule->>'kind','taxable',(adjustment_rule->>'taxable')::boolean,'name',adjustment_rule->>'name','net',adjustment_net,'tax',adjustment_tax,'total',adjustment_net+adjustment_tax) END,
   'deposit',jsonb_build_object('kind',deposit_kind,'value',deposit_value,'amount',deposit_amount,'paid',deposit_paid),'shipping',jsonb_build_object('mode',shipping_mode,'address',shipping_address),'delivery',jsonb_build_object('confirmed',delivery_confirmed,'date',coalesce(delivery_date::text,'')),
   'attachments',files,'note',coalesce(inv->>'note',''),'extraFields',coalesce(draft.payload->'extraFields','[]'::jsonb),'template',draft.payload->>'template','deliveryMethod',coalesce(draft.payload->>'deliveryMethod','print'));
  INSERT INTO public.bf_company_invoices(document_id,cafe_id,draft_id,snapshot) VALUES(doc,p_cafe_id,p_draft_id,result);
  INSERT INTO public.bf_invoice_extensions(cafe_id,document_id,display_number,source_id,status_id,metadata,created_by) VALUES(p_cafe_id,doc,display_number,p_source_id,status_id,jsonb_build_object('currency',currency_code,'exchangeRate',fx,'reason',p_debit_reason),auth.uid());
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.brand_finance_issue_company_invoice(p_cafe_id uuid,p_draft_id uuid,p_revision integer,p_expected_total numeric) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT brand_finance_private.issue_company_invoice(p_cafe_id,p_draft_id,p_revision,p_expected_total,NULL,'') $$;

CREATE FUNCTION brand_finance_private.invoice_refund_adjustments(cafe uuid,refund uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row record;before_qty numeric;share_net numeric;share_tax numeric;
BEGIN
 FOR row IN SELECT l.id,l.reference_line_id,l.quantity,a.net,a.tax,a.account_id,original.quantity AS original_quantity FROM public.bf_document_lines l JOIN public.bf_invoice_adjustment_lines a ON a.cafe_id=l.cafe_id AND a.line_id=l.reference_line_id JOIN public.bf_document_lines original ON original.id=l.reference_line_id WHERE l.cafe_id=cafe AND l.document_id=refund LOOP
  SELECT coalesce(sum(quantity),0) INTO before_qty FROM public.bf_document_lines WHERE cafe_id=cafe AND reference_line_id=row.reference_line_id AND id<>row.id;
  share_net:=round(row.net*(before_qty+row.quantity)/row.original_quantity,2)-round(row.net*before_qty/row.original_quantity,2);
  share_tax:=round(row.tax*(before_qty+row.quantity)/row.original_quantity,2)-round(row.tax*before_qty/row.original_quantity,2);
  IF share_net<>0 THEN
   PERFORM brand_finance_private.line(cafe,refund,row.account_id,greatest(share_net,0),greatest(-share_net,0));
   PERFORM brand_finance_private.line(cafe,refund,brand_finance_private.account(cafe,'4000'),greatest(-share_net,0),greatest(share_net,0));
  END IF;
  INSERT INTO public.bf_invoice_adjustment_lines(cafe_id,document_id,line_id,account_id,net,tax) VALUES(cafe,refund,row.id,row.account_id,share_net,share_tax);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION brand_finance_private.post_refund(p_cafe uuid, p_payload jsonb, p_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE original public.bf_documents%ROWTYPE; source jsonb; entry jsonb; available jsonb; selections jsonb; prepared jsonb:='[]'; state jsonb;
 qty numeric; before_qty numeric; line_net numeric; line_tax numeric; line_cost numeric; line_gross numeric; net numeric:=0; tax numeric:=0; gross numeric:=0; total numeric; discount numeric; debt numeric; paid numeric; actual_cost numeric; aid uuid; number bigint; item uuid; original_line public.bf_document_lines%ROWTYPE;
BEGIN
 IF brand_finance_private.role_for(p_cafe) NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 SELECT * INTO original FROM public.bf_documents WHERE cafe_id=p_cafe AND id=(p_payload->>'documentId')::uuid AND kind IN('sale','purchase') FOR UPDATE;
 IF original.kind='sale' AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=auth.uid()) THEN RAISE EXCEPTION 'Brand owner required' USING ERRCODE='42501'; END IF;
 IF original.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير متاحة للإرجاع'; END IF;
 available:=brand_finance_private.refund_lines(p_cafe,original.id,true);
 state:=brand_finance_private.document_state(p_cafe,original.id);
 IF (state->>'refunded')::boolean THEN RAISE EXCEPTION 'تم إرجاع جميع كميات الفاتورة'; END IF;
 IF p_payload ? 'lines' THEN selections:=p_payload->'lines'; ELSE
  SELECT jsonb_agg(jsonb_build_object('lineId',l->>'id','quantity',(l->>'quantity')::numeric-(l->>'returned_quantity')::numeric)) INTO selections FROM jsonb_array_elements(available) l WHERE (l->>'quantity')::numeric>(l->>'returned_quantity')::numeric;
 END IF;
 IF jsonb_typeof(selections) IS DISTINCT FROM 'array' OR jsonb_array_length(selections) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'حدد الأصناف والكميات المرتجعة'; END IF;
 IF (SELECT count(DISTINCT e->>'lineId') FROM jsonb_array_elements(selections) e)<>jsonb_array_length(selections) THEN RAISE EXCEPTION 'لا تكرر الصنف في طلب المرتجع'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(selections) LOOP
  SELECT l INTO source FROM jsonb_array_elements(available) l WHERE l->>'id'=entry->>'lineId';
  IF source IS NULL THEN RAISE EXCEPTION 'الصنف لا ينتمي إلى الفاتورة'; END IF;
  qty:=(entry->>'quantity')::numeric; before_qty:=(source->>'returned_quantity')::numeric;
  IF qty IS NULL OR qty<=0 OR qty<>round(qty,3) OR qty>(source->>'quantity')::numeric-before_qty THEN RAISE EXCEPTION 'الكمية المرتجعة تتجاوز الكمية المتبقية'; END IF;
  IF entry ? 'expectedReturnedQuantity' AND (entry->>'expectedReturnedQuantity')::numeric IS DISTINCT FROM before_qty THEN RAISE EXCEPTION 'تغيرت الكمية المرتجعة حدث الفاتورة ثم أعد المحاولة'; END IF;
  line_net:=round((source->>'net')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_net')::numeric;
  line_tax:=round((source->>'tax')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_tax')::numeric;
  line_cost:=round((source->>'cost')::numeric*(before_qty+qty)/(source->>'quantity')::numeric,2)-(source->>'returned_cost')::numeric;
  line_gross:=round(qty*(source->>'unit_price')::numeric,2);
  net:=net+line_net; tax:=tax+line_tax; gross:=gross+line_gross;
  prepared:=prepared||jsonb_build_array(source||jsonb_build_object('return_quantity',qty,'return_net',line_net,'return_tax',line_tax,'return_cost',line_cost));
 END LOOP;
 total:=net+tax;
 IF p_payload ? 'lines' AND (p_payload->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'تغير إجمالي المرتجع راجع الكميات'; END IF;
 discount:=greatest(0,gross-net-CASE WHEN coalesce(original.tax_inclusive,true) THEN tax ELSE 0 END);
 debt:=least(total,(state->>'outstanding')::numeric); paid:=total-debt;
 aid:=nullif(p_payload->>'accountId','')::uuid;
 IF paid>0 AND aid IS NULL THEN
  aid:=CASE WHEN (brand_finance_private.payment_document(original)).paid>0 THEN (brand_finance_private.payment_document(original)).account_id ELSE NULL END;
  IF aid IS NULL THEN SELECT (brand_finance_private.payment_document(d)).account_id INTO aid FROM public.bf_documents d WHERE cafe_id=p_cafe AND reference_id=original.id AND kind='settlement' AND (brand_finance_private.payment_document(d)).paid>0 ORDER BY created_at DESC,id LIMIT 1; END IF;
 END IF;
 IF paid>0 AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=aid AND active AND kind IN('cash','bank','pos')) THEN RAISE EXCEPTION 'اختر حساب تسوية المبلغ المرتجع'; END IF;
 IF paid=0 THEN aid:=NULL; END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,warehouse_id,subtotal,discount,tax,total,paid,reference_id,note,created_by,vat_rate,tax_inclusive)
 VALUES(p_id,p_cafe,'refund',original.party_id,CASE WHEN original.kind='sale' THEN nullif(p_payload->>'shiftId','')::uuid ELSE NULL END,aid,original.warehouse_id,gross,discount,tax,total,paid,original.id,coalesce(p_payload->>'note',''),auth.uid(),original.vat_rate,original.tax_inclusive) RETURNING bf_documents.number INTO number;
 FOR entry IN SELECT value FROM jsonb_array_elements(prepared) LOOP
  qty:=(entry->>'return_quantity')::numeric; line_net:=(entry->>'return_net')::numeric; line_tax:=(entry->>'return_tax')::numeric; line_cost:=(entry->>'return_cost')::numeric; item:=(entry->>'item_id')::uuid;
  actual_cost:=0;
  IF item IS NOT NULL AND NOT (original.kind='sale' AND EXISTS(SELECT 1 FROM public.bf_line_components WHERE cafe_id=p_cafe AND line_id=(entry->>'id')::uuid)) THEN actual_cost:=brand_finance_private.stock_move(p_cafe,p_id,item,original.warehouse_id,CASE WHEN original.kind='sale' THEN qty ELSE -qty END,CASE WHEN original.kind='sale' THEN line_cost/qty ELSE 0 END); END IF;
  SELECT * INTO STRICT original_line FROM public.bf_document_lines WHERE cafe_id=p_cafe AND id=(entry->>'id')::uuid;
  INSERT INTO public.bf_document_lines(cafe_id,document_id,reference_line_id,product_id,item_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason)
  VALUES(p_cafe,p_id,(entry->>'id')::uuid,(entry->>'product_id')::uuid,item,entry->>'name',qty,(entry->>'unit_price')::numeric,line_net,line_tax,line_cost,original_line.activity_kind,original_line.vat_rate,original_line.tax_category,original_line.exemption_reason) RETURNING bf_document_lines.cost INTO line_cost;
  IF original.kind='sale' THEN
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1200'),line_cost,0);
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'5000'),0,line_cost);
  ELSE
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1200'),0,actual_cost);
   PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'5200'),greatest(actual_cost-line_net,0),greatest(line_net-actual_cost,0));
  END IF;
 END LOOP;
 IF original.kind='sale' THEN
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'4000'),net,0);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'2100'),tax,0);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1100'),0,debt,original.party_id);
  PERFORM brand_finance_private.line(p_cafe,p_id,aid,0,paid);
 ELSE
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'1300'),0,tax);
  PERFORM brand_finance_private.line(p_cafe,p_id,brand_finance_private.account(p_cafe,'2000'),debt,0,original.party_id);
  PERFORM brand_finance_private.line(p_cafe,p_id,aid,paid,0);
 END IF;
 PERFORM brand_finance_private.invoice_refund_adjustments(p_cafe,p_id);
 RETURN number;
END $function$
;
CREATE OR REPLACE FUNCTION brand_finance_private.payment_financial_guard(source bf_documents, invoice bf_documents, account uuid, financial_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE a public.bf_accounts%ROWTYPE; today date:=(now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
 IF EXISTS(SELECT 1 FROM public.bf_customer_credit_events WHERE cafe_id=source.cafe_id AND document_id=source.id AND action='apply') THEN RETURN 'هذه الدفعة من رصيد العميل ألغ تطبيق الرصيد من إدارة الأرصدة';END IF;
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=source.cafe_id AND (closed_through>=today OR closed_through>=(source.created_at AT TIME ZONE 'Asia/Riyadh')::date))
  OR EXISTS(SELECT 1 FROM public.bf_gl_periods WHERE cafe_id=source.cafe_id AND closed AND (today BETWEEN period_start AND period_end OR (source.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN period_start AND period_end)) THEN RETURN 'الفترة المالية للدفعة أو التصحيح مقفلة'; END IF;
 IF invoice.shift_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=source.cafe_id AND id=invoice.shift_id AND status<>'open') THEN RETURN 'وردية الفاتورة مغلقة أو في التسليم ولا يمكن تغيير مبالغها'; END IF;
 IF source.shift_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=source.cafe_id AND id=source.shift_id AND status<>'open') THEN RETURN 'وردية الدفعة مغلقة أو في التسليم'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_refund_requests WHERE cafe_id=source.cafe_id AND document_id=invoice.id AND status='pending') THEN RETURN 'راجع طلب المرتجع المعلق قبل تغيير الدفعة'; END IF;
 SELECT * INTO a FROM public.bf_accounts WHERE cafe_id=source.cafe_id AND id=account;
 IF NOT FOUND OR NOT a.active OR a.deleted_at IS NOT NULL OR a.frozen OR a.is_group THEN RETURN 'حساب التحصيل غير نشط أو مجمد'; END IF;
 IF a.is_cashier_drawer AND NOT EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=source.cafe_id AND id=coalesce(source.shift_id,invoice.shift_id) AND account_id=a.id AND status='open') THEN RETURN 'صندوق الكاشير لا يتبع وردية الفاتورة المفتوحة'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=source.cafe_id AND account_id=a.id AND status IN('open','handover') AND (status='handover' OR id IS DISTINCT FROM coalesce(source.shift_id,invoice.shift_id))) THEN RETURN 'حساب التحصيل مرتبط بعهدة وردية أخرى'; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_terminal_fee_charges f WHERE f.cafe_id=source.cafe_id AND (f.source_document_id=source.id OR f.source_document_id IN(SELECT correction_id FROM public.bf_invoice_payment_events WHERE cafe_id=source.cafe_id AND source_id=source.id))) THEN RETURN 'الدفعة مرتبطة برسوم شبكة مرحلة وتتطلب تصحيح الرسوم المرتبطة أولًا'; END IF;
 IF a.kind='pos' AND EXISTS(SELECT 1 FROM public.bf_treasury_documents t JOIN public.bf_documents d ON d.cafe_id=t.cafe_id AND d.id=t.document_id WHERE t.cafe_id=source.cafe_id AND t.account_id=a.id AND t.operation='pos_settle' AND d.created_at>=financial_at AND NOT EXISTS(SELECT 1 FROM public.bf_treasury_documents rev WHERE rev.cafe_id=t.cafe_id AND rev.reverses_id=d.id)) THEN RETURN 'تمت تسوية الشبكة بعد هذه الدفعة ولا يمكن تغيير التحصيل المسوى'; END IF;
 RETURN NULL;
END $function$
;
CREATE OR REPLACE FUNCTION brand_finance_private.invoice_payment_record(source bf_documents, invoice bf_documents)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE p public.bf_invoice_payments%ROWTYPE; values jsonb; paid numeric; state text; account public.bf_accounts%ROWTYPE; collector uuid; guard text; deletion_guard text; editable boolean;
BEGIN
 SELECT * INTO p FROM public.bf_invoice_payments WHERE cafe_id=source.cafe_id AND source_id=source.id;
 state:=coalesce(p.status,'completed');
 values:=coalesce(p.payload,jsonb_build_object('amount',CASE WHEN source.kind='sale' THEN source.paid ELSE source.total END,'date',(source.created_at AT TIME ZONE 'Asia/Riyadh')::date,'accountId',source.account_id,'status','completed','collectorId',source.created_by,'reference','','details',CASE WHEN source.kind='sale' THEN '' ELSE source.note END,'receiptNote','','attachments','[]'::jsonb));
 paid:=CASE WHEN state='completed' THEN (values->>'amount')::numeric ELSE 0 END;
 SELECT * INTO account FROM public.bf_accounts WHERE cafe_id=source.cafe_id AND id=(values->>'accountId')::uuid;
 collector:=(values->>'collectorId')::uuid;
 guard:=brand_finance_private.payment_financial_guard(source,invoice,account.id,coalesce(p.financial_at,source.created_at));
 deletion_guard:=guard;
 
 IF paid>0 AND (brand_finance_private.payment_document(invoice)).paid+coalesce((SELECT sum((brand_finance_private.payment_document(s)).total) FROM public.bf_documents s WHERE s.cafe_id=source.cafe_id AND s.reference_id=invoice.id AND s.kind='settlement'),0)-paid<coalesce((SELECT sum(r.paid) FROM public.bf_documents r WHERE r.cafe_id=source.cafe_id AND r.reference_id=invoice.id AND r.kind='refund'),0) THEN deletion_guard:=coalesce(deletion_guard,'لا يمكن حذف دفعة استندت إليها مبالغ معادة للعميل'); END IF;
 IF paid>0 AND brand_finance_private.treasury_balance(source.cafe_id,account.id)<paid THEN deletion_guard:=coalesce(deletion_guard,'رصيد حساب التحصيل لا يكفي لعكس هذه الدفعة'); END IF;
 editable:=coalesce(brand_finance_private.role_for(source.cafe_id),'') IN('owner','manager','accountant') AND state<>'deleted';
 RETURN jsonb_build_object('id',source.id,'invoiceId',invoice.id,'initial',source.id=invoice.id,'number',source.number,'revision',coalesce(p.revision,0),'status',state,
  'amount',(values->>'amount')::numeric,'effectiveAmount',paid,'date',values->>'date','accountId',account.id,'accountName',account.name,'method',account.kind,
  'collectorId',collector,'collectorName',coalesce((SELECT nullif(name,'') FROM public.bf_staff WHERE cafe_id=source.cafe_id AND user_id=collector),(SELECT nullif(full_name,'') FROM public.profiles WHERE id=collector),'مستخدم غير مسمى'),
  'reference',values->>'reference','details',values->>'details','receiptNote',values->>'receiptNote',
  'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.original_name,'size',f.size_bytes) ORDER BY a.ordinality) FROM jsonb_array_elements_text(values->'attachments') WITH ORDINALITY a(id,ordinality) JOIN public.bf_company_invoice_files f ON f.id=a.id::uuid AND f.cafe_id=source.cafe_id AND f.uploaded),'[]'::jsonb),
  'canEdit',editable,'canChangeFinancials',editable AND guard IS NULL,'canDelete',editable AND (paid=0 OR deletion_guard IS NULL),'blockedReason',CASE WHEN state='deleted' THEN 'تم حذف الدفعة مع حفظ أثر التصحيح' ELSE coalesce(guard,deletion_guard) END)||CASE WHEN EXISTS(SELECT 1 FROM public.bf_customer_credit_events WHERE cafe_id=source.cafe_id AND document_id=source.id AND action='apply') THEN jsonb_build_object('method','credit','accountName','رصيد العميل','canEdit',false,'canChangeFinancials',false,'canDelete',false,'blockedReason',CASE WHEN state='deleted' THEN 'تم إلغاء تطبيق رصيد العميل' ELSE 'ألغ تطبيق رصيد العميل من إدارة الأرصدة' END) ELSE '{}'::jsonb END;
END $function$
;
DO $projection$ DECLARE body text;old text:='||CASE WHEN d.kind=''settlement'' THEN';BEGIN
 SELECT pg_get_functiondef('brand_finance_private.document_state(uuid,uuid)'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Unexpected document projection anchor';END IF;
 EXECUTE replace(body,old,$extra$||coalesce((SELECT jsonb_build_object('display_number',e.display_number,'document_type',CASE WHEN e.source_id IS NULL THEN 'invoice' ELSE 'debit' END,'currency',coalesce(e.metadata->>'currency','SAR')) FROM public.bf_invoice_extensions e WHERE e.cafe_id=p_cafe AND e.document_id=d.id),'{}'::jsonb)
 ||CASE WHEN d.kind='settlement' THEN$extra$);
END $projection$;

CREATE FUNCTION public.brand_finance_invoice_extensions(p_cafe_id uuid,p_document_id uuid,p_action text DEFAULT 'read',p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.bf_documents%ROWTYPE;stored public.bf_invoice_extensions%ROWTYPE;advanced jsonb;status uuid;expected integer;request uuid;prior public.bf_requests%ROWTYPE;archived jsonb;payload jsonb;draft_id uuid:=gen_random_uuid();answer jsonb;amount numeric;rate numeric;reason text;description text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('read','status','debit') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>5000 THEN RAISE EXCEPTION 'Invalid invoice extension input' USING ERRCODE='22023';END IF;
 IF p_action<>'read' THEN
  IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 END IF;
 SELECT * INTO source FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_document_id AND kind='sale';
 IF source.id IS NULL THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501';END IF;
 advanced:=brand_finance_private.invoice_settings(p_cafe_id)->'advanced';SELECT * INTO stored FROM public.bf_invoice_extensions WHERE document_id=p_document_id AND cafe_id=p_cafe_id;
 IF p_action='read' THEN RETURN jsonb_build_object('statusId',coalesce(stored.status_id::text,''),'revision',coalesce(stored.revision,0),'sourceId',stored.source_id,
  'profit',CASE WHEN (advanced->>'profitEnabled')::boolean THEN (SELECT jsonb_build_object('revenue',coalesce(sum(net),0),'cost',coalesce(sum(cost),0),'profit',coalesce(sum(net-cost),0),'costKnown',coalesce(bool_and(cost_status='known'),false)) FROM public.bf_document_lines WHERE cafe_id=p_cafe_id AND document_id=p_document_id) ELSE NULL END,
  'debitNotes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'number',d.number,'displayNumber',x.display_number,'total',d.total) ORDER BY d.created_at,d.id) FROM public.bf_invoice_extensions x JOIN public.bf_documents d ON d.cafe_id=x.cafe_id AND d.id=x.document_id WHERE x.cafe_id=p_cafe_id AND x.source_id=p_document_id),'[]'::jsonb));END IF;
 IF p_action='status' THEN
  status:=nullif(p_input->>'statusId','')::uuid;expected:=(p_input->>'revision')::integer;
  IF expected IS NULL OR expected<0 OR (status IS NOT NULL AND (NOT(advanced->>'customStatusesEnabled')::boolean OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(advanced->'statuses') x WHERE x->>'id'=status::text))) THEN RAISE EXCEPTION 'حالة الفاتورة غير متاحة' USING ERRCODE='22023';END IF;
  IF stored.status_id IS NOT DISTINCT FROM status THEN RETURN jsonb_build_object('id',source.id,'revision',coalesce(stored.revision,0));END IF;
  IF expected<>coalesce(stored.revision,0) THEN RAISE EXCEPTION 'Invoice status conflict' USING ERRCODE='40001';END IF;
  INSERT INTO public.bf_invoice_extensions(cafe_id,document_id,display_number,status_id,revision,created_by) VALUES(p_cafe_id,source.id,source.number::text,status,1,auth.uid()) ON CONFLICT(document_id) DO UPDATE SET status_id=excluded.status_id,revision=bf_invoice_extensions.revision+1;
  INSERT INTO public.bf_invoice_extension_events(cafe_id,document_id,action,before_value,after_value,created_by) VALUES(p_cafe_id,source.id,'status',jsonb_build_object('statusId',stored.status_id),jsonb_build_object('statusId',status),auth.uid());
  RETURN jsonb_build_object('id',source.id,'revision',coalesce(stored.revision,0)+1);
 END IF;
 request:=(p_input->>'requestId')::uuid;IF request IS NULL THEN RAISE EXCEPTION 'Invalid debit request' USING ERRCODE='22023';END IF;
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=request;
 IF FOUND THEN IF prior.operation<>'invoice_debit' OR prior.payload<>(p_input||jsonb_build_object('sourceId',p_document_id)) OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Debit request conflict' USING ERRCODE='40001';END IF;RETURN prior.result;END IF;
 SELECT snapshot INTO archived FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND document_id=source.id;
 IF archived IS NULL OR NOT(advanced->>'debitNotesEnabled')::boolean OR stored.source_id IS NOT NULL OR source.party_id IS NULL OR coalesce((brand_finance_private.document_state(p_cafe_id,source.id)->>'refunded')::boolean,false) THEN RAISE EXCEPTION 'الفاتورة غير متاحة لإشعار مدين';END IF;
 IF NOT brand_finance_private.invoice_number_valid(p_input->'amount',0.01,1000000000,2) OR NOT brand_finance_private.invoice_number_valid(p_input->'vatRate',0,15) OR (p_input->>'vatRate')::numeric NOT IN(0,15) THEN RAISE EXCEPTION 'راجع مبلغ الإشعار وضريبته' USING ERRCODE='22023';END IF;
 amount:=(p_input->>'amount')::numeric;rate:=(p_input->>'vatRate')::numeric;reason:=btrim(coalesce(p_input->>'reason',''));description:=btrim(coalesce(p_input->>'description',''));
 IF length(description) NOT BETWEEN 3 AND 500 OR length(reason) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'أكمل وصف الإشعار المدين وسبب إصداره';END IF;
 payload:=jsonb_build_object('invoice',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('key',0,'productId','','name',left(description,160),'kind','service','quantity',1,'price',amount,'vatRate',rate,'taxCategory',CASE WHEN rate=15 THEN 'S' ELSE 'Z' END,'exemptionReason',CASE WHEN rate=0 THEN reason ELSE '' END,'description',description)),'warehouseId',source.warehouse_id,'partyId',source.party_id,'accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','taxInclusive',false,'note',description,'currency','SAR','exchangeRate',1,'applyCredit',false),
  'issuer',archived->'seller','supplyDate',(now() AT TIME ZONE 'Asia/Riyadh')::date,'template','standard','deliveryMethod','print','deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'shipping','none','delivery',jsonb_build_object('confirmed',false,'date',''),'attachments','[]'::jsonb,'extraFields','[]'::jsonb);
 PERFORM public.brand_finance_save_invoice_draft(p_cafe_id,draft_id,0,payload);
 answer:=brand_finance_private.issue_company_invoice(p_cafe_id,draft_id,1,amount+round(amount*rate/100,2),source.id,reason);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,request,'invoice_debit',p_input||jsonb_build_object('sourceId',p_document_id),answer,auth.uid());RETURN answer;
END $$;

CREATE TABLE public.bf_company_invoice_emails(document_id uuid PRIMARY KEY,cafe_id uuid NOT NULL,email text NOT NULL,lease_token uuid NOT NULL DEFAULT gen_random_uuid(),status text NOT NULL DEFAULT 'processing' CHECK(status IN('processing','sent','failed','unknown')),attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3),provider_id text,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),finished_at timestamptz,FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX bf_company_invoice_emails_cafe ON public.bf_company_invoice_emails(cafe_id,created_at DESC);
CREATE INDEX bf_company_invoice_emails_actor ON public.bf_company_invoice_emails(created_by);
ALTER TABLE public.bf_company_invoice_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_company_invoice_emails FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_claim_company_email(p_cafe_id uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invoice jsonb;recipient text;advanced jsonb;delivery public.bf_company_invoice_emails%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 invoice:=public.brand_finance_company_invoice(p_cafe_id,p_id);IF invoice IS NULL THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501';END IF;
 advanced:=brand_finance_private.invoice_settings(p_cafe_id)->'advanced';
 IF NOT(coalesce(invoice->>'deliveryMethod','') IN('email','both') OR advanced->>'billingMethod' IN('email','both') OR ((advanced->>'socialEnabled')::boolean AND advanced->'socialPlatforms' ? 'email')) THEN RAISE EXCEPTION 'إرسال البريد الإلكتروني غير مفعل في إعدادات الفواتير';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60414));
 SELECT * INTO delivery FROM public.bf_company_invoice_emails WHERE cafe_id=p_cafe_id AND document_id=(invoice->>'id')::uuid;
 IF FOUND THEN
  IF delivery.status='failed' AND delivery.attempts<3 AND delivery.finished_at<clock_timestamp()-interval '30 seconds' AND delivery.created_at>clock_timestamp()-interval '23 hours' THEN
   UPDATE public.bf_company_invoice_emails SET status='processing',lease_token=gen_random_uuid(),attempts=attempts+1,provider_id=NULL,finished_at=NULL WHERE document_id=delivery.document_id RETURNING * INTO delivery;
  ELSE RETURN jsonb_build_object('claimed',false,'id',delivery.document_id,'email',delivery.email,'status',delivery.status,'idempotencyKey','branda-invoice-email-'||delivery.document_id);END IF;
 ELSE
  recipient:=coalesce(nullif(invoice#>>'{customer,email}',''),(SELECT p.email FROM public.bf_documents d JOIN public.bf_parties p ON p.cafe_id=d.cafe_id AND p.id=d.party_id WHERE d.cafe_id=p_cafe_id AND d.id=(invoice->>'id')::uuid));
  IF coalesce(recipient,'')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'أكمل البريد الإلكتروني الصحيح للعميل';END IF;
  IF (SELECT count(*) FROM public.bf_company_invoice_emails WHERE cafe_id=p_cafe_id AND created_at>clock_timestamp()-interval '1 minute')>=20 THEN RAISE EXCEPTION 'تجاوزت حد إرسال الفواتير حاول بعد قليل';END IF;
  INSERT INTO public.bf_company_invoice_emails(document_id,cafe_id,email,created_by) VALUES((invoice->>'id')::uuid,p_cafe_id,recipient,auth.uid()) RETURNING * INTO delivery;
 END IF;
 RETURN jsonb_build_object('claimed',true,'id',delivery.document_id,'leaseToken',delivery.lease_token,'email',delivery.email,'status',delivery.status,'idempotencyKey','branda-invoice-email-'||delivery.document_id);
END $$;
CREATE FUNCTION public.brand_finance_finish_company_email(p_id uuid,p_lease_token uuid,p_status text,p_provider_id text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status IS NULL OR p_status NOT IN('sent','failed','unknown') OR (p_status='sent' AND coalesce(length(p_provider_id),0) NOT BETWEEN 1 AND 200) OR length(p_provider_id)>200 THEN RAISE EXCEPTION 'Invalid email delivery result' USING ERRCODE='22023';END IF;
 UPDATE public.bf_company_invoice_emails SET status=p_status,provider_id=p_provider_id,finished_at=clock_timestamp() WHERE document_id=p_id AND lease_token=p_lease_token AND status='processing';RETURN FOUND;
END $$;

DO $whatsapp$ DECLARE body text;old text:='  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60414));';BEGIN
 SELECT pg_get_functiondef('public.brand_finance_claim_company_delivery(uuid,uuid)'::regprocedure) INTO body;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Unexpected whatsapp claim anchor';END IF;
 EXECUTE replace(body,old,$guard$  IF invoice ? 'documentType' AND coalesce(invoice->>'deliveryMethod','')<>'whatsapp' AND NOT coalesce((brand_finance_private.invoice_settings(p_cafe_id)#>>'{advanced,socialEnabled}')::boolean AND (brand_finance_private.invoice_settings(p_cafe_id)#>'{advanced,socialPlatforms}') ? 'whatsapp',false) THEN RAISE EXCEPTION 'إرسال الواتساب غير مفعل في إعدادات الفواتير';END IF;
$guard$||old);
END $whatsapp$;

DO $privileges$ DECLARE p record;BEGIN
 FOR p IN SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='brand_finance_private'::regnamespace AND proname IN('invoice_line','invoice_advanced_defaults','invoice_number_valid','invoice_object_keys','invoice_advanced_validate','customer_credit_balance','customer_credit_account','customer_credit_apply','customer_credit_unapply_allowed','invoice_number_next','invoice_number_allocate','issue_company_invoice','invoice_refund_adjustments') LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||p.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;
END $privileges$;
REVOKE ALL ON FUNCTION public.brand_finance_customer_credit(uuid,text,jsonb),public.brand_finance_invoice_context(uuid,uuid,uuid[]),public.brand_finance_invoice_extensions(uuid,uuid,text,jsonb),public.brand_finance_claim_company_email(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_customer_credit(uuid,text,jsonb),public.brand_finance_invoice_context(uuid,uuid,uuid[]),public.brand_finance_invoice_extensions(uuid,uuid,text,jsonb),public.brand_finance_claim_company_email(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_finish_company_email(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_finish_company_email(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
