BEGIN;
-- Forward-only feature activation; no historical financial data is rewritten.
-- CLI-created version advanced to follow the existing POS report dependency.
CREATE TABLE public.bf_shift_supplier_payouts (
 document_id uuid PRIMARY KEY,cafe_id uuid NOT NULL,shift_id uuid NOT NULL,
 supplier_name text NOT NULL CHECK(length(supplier_name) BETWEEN 1 AND 150),
 supplier_phone text NOT NULL CHECK(length(supplier_phone) BETWEEN 5 AND 30),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id)
);
CREATE INDEX bf_shift_supplier_payouts_shift ON public.bf_shift_supplier_payouts(cafe_id,shift_id);
ALTER TABLE public.bf_shift_supplier_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_shift_supplier_payouts FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_shift_supplier_payouts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) SET SCHEMA brand_finance_private;
ALTER FUNCTION brand_finance_private.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_supplier_payout;
REVOKE ALL ON FUNCTION brand_finance_private.execute_before_supplier_payout(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sh public.bf_shifts%ROWTYPE; prior public.bf_requests%ROWTYPE; cfg public.bf_settings%ROWTYPE;
 amount numeric; available numeric; supplier_name text; supplier_phone text; note text; party uuid;
 doc uuid:=gen_random_uuid(); num bigint; ids uuid[]; matched integer; result jsonb;
BEGIN
 IF p_operation IS DISTINCT FROM 'supplier_payout' THEN RETURN brand_finance_private.execute_before_supplier_payout(p_cafe_id,p_operation,p_payload,p_request_id); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 PERFORM brand_finance_private.role_for(p_cafe_id);
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 THEN RAISE EXCEPTION 'بيانات السداد غير صالحة'; END IF;
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.operation<>p_operation OR prior.payload IS DISTINCT FROM p_payload OR prior.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى'; END IF;
  RETURN prior.result||'{"duplicate":true}'::jsonb;
 END IF;
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=(p_payload->>'shiftId')::uuid AND user_id=auth.uid() AND status='open' FOR UPDATE;
 IF sh.id IS NULL THEN RAISE EXCEPTION 'السداد متاح من ورديتك المفتوحة فقط حدث الصفحة وتحقق من الوردية' USING ERRCODE='42501'; END IF;
 IF sh.supervisor_paused THEN RAISE EXCEPTION 'الوردية موقوفة إداريًا لا يمكن الصرف حتى استئنافها'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=sh.account_id AND kind='cash' AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'صندوق الوردية غير متاح للسداد'; END IF;
 SELECT * INTO STRICT cfg FROM public.bf_settings WHERE cafe_id=p_cafe_id FOR UPDATE;
 IF cfg.closed_through IS NOT NULL AND (now() AT TIME ZONE 'Asia/Riyadh')::date<=cfg.closed_through THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 supplier_name:=btrim(coalesce(p_payload->>'supplierName','')); supplier_phone:=btrim(coalesce(p_payload->>'supplierPhone','')); note:=btrim(coalesce(p_payload->>'note',''));
 IF jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'أدخل مبلغًا صحيحًا للسداد'; END IF;
 amount:=(p_payload->>'amount')::numeric;
 IF amount<=0 OR amount>999999999 OR amount<>round(amount,2) OR length(supplier_name) NOT BETWEEN 1 AND 150 OR length(supplier_phone) NOT BETWEEN 5 AND 30 OR length(note)>500 THEN RAISE EXCEPTION 'راجع اسم المورد ورقم جواله ومبلغ السداد والبيان'; END IF;
 SELECT coalesce(sum(debit-credit),0) INTO available FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=sh.account_id;
 IF amount>available THEN RAISE EXCEPTION 'رصيد صندوق الوردية لا يكفي لهذا السداد'; END IF;
 IF jsonb_typeof(coalesce(p_payload->'attachmentIds','[]'::jsonb)) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(p_payload->'attachmentIds','[]'::jsonb))>100 THEN RAISE EXCEPTION 'مرفقات السداد غير صالحة'; END IF;
 SELECT coalesce(array_agg(value::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(p_payload->'attachmentIds','[]'::jsonb));
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'المرفق مكرر في السداد'; END IF;
 PERFORM 1 FROM public.bf_shift_attachments WHERE id=ANY(ids) AND cafe_id=p_cafe_id AND shift_id=sh.id AND uploader_id=auth.uid() AND uploaded AND document_id IS NULL ORDER BY id FOR UPDATE;
 GET DIAGNOSTICS matched=ROW_COUNT;
 IF matched<>cardinality(ids) THEN RAISE EXCEPTION 'أكمل رفع المرفقات وتأكد أنها تخص ورديتك' USING ERRCODE='42501'; END IF;
 SELECT id INTO party FROM public.bf_parties WHERE cafe_id=p_cafe_id AND kind='supplier' AND name=supplier_name AND phone=supplier_phone AND active ORDER BY id LIMIT 1;
 IF party IS NULL THEN INSERT INTO public.bf_parties(cafe_id,kind,name,phone) VALUES(p_cafe_id,'supplier',supplier_name,supplier_phone) RETURNING id INTO party; END IF;
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,account_id,total,paid,note,created_by)
 VALUES(doc,p_cafe_id,'settlement',party,sh.id,sh.account_id,amount,amount,note,auth.uid()) RETURNING number INTO num;
 INSERT INTO public.bf_shift_supplier_payouts VALUES(doc,p_cafe_id,sh.id,supplier_name,supplier_phone);
 PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'2000'),amount,0,party);
 PERFORM brand_finance_private.line(p_cafe_id,doc,sh.account_id,0,amount);
 UPDATE public.bf_shift_attachments SET document_id=doc WHERE id=ANY(ids);
 result:=jsonb_build_object('id',doc,'number',num,'status','posted');
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,p_operation,p_payload,result,auth.uid());
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,after_data) VALUES(p_cafe_id,auth.uid(),'supplier_payout',doc,jsonb_build_object('shiftId',sh.id,'accountId',sh.account_id,'amount',amount,'supplierName',supplier_name));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) TO authenticated;

ALTER FUNCTION public.brand_finance_pos_shift_report(uuid,uuid) SET SCHEMA brand_finance_private;
ALTER FUNCTION brand_finance_private.brand_finance_pos_shift_report(uuid,uuid) RENAME TO pos_report_before_supplier_payout;
REVOKE ALL ON FUNCTION brand_finance_private.pos_report_before_supplier_payout(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_pos_shift_report(p_cafe_id uuid,p_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; payouts jsonb; total numeric;
BEGIN
 result:=brand_finance_private.pos_report_before_supplier_payout(p_cafe_id,p_shift_id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'number',d.number,'supplierName',p.supplier_name,'amount',d.paid,'note',d.note,'createdAt',d.created_at,
  'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.original_name) ORDER BY a.created_at,a.id) FROM public.bf_shift_attachments a WHERE a.cafe_id=p_cafe_id AND a.document_id=d.id AND a.uploaded),'[]'::jsonb)) ORDER BY d.created_at,d.id),'[]'::jsonb),coalesce(sum(d.paid),0)
 INTO payouts,total FROM public.bf_shift_supplier_payouts p JOIN public.bf_documents d ON d.cafe_id=p.cafe_id AND d.id=p.document_id WHERE p.cafe_id=p_cafe_id AND p.shift_id=p_shift_id;
 RETURN result||jsonb_build_object('supplierPayoutTotal',total,'supplierPayouts',payouts);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_pos_shift_report(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_pos_shift_report(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
