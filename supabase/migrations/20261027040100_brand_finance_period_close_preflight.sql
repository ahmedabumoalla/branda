-- CLI scaffold 20261027011933 reordered after previously published migration timestamps
-- Forward-only: retain closure evidence; a future corrective migration must preserve history
BEGIN;
CREATE TABLE public.bf_period_closures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 previous_closed_through date,
 closed_through date NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL,
 UNIQUE(cafe_id,request_id),
 CHECK(previous_closed_through IS NULL OR closed_through>previous_closed_through)
);
CREATE INDEX bf_period_closures_history ON public.bf_period_closures(cafe_id,created_at DESC,id);
ALTER TABLE public.bf_period_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_period_closures FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_period_closures
 FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.assert_period_close(p_cafe uuid,p_payload jsonb,p_request uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_cutoff date; cutoff date:=nullif(p_payload->>'closedThrough','')::date;
 cutoff_end timestamptz; reason text:=btrim(coalesce(p_payload->>'periodCloseReason',''));
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 IF brand_finance_private.role_for(p_cafe)<>'owner' THEN
  RAISE EXCEPTION 'إقفال الفترة متاح لمالك العلامة فقط' USING ERRCODE='42501';
 END IF;
 SELECT closed_through INTO previous_cutoff FROM public.bf_settings WHERE cafe_id=p_cafe FOR UPDATE;
 IF previous_cutoff IS NOT NULL AND (cutoff IS NULL OR cutoff<previous_cutoff) THEN
  RAISE EXCEPTION 'لا يمكن إعادة فتح فترة مقفلة';
 END IF;
 -- Unchanged policy updates and pre-existing closure dates do not create new closure events
 IF cutoff IS NOT DISTINCT FROM previous_cutoff THEN RETURN; END IF;
 IF cutoff IS NULL THEN RETURN; END IF;
 IF cutoff>=(now() AT TIME ZONE 'Asia/Riyadh')::date THEN
  RAISE EXCEPTION 'اختر نهاية يوم مكتمل قبل اليوم الحالي بتوقيت الرياض';
 END IF;
 IF length(reason) NOT BETWEEN 3 AND 1000 OR p_request IS NULL THEN
  RAISE EXCEPTION 'أدخل سبب إقفال الفترة من 3 إلى 1000 حرف';
 END IF;
 cutoff_end:=(cutoff+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
 IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe
  AND status IN('open','handover') AND opened_at<cutoff_end) THEN
  RAISE EXCEPTION 'أكمل إقفال الورديات وتسليمها ضمن الفترة قبل إقفال الفترة المالية';
 END IF;
 IF EXISTS(SELECT 1 FROM public.bf_cash_handovers h
  JOIN public.bf_shifts s ON s.cafe_id=h.cafe_id AND s.id=h.shift_id
  WHERE h.cafe_id=p_cafe AND s.opened_at<cutoff_end
  AND NOT EXISTS(SELECT 1 FROM public.bf_cash_handover_receipts r WHERE r.cafe_id=h.cafe_id AND r.handover_id=h.id)) THEN
  RAISE EXCEPTION 'أكد استلام جميع مبالغ تسليم الصناديق المرتبطة بورديات الفترة أولًا';
 END IF;
 INSERT INTO public.bf_period_closures(cafe_id,previous_closed_through,closed_through,reason,actor_id,request_id)
 VALUES(p_cafe,previous_cutoff,cutoff,reason,auth.uid(),p_request);
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.assert_period_close(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Integrate after the established tenant lock, owner authorization and request deduplication
-- The audit insert rolls back with the settings update if any validation fails
DO $$ DECLARE source text; needle text:='IF p_operation=''settings'' THEN'; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 IF strpos(source,needle)=0 OR strpos(source,'assert_period_close')>0 THEN
  RAISE EXCEPTION 'Unexpected finance settings baseline';
 END IF;
 EXECUTE replace(source,needle,needle||E'\n  PERFORM brand_finance_private.assert_period_close(p_cafe_id,p_payload,p_request_id);');
END $$;

CREATE FUNCTION public.brand_finance_period_closures(p_cafe_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text; rows jsonb; total bigint;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF role_name NOT IN('owner','manager','accountant','auditor') THEN
  RAISE EXCEPTION 'لا تملك صلاحية الاطلاع على سجل إقفال الفترات' USING ERRCODE='42501';
 END IF;
 SELECT count(*) INTO total FROM public.bf_period_closures WHERE cafe_id=p_cafe_id;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC,c.id),'[]'::jsonb) INTO rows
 FROM (SELECT id,previous_closed_through,closed_through,reason,actor_id,created_at,
  brand_finance_private.cash_employee_name(p_cafe_id,actor_id) AS actor_name
  FROM public.bf_period_closures WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id LIMIT 50) c;
 RETURN jsonb_build_object('rows',rows,'total',total,'hasMore',total>50);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_period_closures(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_period_closures(uuid) TO authenticated;
COMMIT;
