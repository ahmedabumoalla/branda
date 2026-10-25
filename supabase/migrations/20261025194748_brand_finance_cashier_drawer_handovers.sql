-- Independent cashier drawer and immutable cash handover workflow
BEGIN;
ALTER TABLE public.bf_accounts ADD COLUMN is_cashier_drawer boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT bf_cashier_drawer_eligible CHECK(NOT is_cashier_drawer OR (kind='cash' AND active AND NOT is_primary));
CREATE UNIQUE INDEX bf_one_cashier_drawer ON public.bf_accounts(cafe_id) WHERE is_cashier_drawer;
CREATE FUNCTION brand_finance_private.cashier_drawer_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.is_cashier_drawer IS DISTINCT FROM OLD.is_cashier_drawer THEN RAISE EXCEPTION 'نوع صندوق الكاشير ثابت'; END IF;
 IF NEW.is_cashier_drawer AND (NOT NEW.active OR NEW.is_primary OR NEW.kind<>'cash') THEN RAISE EXCEPTION 'صندوق الكاشير مستقل ولا يمكن أرشفته أو اختياره خزينة رئيسية'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_cashier_drawer_guard BEFORE INSERT OR UPDATE ON public.bf_accounts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.cashier_drawer_guard();
-- Preserve latest fee/link guards while excluding the special drawer from normal account limits
DO $$ DECLARE src text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.treasury_account_guard()'::regprocedure) INTO src;
 IF strpos(src,'IF NEW.kind IN(''cash'',''bank'',''pos'') THEN')=0 OR strpos(src,'kind=NEW.kind AND active AND id<>NEW.id')=0 THEN RAISE EXCEPTION 'Unexpected treasury account guard'; END IF;
 src:=replace(src,'IF NEW.kind IN(''cash'',''bank'',''pos'') THEN','IF NEW.kind IN(''cash'',''bank'',''pos'') AND NOT NEW.is_cashier_drawer THEN');
 src:=replace(src,'kind=NEW.kind AND active AND id<>NEW.id','kind=NEW.kind AND active AND NOT is_cashier_drawer AND id<>NEW.id');
 EXECUTE src;
 SELECT pg_get_functiondef('brand_finance_private.treasury_primary_guard()'::regprocedure) INTO src;
 src:=replace(src,'IF NEW.kind IN(''cash'',''bank'',''pos'') AND NEW.active','IF NEW.kind IN(''cash'',''bank'',''pos'') AND NEW.active AND NOT NEW.is_cashier_drawer');EXECUTE src;
 SELECT pg_get_functiondef('brand_finance_private.treasury_primary_check()'::regprocedure) INTO src;
 src:=replace(src,'kind=category AND active)','kind=category AND active AND NOT is_cashier_drawer)');EXECUTE src;
END $$;
CREATE FUNCTION brand_finance_private.cashier_drawer(p_cafe uuid) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 SELECT id INTO result FROM public.bf_accounts WHERE cafe_id=p_cafe AND is_cashier_drawer;
 IF result IS NULL THEN
  INSERT INTO public.bf_accounts(cafe_id,code,name,kind,is_cashier_drawer,opening_recorded_at,opening_amount)
  VALUES(p_cafe,'1001-CASHIER','صندوق كاشير الفرع','cash',true,now(),0) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;
DO $$ DECLARE src text; tenant uuid; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.seed(uuid)'::regprocedure) INTO src;
 IF strpos(src,'END $function$')=0 THEN RAISE EXCEPTION 'Unexpected finance seed'; END IF;
 EXECUTE replace(src,'END $function$','PERFORM brand_finance_private.cashier_drawer(p_cafe); END $function$');
 FOR tenant IN SELECT cafe_id FROM public.bf_settings LOOP PERFORM brand_finance_private.cashier_drawer(tenant); END LOOP;
END $$;
CREATE TABLE public.bf_cash_handover_parties(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),user_id uuid REFERENCES auth.users(id),phone text,name text NOT NULL,party_id uuid NOT NULL,
 UNIQUE(cafe_id,party_id),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id),CHECK(user_id IS NOT NULL OR phone IS NOT NULL));
