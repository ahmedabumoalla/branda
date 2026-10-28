BEGIN;
CREATE SCHEMA IF NOT EXISTS subscription_invoice_private;
REVOKE ALL ON SCHEMA subscription_invoice_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE subscription_invoice_private.counter (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 last_number bigint NOT NULL DEFAULT 0,
 last_issued_at timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO subscription_invoice_private.counter(singleton) VALUES(true);
REVOKE ALL ON subscription_invoice_private.counter FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE subscription_invoice_private.counter ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_subscription_invoices (
 id uuid PRIMARY KEY,
 invoice_number text NOT NULL UNIQUE,
 issued_at timestamptz NOT NULL UNIQUE,
 customer_name text NOT NULL,
 total_cents bigint NOT NULL CHECK(total_cents>0),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 submission jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT
);
CREATE INDEX platform_subscription_invoices_issued_idx ON public.platform_subscription_invoices(issued_at DESC,id);
ALTER TABLE public.platform_subscription_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_subscription_invoices FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.platform_subscription_invoices TO authenticated;
CREATE POLICY subscription_invoice_admin_read ON public.platform_subscription_invoices FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND role='platform_admin' AND status='active'));

CREATE FUNCTION subscription_invoice_private.immutable_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Issued invoices cannot be changed or deleted'; END $$;
REVOKE ALL ON FUNCTION subscription_invoice_private.immutable_invoice() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_subscription_invoice BEFORE UPDATE OR DELETE ON public.platform_subscription_invoices FOR EACH ROW EXECUTE FUNCTION subscription_invoice_private.immutable_invoice();

