BEGIN;
ALTER TABLE public.bf_shifts ADD COLUMN supervisor_paused boolean NOT NULL DEFAULT false;
CREATE INDEX bf_shifts_monitor_order ON public.bf_shifts(cafe_id,opened_at DESC,id);
CREATE TABLE public.bf_shift_devices (
 cafe_id uuid NOT NULL, shift_id uuid NOT NULL, device_id uuid NOT NULL,
 last_seen_at timestamptz NOT NULL DEFAULT now(), pending_count integer NOT NULL CHECK(pending_count BETWEEN 0 AND 1000000),
 conflict_count integer NOT NULL CHECK(conflict_count BETWEEN 0 AND pending_count),
 PRIMARY KEY(shift_id,device_id), FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id)
);
CREATE TABLE public.bf_shift_supervision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,shift_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('pause','resume','close')),reason text NOT NULL,
 actor_id uuid NOT NULL,actor_name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 UNIQUE(cafe_id,request_id),FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id)
);
CREATE INDEX bf_shift_supervision_history ON public.bf_shift_supervision(cafe_id,shift_id,created_at DESC);
ALTER TABLE public.bf_shift_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_shift_supervision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_shift_devices,public.bf_shift_supervision FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_shift_supervision FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION public.brand_finance_shift_heartbeat(p_cafe_id uuid,p_shift_id uuid,p_device_id uuid,p_pending integer,p_conflicts integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sh public.bf_shifts%ROWTYPE;
BEGIN
 PERFORM brand_finance_private.role_for(p_cafe_id);
 IF p_device_id IS NULL OR p_pending IS NULL OR p_conflicts IS NULL OR p_pending NOT BETWEEN 0 AND 1000000 OR p_conflicts NOT BETWEEN 0 AND p_pending THEN RAISE EXCEPTION 'Invalid telemetry'; END IF;
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=p_shift_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden shift' USING ERRCODE='42501'; END IF;
 INSERT INTO public.bf_shift_devices(cafe_id,shift_id,device_id,pending_count,conflict_count) VALUES(p_cafe_id,p_shift_id,p_device_id,p_pending,p_conflicts)
 ON CONFLICT(shift_id,device_id) DO UPDATE SET last_seen_at=now(),pending_count=excluded.pending_count,conflict_count=excluded.conflict_count;
 RETURN jsonb_build_object('status',sh.status,'paused',sh.supervisor_paused);
END $$;

CREATE FUNCTION public.brand_finance_shift_monitor(p_cafe_id uuid,p_offset integer DEFAULT 0,p_query text DEFAULT '',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_shift_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb; total bigint; managed boolean;
BEGIN
 managed:=brand_finance_private.role_for(p_cafe_id) IN('owner','manager');
 IF NOT managed THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 OR length(coalesce(p_query,''))>120 THEN RAISE EXCEPTION 'Invalid filter'; END IF;
 WITH filtered AS (
 SELECT s.*,a.name AS drawer_name,brand_finance_private.cash_employee_name(p_cafe_id,s.user_id) AS employee_name,
 CASE WHEN s.status='closed' THEN s.expected_cash ELSE (SELECT coalesce(sum(j.debit-j.credit),0) FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.account_id=s.account_id) END AS current_expected,
 d.last_seen_at,coalesce(d.pending_count,0) AS pending_count,coalesce(d.conflict_count,0) AS conflict_count,
 CASE WHEN s.status='closed' THEN 'closed' WHEN s.supervisor_paused THEN 'paused' WHEN d.last_seen_at IS NULL OR d.last_seen_at<now()-interval '90 seconds' OR d.pending_count>0 THEN 'stalled' ELSE 'active' END AS monitor_status
 FROM public.bf_shifts s JOIN public.bf_accounts a ON a.id=s.account_id AND a.cafe_id=p_cafe_id
 LEFT JOIN LATERAL (SELECT max(last_seen_at) AS last_seen_at,sum(pending_count) AS pending_count,sum(conflict_count) AS conflict_count FROM public.bf_shift_devices WHERE shift_id=s.id) d ON true
 WHERE s.cafe_id=p_cafe_id AND (p_shift_id IS NULL OR s.id=p_shift_id)
 AND (p_from IS NULL OR s.opened_at >= p_from::timestamp AT TIME ZONE 'Asia/Riyadh')
 AND (p_to IS NULL OR s.opened_at < (p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh')
 AND (coalesce(p_query,'')='' OR strpos(lower(concat(s.shift_number,' ',a.name,' ',brand_finance_private.cash_employee_name(p_cafe_id,s.user_id))),lower(p_query))>0)
 ), page AS (SELECT * FROM filtered ORDER BY (status<>'closed') DESC,opened_at DESC,id LIMIT 50 OFFSET p_offset)
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY (status<>'closed') DESC,opened_at DESC,id) FROM page p),'[]'::jsonb),(SELECT count(*) FROM filtered) INTO rows,total;
 RETURN jsonb_build_object('rows',rows,'total',total,'checkedAt',now(),
 'actions',CASE WHEN p_shift_id IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'action',action,'reason',reason,'actor_name',actor_name,'created_at',created_at) ORDER BY created_at DESC) FROM public.bf_shift_supervision WHERE cafe_id=p_cafe_id AND shift_id=p_shift_id),'[]'::jsonb) END);
