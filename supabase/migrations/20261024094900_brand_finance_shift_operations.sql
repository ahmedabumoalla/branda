BEGIN;
ALTER TABLE public.bf_settings ADD COLUMN initialized_at timestamptz, ADD COLUMN initialized_by uuid REFERENCES auth.users(id);
ALTER TABLE public.bf_shifts ADD COLUMN opening_expected_cash numeric(16,2), ADD COLUMN opening_variance numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE public.bf_parties ADD COLUMN employee_user_id uuid REFERENCES auth.users(id), ADD CHECK(employee_user_id IS NULL OR kind='employee');
CREATE UNIQUE INDEX bf_party_employee_identity ON public.bf_parties(cafe_id,employee_user_id) WHERE employee_user_id IS NOT NULL;
ALTER TABLE public.bf_items ADD COLUMN barcode text CHECK(length(barcode)<=100);
CREATE UNIQUE INDEX bf_item_barcode ON public.bf_items(cafe_id,barcode) WHERE barcode IS NOT NULL;
CREATE TABLE public.bf_shift_menu_snapshot(
 cafe_id uuid NOT NULL,shift_id uuid NOT NULL,product_id uuid NOT NULL,name text NOT NULL,unit_price numeric(16,2) NOT NULL,
 PRIMARY KEY(shift_id,product_id),FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id));