CREATE FUNCTION public.admin_issue_subscription_invoice(p_id uuid,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid(); existing public.platform_subscription_invoices%ROWTYPE;
 customer jsonb; line jsonb; lines jsonb:='[]'; plan_name text; plan_id text; months integer; amount bigint;
 inclusive boolean; due_date date; net bigint; tax bigint; total bigint; sum_net bigint:=0; sum_tax bigint:=0; sum_total bigint:=0;
 seq bigint; stamp timestamptz; invoice_number text; seller jsonb; k text;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND role='platform_admin' AND status='active') THEN RAISE EXCEPTION 'INVOICE_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'INVALID_INVOICE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-invoice:'||p_id::text,0));
 SELECT * INTO existing FROM public.platform_subscription_invoices WHERE id=p_id;
 IF FOUND THEN
  IF existing.created_by<>actor OR existing.submission IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'INVOICE_REQUEST_CHANGED'; END IF;
  RETURN existing.id;
 END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR jsonb_typeof(p_input->'customer') IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_input->'lines') IS DISTINCT FROM 'array' OR jsonb_typeof(p_input->'taxInclusive') IS DISTINCT FROM 'boolean'
  OR (p_input-ARRAY['customer','lines','taxInclusive','dueDate'])<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_INVOICE'; END IF;
 customer:=p_input->'customer';
 IF customer-ARRAY['name','cr','vatNumber','nationalAddress','buildingNumber','additionalNumber','district','city','postalCode','country']<>'{}'::jsonb THEN RAISE EXCEPTION 'INVALID_CUSTOMER'; END IF;
 FOREACH k IN ARRAY ARRAY['name','cr','vatNumber','nationalAddress','buildingNumber','additionalNumber','district','city','postalCode','country'] LOOP
  IF jsonb_typeof(customer->k) IS DISTINCT FROM 'string' OR length(customer->>k)>160 THEN RAISE EXCEPTION 'INVALID_CUSTOMER'; END IF;
 END LOOP;
 IF length(btrim(customer->>'name')) NOT BETWEEN 2 AND 160 OR length(btrim(customer->>'country')) NOT BETWEEN 2 AND 100
  OR customer->>'cr' !~ '^(|[0-9]{10})$' OR customer->>'vatNumber' !~ '^(|3[0-9]{13}3)$'
  OR customer->>'buildingNumber' !~ '^[0-9]{0,4}$' OR customer->>'additionalNumber' !~ '^[0-9]{0,4}$'
  OR customer->>'postalCode' !~ '^(|[0-9]{5})$' THEN RAISE EXCEPTION 'INVALID_CUSTOMER'; END IF;
 IF coalesce(p_input->>'dueDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'INVALID_INVOICE_DATE'; END IF;
 due_date:=(p_input->>'dueDate')::date;
 IF due_date<(clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'INVALID_INVOICE_DATE'; END IF;
 inclusive:=(p_input->>'taxInclusive')::boolean;
 IF jsonb_array_length(p_input->'lines') NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'INVALID_INVOICE_LINES'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_input->'lines') LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR line-ARRAY['planId','months','amountCents']<>'{}'::jsonb
   OR jsonb_typeof(line->'planId') IS DISTINCT FROM 'string' OR jsonb_typeof(line->'months') IS DISTINCT FROM 'number'
   OR jsonb_typeof(line->'amountCents') IS DISTINCT FROM 'number' OR line->>'amountCents' !~ '^[0-9]{1,10}$'
   OR line->>'months' NOT IN('1','3','6','9','12') THEN RAISE EXCEPTION 'INVALID_INVOICE_LINES'; END IF;
  plan_id:=line->>'planId';months:=(line->>'months')::integer;amount:=(line->>'amountCents')::bigint;
  IF amount NOT BETWEEN 1 AND 9999999999 THEN RAISE EXCEPTION 'INVALID_INVOICE_AMOUNT'; END IF;
  SELECT name INTO plan_name FROM public.platform_plans WHERE id=plan_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_PLAN_UNAVAILABLE'; END IF;
  net:=CASE WHEN inclusive THEN round(amount::numeric*100/115)::bigint ELSE amount END;
  tax:=CASE WHEN inclusive THEN amount-net ELSE round(net::numeric*15/100)::bigint END;
  total:=net+tax;sum_net:=sum_net+net;sum_tax:=sum_tax+tax;sum_total:=sum_total+total;
  lines:=lines||jsonb_build_array(jsonb_build_object('planId',plan_id,'planName',plan_name,'months',months,'amountCents',amount,
   'description','اشتراك '||plan_name||' لمدة '||CASE months WHEN 1 THEN 'شهر' WHEN 12 THEN 'سنة' ELSE months::text||' أشهر' END,
   'netCents',net,'taxCents',tax,'totalCents',total));
 END LOOP;
 UPDATE subscription_invoice_private.counter SET last_number=last_number+1,last_issued_at=greatest(clock_timestamp(),last_issued_at+interval '1 microsecond')
 WHERE singleton RETURNING last_number,last_issued_at INTO seq,stamp;
 invoice_number:='INV-'||to_char(stamp AT TIME ZONE 'Asia/Riyadh','YYYY-MMDD')||'-'||lpad(seq::text,greatest(6,length(seq::text)),'0');
 seller:=jsonb_build_object('name','شركة العنوان الحصري','cr','5850157983','vatNumber','312872746700003','nationalAddress','AKAA8043',
  'buildingNumber','8043','additionalNumber','3076','district','حي الذلالة','city','خميس مشيط','postalCode','62411','country','المملكة العربية السعودية');
 INSERT INTO public.platform_subscription_invoices(id,invoice_number,issued_at,customer_name,total_cents,submission,created_by,data)
 VALUES(p_id,invoice_number,stamp,btrim(customer->>'name'),sum_total,p_input,actor,jsonb_build_object(
  'id',p_id,'number',invoice_number,'issuedAt',to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'dueDate',due_date,
  'seller',seller,'customer',customer,'taxInclusive',inclusive,'taxRate',15,'lines',lines,'netCents',sum_net,'taxCents',sum_tax,'totalCents',sum_total,'templateVersion',1));
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_issue_subscription_invoice(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_issue_subscription_invoice(uuid,jsonb) TO authenticated;
COMMIT;
