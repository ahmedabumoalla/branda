-- Independent of the unpublished shift operations/attachments migrations
BEGIN;
ALTER TABLE public.bf_shifts ADD COLUMN shift_number bigint, ADD COLUMN opening_expected_cash numeric(16,2), ADD COLUMN opening_variance numeric(16,2);
WITH numbered AS (SELECT id,row_number() OVER(PARTITION BY cafe_id ORDER BY opened_at,id) n FROM public.bf_shifts)
UPDATE public.bf_shifts s SET shift_number=n.n FROM numbered n WHERE n.id=s.id;
ALTER TABLE public.bf_shifts ALTER COLUMN shift_number SET NOT NULL, ADD CONSTRAINT bf_shift_human_number UNIQUE(cafe_id,shift_number), ADD CHECK(shift_number>0);
CREATE TABLE public.bf_shift_cash_numbers(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),last_number bigint NOT NULL CHECK(last_number>0));
INSERT INTO public.bf_shift_cash_numbers SELECT cafe_id,max(shift_number) FROM public.bf_shifts GROUP BY cafe_id;
CREATE TABLE public.bf_shift_cash_variances(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,shift_id uuid NOT NULL,shift_number bigint NOT NULL,
 phase text NOT NULL CHECK(phase IN('opening','closing')),occurred_at timestamptz NOT NULL DEFAULT now(),
 drawer_id uuid NOT NULL,drawer_name text NOT NULL,employee_id uuid NOT NULL REFERENCES auth.users(id),employee_name text NOT NULL,
 previous_employee_id uuid REFERENCES auth.users(id),previous_employee_name text,
 expected_cash numeric(16,2) NOT NULL,counted_cash numeric(16,2) NOT NULL CHECK(counted_cash>=0),difference numeric(16,2) NOT NULL CHECK(difference<>0 AND difference=counted_cash-expected_cash),
 document_id uuid NOT NULL,UNIQUE(cafe_id,id),UNIQUE(cafe_id,shift_id,phase),
 FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id),FOREIGN KEY(cafe_id,drawer_id) REFERENCES public.bf_accounts(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
CREATE INDEX bf_cash_variance_history ON public.bf_shift_cash_variances(cafe_id,occurred_at DESC,id);
CREATE TABLE public.bf_shift_cash_resolutions(
 variance_id uuid PRIMARY KEY,cafe_id uuid NOT NULL,resolution text NOT NULL CHECK(resolution IN('charge_employee','waive')),
 employee_id uuid REFERENCES auth.users(id),employee_name text,document_id uuid NOT NULL,note text NOT NULL CHECK(length(note) BETWEEN 1 AND 1000),
 settled_by uuid NOT NULL REFERENCES auth.users(id),settled_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(cafe_id,variance_id) REFERENCES public.bf_shift_cash_variances(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 CHECK((resolution='charge_employee')=(employee_id IS NOT NULL)));
CREATE TABLE public.bf_shift_cash_employee_accounts(cafe_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),party_id uuid NOT NULL,PRIMARY KEY(cafe_id,user_id),UNIQUE(cafe_id,party_id),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id));
CREATE TABLE public.bf_shift_cash_alerts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,variance_id uuid NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','queued','rejected','unknown','missing_owner')),
 lease_token uuid,claimed_at timestamptz,completed_at timestamptz,provider_message_id text,error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(cafe_id,variance_id) REFERENCES public.bf_shift_cash_variances(cafe_id,id));