END $$;

-- Extend the established closing transaction; it still performs count reconciliation,
-- variance alerts, custody transfer, period checks, tenant locking and deduplication.
DO $$ DECLARE src text; needle text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 needle:='IF sh.user_id<>auth.uid() OR sh.status<>''open'' THEN RAISE EXCEPTION ''Only current cashier can close own open shift''; END IF;';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected shift close baseline'; END IF;
 src:=replace(src,needle,$rep$IF p_operation='shift_close' AND p_payload->>'supervisorClose'='true' THEN
 IF r NOT IN('owner','manager') OR sh.status NOT IN('open','handover') OR length(btrim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 3 AND 1000 OR p_payload->>'acknowledgeOffline' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'الإقفال الإداري يتطلب صلاحية إدارية وسبب الإجراء وتأكيد مراجعة الفواتير المحلية' USING ERRCODE='42501'; END IF;
 ELSE IF sh.user_id<>auth.uid() OR sh.status<>'open' THEN RAISE EXCEPTION 'Only current cashier can close own open shift'; END IF; END IF;$rep$);
 needle:='WHERE bf_shifts.id=sh.id; id:=sh.id;';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected shift update baseline'; END IF;
 src:=replace(src,needle,needle||$rep$
 IF p_operation='shift_close' AND p_payload->>'supervisorClose'='true' THEN
 INSERT INTO public.bf_shift_supervision(cafe_id,shift_id,action,reason,actor_id,actor_name,request_id,payload,result)
 VALUES(p_cafe_id,sh.id,'close',btrim(p_payload->>'reason'),auth.uid(),brand_finance_private.cash_employee_name(p_cafe_id,auth.uid()),p_request_id,p_payload,jsonb_build_object('id',sh.id));
 END IF;
 $rep$);
 needle:='   SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND bf_shifts.id=sid AND user_id=auth.uid() AND status=''open'' FOR UPDATE;';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected sale guard baseline'; END IF;
 src:=replace(src,needle,needle||E'\n   IF sh.supervisor_paused THEN RAISE EXCEPTION ''الوردية موقوفة إداريًا احتفظ بالفاتورة وأعد المزامنة بعد استئناف الوردية''; END IF;');
 EXECUTE src;
 SELECT pg_get_functiondef('brand_finance_private.close_cash_handover(uuid,uuid,jsonb)'::regprocedure) INTO src;
 needle:='AND user_id=auth.uid() AND status=''closed''';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected custody guard baseline'; END IF;
 EXECUTE replace(src,needle,$rep$AND (user_id=auth.uid() OR (p_payload->>'supervisorClose'='true' AND brand_finance_private.role_for(p_cafe) IN('owner','manager'))) AND status='closed'$rep$);
END $$;

CREATE FUNCTION public.brand_finance_supervise_shift(p_cafe_id uuid,p_shift_id uuid,p_action text,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sh public.bf_shifts%ROWTYPE; old public.bf_shift_supervision%ROWTYPE; body jsonb; result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN('pause','resume') OR p_request_id IS NULL OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'أدخل سبب الإجراء'; END IF;
 body:=jsonb_build_object('shiftId',p_shift_id,'action',p_action,'reason',btrim(p_reason));
 SELECT * INTO old FROM public.bf_shift_supervision WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF old.payload<>body OR old.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Request identifier conflict'; END IF; RETURN old.result; END IF;
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=p_shift_id FOR UPDATE;
 IF NOT FOUND OR sh.status<>'open' THEN RAISE EXCEPTION 'الإجراء متاح للورديات المفتوحة فقط'; END IF;
 IF sh.supervisor_paused=(p_action='pause') THEN RAISE EXCEPTION 'حالة الوردية تغيرت حدث السجل'; END IF;
 UPDATE public.bf_shifts SET supervisor_paused=(p_action='pause') WHERE id=sh.id;
 result:=jsonb_build_object('id',sh.id);
 INSERT INTO public.bf_shift_supervision(cafe_id,shift_id,action,reason,actor_id,actor_name,request_id,payload,result) VALUES(p_cafe_id,sh.id,p_action,btrim(p_reason),auth.uid(),brand_finance_private.cash_employee_name(p_cafe_id,auth.uid()),p_request_id,body,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_shift_heartbeat(uuid,uuid,uuid,integer,integer), public.brand_finance_shift_monitor(uuid,integer,text,date,date,uuid), public.brand_finance_supervise_shift(uuid,uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.brand_finance_shift_heartbeat(uuid,uuid,uuid,integer,integer), public.brand_finance_shift_monitor(uuid,integer,text,date,date,uuid), public.brand_finance_supervise_shift(uuid,uuid,text,text,uuid) TO authenticated;
COMMIT;