CREATE UNIQUE INDEX bf_cash_handover_employee_party ON public.bf_cash_handover_parties(cafe_id,user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX bf_cash_handover_external_party ON public.bf_cash_handover_parties(cafe_id,phone) WHERE user_id IS NULL;
CREATE TABLE public.bf_cash_handovers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,shift_id uuid NOT NULL,shift_number bigint NOT NULL,
 drawer_id uuid NOT NULL,drawer_name text NOT NULL,receiving_drawer_id uuid,receiving_drawer_name text,
 amount numeric(16,2) NOT NULL CHECK(amount>=0),handover_type text NOT NULL CHECK(handover_type IN('next_shift','accountant','other')),
 from_user_id uuid NOT NULL REFERENCES auth.users(id),from_name text NOT NULL,recipient_user_id uuid REFERENCES auth.users(id),recipient_name text NOT NULL,recipient_phone text,party_id uuid,document_id uuid,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,shift_id),
 FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id),FOREIGN KEY(cafe_id,drawer_id) REFERENCES public.bf_accounts(cafe_id,id),FOREIGN KEY(cafe_id,receiving_drawer_id) REFERENCES public.bf_accounts(cafe_id,id),FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 CHECK((handover_type='next_shift')=(receiving_drawer_id IS NOT NULL)),CHECK((handover_type='next_shift')=(party_id IS NULL)),CHECK(handover_type<>'accountant' OR recipient_user_id IS NOT NULL),CHECK(handover_type<>'other' OR (recipient_user_id IS NULL AND recipient_phone IS NOT NULL)));