CREATE INDEX bf_cash_alert_pending ON public.bf_shift_cash_alerts(created_at,id) WHERE status='pending';
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bf_shift_cash_numbers','bf_shift_cash_variances','bf_shift_cash_resolutions','bf_shift_cash_employee_accounts','bf_shift_cash_alerts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_shift_cash_variances FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_shift_cash_resolutions FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_shift_cash_employee_accounts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE FUNCTION brand_finance_private.cash_employee_name(p_cafe uuid,p_user uuid) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT nullif(btrim(name),'') FROM public.bf_staff WHERE cafe_id=p_cafe AND user_id=p_user),(SELECT nullif(btrim(full_name),'') FROM public.profiles WHERE id=p_user),'موظف')
$$;
CREATE FUNCTION brand_finance_private.cash_pending_account(p_cafe uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.bf_accounts(cafe_id,code,name,kind) VALUES(p_cafe,'1190','فروقات الصندوق قيد المراجعة','receivable') ON CONFLICT(cafe_id,code) DO NOTHING;
 RETURN brand_finance_private.account(p_cafe,'1190');
END $$;
CREATE FUNCTION brand_finance_private.cash_shift_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.cafe_id,NEW.user_id,NEW.account_id,NEW.shift_number,NEW.opening_cash,NEW.opening_expected_cash,NEW.opening_variance,NEW.opened_at) IS DISTINCT FROM ROW(OLD.cafe_id,OLD.user_id,OLD.account_id,OLD.shift_number,OLD.opening_cash,OLD.opening_expected_cash,OLD.opening_variance,OLD.opened_at) THEN RAISE EXCEPTION 'بيانات بداية الوردية ثابتة'; END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
 INSERT INTO public.bf_shift_cash_numbers(cafe_id,last_number) VALUES(NEW.cafe_id,1) ON CONFLICT(cafe_id) DO UPDATE SET last_number=public.bf_shift_cash_numbers.last_number+1 RETURNING last_number INTO NEW.shift_number;
 SELECT coalesce(sum(debit-credit),0) INTO NEW.opening_expected_cash FROM public.bf_journal WHERE cafe_id=NEW.cafe_id AND account_id=NEW.account_id;
 NEW.opening_variance:=NEW.opening_cash-NEW.opening_expected_cash;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_cash_shift_before BEFORE INSERT OR UPDATE ON public.bf_shifts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.cash_shift_before();
CREATE FUNCTION brand_finance_private.cash_shift_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE phase text; expected numeric; counted numeric; delta numeric; doc uuid; event_id uuid; previous_user uuid; title text;
BEGIN
 IF TG_OP='INSERT' THEN phase:='opening';expected:=NEW.opening_expected_cash;counted:=NEW.opening_cash;
 ELSIF OLD.status='open' AND NEW.status IN('closed','handover') THEN phase:='closing';expected:=NEW.expected_cash;counted:=NEW.counted_cash;
 ELSE RETURN NEW; END IF;
 delta:=counted-expected;
 IF delta IS NULL OR delta=0 THEN RETURN NEW; END IF;
 title:=CASE phase WHEN 'opening' THEN 'فرق بداية الوردية رقم ' ELSE 'فرق إغلاق الوردية رقم ' END||NEW.shift_number||' - '||brand_finance_private.cash_employee_name(NEW.cafe_id,NEW.user_id);
 IF phase='opening' THEN
  doc:=gen_random_uuid();
  INSERT INTO public.bf_documents(id,cafe_id,kind,shift_id,account_id,total,paid,note,created_by) VALUES(doc,NEW.cafe_id,'shift_variance',NEW.id,NEW.account_id,abs(delta),abs(delta),title,NEW.user_id);
  PERFORM brand_finance_private.line(NEW.cafe_id,doc,NEW.account_id,greatest(delta,0),greatest(-delta,0));
  PERFORM brand_finance_private.line(NEW.cafe_id,doc,brand_finance_private.cash_pending_account(NEW.cafe_id),greatest(-delta,0),greatest(delta,0));
 ELSE
  SELECT d.id INTO doc FROM public.bf_documents d WHERE d.cafe_id=NEW.cafe_id AND d.shift_id=NEW.id AND d.kind='shift_variance' AND NOT EXISTS(SELECT 1 FROM public.bf_shift_cash_variances v WHERE v.document_id=d.id) ORDER BY d.number DESC LIMIT 1;
  IF doc IS NULL THEN RAISE EXCEPTION 'قيد فرق الإغلاق غير موجود'; END IF;
 END IF;
 SELECT s.user_id INTO previous_user FROM public.bf_shifts s WHERE s.cafe_id=NEW.cafe_id AND s.account_id=NEW.account_id AND s.id<>NEW.id AND (s.opened_at,s.shift_number)<(NEW.opened_at,NEW.shift_number) ORDER BY s.opened_at DESC,s.shift_number DESC LIMIT 1;
 INSERT INTO public.bf_shift_cash_variances(cafe_id,shift_id,shift_number,phase,drawer_id,drawer_name,employee_id,employee_name,previous_employee_id,previous_employee_name,expected_cash,counted_cash,difference,document_id)
 SELECT NEW.cafe_id,NEW.id,NEW.shift_number,phase,NEW.account_id,a.name,NEW.user_id,brand_finance_private.cash_employee_name(NEW.cafe_id,NEW.user_id),previous_user,CASE WHEN previous_user IS NOT NULL THEN brand_finance_private.cash_employee_name(NEW.cafe_id,previous_user) END,expected,counted,delta,doc FROM public.bf_accounts a WHERE a.id=NEW.account_id RETURNING id INTO event_id;
 INSERT INTO public.bf_shift_cash_alerts(cafe_id,variance_id) VALUES(NEW.cafe_id,event_id);
 RETURN NEW;
