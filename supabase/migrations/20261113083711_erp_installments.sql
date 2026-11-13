BEGIN;
CREATE SCHEMA erp_installment_private;
REVOKE ALL ON SCHEMA erp_installment_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.erp_installment_requests(cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
ALTER TABLE public.erp_installment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_installment_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX erp_installment_agreement_lookup ON public.bf_invoice_management(cafe_id,document_id) WHERE jsonb_typeof(metadata->'schedule')='object';
-- Allocation is derived from the financial ledger; no parallel paid balance is stored.
CREATE FUNCTION erp_installment_private.rows(p_total numeric,p_outstanding numeric,p_refunded numeric,p_schedule jsonb)
RETURNS TABLE(number integer,date date,amount numeric,paid numeric,cancelled numeric,remaining numeric,status text) LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE step numeric;count_rows integer;anchor date;frequency text;payable numeric;collected numeric;offset_amount numeric;due numeric;idx integer;months integer;
BEGIN
 IF jsonb_typeof(p_schedule) IS DISTINCT FROM 'object' THEN RETURN;END IF;
 step:=(p_schedule->>'amount')::numeric;anchor:=(p_schedule->>'start')::date;frequency:=p_schedule->>'frequency';
 IF step IS NULL OR step<.01 OR step<>round(step,2) OR step>p_total OR p_total<=0 OR ceil(p_total/step)>600 OR NOT isfinite(anchor) THEN RAISE EXCEPTION 'جدول الأقساط غير صالح' USING ERRCODE='22023';END IF;
 count_rows:=ceil(p_total/step);payable:=greatest(p_total-least(p_total,greatest(coalesce(p_refunded,0),0)),0);collected:=least(payable,greatest(payable-p_outstanding,0));
 months:=CASE frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'half_yearly' THEN 6 WHEN 'yearly' THEN 12 END;
 IF months IS NULL AND frequency NOT IN('weekly','fortnightly') THEN RAISE EXCEPTION 'فترة التقسيط غير صالحة' USING ERRCODE='22023';END IF;
 FOR idx IN 0..count_rows-1 LOOP
  number:=idx+1;date:=CASE WHEN months IS NULL THEN anchor+idx*CASE WHEN frequency='weekly' THEN 7 ELSE 14 END ELSE (anchor+make_interval(months=>months*idx))::date END;
  IF date>'9999-12-31'::date THEN RAISE EXCEPTION 'تاريخ الأقساط خارج النطاق المسموح' USING ERRCODE='22023';END IF;
  offset_amount:=idx*step;amount:=least(step,p_total-offset_amount);due:=greatest(least(amount,payable-offset_amount),0);paid:=greatest(least(due,collected-offset_amount),0);cancelled:=amount-due;remaining:=due-paid;
  status:=CASE WHEN due=0 THEN 'cancelled' WHEN remaining=0 THEN 'paid' WHEN date<(now() AT TIME ZONE 'Asia/Riyadh')::date THEN 'overdue' WHEN paid>0 THEN 'partial' ELSE 'unpaid' END;RETURN NEXT;
 END LOOP;
END $$;
CREATE FUNCTION erp_installment_private.agreement(p_cafe uuid,p_document uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE d public.bf_documents;state jsonb;schedule jsonb;rows jsonb;outstanding numeric;credit numeric;next_due date;has_overdue boolean;status text;
BEGIN
 SELECT * INTO d FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_document AND kind='sale';IF NOT FOUND THEN RETURN NULL;END IF;
 state:=brand_finance_private.document_state(p_cafe,p_document);outstanding:=(state->>'outstanding')::numeric;credit:=coalesce((state->>'refunded_total')::numeric,0);
 SELECT metadata->'schedule' INTO schedule FROM public.bf_invoice_management WHERE cafe_id=p_cafe AND document_id=p_document;
 SELECT min(r.date) FILTER(WHERE r.remaining>0),bool_or(r.status='overdue') INTO next_due,has_overdue FROM erp_installment_private.rows(d.total,outstanding,credit,schedule) r;
 status:=CASE WHEN credit>=d.total THEN 'cancelled' WHEN outstanding<=0 THEN 'paid' WHEN has_overdue THEN 'overdue' WHEN outstanding<greatest(d.total-credit,0) THEN 'partial' ELSE 'unpaid' END;
 RETURN jsonb_build_object('id',d.id,'number',d.number,'invoiceNumber',coalesce(state->>'display_number',d.number::text),'customerId',d.party_id,'customerName',(SELECT name FROM public.bf_parties WHERE cafe_id=p_cafe AND id=d.party_id),'total',d.total,'outstanding',outstanding,'refundedTotal',credit,'refunded',coalesce((state->>'refunded')::boolean,false),'paid',greatest(d.total-credit-outstanding,0),'createdAt',d.created_at,'schedule',schedule,'nextDue',next_due,'status',status,'row',NULL);
END $$;
CREATE FUNCTION public.erp_installments_read(p_cafe_id uuid,p_filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;mode text:=coalesce(p_filters->>'mode','agreements');q text:=lower(btrim(coalesce(p_filters->>'query','')));status_filter text:=coalesce(p_filters->>'status','all');ordering text:=coalesce(p_filters->>'sort','newest');off integer:=coalesce((p_filters->>'offset')::integer,0);lim integer:=coalesce((p_filters->>'limit')::integer,30);date_from date:=nullif(p_filters->>'from','')::date;date_to date:=nullif(p_filters->>'to','')::date;items jsonb;cnt bigint;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية عرض الأقساط' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text)>3000 OR length(q)>100 OR mode NOT IN('agreements','installments','invoices') OR status_filter NOT IN('all','unpaid','partial','paid','overdue','cancelled') OR ordering NOT IN('newest','oldest','due','amount') OR off NOT BETWEEN 0 AND 100000 OR lim NOT BETWEEN 1 AND 100 OR date_from>date_to THEN RAISE EXCEPTION 'راجع خيارات البحث' USING ERRCODE='22023';END IF;
 WITH candidates AS MATERIALIZED(
 SELECT d.id FROM public.bf_documents d JOIN public.bf_parties c ON c.cafe_id=d.cafe_id AND c.id=d.party_id LEFT JOIN public.bf_invoice_management m ON m.cafe_id=d.cafe_id AND m.document_id=d.id LEFT JOIN public.bf_invoice_extensions e ON e.cafe_id=d.cafe_id AND e.document_id=d.id
 WHERE d.cafe_id=p_cafe_id AND d.kind='sale' AND (mode='invoices' OR jsonb_typeof(m.metadata->'schedule')='object') AND (q='' OR position(q IN lower(c.name||' '||d.number::text||' '||coalesce(e.display_number,'')))>0)
 ),agreements AS MATERIALIZED(SELECT erp_installment_private.agreement(p_cafe_id,id) item FROM candidates),expanded AS(
 SELECT a.item||jsonb_build_object('row',to_jsonb(t)) item FROM agreements a CROSS JOIN LATERAL erp_installment_private.rows((a.item->>'total')::numeric,(a.item->>'outstanding')::numeric,(a.item->>'refundedTotal')::numeric,a.item->'schedule') t WHERE mode='installments'
 UNION ALL SELECT a.item FROM agreements a WHERE mode<>'installments'
 ),matching AS MATERIALIZED(SELECT item FROM expanded WHERE (status_filter='all' OR CASE WHEN mode='installments' THEN item#>>'{row,status}' ELSE item->>'status' END=status_filter) AND (date_from IS NULL OR coalesce((item#>>'{row,date}')::date,(item->>'nextDue')::date,(item#>>'{schedule,start}')::date)>=date_from) AND (date_to IS NULL OR coalesce((item#>>'{row,date}')::date,(item->>'nextDue')::date,(item#>>'{schedule,start}')::date)<=date_to)),page AS(
 SELECT item,row_number() OVER(ORDER BY CASE WHEN ordering='due' THEN coalesce(item#>>'{row,date}',item->>'nextDue') END ASC NULLS LAST,CASE WHEN ordering='amount' THEN coalesce((item#>>'{row,remaining}')::numeric,(item->>'outstanding')::numeric) END DESC,CASE WHEN ordering='oldest' THEN item->>'createdAt' END ASC,CASE WHEN ordering<>'oldest' THEN item->>'createdAt' END DESC,item->>'id',item#>>'{row,number}') ordinal FROM matching
 ORDER BY ordinal LIMIT lim OFFSET off)
 SELECT (SELECT count(*) FROM matching),coalesce((SELECT jsonb_agg(item ORDER BY ordinal) FROM page),'[]') INTO cnt,items;
 RETURN jsonb_build_object('items',items,'total',cnt,'canWrite',r IN('owner','manager','accountant'),'actorId',auth.uid(),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind) ORDER BY name) FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND active AND deleted_at IS NULL AND NOT frozen AND NOT is_group AND NOT is_cashier_drawer AND kind IN('cash','bank','pos')),'[]'),
 'collectors',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM (SELECT p.id,coalesce(nullif(p.full_name,''),'مالك العلامة') name FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active' WHERE c.id=p_cafe_id UNION SELECT s.user_id,coalesce(nullif(s.name,''),p.full_name) FROM public.bf_staff s JOIN public.profiles p ON p.id=s.user_id AND p.status='active' WHERE s.cafe_id=p_cafe_id AND s.active AND s.role IN('manager','accountant','cashier')) users),'[]'));
END $$;
CREATE FUNCTION public.erp_installments_write(p_cafe_id uuid,p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;previous public.erp_installment_requests;d public.bf_documents;old_schedule jsonb;state jsonb;result jsonb;payment jsonb;part record;amount numeric;account public.bf_accounts;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل الأقساط' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>250000 THEN RAISE EXCEPTION 'طلب غير صالح' USING ERRCODE='22023';END IF;
 -- Same lock and ordering as all financial postings and payment corrections.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO previous FROM public.erp_installment_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF previous.actor<>auth.uid() OR previous.action IS DISTINCT FROM p_action OR previous.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'معرف الطلب مستخدم لتغيير آخر' USING ERRCODE='40001';END IF;RETURN previous.result;END IF;
 IF p_action IN('schedule','collect') THEN
  SELECT * INTO d FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=(p_payload->>'documentId')::uuid AND kind='sale' FOR UPDATE;
  IF NOT FOUND OR d.party_id IS NULL THEN RAISE EXCEPTION 'اختر فاتورة مرتبطة بعميل في هذه العلامة' USING ERRCODE='42501';END IF;
  SELECT metadata->'schedule' INTO old_schedule FROM public.bf_invoice_management WHERE cafe_id=p_cafe_id AND document_id=d.id;
  IF coalesce(old_schedule,'null') IS DISTINCT FROM p_payload->'expectedSchedule' THEN RAISE EXCEPTION 'تغيرت اتفاقية التقسيط' USING ERRCODE='40001';END IF;
  IF p_action='schedule' THEN
   IF NOT p_payload?'schedule' THEN RAISE EXCEPTION 'أرسل جدول الأقساط أو طلب إزالته صراحة' USING ERRCODE='22023';END IF;
   -- Existing sales management validates and persists the single source schedule.
   PERFORM public.brand_finance_invoice_management(p_cafe_id,jsonb_build_object('action','schedule','ids',jsonb_build_array(d.id),'schedule',p_payload->'schedule'));
   PERFORM 1 FROM erp_installment_private.rows(d.total,d.total,0,p_payload->'schedule');
   result:=jsonb_build_object('id',d.id);
  ELSE
   state:=brand_finance_private.document_state(p_cafe_id,d.id);
   IF (state->>'outstanding')::numeric IS DISTINCT FROM (p_payload->>'expectedOutstanding')::numeric THEN RAISE EXCEPTION 'تغير رصيد الفاتورة' USING ERRCODE='40001';END IF;
   SELECT * INTO part FROM erp_installment_private.rows(d.total,(state->>'outstanding')::numeric,(state->>'refunded_total')::numeric,old_schedule) r WHERE r.remaining>0 ORDER BY r.number LIMIT 1;
   IF NOT FOUND OR part.number IS DISTINCT FROM (p_payload->>'number')::integer THEN RAISE EXCEPTION 'ابدأ بتحصيل القسط الأقدم غير المسدد' USING ERRCODE='22023';END IF;
   amount:=(p_payload->>'amount')::numeric;
   IF amount IS NULL OR amount<.01 OR amount<>round(amount,2) OR amount>part.remaining OR amount>1000000000 THEN RAISE EXCEPTION 'المبلغ يتجاوز المتبقي في القسط' USING ERRCODE='22023';END IF;
   SELECT * INTO account FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=(p_payload->>'accountId')::uuid AND active AND deleted_at IS NULL AND NOT frozen AND NOT is_group AND NOT is_cashier_drawer AND kind IN('cash','bank','pos');
   IF NOT FOUND THEN RAISE EXCEPTION 'اختر حساب تحصيل إداريًا نشطًا' USING ERRCODE='22023';END IF;
   result:=public.brand_finance_execute(p_cafe_id,'settlement',jsonb_build_object('documentId',d.id,'accountId',account.id,'amount',amount,'note',left(coalesce(p_payload->>'details',''),500)),p_request_id);
   payment:=jsonb_build_object('amount',amount,'date',p_payload->>'date','accountId',account.id,'status',p_payload->>'status','collectorId',p_payload->>'collectorId','reference',p_payload->>'reference','details',p_payload->>'details','receiptNote',p_payload->>'receiptNote','attachments',coalesce(p_payload->'attachments','[]'));
   PERFORM public.brand_finance_manage_invoice_payment(p_cafe_id,jsonb_build_object('action','save','invoiceId',d.id,'paymentId',result->>'id','revision',0,'requestId',gen_random_uuid(),'payload',payment));
   result:=result||jsonb_build_object('invoiceId',d.id,'installment',part.number);
  END IF;
 ELSE RAISE EXCEPTION 'إجراء الأقساط غير معروف' USING ERRCODE='22023';END IF;
 INSERT INTO public.erp_installment_requests(cafe_id,request_id,actor,action,payload,result) VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_payload,result);RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_installment_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_installments_read(uuid,jsonb),public.erp_installments_write(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_installments_read(uuid,jsonb),public.erp_installments_write(uuid,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