CREATE TABLE public.bf_shift_variances(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,shift_id uuid NOT NULL,phase text NOT NULL CHECK(phase IN('opening','closing')),
 expected_cash numeric(16,2) NOT NULL,counted_cash numeric(16,2) NOT NULL CHECK(counted_cash>=0 AND counted_cash<>'NaN'),
 difference numeric(16,2) NOT NULL CHECK(difference<>0 AND difference<>'NaN'),document_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','charge_employee','waive')),settled_at timestamptz,settled_by uuid REFERENCES auth.users(id),settlement_note text,settlement_document_id uuid,
 UNIQUE(shift_id,phase),FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,settlement_document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX bf_shift_variances_pending ON public.bf_shift_variances(cafe_id,status);
CREATE TABLE public.bf_shift_supplier_payouts(
 document_id uuid PRIMARY KEY,cafe_id uuid NOT NULL,shift_id uuid NOT NULL,supplier_name text NOT NULL,supplier_phone text NOT NULL,
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id));
CREATE INDEX bf_shift_supplier_payouts_shift ON public.bf_shift_supplier_payouts(cafe_id,shift_id);
CREATE TABLE public.bf_shift_alerts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,shift_id uuid NOT NULL,phase text NOT NULL CHECK(phase IN('opening','closing')),
 expected_cash numeric(16,2) NOT NULL,counted_cash numeric(16,2) NOT NULL,difference numeric(16,2) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(shift_id,phase),FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['bf_shift_menu_snapshot','bf_shift_variances','bf_shift_supplier_payouts','bf_shift_alerts'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP; END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_shift_supplier_payouts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_shift_menu_snapshot FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.record_shift_variance(p_cafe uuid,p_shift uuid,p_phase text,p_expected numeric,p_counted numeric,p_actor uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE d uuid:=gen_random_uuid(); aid uuid; delta numeric:=p_counted-p_expected;
BEGIN
 IF delta=0 THEN RETURN; END IF;
 SELECT account_id INTO STRICT aid FROM public.bf_shifts WHERE cafe_id=p_cafe AND id=p_shift;
 INSERT INTO public.bf_documents(id,cafe_id,kind,shift_id,account_id,total,paid,note,created_by) VALUES(d,p_cafe,'shift_variance',p_shift,aid,abs(delta),abs(delta),p_phase,p_actor);
 PERFORM brand_finance_private.line(p_cafe,d,aid,greatest(delta,0),greatest(-delta,0));
 PERFORM brand_finance_private.line(p_cafe,d,brand_finance_private.account(p_cafe,'5300'),greatest(-delta,0),greatest(delta,0));
 INSERT INTO public.bf_shift_variances(cafe_id,shift_id,phase,expected_cash,counted_cash,difference,document_id) VALUES(p_cafe,p_shift,p_phase,p_expected,p_counted,delta,d);
 INSERT INTO public.bf_shift_alerts(cafe_id,shift_id,phase,expected_cash,counted_cash,difference) VALUES(p_cafe,p_shift,p_phase,p_expected,p_counted,delta);
END $$;
CREATE FUNCTION brand_finance_private.capture_shift_menu(p_cafe uuid,p_shift uuid) RETURNS void LANGUAGE sql SET search_path='' AS $$
 INSERT INTO public.bf_shift_menu_snapshot(cafe_id,shift_id,product_id,name,unit_price)
 SELECT p_cafe,p_shift,id,name,price FROM public.menu_products WHERE cafe_id=p_cafe AND deleted_at IS NULL AND available ON CONFLICT DO NOTHING
$$;
ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) SET SCHEMA brand_finance_private;
ALTER FUNCTION brand_finance_private.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_shifts;
REVOKE ALL ON FUNCTION brand_finance_private.execute_before_shifts(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE r text; prior public.bf_requests%ROWTYPE; sh public.bf_shifts%ROWTYPE; v public.bf_shift_variances%ROWTYPE; aid uuid; pid uuid; uid uuid; sid uuid; id uuid:=gen_random_uuid(); doc uuid; n bigint; expected numeric; counted numeric; amount numeric; delta numeric; e jsonb; result jsonb; note text:=coalesce(p_payload->>'note',''); attachment_ids uuid[]; matched integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412)); r:=brand_finance_private.role_for(p_cafe_id);
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 OR p_payload::text ~* '"[-+]?(nan|infinity)"' OR length(note)>1000 THEN RAISE EXCEPTION 'Invalid command'; END IF;
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF prior.operation<>p_operation OR prior.payload<>p_payload OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Request identifier conflict'; END IF; RETURN prior.result||'{"duplicate":true}'::jsonb; END IF;
 IF p_operation='treasury' AND p_payload->>'kind'='opening' THEN RAISE EXCEPTION 'Use initial balance setup'; END IF;
 IF p_operation NOT IN('opening_balances','supplier_payout','shift_purchase','shift_variance_settle','shift_open','shift_close','shift_handover','shift_accept') THEN RETURN brand_finance_private.execute_before_shifts(p_cafe_id,p_operation,p_payload,p_request_id); END IF;
 PERFORM brand_finance_private.seed(p_cafe_id);
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=current_date) THEN RAISE EXCEPTION 'Accounting period closed'; END IF;
 IF p_operation='shift_purchase' THEN
  result:=brand_finance_private.post_shift_purchase(p_cafe_id,p_payload); id:=(result->>'id')::uuid; n:=(result->>'number')::bigint;
 ELSIF p_operation='opening_balances' THEN
  IF r<>'owner' AND NOT EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.role='platform_admin' AND pr.status='active') THEN RAISE EXCEPTION 'Finance owner required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND initialized_at IS NOT NULL) THEN RAISE EXCEPTION 'Opening balances already initialized'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND status IN('open','handover')) THEN RAISE EXCEPTION 'Close all shifts before initial balance setup'; END IF;
  IF jsonb_typeof(p_payload->'balances') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'balances') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Opening balances required'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_payload->'balances'))<>(SELECT count(DISTINCT value->>'accountId') FROM jsonb_array_elements(p_payload->'balances')) THEN RAISE EXCEPTION 'Duplicate opening account'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.active AND a.kind IN('cash','bank','pos') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'balances') entry_row WHERE (entry_row.value->>'accountId')::uuid=a.id)) THEN RAISE EXCEPTION 'Count every liquid account'; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,note,created_by) VALUES(id,p_cafe_id,'opening',note,auth.uid()) RETURNING number INTO n;
  FOR e IN SELECT value FROM jsonb_array_elements(p_payload->'balances') LOOP
   aid:=(e->>'accountId')::uuid; counted:=(e->>'amount')::numeric;
   IF counted IS NULL OR counted<0 OR counted>99999999999999 OR counted<>round(counted,2) OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND bf_accounts.id=aid AND active AND kind IN('cash','bank','pos')) THEN RAISE EXCEPTION 'Invalid opening balance'; END IF;
   SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=aid; delta:=counted-expected;
   PERFORM brand_finance_private.line(p_cafe_id,id,aid,greatest(delta,0),greatest(-delta,0)); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'3000'),greatest(-delta,0),greatest(delta,0));
  END LOOP;
  UPDATE public.bf_settings SET initialized_at=now(),initialized_by=auth.uid() WHERE cafe_id=p_cafe_id;
 ELSIF p_operation='shift_open' THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND initialized_at IS NOT NULL) THEN RAISE EXCEPTION 'Initialize opening balances first'; END IF;
  aid:=(p_payload->>'accountId')::uuid; counted:=(p_payload->>'openingCash')::numeric;
  IF counted IS NULL OR counted<0 OR counted<>round(counted,2) OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND bf_accounts.id=aid AND kind='cash' AND active) THEN RAISE EXCEPTION 'Valid opening cash count required'; END IF;
  SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=aid;
  INSERT INTO public.bf_shifts(id,cafe_id,user_id,account_id,opening_cash,expected_cash,opening_expected_cash,opening_variance) VALUES(id,p_cafe_id,auth.uid(),aid,counted,counted,expected,counted-expected);
  PERFORM brand_finance_private.record_shift_variance(p_cafe_id,id,'opening',expected,counted,auth.uid()); PERFORM brand_finance_private.capture_shift_menu(p_cafe_id,id);
 ELSIF p_operation IN('shift_close','shift_handover','shift_accept') THEN
  SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND bf_shifts.id=(p_payload->>'shiftId')::uuid FOR UPDATE;
  counted:=(p_payload->>'countedCash')::numeric; IF sh.id IS NULL OR counted IS NULL OR counted<0 OR counted<>round(counted,2) THEN RAISE EXCEPTION 'Cash count required'; END IF;
  SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=sh.account_id;
  IF p_operation='shift_accept' THEN
   IF sh.status<>'handover' OR sh.handover_to IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Invalid shift handover recipient' USING ERRCODE='42501'; END IF;
   UPDATE public.bf_shifts SET status='closed',closed_at=coalesce(closed_at,now()) WHERE bf_shifts.id=sh.id;
   INSERT INTO public.bf_shifts(id,cafe_id,user_id,account_id,opening_cash,expected_cash,opening_expected_cash,opening_variance) VALUES(id,p_cafe_id,auth.uid(),sh.account_id,counted,counted,expected,counted-expected);
   PERFORM brand_finance_private.record_shift_variance(p_cafe_id,id,'opening',expected,counted,auth.uid()); PERFORM brand_finance_private.capture_shift_menu(p_cafe_id,id);
  ELSE
   IF sh.user_id<>auth.uid() OR sh.status<>'open' THEN RAISE EXCEPTION 'Only current cashier can close own open shift' USING ERRCODE='42501'; END IF;
   IF p_operation='shift_handover' THEN uid:=(p_payload->>'toUserId')::uuid;
    IF uid IS NULL OR uid=auth.uid() OR NOT(EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=uid AND active) OR EXISTS(SELECT 1 FROM public.cafes WHERE cafes.id=p_cafe_id AND owner_user_id=uid)) THEN RAISE EXCEPTION 'Invalid handover recipient'; END IF;
   END IF;
   PERFORM brand_finance_private.record_shift_variance(p_cafe_id,sh.id,'closing',expected,counted,auth.uid());
   UPDATE public.bf_shifts SET expected_cash=expected,counted_cash=counted,variance=counted-expected,status=CASE WHEN p_operation='shift_close' THEN 'closed' ELSE 'handover' END,closed_at=now(),handover_to=uid,note=note WHERE bf_shifts.id=sh.id; id:=sh.id;
  END IF;
 ELSIF p_operation='supplier_payout' THEN
  SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND bf_shifts.id=(p_payload->>'shiftId')::uuid AND user_id=auth.uid() AND status='open' FOR UPDATE;
  amount:=(p_payload->>'amount')::numeric;
  IF sh.id IS NULL THEN RAISE EXCEPTION 'Own open shift required' USING ERRCODE='42501'; END IF;
  IF amount IS NULL OR amount<=0 OR amount<>round(amount,2) OR length(btrim(coalesce(p_payload->>'supplierName',''))) NOT BETWEEN 1 AND 150 OR length(btrim(coalesce(p_payload->>'supplierPhone',''))) NOT BETWEEN 5 AND 30 THEN RAISE EXCEPTION 'Supplier name phone and amount required'; END IF;
  SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=sh.account_id; IF amount>expected THEN RAISE EXCEPTION 'Insufficient drawer cash'; END IF;
  IF jsonb_typeof(coalesce(p_payload->'attachmentIds','[]'::jsonb)) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(p_payload->'attachmentIds','[]'::jsonb))>100 THEN RAISE EXCEPTION 'Invalid attachments'; END IF;
  SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO attachment_ids FROM jsonb_array_elements_text(coalesce(p_payload->'attachmentIds','[]'::jsonb));
  IF cardinality(attachment_ids)<>(SELECT count(DISTINCT x) FROM unnest(attachment_ids) x) THEN RAISE EXCEPTION 'Duplicate attachment'; END IF;
  PERFORM 1 FROM public.bf_shift_attachments at WHERE at.id=ANY(attachment_ids) AND at.cafe_id=p_cafe_id AND at.shift_id=sh.id AND at.uploader_id=auth.uid() AND at.uploaded AND at.document_id IS NULL FOR UPDATE; GET DIAGNOSTICS matched=ROW_COUNT;
  IF matched<>cardinality(attachment_ids) THEN RAISE EXCEPTION 'Attachment access denied' USING ERRCODE='42501'; END IF;
  SELECT bf_parties.id INTO pid FROM public.bf_parties WHERE cafe_id=p_cafe_id AND kind='supplier' AND phone=btrim(p_payload->>'supplierPhone') AND name=btrim(p_payload->>'supplierName') AND active ORDER BY id LIMIT 1;
  IF pid IS NULL THEN INSERT INTO public.bf_parties(cafe_id,kind,name,phone) VALUES(p_cafe_id,'supplier',btrim(p_payload->>'supplierName'),btrim(p_payload->>'supplierPhone')) RETURNING bf_parties.id INTO pid; END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,total,paid,note,created_by) VALUES(id,p_cafe_id,'settlement',pid,sh.id,sh.account_id,amount,amount,note,auth.uid()) RETURNING number INTO n;
  INSERT INTO public.bf_shift_supplier_payouts(document_id,cafe_id,shift_id,supplier_name,supplier_phone) VALUES(id,p_cafe_id,sh.id,btrim(p_payload->>'supplierName'),btrim(p_payload->>'supplierPhone'));
  PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'2000'),amount,0,pid); PERFORM brand_finance_private.line(p_cafe_id,id,sh.account_id,0,amount);
  UPDATE public.bf_shift_attachments SET document_id=id WHERE bf_shift_attachments.id=ANY(attachment_ids);
 ELSIF p_operation='shift_variance_settle' THEN
  IF r<>'owner' THEN RAISE EXCEPTION 'Finance owner required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.bf_shift_variances WHERE cafe_id=p_cafe_id AND bf_shift_variances.id=(p_payload->>'varianceId')::uuid FOR UPDATE;
  IF v.id IS NULL OR v.status<>'pending' OR coalesce(p_payload->>'resolution','') NOT IN('charge_employee','waive') OR length(btrim(note))=0 THEN RAISE EXCEPTION 'Pending variance and settlement reason required'; END IF;
  IF p_payload->>'resolution'='charge_employee' AND v.difference>=0 THEN RAISE EXCEPTION 'Only shortage may be charged to employee'; END IF;
  SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND bf_shifts.id=v.shift_id;
  IF p_payload->>'resolution'='charge_employee' THEN
   SELECT bf_parties.id INTO pid FROM public.bf_parties WHERE cafe_id=p_cafe_id AND employee_user_id=sh.user_id;
   IF pid IS NULL THEN INSERT INTO public.bf_parties(cafe_id,kind,name,phone,employee_user_id) SELECT p_cafe_id,'employee',coalesce((SELECT name FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=sh.user_id),'Employee'),'',sh.user_id RETURNING bf_parties.id INTO pid; END IF;
   aid:=brand_finance_private.account(p_cafe_id,'1030');
  ELSE aid:=brand_finance_private.account(p_cafe_id,'5100'); END IF;
  INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,total,note,created_by) VALUES(id,p_cafe_id,'journal',pid,sh.id,abs(v.difference),note,auth.uid()) RETURNING number INTO n;
  PERFORM brand_finance_private.line(p_cafe_id,id,aid,greatest(-v.difference,0),greatest(v.difference,0),pid); PERFORM brand_finance_private.line(p_cafe_id,id,brand_finance_private.account(p_cafe_id,'5300'),greatest(v.difference,0),greatest(-v.difference,0));
  UPDATE public.bf_shift_variances SET status=p_payload->>'resolution',settled_by=auth.uid(),settled_at=now(),settlement_note=note,settlement_document_id=id WHERE bf_shift_variances.id=v.id;
 END IF;
 result:=jsonb_build_object('id',id,'number',n); INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,p_operation,p_payload,result,auth.uid()); RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brand_finance_private FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.shift_summary(p_cafe uuid,p_shift uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
 'cash_sales',coalesce(sum(j.debit) FILTER(WHERE d.kind='sale' AND a.kind='cash'),0),
 'pos_sales',coalesce(sum(j.debit) FILTER(WHERE d.kind='sale' AND a.kind='pos'),0),
 'bank_sales',coalesce(sum(j.debit) FILTER(WHERE d.kind='sale' AND a.kind='bank'),0),
 'cash_refunds',coalesce(sum(j.credit) FILTER(WHERE d.kind='refund' AND a.kind='cash'),0),
 'pos_refunds',coalesce(sum(j.credit) FILTER(WHERE d.kind='refund' AND a.kind='pos'),0),
 'bank_refunds',coalesce(sum(j.credit) FILTER(WHERE d.kind='refund' AND a.kind='bank'),0),
 'supplier_payouts',coalesce((SELECT sum(d2.paid) FROM public.bf_shift_supplier_payouts sp JOIN public.bf_documents d2 ON d2.id=sp.document_id WHERE sp.cafe_id=p_cafe AND sp.shift_id=p_shift),0),
 'invoice_count',(SELECT count(*) FROM public.bf_documents WHERE cafe_id=p_cafe AND shift_id=p_shift AND kind='sale'),
 'item_quantity',coalesce((SELECT sum(l.quantity*CASE WHEN d2.kind='refund' THEN -1 ELSE 1 END) FROM public.bf_documents d2 JOIN public.bf_document_lines l ON l.document_id=d2.id WHERE d2.cafe_id=p_cafe AND d2.shift_id=p_shift AND d2.kind IN('sale','refund')),0))
 FROM public.bf_documents d LEFT JOIN public.bf_journal j ON j.document_id=d.id LEFT JOIN public.bf_accounts a ON a.id=j.account_id WHERE d.cafe_id=p_cafe AND d.shift_id=p_shift