END $$;
CREATE TRIGGER bf_cash_shift_event AFTER INSERT OR UPDATE ON public.bf_shifts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.cash_shift_event();
-- Change only the already-live core branches; preserve refunds, fees and treasury wrappers
DO $$ DECLARE src text; old text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 old:='IF amount IS NULL OR amount<0 OR amount<>expected THEN';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected shift opening baseline'; END IF;
 src:=replace(src,old,'IF amount IS NULL OR amount<0 THEN');
 src:=replace(src,'رصيد بداية الوردية يجب أن يطابق رصيد الخزينة سجل الرصيد الافتتاحي أولا','أدخل النقدية المعدودة عند بداية الوردية');
 old:='brand_finance_private.account(p_cafe_id,''5300''),greatest(expected-counted,0),greatest(counted-expected,0)';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected shift closing baseline'; END IF;
 src:=replace(src,old,'brand_finance_private.cash_pending_account(p_cafe_id),greatest(expected-counted,0),greatest(counted-expected,0)');
 old:='abs(counted-expected),abs(counted-expected),note,auth.uid()';
 src:=replace(src,old,'abs(counted-expected),abs(counted-expected),left(''فرق إغلاق الوردية رقم ''||sh.shift_number||'' - ''||brand_finance_private.cash_employee_name(p_cafe_id,auth.uid())||'' - ''||note,1000),auth.uid()');
 EXECUTE src;
 SELECT pg_get_functiondef('public.brand_finance_snapshot(uuid)'::regprocedure) INTO src;
 IF strpos(src,'a.kind=''receivable''')=0 THEN RAISE EXCEPTION 'Unexpected receivable summary baseline'; END IF;
 EXECUTE replace(src,'a.kind=''receivable''','a.kind=''receivable'' AND a.code<>''1190''');
 SELECT pg_get_functiondef('public.brand_finance_treasury_correct(uuid,uuid,timestamptz,text,jsonb,uuid)'::regprocedure) INTO src;
 old:='IF p_operation=''reverse'' THEN';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected correction baseline'; END IF;
 src:=replace(src,old,$guard$
 IF p_operation IN('reset','reconcile_adjust') AND EXISTS(SELECT 1 FROM public.bf_shift_cash_variances v WHERE v.cafe_id=p_cafe_id AND NOT EXISTS(SELECT 1 FROM public.bf_shift_cash_resolutions r WHERE r.variance_id=v.id)) THEN RAISE EXCEPTION 'سو فروقات الورديات المعلقة قبل تصحيح الأرصدة'; END IF;
 IF p_operation='reverse' AND (EXISTS(SELECT 1 FROM public.bf_shift_cash_variances WHERE cafe_id=p_cafe_id AND document_id=(p_payload->>'documentId')::uuid) OR EXISTS(SELECT 1 FROM public.bf_shift_cash_resolutions WHERE cafe_id=p_cafe_id AND document_id=(p_payload->>'documentId')::uuid)) THEN RAISE EXCEPTION 'قيود فروقات الورديات لا تعكس من التصحيح العام'; END IF;
 IF p_operation='reverse' THEN$guard$);
 EXECUTE src;
