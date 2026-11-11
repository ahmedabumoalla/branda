BEGIN;
CREATE TABLE public.bf_journal_descriptions (
 cafe_id uuid NOT NULL,document_id uuid PRIMARY KEY,revision integer NOT NULL CHECK(revision>0),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=2100000),
 updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_journal_descriptions_cafe ON public.bf_journal_descriptions(cafe_id,document_id);
CREATE INDEX bf_journal_descriptions_actor ON public.bf_journal_descriptions(updated_by);
CREATE TABLE public.bf_journal_description_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,document_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 field text NOT NULL CHECK(field IN('document_note','line_memo')),line_id uuid REFERENCES public.bf_journal(id),
 before_value text NOT NULL,after_value text NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((field='document_note' AND line_id IS NULL) OR (field='line_memo' AND line_id IS NOT NULL)),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_journal_description_events_doc ON public.bf_journal_description_events(cafe_id,document_id,created_at DESC,id);
CREATE INDEX bf_journal_description_events_line ON public.bf_journal_description_events(line_id);
CREATE INDEX bf_journal_description_events_actor ON public.bf_journal_description_events(created_by);
ALTER TABLE public.bf_journal_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_journal_description_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_journal_descriptions,public.bf_journal_description_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_journal_description_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION public.brand_finance_save_journal_descriptions(p_cafe_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.bf_documents%ROWTYPE; stored public.bf_journal_descriptions%ROWTYPE; prior public.bf_requests%ROWTYPE;
 target uuid;request uuid;expected integer;revision integer;before_note text;new_note text;before_memo text;entry jsonb;line public.bf_journal%ROWTYPE;
 memos jsonb;changes integer:=0;answer jsonb;event_time timestamptz:=clock_timestamp();
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>2100000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN('id','revision','requestId','note','lineMemos'))
  OR jsonb_typeof(p_input->'revision') IS DISTINCT FROM 'number' OR jsonb_typeof(p_input->'note') IS DISTINCT FROM 'string' OR length(p_input->>'note')>1000 OR jsonb_typeof(p_input->'lineMemos') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid journal description input' USING ERRCODE='22023';END IF;
 target:=(p_input->>'id')::uuid;request:=(p_input->>'requestId')::uuid;expected:=(p_input->>'revision')::integer;
 IF target IS NULL OR request IS NULL OR expected<0 OR jsonb_array_length(p_input->'lineMemos')>2000 OR (SELECT count(*)<>count(DISTINCT x->>'id') FROM jsonb_array_elements(p_input->'lineMemos') x) THEN RAISE EXCEPTION 'Invalid journal description input' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO prior FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=request;
 IF FOUND THEN
  IF prior.operation<>'journal_descriptions' OR prior.payload<>p_input OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Description request conflict' USING ERRCODE='40001';END IF;
  RETURN prior.result||jsonb_build_object('duplicate',true);
 END IF;
 SELECT * INTO source FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=target FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe_id AND document_id=target) THEN RAISE EXCEPTION 'Journal unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO stored FROM public.bf_journal_descriptions WHERE cafe_id=p_cafe_id AND document_id=target FOR UPDATE;
 IF coalesce(stored.revision,0)<>expected THEN RAISE EXCEPTION 'Description revision conflict' USING ERRCODE='40001';END IF;
 revision:=coalesce(stored.revision,0)+1;before_note:=coalesce(stored.payload->>'note',source.note);new_note:=p_input->>'note';memos:=coalesce(stored.payload->'lineMemos','{}'::jsonb);
 IF before_note IS DISTINCT FROM new_note THEN
  INSERT INTO public.bf_journal_description_events(cafe_id,document_id,revision,field,before_value,after_value,created_by,created_at) VALUES(p_cafe_id,target,revision,'document_note',before_note,new_note,auth.uid(),event_time);changes:=changes+1;
 END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_input->'lineMemos') LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN('id','memo')) OR jsonb_typeof(entry->'memo') IS DISTINCT FROM 'string' OR length(entry->>'memo')>300 THEN RAISE EXCEPTION 'Invalid line description' USING ERRCODE='22023';END IF;
  SELECT * INTO line FROM public.bf_journal WHERE cafe_id=p_cafe_id AND document_id=target AND id=(entry->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journal line unavailable' USING ERRCODE='42501';END IF;
  before_memo:=coalesce(memos->>line.id::text,line.memo);
  IF before_memo IS DISTINCT FROM entry->>'memo' THEN
   INSERT INTO public.bf_journal_description_events(cafe_id,document_id,revision,field,line_id,before_value,after_value,created_by,created_at) VALUES(p_cafe_id,target,revision,'line_memo',line.id,before_memo,entry->>'memo',auth.uid(),event_time);changes:=changes+1;
   memos:=memos||jsonb_build_object(line.id::text,entry->>'memo');
  END IF;
 END LOOP;
 IF changes>0 THEN
  INSERT INTO public.bf_journal_descriptions(cafe_id,document_id,revision,payload,updated_by) VALUES(p_cafe_id,target,revision,jsonb_build_object('note',new_note,'lineMemos',memos),auth.uid())
   ON CONFLICT(document_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 ELSE revision:=coalesce(stored.revision,0);END IF;
 answer:=jsonb_build_object('id',target,'revision',revision,'changed',changes,'duplicate',false);
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by) VALUES(p_cafe_id,request,'journal_descriptions',p_input,answer,auth.uid());
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_save_journal_descriptions(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_save_journal_descriptions(uuid,jsonb) TO authenticated;

CREATE FUNCTION brand_finance_private.journal_activity_rows(p_cafe uuid,p_doc uuid)
RETURNS TABLE(id text,kind text,action text,event_at timestamptz,actor_id uuid,field text,line_id uuid,before_value text,after_value text,account_name text,account_code text)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH source AS (SELECT d.*,CASE WHEN d.kind IN('sale','settlement','refund') THEN d.id ELSE (SELECT e.source_id FROM public.bf_invoice_payment_events e WHERE e.cafe_id=p_cafe AND e.correction_id=d.id LIMIT 1) END payment_id FROM public.bf_documents d WHERE d.cafe_id=p_cafe AND d.id=p_doc)
 SELECT 'document:'||s.id,'created','إنشاء المستند',s.created_at,s.created_by,NULL::text,NULL::uuid,NULL::text,s.note,NULL::text,NULL::text FROM source s
 UNION ALL
 SELECT 'payment:'||e.id,'payment',CASE WHEN e.action='delete' THEN 'حذف الدفعة بتصحيح محاسبي' WHEN e.correction_id IS NOT NULL THEN 'تصحيح تحصيل الدفعة' ELSE 'تعديل بيانات الدفعة' END,e.created_at,e.created_by,NULL::text,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text FROM public.bf_invoice_payment_events e JOIN source s ON e.cafe_id=p_cafe AND e.source_id=s.payment_id
 UNION ALL
 SELECT 'description:'||e.id,'description',CASE WHEN e.field='document_note' THEN 'تعديل وصف القيد' ELSE 'تعديل وصف سطر القيد' END,e.created_at,e.created_by,e.field,e.line_id,e.before_value,e.after_value,a.name,a.code
 FROM public.bf_journal_description_events e LEFT JOIN public.bf_journal j ON j.cafe_id=e.cafe_id AND j.document_id=e.document_id AND j.id=e.line_id LEFT JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id WHERE e.cafe_id=p_cafe AND e.document_id=p_doc
$$;
REVOKE ALL ON FUNCTION brand_finance_private.journal_activity_rows(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_journal_activity(p_cafe_id uuid,p_id uuid,p_filters jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE requested_action text;actor uuid;start_date date;end_date date;ordering text;start_row integer;answer jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant','auditor') OR NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text)>2000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters) k WHERE k NOT IN('action','actorId','from','to','sort','offset')) THEN RAISE EXCEPTION 'Invalid activity filters' USING ERRCODE='22023';END IF;
 requested_action:=p_filters->>'action';actor:=nullif(p_filters->>'actorId','')::uuid;ordering:=p_filters->>'sort';start_row:=(p_filters->>'offset')::integer;
 IF requested_action IS NULL OR requested_action NOT IN('all','created','payment','description') OR ordering IS NULL OR ordering NOT IN('newest','oldest') OR start_row IS NULL OR start_row NOT BETWEEN 0 AND 10000000 OR coalesce(p_filters->>'from','') !~ '^(|\d{4}-\d{2}-\d{2})$' OR coalesce(p_filters->>'to','') !~ '^(|\d{4}-\d{2}-\d{2})$' THEN RAISE EXCEPTION 'Invalid activity filters' USING ERRCODE='22023';END IF;
 start_date:=nullif(p_filters->>'from','')::date;end_date:=nullif(p_filters->>'to','')::date;
 IF (start_date IS NOT NULL AND NOT isfinite(start_date)) OR (end_date IS NOT NULL AND NOT isfinite(end_date)) OR start_date>end_date THEN RAISE EXCEPTION 'Invalid activity dates' USING ERRCODE='22023';END IF;
 WITH events AS MATERIALIZED(SELECT * FROM brand_finance_private.journal_activity_rows(p_cafe_id,p_id)),filtered AS MATERIALIZED(
  SELECT * FROM events e WHERE (requested_action='all' OR e.kind=requested_action) AND (actor IS NULL OR e.actor_id=actor) AND (start_date IS NULL OR e.event_at>=(start_date::timestamp AT TIME ZONE 'Asia/Riyadh')) AND (end_date IS NULL OR e.event_at<((end_date+1)::timestamp AT TIME ZONE 'Asia/Riyadh'))
 ),page AS (
  SELECT * FROM filtered ORDER BY CASE WHEN ordering='newest' THEN event_at END DESC,CASE WHEN ordering='oldest' THEN event_at END ASC,CASE WHEN ordering='newest' THEN id END DESC,CASE WHEN ordering='oldest' THEN id END ASC OFFSET start_row LIMIT 25
 ) SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'action',action,'createdAt',event_at,'actorId',actor_id,'actor',brand_finance_private.treasury_actor_name(p_cafe_id,actor_id),'field',field,'lineId',line_id,'before',before_value,'after',after_value,'accountName',account_name,'accountCode',account_code) ORDER BY CASE WHEN ordering='newest' THEN event_at END DESC,CASE WHEN ordering='oldest' THEN event_at END ASC,CASE WHEN ordering='newest' THEN id END DESC,CASE WHEN ordering='oldest' THEN id END ASC) FROM page),'[]'::jsonb),
 'total',(SELECT count(*) FROM filtered),'hasMore',(SELECT count(*)>start_row+25 FROM filtered),'offset',start_row,'pageSize',25,
 'actors',coalesce((SELECT jsonb_agg(jsonb_build_object('id',actor_id,'name',brand_finance_private.treasury_actor_name(p_cafe_id,actor_id)) ORDER BY actor_id) FROM (SELECT DISTINCT actor_id FROM events WHERE actor_id IS NOT NULL) actors),'[]'::jsonb),
 'actionOptions',jsonb_build_array(jsonb_build_object('id','all','label','كل الأنشطة'),jsonb_build_object('id','created','label','إنشاء المستند'),jsonb_build_object('id','payment','label','إجراءات الدفعة'),jsonb_build_object('id','description','label','تعديل الأوصاف'))) INTO answer;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_journal_activity(uuid,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_journal_activity(uuid,uuid,jsonb) TO authenticated;

ALTER FUNCTION public.brand_finance_journal_detail(uuid,uuid) SET SCHEMA brand_finance_private;
ALTER FUNCTION brand_finance_private.brand_finance_journal_detail(uuid,uuid) RENAME TO journal_detail_before_descriptions;
REVOKE ALL ON FUNCTION brand_finance_private.journal_detail_before_descriptions(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_journal_detail(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;stored public.bf_journal_descriptions%ROWTYPE;source public.bf_documents%ROWTYPE;invoice public.bf_documents%ROWTYPE;draft public.bf_gl_drafts%ROWTYPE;
 actor_role text;editable boolean;copy_mode text:='none';reverse_mode text:='none';copy_reason text:='هذا القيد مرتبط بمصدره ولا ينسخ كقيد يدوي';reverse_reason text:='تعالج آثار هذا القيد من المستند المصدر';
 rows jsonb;manual jsonb;posted_lines jsonb;normalized jsonb;activity jsonb;payment jsonb;state jsonb;
BEGIN
 result:=brand_finance_private.journal_detail_before_descriptions(p_cafe_id,p_id);
 SELECT * INTO source FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_id;
 SELECT * INTO stored FROM public.bf_journal_descriptions WHERE cafe_id=p_cafe_id AND document_id=p_id;
 actor_role:=brand_finance_private.role_for(p_cafe_id);editable:=actor_role IN('owner','manager','accountant');
 SELECT coalesce(jsonb_agg(x.value||jsonb_build_object('memo',coalesce(stored.payload#>>ARRAY['lineMemos',j.id::text],j.memo),'originalMemo',j.memo,'createdAt',j.created_at,'postingDate',(source.created_at AT TIME ZONE 'Asia/Riyadh')::date,'actorId',source.created_by,'actorName',brand_finance_private.treasury_actor_name(p_cafe_id,source.created_by),'documentNumber',source.number,'currency','SAR','localDebit',j.debit,'localCredit',j.credit,'action','posting') ORDER BY x.ordinality),'[]'::jsonb) INTO rows
 FROM jsonb_array_elements(result->'journal') WITH ORDINALITY x(value,ordinality) JOIN public.bf_journal j ON j.cafe_id=p_cafe_id AND j.document_id=p_id AND j.id=(x.value->>'id')::uuid;
 SELECT * INTO draft FROM public.bf_gl_drafts WHERE cafe_id=p_cafe_id AND document_id=p_id;
 IF draft.id IS NOT NULL THEN
  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('accountId',j.account_id,'code',a.code,'name',a.name,'debit',j.debit,'credit',j.credit,'memo',coalesce(stored.payload#>>ARRAY['lineMemos',j.id::text],j.memo),'projectId',to_jsonb(j)->'project_id','costCenterId',to_jsonb(j)->'cost_center_id')) ORDER BY j.id) INTO posted_lines FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.document_id=p_id;
  manual:=to_jsonb(draft)-'cafe_id'||jsonb_build_object('note',coalesce(stored.payload->>'note',source.note),'lines',coalesce(posted_lines,'[]'::jsonb));
  IF NOT brand_finance_private.gl_enabled(p_cafe_id) THEN copy_reason:='دفتر القيود اليدوية غير مفعل لهذه المنشأة';reverse_reason:=copy_reason;
  ELSIF NOT editable THEN copy_reason:='لا تملك صلاحية إنشاء قيد يدوي';reverse_reason:='لا تملك صلاحية عكس القيد اليدوي';
  ELSE
   BEGIN
    normalized:=brand_finance_private.gl_lines(p_cafe_id,posted_lines);
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(posted_lines) WITH ORDINALITY p(value,n) JOIN jsonb_array_elements(normalized) WITH ORDINALITY x(value,n) USING(n) WHERE nullif(p.value->>'projectId','') IS DISTINCT FROM nullif(x.value->>'projectId','') OR nullif(p.value->>'costCenterId','') IS DISTINCT FROM nullif(x.value->>'costCenterId','')) THEN RAISE EXCEPTION 'أبعاد السطر لا يدعمها مسار النسخ الحالي';END IF;
    IF EXISTS((SELECT l->>'accountId',(l->>'debit')::numeric,(l->>'credit')::numeric,nullif(l->>'projectId',''),nullif(l->>'costCenterId','') FROM jsonb_array_elements(draft.lines) l) EXCEPT ALL (SELECT l->>'accountId',(l->>'debit')::numeric,(l->>'credit')::numeric,nullif(l->>'projectId',''),nullif(l->>'costCenterId','') FROM jsonb_array_elements(posted_lines) l)) THEN RAISE EXCEPTION 'أبعاد القيد غير مرتبطة بسطوره المرحلة';END IF;
    copy_mode:='manual';copy_reason:=NULL;
   EXCEPTION WHEN OTHERS THEN copy_reason:='راجع حسابات القيد وأبعاده قبل إنشاء نسخة';END;
   IF draft.status<>'posted' THEN reverse_reason:='لا يمكن عكس قيد سبق عكسه أو لم يرحل';
   ELSE
    BEGIN
     normalized:=brand_finance_private.gl_lines(p_cafe_id,draft.lines);
     IF normalized<>draft.lines THEN RAISE EXCEPTION 'Original manual lines changed';END IF;
     reverse_mode:='manual';reverse_reason:=NULL;
    EXCEPTION WHEN OTHERS THEN reverse_reason:='تغيرت حسابات القيد أو أبعاده راجع دفتر الأستاذ';END;
   END IF;
  END IF;
 ELSIF source.kind='sale' THEN
  IF editable THEN copy_mode:='invoice';copy_reason:=NULL;state:=brand_finance_private.document_state(p_cafe_id,p_id);
   IF NOT coalesce((state->>'refunded')::boolean,false) AND EXISTS(SELECT 1 FROM public.bf_document_lines WHERE cafe_id=p_cafe_id AND document_id=p_id) THEN reverse_mode:='refund';reverse_reason:=NULL;ELSE reverse_reason:='لا توجد كميات متبقية لإرجاعها في الفاتورة';END IF;
  ELSE copy_reason:='لا تملك صلاحية نسخ الفاتورة';reverse_reason:='لا تملك صلاحية طلب مرتجع';END IF;
 ELSIF source.kind='settlement' AND result->>'invoiceId' IS NOT NULL THEN
  SELECT * INTO invoice FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=(result->>'invoiceId')::uuid;
  state:=brand_finance_private.document_state(p_cafe_id,invoice.id);payment:=brand_finance_private.invoice_payment_record(source,invoice);
  IF editable AND (state->>'outstanding')::numeric>0 THEN copy_mode:='payment';copy_reason:=NULL;ELSE copy_reason:='لا يوجد رصيد فاتورة متاح لتسجيل دفعة جديدة';END IF;
  IF editable AND (payment->>'canDelete')::boolean THEN reverse_mode:='payment';reverse_reason:=NULL;ELSE reverse_reason:=coalesce(payment->>'blockedReason','لا يمكن عكس تحصيل هذه الدفعة');END IF;
 END IF;
 activity:=public.brand_finance_journal_activity(p_cafe_id,p_id,jsonb_build_object('action','all','actorId',NULL,'from','','to','','sort','newest','offset',0));
 result:=jsonb_set(result,'{document,note}',to_jsonb(coalesce(stored.payload->>'note',source.note)));
 RETURN result||jsonb_build_object('journal',rows,'metadata',jsonb_build_object('revision',coalesce(stored.revision,0),'canEdit',editable AND (result->>'journalCount')::integer>0,'note',coalesce(stored.payload->>'note',source.note),'originalNote',source.note),
  'manualDraft',manual,'capabilities',jsonb_build_object('canCopy',copy_mode<>'none','canReverse',reverse_mode<>'none','copyMode',copy_mode,'reverseMode',reverse_mode,'copyReason',copy_reason,'reverseReason',reverse_reason),
  'activity',activity->'rows','activityCount',activity->'total','activityTruncated',activity->'hasMore');
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_journal_detail(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_journal_detail(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