$$;
CREATE FUNCTION brand_finance_private.shift_record(p_cafe uuid,p_shift uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (to_jsonb(s)-'cafe_id')||brand_finance_private.shift_summary(p_cafe,p_shift)||jsonb_build_object(
 'employee_name',coalesce((SELECT name FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=s.user_id),(SELECT full_name FROM public.profiles WHERE id=s.user_id),'Employee'),
 'expected_cash',CASE WHEN s.status IN('closed','handover') THEN s.expected_cash ELSE coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe AND account_id=s.account_id),0) END,
 'pending_variance',coalesce((SELECT sum(abs(difference)) FROM public.bf_shift_variances WHERE cafe_id=p_cafe AND shift_id=s.id AND status='pending'),0))
 FROM public.bf_shifts s WHERE s.cafe_id=p_cafe AND s.id=p_shift
$$;
CREATE FUNCTION public.brand_finance_shift_detail(p_cafe_id uuid,p_shift_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; sh public.bf_shifts%ROWTYPE; managed boolean;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id); managed:=r IN('owner','manager');
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=p_shift_id;
 IF sh.id IS NULL OR (NOT managed AND sh.user_id<>auth.uid()) THEN RAISE EXCEPTION 'Shift access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('shift',brand_finance_private.shift_record(p_cafe_id,p_shift_id),'summary',brand_finance_private.shift_summary(p_cafe_id,p_shift_id),
 'payouts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'number',d.number,'supplier_name',sp.supplier_name,'supplier_phone',sp.supplier_phone,'amount',d.total,'paid',d.paid,'kind',d.kind,'tax',d.tax,'vat_rate',d.vat_rate,'tax_inclusive',d.tax_inclusive,'payment',CASE WHEN d.paid>0 THEN 'cash' ELSE 'credit' END,'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity,'unit_price',l.unit_price,'net',l.net,'tax',l.tax)) FROM public.bf_document_lines l WHERE l.document_id=d.id),'[]'::jsonb),'note',d.note,'created_at',d.created_at,'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',at.id,'original_name',at.original_name,'content_type',at.content_type,'size_bytes',at.size_bytes)) FROM public.bf_shift_attachments at WHERE at.document_id=d.id AND at.cafe_id=p_cafe_id AND at.uploaded),'[]'::jsonb)) ORDER BY d.created_at,d.id) FROM public.bf_shift_supplier_payouts sp JOIN public.bf_documents d ON d.id=sp.document_id WHERE sp.cafe_id=p_cafe_id AND sp.shift_id=p_shift_id),'[]'::jsonb),
 'sales',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'number',d.number,'kind',d.kind,'total',d.total,'tax',d.tax,'created_at',d.created_at,'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity,'unit_price',l.unit_price,'net',l.net,'tax',l.tax)) FROM public.bf_document_lines l WHERE l.document_id=d.id),'[]'::jsonb)) ORDER BY d.created_at,d.id) FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.shift_id=p_shift_id AND d.kind IN('sale','refund')),'[]'::jsonb),
 'products',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.quantity DESC,x.name) FROM (
 SELECT l.product_id,max(l.name) name,sum(l.quantity*CASE WHEN d.kind='refund' THEN -1 ELSE 1 END) quantity,
 round(sum(l.unit_price*l.quantity)/nullif(sum(l.quantity),0),2) unit_price,
 sum(l.net*CASE WHEN d.kind='refund' THEN -1 ELSE 1 END) net,sum(l.tax*CASE WHEN d.kind='refund' THEN -1 ELSE 1 END) tax,
 managed AND bool_and(l.item_id IS NOT NULL) cost_known,
 CASE WHEN managed AND bool_and(l.item_id IS NOT NULL) THEN sum(l.cost*CASE WHEN d.kind='refund' THEN -1 ELSE 1 END) END cost,
 CASE WHEN managed AND bool_and(l.item_id IS NOT NULL) THEN sum((l.net-l.cost)*CASE WHEN d.kind='refund' THEN -1 ELSE 1 END) END profit
 FROM public.bf_documents d JOIN public.bf_document_lines l ON l.document_id=d.id WHERE d.cafe_id=p_cafe_id AND d.shift_id=p_shift_id AND d.kind IN('sale','refund') GROUP BY l.product_id) x),'[]'::jsonb),
 'unsoldProducts',coalesce((SELECT jsonb_agg(jsonb_build_object('product_id',m.product_id,'name',m.name,'unit_price',m.unit_price) ORDER BY m.name) FROM public.bf_shift_menu_snapshot m WHERE m.cafe_id=p_cafe_id AND m.shift_id=p_shift_id AND NOT EXISTS(SELECT 1 FROM public.bf_document_lines l JOIN public.bf_documents d ON d.id=l.document_id WHERE d.cafe_id=p_cafe_id AND d.shift_id=p_shift_id AND d.kind='sale' AND l.product_id=m.product_id)),'[]'::jsonb),
 'variances',coalesce((SELECT jsonb_agg(to_jsonb(v)-'cafe_id'-'settled_by' ORDER BY v.phase) FROM public.bf_shift_variances v WHERE v.cafe_id=p_cafe_id AND v.shift_id=p_shift_id),'[]'::jsonb));