END $$;
CREATE FUNCTION public.brand_finance_cash_differences(p_cafe_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; result jsonb;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF role_name NOT IN('owner','manager') THEN RAISE EXCEPTION 'إدارة المالية مطلوبة لعرض الفروقات' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'نطاق السجلات غير صالح'; END IF;
 SELECT jsonb_build_object(
  'rows',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY occurred_at DESC,id DESC) FROM (
   SELECT v.id,v.shift_id,v.shift_number,v.phase,v.occurred_at,v.drawer_id,v.drawer_name,v.employee_id,v.employee_name,v.previous_employee_id,v.previous_employee_name,v.expected_cash,v.counted_cash,v.difference,v.document_id,d.number document_number,
   coalesce(r.resolution,'pending') status,r.employee_id resolution_employee_id,r.employee_name resolution_employee_name,r.settled_at,r.note settlement_note,r.document_id resolution_document_id,rd.number resolution_document_number,a.status notification_status
   FROM public.bf_shift_cash_variances v JOIN public.bf_documents d ON d.id=v.document_id LEFT JOIN public.bf_shift_cash_resolutions r ON r.variance_id=v.id LEFT JOIN public.bf_documents rd ON rd.id=r.document_id LEFT JOIN public.bf_shift_cash_alerts a ON a.variance_id=v.id
   WHERE v.cafe_id=p_cafe_id ORDER BY v.occurred_at DESC,v.id DESC OFFSET p_offset LIMIT p_limit) x),'[]'::jsonb),
  'total',(SELECT count(*) FROM public.bf_shift_cash_variances WHERE cafe_id=p_cafe_id),
  'canSettle',EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid()),
  'employees',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.user_id,'name',e.name) ORDER BY e.name,e.user_id) FROM (
   SELECT DISTINCT ON(user_id) user_id,name FROM (
    SELECT s.user_id,s.name,0 priority,now() at_time FROM public.bf_staff s WHERE s.cafe_id=p_cafe_id AND s.active
    UNION ALL SELECT v.employee_id,v.employee_name,1,v.occurred_at FROM public.bf_shift_cash_variances v WHERE v.cafe_id=p_cafe_id
    UNION ALL SELECT v.previous_employee_id,v.previous_employee_name,1,v.occurred_at FROM public.bf_shift_cash_variances v WHERE v.cafe_id=p_cafe_id AND v.previous_employee_id IS NOT NULL
   ) candidates WHERE EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=candidates.user_id AND p.status='active') ORDER BY user_id,priority,at_time DESC
  ) e),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.brand_finance_settle_cash_difference(p_cafe_id uuid,p_variance_id uuid,p_resolution text,p_employee_id uuid,p_note text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.bf_shift_cash_variances%ROWTYPE; prior public.bf_requests%ROWTYPE; payload jsonb; result jsonb; doc uuid:=gen_random_uuid(); n bigint; party uuid; employee_name text; title text; amount numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 PERFORM brand_finance_private.role_for(p_cafe_id);
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid()) THEN RAISE EXCEPTION 'اعتماد مالك العلامة مطلوب لتسوية الفرق' USING ERRCODE='42501'; END IF;
 p_note:=btrim(coalesce(p_note,''));
 IF p_variance_id IS NULL OR p_request_id IS NULL OR p_resolution IS NULL OR p_resolution NOT IN('charge_employee','waive') OR length(p_note) NOT BETWEEN 1 AND 1000 OR (p_resolution='charge_employee')<>(p_employee_id IS NOT NULL) THEN RAISE EXCEPTION 'بيانات تسوية الفرق غير مكتملة'; END IF;
 payload:=jsonb_build_object('varianceId',p_variance_id,'resolution',p_resolution,'employeeId',p_employee_id,'note',p_note);
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.operation<>'cash_difference_settle' OR prior.payload<>payload OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى'; END IF;
  RETURN prior.result||'{"duplicate":true}'::jsonb;
 END IF;
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date) THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 SELECT * INTO v FROM public.bf_shift_cash_variances WHERE cafe_id=p_cafe_id AND id=p_variance_id FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.bf_shift_cash_resolutions WHERE variance_id=p_variance_id) THEN RAISE EXCEPTION 'الفرق غير موجود أو تمت تسويته'; END IF;
 amount:=abs(v.difference);
 IF p_resolution='charge_employee' THEN
  IF v.difference>=0 THEN RAISE EXCEPTION 'تحميل الموظف متاح للعجز فقط'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_employee_id AND p.status='active') OR NOT(
   p_employee_id=v.employee_id OR coalesce(p_employee_id=v.previous_employee_id,false) OR EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=p_employee_id AND active)
  ) THEN RAISE EXCEPTION 'اختر موظفا مرتبطا بهذه العلامة'; END IF;
  employee_name:=CASE WHEN p_employee_id=v.employee_id THEN v.employee_name WHEN p_employee_id=v.previous_employee_id THEN v.previous_employee_name ELSE brand_finance_private.cash_employee_name(p_cafe_id,p_employee_id) END;
  SELECT party_id INTO party FROM public.bf_shift_cash_employee_accounts WHERE cafe_id=p_cafe_id AND user_id=p_employee_id;
  IF party IS NULL THEN
   INSERT INTO public.bf_parties(cafe_id,name,kind) VALUES(p_cafe_id,employee_name,'employee') RETURNING id INTO party;
   INSERT INTO public.bf_shift_cash_employee_accounts(cafe_id,user_id,party_id) VALUES(p_cafe_id,p_employee_id,party);
  END IF;
 END IF;
 title:=left('تسوية فرق '||CASE v.phase WHEN 'opening' THEN 'بداية' ELSE 'إغلاق' END||' الوردية رقم '||v.shift_number||CASE p_resolution WHEN 'charge_employee' THEN ' على الموظف '||employee_name ELSE ' دون تحميل موظف' END||' - '||p_note,1000);
 INSERT INTO public.bf_documents(id,cafe_id,kind,party_id,shift_id,total,reference_id,note,created_by) VALUES(doc,p_cafe_id,'journal',party,v.shift_id,amount,v.document_id,title,auth.uid()) RETURNING number INTO n;
 IF p_resolution='charge_employee' THEN
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1030'),amount,0,party);
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.cash_pending_account(p_cafe_id),0,amount);
 ELSIF v.difference<0 THEN
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'5300'),amount,0);
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.cash_pending_account(p_cafe_id),0,amount);
 ELSE
  INSERT INTO public.bf_accounts(cafe_id,code,name,kind) VALUES(p_cafe_id,'4010','إيرادات أخرى','revenue') ON CONFLICT(cafe_id,code) DO NOTHING;
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.cash_pending_account(p_cafe_id),amount,0);
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'4010'),0,amount);
 END IF;
 INSERT INTO public.bf_shift_cash_resolutions(variance_id,cafe_id,resolution,employee_id,employee_name,document_id,note,settled_by) VALUES(v.id,p_cafe_id,p_resolution,p_employee_id,employee_name,doc,p_note,auth.uid());
 result:=jsonb_build_object('id',v.id,'document_id',doc,'number',n);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'cash_difference_settle',payload,result,auth.uid());
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,after_data) VALUES(p_cafe_id,auth.uid(),'cash_difference_settle',doc,payload||result);
 RETURN result;
