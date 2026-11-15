BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE subscription_invoice_private.quote_counter(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),last_number bigint NOT NULL DEFAULT 0);
INSERT INTO subscription_invoice_private.quote_counter(singleton) VALUES(true);
ALTER TABLE subscription_invoice_private.quote_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON subscription_invoice_private.quote_counter FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.platform_subscription_quotes(
 id uuid PRIMARY KEY,quote_number text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 customer_name text NOT NULL,total_cents bigint NOT NULL CHECK(total_cents>=0),
 revision integer NOT NULL CHECK(revision>0),data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 submission jsonb NOT NULL,created_by uuid NOT NULL REFERENCES public.profiles(id),updated_by uuid NOT NULL REFERENCES public.profiles(id),
 converted_invoice_id uuid UNIQUE REFERENCES public.platform_subscription_invoices(id),conversion_submission jsonb,
 CHECK((converted_invoice_id IS NULL)=(conversion_submission IS NULL))
);
CREATE INDEX platform_subscription_quotes_created_idx ON public.platform_subscription_quotes(created_at DESC,id);
ALTER TABLE public.platform_subscription_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_subscription_quotes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_subscription_quotes TO authenticated;
CREATE POLICY subscription_quotes_admin_read ON public.platform_subscription_quotes FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND role='platform_admin' AND status='active'));