END $$;
ALTER FUNCTION public.brand_finance_snapshot(uuid) SET SCHEMA brand_finance_private;
ALTER FUNCTION brand_finance_private.brand_finance_snapshot(uuid) RENAME TO snapshot_before_shifts;
REVOKE ALL ON FUNCTION brand_finance_private.snapshot_before_shifts(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE answer jsonb; r text; initialized boolean;
BEGIN
 answer:=brand_finance_private.snapshot_before_shifts(p_cafe_id); r:=answer->>'role';
 IF r='cashier' THEN answer:=jsonb_set(answer,'{parties}',(answer->'parties')||coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'kind',p.kind,'phone',p.phone,'tax_number',p.tax_number,'active',p.active,'balance',0,'email','','details',jsonb_build_object('commercialRegistration',coalesce(p.details->>'commercialRegistration','')))) FROM public.bf_parties p WHERE p.cafe_id=p_cafe_id AND p.kind='supplier' AND p.active),'[]'::jsonb)); END IF;
 SELECT initialized_at IS NOT NULL INTO initialized FROM public.bf_settings WHERE cafe_id=p_cafe_id;
 RETURN answer||jsonb_build_object('initialized',initialized,'canInitialize',NOT initialized AND (r='owner' OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active')),
 'drawerAvailability',coalesce((SELECT jsonb_agg(jsonb_build_object('account_id',a.id,'balance',coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=a.id),0),'busy',EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND account_id=a.id AND status IN('open','handover')),'own_shift_id',(SELECT id FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND account_id=a.id AND user_id=auth.uid() AND status IN('open','handover')))) FROM public.bf_accounts a WHERE cafe_id=p_cafe_id AND kind='cash' AND active),'[]'::jsonb),
 'shifts',coalesce((SELECT jsonb_agg(brand_finance_private.shift_record(p_cafe_id,s.id) ORDER BY s.opened_at DESC) FROM (SELECT * FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND (r IN('owner','manager') OR user_id=auth.uid() OR handover_to=auth.uid()) ORDER BY opened_at DESC LIMIT 200) s),'[]'::jsonb));