CREATE INDEX bf_cash_handover_history ON public.bf_cash_handovers(cafe_id,created_at DESC,id);
CREATE INDEX bf_cash_handover_from ON public.bf_cash_handovers(cafe_id,from_user_id,created_at DESC,id);
CREATE TABLE public.bf_cash_handover_receipts(
 handover_id uuid PRIMARY KEY,cafe_id uuid NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),received_by uuid NOT NULL REFERENCES auth.users(id),received_by_name text NOT NULL,
 received_counted_cash numeric(16,2) NOT NULL CHECK(received_counted_cash>=0),receiving_shift_id uuid,account_id uuid,document_id uuid,note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 FOREIGN KEY(cafe_id,handover_id) REFERENCES public.bf_cash_handovers(cafe_id,id),FOREIGN KEY(cafe_id,receiving_shift_id) REFERENCES public.bf_shifts(cafe_id,id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bf_cash_handover_parties','bf_cash_handovers','bf_cash_handover_receipts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable()',t);
 END LOOP;
END $$;
CREATE FUNCTION brand_finance_private.close_cash_handover(p_cafe uuid,p_shift uuid,p_payload jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sh public.bf_shifts%ROWTYPE; mode text:=coalesce(p_payload->>'handoverType','next_shift'); recipient uuid; recipient_name text; v_phone text; party uuid; doc uuid; receiving uuid; title text;
BEGIN
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe AND id=p_shift AND user_id=auth.uid() AND status='closed' FOR UPDATE;
 IF NOT FOUND OR sh.counted_cash IS NULL THEN RAISE EXCEPTION 'أغلق ورديتك قبل تسجيل التسليم'; END IF;
 IF mode NOT IN('next_shift','accountant','other') THEN RAISE EXCEPTION 'اختر طريقة تسليم النقدية'; END IF;
 IF mode='next_shift' THEN
  receiving:=brand_finance_private.cashier_drawer(p_cafe);recipient_name:='موظف الوردية التالية';
  IF EXISTS(SELECT 1 FROM public.bf_cash_handovers h WHERE h.cafe_id=p_cafe AND h.receiving_drawer_id=receiving AND NOT EXISTS(SELECT 1 FROM public.bf_cash_handover_receipts r WHERE r.handover_id=h.id)) THEN RAISE EXCEPTION 'يوجد تسليم سابق للصندوق لم يتم استلامه'; END IF;
  IF receiving<>sh.account_id AND EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe AND account_id=receiving AND status IN('open','handover')) THEN RAISE EXCEPTION 'صندوق الكاشير مستخدم في وردية أخرى اختر تسليم النقدية للمحاسب أو لمستلم آخر'; END IF;
 ELSE
  IF mode='accountant' THEN
   recipient:=nullif(p_payload->>'recipientUserId','')::uuid;
   SELECT s.name INTO recipient_name FROM public.bf_staff s JOIN public.profiles p ON p.id=s.user_id AND p.status='active' WHERE s.cafe_id=p_cafe AND s.user_id=recipient AND s.role='manager' AND s.active;
   IF recipient_name IS NULL THEN RAISE EXCEPTION 'اختر محاسبا نشطا من موظفي العلامة'; END IF;
   SELECT party_id INTO party FROM public.bf_cash_handover_parties WHERE cafe_id=p_cafe AND user_id=recipient;
  ELSE
   recipient_name:=btrim(coalesce(p_payload->>'recipientName',''));v_phone:=regexp_replace(translate(coalesce(p_payload->>'recipientPhone',''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[[:space:]()-]','','g');
   IF v_phone ~ '^05[0-9]{8}$' THEN v_phone:='966'||substr(v_phone,2);ELSIF v_phone ~ '^\+[1-9][0-9]{7,14}$' THEN v_phone:=substr(v_phone,2); END IF;
   IF length(recipient_name) NOT BETWEEN 1 AND 100 OR v_phone !~ '^[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'أدخل اسم المستلم ورقم جوال صحيحا'; END IF;
   SELECT party_id INTO party FROM public.bf_cash_handover_parties WHERE cafe_id=p_cafe AND user_id IS NULL AND bf_cash_handover_parties.phone=v_phone;
  END IF;
  IF party IS NULL THEN
   INSERT INTO public.bf_parties(cafe_id,name,kind,phone) VALUES(p_cafe,recipient_name,'employee',coalesce(v_phone,'')) RETURNING id INTO party;
   INSERT INTO public.bf_cash_handover_parties(cafe_id,user_id,phone,name,party_id) VALUES(p_cafe,recipient,v_phone,recipient_name,party);
  END IF;
 END IF;
 IF sh.counted_cash>0 AND (mode<>'next_shift' OR receiving<>sh.account_id) THEN
  doc:=gen_random_uuid();title:=left('تسليم نقدية الوردية رقم '||sh.shift_number||' من '||brand_finance_private.cash_employee_name(p_cafe,sh.user_id)||' إلى '||recipient_name,1000);
  INSERT INTO public.bf_documents(id,cafe_id,kind,shift_id,account_id,party_id,total,paid,note,created_by) VALUES(doc,p_cafe,'transfer',sh.id,sh.account_id,party,sh.counted_cash,sh.counted_cash,title,auth.uid());
  PERFORM brand_finance_private.line(p_cafe,doc,sh.account_id,0,sh.counted_cash);
  PERFORM brand_finance_private.line(p_cafe,doc,CASE WHEN mode='next_shift' THEN receiving ELSE brand_finance_private.account(p_cafe,'1030') END,sh.counted_cash,0,party);
 END IF;
 INSERT INTO public.bf_cash_handovers(cafe_id,shift_id,shift_number,drawer_id,drawer_name,receiving_drawer_id,receiving_drawer_name,amount,handover_type,from_user_id,from_name,recipient_user_id,recipient_name,recipient_phone,party_id,document_id)
 SELECT p_cafe,sh.id,sh.shift_number,sh.account_id,a.name,receiving,(SELECT name FROM public.bf_accounts WHERE id=receiving),sh.counted_cash,mode,sh.user_id,brand_finance_private.cash_employee_name(p_cafe,sh.user_id),recipient,recipient_name,v_phone,party,doc FROM public.bf_accounts a WHERE a.id=sh.account_id;
END $$;
CREATE FUNCTION brand_finance_private.accept_cash_handover() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.bf_cash_handovers%ROWTYPE;
BEGIN
 SELECT h1.* INTO h FROM public.bf_cash_handovers h1 WHERE h1.cafe_id=NEW.cafe_id AND h1.receiving_drawer_id=NEW.account_id AND h1.handover_type='next_shift' AND NOT EXISTS(SELECT 1 FROM public.bf_cash_handover_receipts r WHERE r.handover_id=h1.id) ORDER BY h1.created_at,h1.id LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  INSERT INTO public.bf_cash_handover_receipts(handover_id,cafe_id,received_by,received_by_name,received_counted_cash,receiving_shift_id,account_id)
  VALUES(h.id,NEW.cafe_id,NEW.user_id,brand_finance_private.cash_employee_name(NEW.cafe_id,NEW.user_id),NEW.opening_cash,NEW.id,NEW.account_id);
 END IF;
 RETURN NEW;
END $$;
-- Runs after the existing opening-count event trigger, in the same transaction
CREATE TRIGGER bf_cash_shift_handover_accept AFTER INSERT ON public.bf_shifts FOR EACH ROW EXECUTE FUNCTION brand_finance_private.accept_cash_handover();
DO $$ DECLARE src text; old text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.cash_shift_event()'::regprocedure) INTO src;
 IF strpos(src,'previous_user uuid; title text;')=0 OR strpos(src,'ORDER BY s.opened_at DESC,s.shift_number DESC LIMIT 1;')=0 THEN RAISE EXCEPTION 'Unexpected cash variance event baseline'; END IF;
 src:=replace(src,'previous_user uuid; title text;','previous_user uuid; title text; prior_handover record; handover_previous_name text;');
 src:=replace(src,'ORDER BY s.opened_at DESC,s.shift_number DESC LIMIT 1;',$prior$ORDER BY s.opened_at DESC,s.shift_number DESC LIMIT 1;
 IF phase='opening' THEN
  SELECT h.from_user_id,h.from_name INTO prior_handover FROM public.bf_cash_handovers h WHERE h.cafe_id=NEW.cafe_id AND h.receiving_drawer_id=NEW.account_id AND h.handover_type='next_shift' AND NOT EXISTS(SELECT 1 FROM public.bf_cash_handover_receipts r WHERE r.handover_id=h.id) ORDER BY h.created_at,h.id LIMIT 1;
  IF FOUND THEN previous_user:=prior_handover.from_user_id;handover_previous_name:=prior_handover.from_name;END IF;
 END IF;$prior$);
 src:=replace(src,'CASE WHEN previous_user IS NOT NULL THEN brand_finance_private.cash_employee_name(NEW.cafe_id,previous_user) END','coalesce(handover_previous_name,CASE WHEN previous_user IS NOT NULL THEN brand_finance_private.cash_employee_name(NEW.cafe_id,previous_user) END)');EXECUTE src;
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 old:='ELSIF p_operation=''shift_open'' THEN';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected shift open baseline'; END IF;
 src:=replace(src,old,old||E'\n  IF aid IS DISTINCT FROM brand_finance_private.cashier_drawer(p_cafe_id) THEN RAISE EXCEPTION ''تبدأ الورديات الجديدة من صندوق الكاشير المستقل''; END IF;');
 old:='WHERE bf_shifts.id=sh.id; id:=sh.id;';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected shift close baseline'; END IF;
 src:=replace(src,old,old||E'\n   IF p_operation=''shift_close'' THEN PERFORM brand_finance_private.close_cash_handover(p_cafe_id,sh.id,p_payload); END IF;');
 old:='IF p_operation=''shift_handover'' THEN';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected legacy handover baseline'; END IF;
 src:=replace(src,old,old||E'\n    IF EXISTS(SELECT 1 FROM public.bf_accounts drawer WHERE drawer.id=sh.account_id AND drawer.is_cashier_drawer) THEN RAISE EXCEPTION ''اختر طريقة التسليم من إجراء إغلاق الوردية''; END IF;');
 EXECUTE src;
END $$;
CREATE FUNCTION public.brand_finance_cash_handovers(p_cafe_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; managed boolean; drawer uuid;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);managed:=role_name IN('owner','manager');
 IF p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'نطاق سجلات التسليم غير صالح'; END IF;
 PERFORM brand_finance_private.seed(p_cafe_id);drawer:=brand_finance_private.cashier_drawer(p_cafe_id);
 RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY created_at DESC,id DESC) FROM (
  SELECT h.id,h.shift_id,h.shift_number,h.drawer_id,h.drawer_name,h.receiving_drawer_id,h.receiving_drawer_name,h.amount,h.handover_type,h.from_user_id,h.from_name,h.recipient_user_id,h.recipient_name,h.recipient_phone,h.created_at,
   CASE WHEN r.handover_id IS NULL THEN 'pending' ELSE 'received' END status,r.received_at,r.received_by_name,r.received_counted_cash,d.number document_number,rd.number receipt_document_number
  FROM public.bf_cash_handovers h LEFT JOIN public.bf_cash_handover_receipts r ON r.handover_id=h.id LEFT JOIN public.bf_documents d ON d.id=h.document_id LEFT JOIN public.bf_documents rd ON rd.id=r.document_id
  WHERE h.cafe_id=p_cafe_id AND (managed OR h.from_user_id=auth.uid() OR r.received_by=auth.uid()) ORDER BY h.created_at DESC,h.id DESC OFFSET p_offset LIMIT p_limit
 ) x),'[]'::jsonb),
 'total',(SELECT count(*) FROM public.bf_cash_handovers h LEFT JOIN public.bf_cash_handover_receipts r ON r.handover_id=h.id WHERE h.cafe_id=p_cafe_id AND (managed OR h.from_user_id=auth.uid() OR r.received_by=auth.uid())),
 'canReceive',managed,'cashierDrawerId',drawer,
 'accountants',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',s.user_id,'name',s.name) ORDER BY s.name,s.user_id) FROM public.bf_staff s JOIN public.profiles p ON p.id=s.user_id AND p.status='active' WHERE s.cafe_id=p_cafe_id AND s.role='manager' AND s.active),'[]'::jsonb));
END $$;
CREATE FUNCTION public.brand_finance_receive_shift_cash(p_cafe_id uuid,p_handover_id uuid,p_account_id uuid,p_note text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.bf_cash_handovers%ROWTYPE; role_name text; prior public.bf_requests%ROWTYPE; payload jsonb; result jsonb; doc uuid; n bigint; title text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));role_name:=brand_finance_private.role_for(p_cafe_id);
 IF role_name NOT IN('owner','manager') THEN RAISE EXCEPTION 'استلام العهدة متاح لمالك العلامة أو المحاسب' USING ERRCODE='42501'; END IF;
 p_note:=btrim(coalesce(p_note,''));
 IF p_handover_id IS NULL OR p_account_id IS NULL OR p_request_id IS NULL OR length(p_note)>1000 THEN RAISE EXCEPTION 'بيانات استلام العهدة غير مكتملة'; END IF;
 payload:=jsonb_build_object('handoverId',p_handover_id,'accountId',p_account_id,'note',p_note);
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.operation<>'shift_cash_receive' OR prior.payload<>payload OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'معرف الطلب مستخدم لعملية أخرى'; END IF;
  RETURN prior.result||'{"duplicate":true}'::jsonb;
 END IF;
 IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=(now() AT TIME ZONE 'Asia/Riyadh')::date) THEN RAISE EXCEPTION 'الفترة المالية مقفلة'; END IF;
 SELECT * INTO h FROM public.bf_cash_handovers WHERE cafe_id=p_cafe_id AND id=p_handover_id FOR UPDATE;
 IF NOT FOUND OR h.handover_type='next_shift' OR EXISTS(SELECT 1 FROM public.bf_cash_handover_receipts WHERE handover_id=h.id) THEN RAISE EXCEPTION 'سجل التسليم غير متاح للاستلام أو سبق استلامه'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=p_account_id AND kind IN('cash','bank') AND active AND NOT is_cashier_drawer) THEN RAISE EXCEPTION 'اختر خزينة أو حسابا بنكيا نشطا غير صندوق الكاشير'; END IF;
 IF h.amount>0 THEN
  IF coalesce((SELECT sum(debit-credit) FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=brand_finance_private.account(p_cafe_id,'1030') AND party_id=h.party_id),0)<h.amount THEN RAISE EXCEPTION 'رصيد عهدة المستلم لا يكفي لهذه العملية'; END IF;
  doc:=gen_random_uuid();title:=left('استلام نقدية الوردية رقم '||h.shift_number||' المسلمة من '||h.from_name||' إلى عهدة '||h.recipient_name||CASE WHEN p_note='' THEN '' ELSE ' - '||p_note END,1000);
  INSERT INTO public.bf_documents(id,cafe_id,kind,shift_id,account_id,party_id,total,paid,reference_id,note,created_by) VALUES(doc,p_cafe_id,'receipt',h.shift_id,p_account_id,h.party_id,h.amount,h.amount,h.document_id,title,auth.uid()) RETURNING number INTO n;
  PERFORM brand_finance_private.line(p_cafe_id,doc,p_account_id,h.amount,0);
  PERFORM brand_finance_private.line(p_cafe_id,doc,brand_finance_private.account(p_cafe_id,'1030'),0,h.amount,h.party_id);
 END IF;
 INSERT INTO public.bf_cash_handover_receipts(handover_id,cafe_id,received_by,received_by_name,received_counted_cash,account_id,document_id,note) VALUES(h.id,p_cafe_id,auth.uid(),brand_finance_private.cash_employee_name(p_cafe_id,auth.uid()),h.amount,p_account_id,doc,p_note);
 result:=jsonb_build_object('id',h.id,'document_id',doc,'number',n,'amount',h.amount);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,p_request_id,'shift_cash_receive',payload,result,auth.uid());
 INSERT INTO public.bf_treasury_audit(cafe_id,actor_id,operation,entity_id,after_data) VALUES(p_cafe_id,auth.uid(),'shift_cash_receive',coalesce(doc,h.id),payload||result);
 RETURN result;