END $$;
CREATE FUNCTION public.brand_finance_claim_cash_alerts(p_cafe_id uuid DEFAULT NULL,p_shift_id uuid DEFAULT NULL,p_limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a record; result jsonb:='[]'::jsonb; token uuid; phone text;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid alert limit'; END IF;
 UPDATE public.bf_shift_cash_alerts SET status='unknown',completed_at=now(),error_code='lease_expired' WHERE status='processing' AND claimed_at<now()-interval '5 minutes';
 FOR a IN SELECT q.id,v.phase,v.shift_number,v.difference,v.drawer_name,v.employee_name,v.previous_employee_name,q.created_at,c.name brand_name,c.owner_user_id,c.status cafe_status,c.deleted_at,q.cafe_id
  FROM public.bf_shift_cash_alerts q JOIN public.bf_shift_cash_variances v ON v.id=q.variance_id JOIN public.cafes c ON c.id=q.cafe_id
  WHERE q.status='pending' AND (p_cafe_id IS NULL OR q.cafe_id=p_cafe_id) AND (p_shift_id IS NULL OR v.shift_id=p_shift_id)
  ORDER BY q.created_at,q.id LIMIT p_limit FOR UPDATE OF q SKIP LOCKED
 LOOP
  phone:=NULL;
  IF a.cafe_status IN('active','published') AND a.deleted_at IS NULL THEN
   SELECT nullif(btrim(p.phone),'') INTO phone FROM public.profiles p WHERE p.id=a.owner_user_id AND p.status='active';
  END IF;
  IF phone IS NULL THEN UPDATE public.bf_shift_cash_alerts SET status='missing_owner',completed_at=now(),error_code='owner_phone_missing' WHERE id=a.id;CONTINUE; END IF;
  token:=gen_random_uuid();
  UPDATE public.bf_shift_cash_alerts SET status='processing',lease_token=token,claimed_at=now() WHERE id=a.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',a.id,'leaseToken',token,'phase',a.phase,'shiftNumber',a.shift_number,'difference',a.difference,'ownerPhone',phone,'brandName',a.brand_name,'drawerName',a.drawer_name,'employeeName',a.employee_name,'previousEmployeeName',a.previous_employee_name,'createdAt',a.created_at));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION public.brand_finance_complete_cash_alert(p_alert_id uuid,p_lease_token uuid,p_status text,p_provider_message_id text DEFAULT NULL,p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status IS NULL OR p_status NOT IN('queued','rejected','unknown','missing_owner') OR p_lease_token IS NULL OR (p_status='queued' AND nullif(btrim(p_provider_message_id),'') IS NULL) THEN RAISE EXCEPTION 'Invalid delivery result'; END IF;
 UPDATE public.bf_shift_cash_alerts SET status=p_status,completed_at=now(),provider_message_id=left(p_provider_message_id,200),error_code=left(p_error_code,100) WHERE id=p_alert_id AND lease_token=p_lease_token AND status='processing';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_cash_differences(uuid,integer,integer),public.brand_finance_settle_cash_difference(uuid,uuid,text,uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_cash_differences(uuid,integer,integer),public.brand_finance_settle_cash_difference(uuid,uuid,text,uuid,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_claim_cash_alerts(uuid,uuid,integer),public.brand_finance_complete_cash_alert(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_claim_cash_alerts(uuid,uuid,integer),public.brand_finance_complete_cash_alert(uuid,uuid,text,text,text) TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brand_finance_private FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