END $$;

-- Service execution is additionally gated by the signed active maintenance session in the application.
-- Immutable correcting entries retain the complete accounting audit trail.
CREATE FUNCTION public.brand_finance_reset_liquid_balances(p_cafe_id uuid,p_actor_id uuid,p_reason text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.bf_requests%ROWTYPE; a record; amount numeric; d uuid:=gen_random_uuid(); result jsonb; payload jsonb:=jsonb_build_object('reason',p_reason); n bigint;
BEGIN
 IF p_actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role='platform_admin' AND status='active') OR p_request_id IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Active maintenance administrator and reason required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL AND status IN('active','published')) THEN RAISE EXCEPTION 'Brand unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO old FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF old.operation<>'reset_liquid_balances' OR old.payload<>payload OR old.created_by<>p_actor_id THEN RAISE EXCEPTION 'Request identifier conflict'; END IF; RETURN old.result||'{"duplicate":true}'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND status IN('open','handover')) OR EXISTS(SELECT 1 FROM public.bf_refund_requests WHERE cafe_id=p_cafe_id AND status='pending') OR EXISTS(SELECT 1 FROM public.bf_shift_variances WHERE cafe_id=p_cafe_id AND status='pending') THEN RAISE EXCEPTION 'Resolve live shifts refunds and variances before reset'; END IF;
 PERFORM brand_finance_private.seed(p_cafe_id);
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=current_date) THEN RAISE EXCEPTION 'Accounting period closed'; END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,note,created_by) VALUES(d,p_cafe_id,'journal',p_reason,p_actor_id) RETURNING number INTO n;
 FOR a IN SELECT id FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND kind IN('cash','bank','pos') LOOP
  SELECT coalesce(sum(debit-credit),0) INTO amount FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=a.id;
  PERFORM brand_finance_private.line(p_cafe_id,d,a.id,greatest(-amount,0),greatest(amount,0)); PERFORM brand_finance_private.line(p_cafe_id,d,brand_finance_private.account(p_cafe_id,'3000'),greatest(amount,0),greatest(-amount,0));
 END LOOP;
 UPDATE public.bf_settings SET initialized_at=NULL,initialized_by=NULL WHERE cafe_id=p_cafe_id;
 result:=jsonb_build_object('id',d,'number',n); INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'reset_liquid_balances',payload,result,p_actor_id); RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_reset_liquid_balances(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_reset_liquid_balances(uuid,uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.brand_finance_snapshot(uuid),public.brand_finance_shift_detail(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_snapshot(uuid),public.brand_finance_shift_detail(uuid,uuid) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brand_finance_private FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION brand_finance_private.post_shift_purchase(p_cafe uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_variable
DECLARE sh public.bf_shifts%ROWTYPE; party public.bf_parties%ROWTYPE; item public.bf_items%ROWTYPE; doc uuid:=gen_random_uuid(); n bigint; wid uuid; ent jsonb; lines jsonb:='[]'; aid uuid; ids uuid[]; matched integer; qty numeric; price numeric; subtotal numeric:=0; tax numeric; total numeric; paid numeric; net numeric; ln numeric; lt numeric; remaining numeric; tax_left numeric; cost numeric; pos integer:=0; rate numeric:=coalesce((p->>'vatRate')::numeric,15); inclusive boolean:=coalesce((p->>'taxInclusive')::boolean,true); expected numeric;
BEGIN
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe AND id=(p->>'shiftId')::uuid AND user_id=auth.uid() AND status='open' FOR UPDATE;
 IF sh.id IS NULL THEN RAISE EXCEPTION 'Own open shift required' USING ERRCODE='42501'; END IF;
 IF coalesce(p->>'payment','') NOT IN('cash','credit') OR rate<0 OR rate>100 OR rate<>round(rate,2) THEN RAISE EXCEPTION 'Invalid purchase payment or tax'; END IF;
 wid:=(p->>'warehouseId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.bf_warehouses WHERE cafe_id=p_cafe AND id=wid AND active) THEN RAISE EXCEPTION 'Purchase warehouse required'; END IF;
 IF nullif(p->>'supplierId','') IS NOT NULL THEN
  SELECT * INTO party FROM public.bf_parties WHERE cafe_id=p_cafe AND id=(p->>'supplierId')::uuid AND kind='supplier' AND active;
  IF party.id IS NULL THEN RAISE EXCEPTION 'Supplier unavailable'; END IF;
 ELSE
  ent:=p->'supplier';
  IF jsonb_typeof(ent) IS DISTINCT FROM 'object' OR length(btrim(coalesce(ent->>'name',''))) NOT BETWEEN 1 AND 150 OR length(coalesce(ent->>'phone',''))>30 OR length(coalesce(ent->>'taxNumber',''))>30 OR length(coalesce(ent->>'commercialRegistration',''))>250 THEN RAISE EXCEPTION 'Invalid supplier'; END IF;
  INSERT INTO public.bf_parties(cafe_id,kind,name,phone,tax_number,details) VALUES(p_cafe,'supplier',btrim(ent->>'name'),btrim(coalesce(ent->>'phone','')),btrim(coalesce(ent->>'taxNumber','')),jsonb_build_object('commercialRegistration',coalesce(ent->>'commercialRegistration',''))) RETURNING * INTO party;
 END IF;
 IF jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Purchase items required'; END IF;
 FOR ent IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
  qty:=(ent->>'quantity')::numeric; price:=(ent->>'unitPrice')::numeric;
  IF qty IS NULL OR qty<=0 OR qty>1000000 OR qty<>round(qty,3) OR price IS NULL OR price<0 OR price>10000000 OR price<>round(price,2) THEN RAISE EXCEPTION 'Invalid purchase quantity or unit cost'; END IF;
  IF nullif(ent->>'itemId','') IS NOT NULL THEN
   SELECT * INTO item FROM public.bf_items WHERE cafe_id=p_cafe AND id=(ent->>'itemId')::uuid AND active;
   IF item.id IS NULL THEN RAISE EXCEPTION 'Purchase item unavailable'; END IF;
  ELSE
   IF jsonb_typeof(ent->'newItem') IS DISTINCT FROM 'object' OR length(btrim(coalesce(ent#>>'{newItem,name}',''))) NOT BETWEEN 1 AND 150 OR length(btrim(coalesce(ent#>>'{newItem,sku}',''))) NOT BETWEEN 1 AND 60 OR length(coalesce(ent#>>'{newItem,barcode}',''))>100 THEN RAISE EXCEPTION 'Invalid new stock item'; END IF;
   INSERT INTO public.bf_items(cafe_id,name,sku,barcode) VALUES(p_cafe,btrim(ent#>>'{newItem,name}'),btrim(ent#>>'{newItem,sku}'),nullif(btrim(ent#>>'{newItem,barcode}'),'')) RETURNING * INTO item;
  END IF;
  subtotal:=subtotal+round(qty*price,2); lines:=lines||jsonb_build_array(jsonb_build_object('itemId',item.id,'name',item.name,'quantity',qty,'unitPrice',price,'lineSubtotal',round(qty*price,2)));
 END LOOP;
 tax:=CASE WHEN inclusive THEN round(subtotal-subtotal/(1+rate/100),2) ELSE round(subtotal*rate/100,2) END; total:=CASE WHEN inclusive THEN subtotal ELSE subtotal+tax END; net:=total-tax;
 IF total<=0 THEN RAISE EXCEPTION 'Positive purchase total required'; END IF;
 IF p ? 'expectedTotal' AND (p->>'expectedTotal')::numeric IS DISTINCT FROM total THEN RAISE EXCEPTION 'Purchase total changed'; END IF;
 paid:=CASE WHEN p->>'payment'='cash' THEN total ELSE 0 END; aid:=CASE WHEN paid>0 THEN sh.account_id ELSE NULL END;
 SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=p_cafe AND account_id=sh.account_id;
 IF paid>expected THEN RAISE EXCEPTION 'Insufficient drawer cash'; END IF;
 IF jsonb_typeof(coalesce(p->'attachmentIds','[]'::jsonb)) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(p->'attachmentIds','[]'::jsonb))>100 THEN RAISE EXCEPTION 'Invalid attachments'; END IF;
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(p->'attachmentIds','[]'::jsonb));
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Duplicate attachment'; END IF;
 PERFORM 1 FROM public.bf_shift_attachments WHERE id=ANY(ids) AND cafe_id=p_cafe AND shift_id=sh.id AND uploader_id=auth.uid() AND uploaded AND document_id IS NULL FOR UPDATE; GET DIAGNOSTICS matched=ROW_COUNT;
 IF matched<>cardinality(ids) THEN RAISE EXCEPTION 'Attachment access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,warehouse_id,subtotal,tax,total,paid,note,created_by,vat_rate,tax_inclusive) VALUES(doc,p_cafe,'purchase',party.id,sh.id,aid,wid,subtotal,tax,total,paid,coalesce(p->>'note',''),auth.uid(),rate,inclusive) RETURNING number INTO n;
 remaining:=net; tax_left:=tax;
 FOR ent IN SELECT value FROM jsonb_array_elements(lines) LOOP
  pos:=pos+1; qty:=(ent->>'quantity')::numeric;
  ln:=least(remaining,round(net*(ent->>'lineSubtotal')::numeric/subtotal,2)); lt:=least(tax_left,round(tax*(ent->>'lineSubtotal')::numeric/subtotal,2)); remaining:=remaining-ln; tax_left:=tax_left-lt;
  IF pos=jsonb_array_length(lines) THEN ln:=ln+remaining; lt:=lt+tax_left; END IF;
  cost:=brand_finance_private.stock_move(p_cafe,doc,(ent->>'itemId')::uuid,wid,qty,ln/qty);
  INSERT INTO public.bf_document_lines(cafe_id,document_id,item_id,name,quantity,unit_price,net,tax,cost) VALUES(p_cafe,doc,(ent->>'itemId')::uuid,ent->>'name',qty,(ent->>'unitPrice')::numeric,ln,lt,cost);
 END LOOP;
 PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'1200'),net,0); PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'1300'),tax,0);
 PERFORM brand_finance_private.line(p_cafe,doc,aid,0,paid); PERFORM brand_finance_private.line(p_cafe,doc,brand_finance_private.account(p_cafe,'2000'),0,total-paid,party.id);
 INSERT INTO public.bf_shift_supplier_payouts(document_id,cafe_id,shift_id,supplier_name,supplier_phone) VALUES(doc,p_cafe,sh.id,party.name,party.phone);
 UPDATE public.bf_shift_attachments SET document_id=doc WHERE id=ANY(ids);
 RETURN jsonb_build_object('id',doc,'number',n);
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.post_shift_purchase(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