END $$;
-- Reserved handover custody can only be cleared by its exact receipt workflow
DO $$ DECLARE src text; old text; BEGIN
 SELECT pg_get_functiondef('public.brand_finance_execute(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 old:='r:=brand_finance_private.role_for(p_cafe_id);';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected public finance wrapper'; END IF;
 src:=replace(src,old,old||E'\n IF p_operation=''treasury'' AND EXISTS(SELECT 1 FROM public.bf_cash_handover_parties WHERE cafe_id=p_cafe_id AND party_id=nullif(p_payload->>''partyId'','''')::uuid) THEN RAISE EXCEPTION ''استلم عهدة تسليم الوردية من سجل التسليم الخاص بها''; END IF;');EXECUTE src;
 SELECT pg_get_functiondef('public.brand_finance_treasury_correct(uuid,uuid,timestamptz,text,jsonb,uuid)'::regprocedure) INTO src;
 old:='IF p_operation=''reverse'' THEN';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected treasury correction baseline'; END IF;
 src:=replace(src,old,$guard$
 IF p_operation IN('reset','reconcile_adjust') AND EXISTS(SELECT 1 FROM public.bf_cash_handovers h WHERE h.cafe_id=p_cafe_id AND NOT EXISTS(SELECT 1 FROM public.bf_cash_handover_receipts r WHERE r.handover_id=h.id)) THEN RAISE EXCEPTION 'استلم تسليمات النقدية المعلقة قبل تصحيح الأرصدة'; END IF;
 IF p_operation='reverse' AND (EXISTS(SELECT 1 FROM public.bf_cash_handovers WHERE cafe_id=p_cafe_id AND document_id=(p_payload->>'documentId')::uuid) OR EXISTS(SELECT 1 FROM public.bf_cash_handover_receipts WHERE cafe_id=p_cafe_id AND document_id=(p_payload->>'documentId')::uuid)) THEN RAISE EXCEPTION 'قيود تسليم واستلام الورديات لا تعكس من التصحيح العام'; END IF;
 IF p_operation='reverse' THEN$guard$);EXECUTE src;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_cash_handovers(uuid,integer,integer),public.brand_finance_receive_shift_cash(uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_cash_handovers(uuid,integer,integer),public.brand_finance_receive_shift_cash(uuid,uuid,uuid,text,uuid) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brand_finance_private FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