CREATE TABLE subscription_invoice_private.quote_requests(
 id uuid PRIMARY KEY,quote_id uuid NOT NULL REFERENCES public.platform_subscription_quotes(id),actor uuid NOT NULL REFERENCES public.profiles(id),
 operation text NOT NULL CHECK(operation IN('save','convert')),input jsonb NOT NULL,result_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE subscription_invoice_private.quote_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON subscription_invoice_private.quote_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION subscription_invoice_private.guard_quote() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.converted_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_IMMUTABLE';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION subscription_invoice_private.guard_quote() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER subscription_quote_immutable BEFORE UPDATE OR DELETE ON public.platform_subscription_quotes FOR EACH ROW EXECUTE FUNCTION subscription_invoice_private.guard_quote();

CREATE FUNCTION subscription_invoice_private.quote_customer(p_customer jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;max_len integer;result jsonb:=p_customer;
BEGIN
 IF jsonb_typeof(p_customer) IS DISTINCT FROM 'object' OR p_customer-ARRAY['name','cr','vatNumber','nationalAddress','buildingNumber','additionalNumber','district','city','postalCode','country','street','fullAddress']<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_QUOTE_CUSTOMER';END IF;
 FOREACH k IN ARRAY ARRAY['name','cr','vatNumber','nationalAddress','buildingNumber','additionalNumber','district','city','postalCode','country','street','fullAddress'] LOOP
  IF jsonb_typeof(p_customer->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_QUOTE_CUSTOMER';END IF;
  max_len:=CASE k WHEN 'name' THEN 160 WHEN 'cr' THEN 10 WHEN 'vatNumber' THEN 15 WHEN 'nationalAddress' THEN 120 WHEN 'buildingNumber' THEN 4 WHEN 'additionalNumber' THEN 4 WHEN 'postalCode' THEN 5 WHEN 'street' THEN 200 WHEN 'fullAddress' THEN 500 ELSE 100 END;
  IF length(p_customer->>k)>max_len THEN RAISE EXCEPTION 'INVALID_QUOTE_CUSTOMER';END IF;
  result:=jsonb_set(result,ARRAY[k],to_jsonb(btrim(p_customer->>k)));
 END LOOP;
 IF length(result->>'name')<2 OR length(result->>'country')<2
 OR result->>'cr' !~ '^(|[0-9]{10})$' OR result->>'vatNumber' !~ '^(|3[0-9]{13}3)$'
 OR result->>'buildingNumber' !~ '^[0-9]{0,4}$' OR result->>'additionalNumber' !~ '^[0-9]{0,4}$'
 OR result->>'postalCode' !~ '^(|[0-9]{5})$' THEN RAISE EXCEPTION 'INVALID_QUOTE_CUSTOMER';END IF;
 RETURN result;
END $$;

CREATE FUNCTION subscription_invoice_private.quote_values(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE line jsonb;lines jsonb:='[]';customer jsonb;inclusive boolean;valid_date date;name text;months integer;qty numeric;unit_price bigint;amount bigint;net bigint;tax bigint;total bigint;sum_net bigint:=0;sum_tax bigint:=0;sum_total bigint:=0;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR p_input-ARRAY['customer','validUntil','taxInclusive','lines','scopeWork']<>'{}'::jsonb
 OR jsonb_typeof(p_input->'taxInclusive') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'lines') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_input->'scopeWork') IS DISTINCT FROM 'string' OR length(p_input->>'scopeWork')>12000
 OR coalesce(p_input->>'validUntil','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'INVALID_QUOTE';END IF;
 customer:=subscription_invoice_private.quote_customer(p_input->'customer');valid_date:=(p_input->>'validUntil')::date;
 IF to_char(valid_date,'YYYY-MM-DD')<>p_input->>'validUntil' OR jsonb_array_length(p_input->'lines') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'INVALID_QUOTE';END IF;
 inclusive:=(p_input->>'taxInclusive')::boolean;
 FOR line IN SELECT value FROM jsonb_array_elements(p_input->'lines') LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR jsonb_typeof(line->'name') IS DISTINCT FROM 'string' OR length(btrim(line->>'name')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_QUOTE_LINE';END IF;
  name:=btrim(line->>'name');
  IF line->>'kind'='subscription' THEN
   IF line-ARRAY['kind','name','months','amountCents']<>'{}'::jsonb OR jsonb_typeof(line->'months') IS DISTINCT FROM 'number' OR line->>'months' !~ '^[0-9]{1,3}$'
   OR jsonb_typeof(line->'amountCents') IS DISTINCT FROM 'number' OR line->>'amountCents' !~ '^[0-9]{1,10}$' THEN RAISE EXCEPTION 'INVALID_QUOTE_LINE';END IF;
   months:=(line->>'months')::integer;qty:=1;amount:=(line->>'amountCents')::bigint;unit_price:=amount;
   IF months NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'INVALID_QUOTE_LINE';END IF;
  ELSIF line->>'kind'='item' THEN
   IF line-ARRAY['kind','name','quantity','unitPriceCents']<>'{}'::jsonb OR jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number'
   OR jsonb_typeof(line->'unitPriceCents') IS DISTINCT FROM 'number' OR line->>'unitPriceCents' !~ '^[0-9]{1,10}$' THEN RAISE EXCEPTION 'INVALID_QUOTE_LINE';END IF;
   qty:=(line->>'quantity')::numeric;unit_price:=(line->>'unitPriceCents')::bigint;months:=0;
   IF qty<=0 OR qty>1000000 OR qty<>round(qty,3) THEN RAISE EXCEPTION 'INVALID_QUOTE_LINE';END IF;
   amount:=round(qty*unit_price)::bigint;
  ELSE RAISE EXCEPTION 'INVALID_QUOTE_LINE';END IF;
  IF amount NOT BETWEEN 0 AND 9999999999 OR unit_price NOT BETWEEN 0 AND 9999999999 THEN RAISE EXCEPTION 'INVALID_QUOTE_AMOUNT';END IF;
  net:=CASE WHEN inclusive THEN round(amount::numeric*100/115)::bigint ELSE amount END;
  tax:=CASE WHEN inclusive THEN amount-net ELSE round(net::numeric*15/100)::bigint END;
  total:=net+tax;sum_net:=sum_net+net;sum_tax:=sum_tax+tax;sum_total:=sum_total+total;
  lines:=lines||jsonb_build_array(jsonb_build_object('planId','','planName',name,'kind',line->>'kind','quantity',qty,'unitPriceCents',unit_price,'months',months,'amountCents',amount,
   'description',CASE WHEN months>0 THEN 'اشتراك '||name||' لمدة '||CASE months WHEN 1 THEN 'شهر' WHEN 12 THEN 'سنة' ELSE months::text||' أشهر' END ELSE name END,
   'netCents',net,'taxCents',tax,'totalCents',total));
 END LOOP;
 RETURN jsonb_build_object('customer',customer,'dueDate',valid_date,'taxInclusive',inclusive,'taxRate',15,'lines',lines,'scopeWork',btrim(p_input->>'scopeWork'),'netCents',sum_net,'taxCents',sum_tax,'totalCents',sum_total,'templateVersion',1);
END $$;
REVOKE ALL ON FUNCTION subscription_invoice_private.quote_customer(jsonb),subscription_invoice_private.quote_values(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.admin_save_subscription_quote(p_id uuid,p_request_id uuid,p_revision integer,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();existing public.platform_subscription_quotes;previous subscription_invoice_private.quote_requests;values_json jsonb;request_json jsonb;stamp timestamptz;created timestamptz;seq bigint;number text;rev integer;seller jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='platform_admin' AND status='active') THEN RAISE EXCEPTION 'QUOTE_ADMIN_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_request_id IS NULL OR p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'INVALID_QUOTE';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-quote-request:'||p_request_id::text,0));
 request_json:=jsonb_build_object('revision',p_revision,'draft',p_input);
 SELECT * INTO previous FROM subscription_invoice_private.quote_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF previous.actor<>actor OR previous.quote_id<>p_id OR previous.operation<>'save' OR previous.input IS DISTINCT FROM request_json THEN RAISE EXCEPTION 'QUOTE_REQUEST_CHANGED';END IF;
  RETURN previous.result_id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-quote:'||p_id::text,0));
 SELECT * INTO existing FROM public.platform_subscription_quotes WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF existing.converted_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_ALREADY_CONVERTED';END IF;
  IF existing.revision<>p_revision THEN RAISE EXCEPTION 'QUOTE_STALE';END IF;
  rev:=existing.revision+1;number:=existing.quote_number;created:=existing.created_at;
 ELSE
  IF p_revision<>0 THEN RAISE EXCEPTION 'QUOTE_STALE';END IF;
  rev:=1;created:=clock_timestamp();
  UPDATE subscription_invoice_private.quote_counter SET last_number=last_number+1 WHERE singleton RETURNING last_number INTO seq;
  number:='QT-'||to_char(created AT TIME ZONE 'Asia/Riyadh','YYYY-MMDD')||'-'||lpad(seq::text,greatest(6,length(seq::text)),'0');
 END IF;
 values_json:=subscription_invoice_private.quote_values(p_input);stamp:=clock_timestamp();
 seller:=coalesce(existing.data->'seller',jsonb_build_object('name','شركة العنوان الحصري','cr','5850157983','vatNumber','312872746700003','nationalAddress','AKAA8043','buildingNumber','8043','additionalNumber','3076','district','حي الذلالة','city','خميس مشيط','postalCode','62411','country','المملكة العربية السعودية'));
 values_json:=values_json||jsonb_build_object('id',p_id,'number',number,'issuedAt',to_char(created AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'updatedAt',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'seller',seller,'documentKind','quote','revision',rev,'convertedInvoiceId',NULL,'draft',p_input);
 IF rev=1 THEN
  INSERT INTO public.platform_subscription_quotes(id,quote_number,created_at,updated_at,customer_name,total_cents,revision,data,submission,created_by,updated_by)
  VALUES(p_id,number,created,stamp,values_json->'customer'->>'name',(values_json->>'totalCents')::bigint,rev,values_json,p_input,actor,actor);
 ELSE
  UPDATE public.platform_subscription_quotes SET updated_at=stamp,customer_name=values_json->'customer'->>'name',total_cents=(values_json->>'totalCents')::bigint,revision=rev,data=values_json,submission=p_input,updated_by=actor WHERE id=p_id;
 END IF;
 INSERT INTO subscription_invoice_private.quote_requests(id,quote_id,actor,operation,input,result_id) VALUES(p_request_id,p_id,actor,'save',request_json,p_id);
 RETURN p_id;
END $$;

CREATE FUNCTION public.admin_convert_subscription_quote(p_id uuid,p_request_id uuid,p_revision integer,p_customer jsonb,p_due_date text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();quote public.platform_subscription_quotes;previous subscription_invoice_private.quote_requests;request_json jsonb;customer jsonb;due_date date;invoice_id uuid;seq bigint;stamp timestamptz;number text;invoice jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='platform_admin' AND status='active') THEN RAISE EXCEPTION 'QUOTE_ADMIN_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_request_id IS NULL OR p_revision IS NULL OR p_revision<1 THEN RAISE EXCEPTION 'INVALID_QUOTE';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-quote-request:'||p_request_id::text,0));
 request_json:=jsonb_build_object('revision',p_revision,'customer',p_customer,'dueDate',p_due_date);
 SELECT * INTO previous FROM subscription_invoice_private.quote_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF previous.actor<>actor OR previous.quote_id<>p_id OR previous.operation<>'convert' OR previous.input IS DISTINCT FROM request_json THEN RAISE EXCEPTION 'QUOTE_REQUEST_CHANGED';END IF;
  RETURN previous.result_id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-quote:'||p_id::text,0));
 SELECT * INTO quote FROM public.platform_subscription_quotes WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND';END IF;
 IF quote.converted_invoice_id IS NOT NULL THEN
  IF quote.conversion_submission IS DISTINCT FROM request_json THEN RAISE EXCEPTION 'QUOTE_ALREADY_CONVERTED';END IF;
  INSERT INTO subscription_invoice_private.quote_requests(id,quote_id,actor,operation,input,result_id) VALUES(p_request_id,p_id,actor,'convert',request_json,quote.converted_invoice_id);
  RETURN quote.converted_invoice_id;
 END IF;
 IF quote.revision<>p_revision THEN RAISE EXCEPTION 'QUOTE_STALE';END IF;
 customer:=subscription_invoice_private.quote_customer(p_customer);
 IF coalesce(p_due_date,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'INVALID_QUOTE_DATE';END IF;
 due_date:=p_due_date::date;IF to_char(due_date,'YYYY-MM-DD')<>p_due_date THEN RAISE EXCEPTION 'INVALID_QUOTE_DATE';END IF;
 UPDATE subscription_invoice_private.counter SET last_number=last_number+1,last_issued_at=greatest(clock_timestamp(),last_issued_at+interval '1 microsecond') WHERE singleton RETURNING last_number,last_issued_at INTO seq,stamp;
 invoice_id:=gen_random_uuid();number:='INV-'||to_char(stamp AT TIME ZONE 'Asia/Riyadh','YYYY-MMDD')||'-'||lpad(seq::text,greatest(6,length(seq::text)),'0');
 invoice:=(quote.data-ARRAY['documentKind','revision','updatedAt','convertedInvoiceId','draft'])||jsonb_build_object('id',invoice_id,'number',number,'issuedAt',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'customer',customer,'dueDate',due_date,'sourceQuoteNumber',quote.quote_number);
 INSERT INTO public.platform_subscription_invoices(id,invoice_number,issued_at,customer_name,total_cents,data,submission,created_by)
 VALUES(invoice_id,number,stamp,customer->>'name',quote.total_cents,invoice,jsonb_build_object('sourceQuoteId',p_id,'sourceQuoteRevision',quote.revision,'conversion',request_json),actor);
 UPDATE public.platform_subscription_quotes SET converted_invoice_id=invoice_id,conversion_submission=request_json,updated_at=stamp,updated_by=actor,revision=revision+1,
  data=data||jsonb_build_object('convertedInvoiceId',invoice_id,'revision',revision+1,'updatedAt',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) WHERE id=p_id;
 INSERT INTO subscription_invoice_private.quote_requests(id,quote_id,actor,operation,input,result_id) VALUES(p_request_id,p_id,actor,'convert',request_json,invoice_id);
 RETURN invoice_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_subscription_quote(uuid,uuid,integer,jsonb),public.admin_convert_subscription_quote(uuid,uuid,integer,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_subscription_quote(uuid,uuid,integer,jsonb),public.admin_convert_subscription_quote(uuid,uuid,integer,jsonb,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
