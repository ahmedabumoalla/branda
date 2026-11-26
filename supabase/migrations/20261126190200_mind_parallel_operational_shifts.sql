BEGIN;

-- Only this finance tenant uses concurrent operational sessions.
CREATE UNIQUE INDEX bf_one_live_shift_other_brands ON public.bf_shifts(cafe_id,user_id)
 WHERE status IN ('open','handover') AND cafe_id <> 'ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef';
CREATE UNIQUE INDEX bf_one_live_drawer_other_brands ON public.bf_shifts(cafe_id,account_id)
 WHERE status IN ('open','handover') AND cafe_id <> 'ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef';
DROP INDEX public.bf_one_live_shift;
DROP INDEX public.bf_one_live_drawer;
ALTER INDEX public.bf_one_live_drawer_other_brands RENAME TO bf_one_live_drawer;
ALTER INDEX public.bf_one_live_shift_other_brands RENAME TO bf_one_live_shift;
CREATE INDEX bf_mind_live_sessions ON public.bf_shifts(user_id,opened_at DESC,shift_number DESC)
 WHERE cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND status IN ('open','handover');
CREATE INDEX bf_mind_drawer_latest ON public.bf_shifts(account_id,opened_at DESC,shift_number DESC,id DESC)
 WHERE cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef';
CREATE INDEX bf_mind_shift_documents ON public.bf_documents(shift_id,id)
 WHERE cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND shift_id IS NOT NULL;

-- Latest means latest start, even when that newer session is now closed.
CREATE FUNCTION brand_finance_private.mind_drawer_shift(p_drawer uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT id FROM public.bf_shifts WHERE cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND account_id=p_drawer
 ORDER BY opened_at DESC,shift_number DESC,id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION brand_finance_private.mind_drawer_shift(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.mind_drawer_summary(p_drawer uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',s.id,'account_id',s.account_id,'user_id',s.user_id,'status',s.status,
   'supervisor_paused',s.supervisor_paused,'shift_number',s.shift_number,'opened_at',s.opened_at)
 FROM public.bf_shifts s WHERE s.cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef'
  AND s.id=brand_finance_private.mind_drawer_shift(p_drawer)
$$;
REVOKE ALL ON FUNCTION brand_finance_private.mind_drawer_summary(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.mind_session_cash(p_shift uuid,p_drawer uuid,p_opening numeric)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_opening + coalesce(sum(j.debit-j.credit),0)
 FROM public.bf_documents d JOIN public.bf_journal j ON j.cafe_id=d.cafe_id AND j.document_id=d.id
 WHERE d.cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND d.shift_id=p_shift
   AND j.account_id=p_drawer AND d.kind<>'shift_variance'
   AND d.created_at < coalesce((
    SELECT later.opened_at FROM public.bf_shifts current_session JOIN public.bf_shifts later
      ON later.cafe_id=current_session.cafe_id AND later.account_id=current_session.account_id
      AND (later.opened_at,later.shift_number,later.id)>(current_session.opened_at,current_session.shift_number,current_session.id)
    WHERE current_session.cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND current_session.id=p_shift
    ORDER BY later.opened_at,later.shift_number,later.id LIMIT 1
   ),'infinity'::timestamptz)
$$;

-- Called inside the original request lock after role/payload/replay checks.
CREATE FUNCTION brand_finance_private.mind_operational_shift(p_cafe uuid,p_operation text,p_payload jsonb,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 actor uuid:=auth.uid();
 actor_role text:=brand_finance_private.role_for(p_cafe);
 administrative boolean:=coalesce(p_payload->>'supervisorClose'='true',false);
 sh public.bf_shifts%ROWTYPE;
 result jsonb;
BEGIN
 IF p_cafe IS DISTINCT FROM 'ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef'::uuid OR actor IS NULL
    OR coalesce(actor_role,'') NOT IN ('owner','manager','cashier') THEN
  RAISE EXCEPTION 'Shift access denied' USING ERRCODE='42501';
 END IF;
 IF p_operation='shift_open' THEN
  IF NOT EXISTS (SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=p_cafe AND a.id=(p_payload->>'accountId')::uuid
                 AND a.kind='cash' AND a.is_cashier_drawer AND a.active) THEN
   RAISE EXCEPTION 'اختر صندوق كاشير نشطا تابعا للعلامة';
  END IF;
  INSERT INTO public.bf_shifts(cafe_id,user_id,account_id,opening_cash,expected_cash,opened_at)
   VALUES(p_cafe,actor,(p_payload->>'accountId')::uuid,0,0,clock_timestamp()) RETURNING * INTO sh;
 ELSIF p_operation='shift_close' THEN
  SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe AND id=(p_payload->>'shiftId')::uuid FOR UPDATE;
  IF NOT FOUND OR (administrative AND coalesce(actor_role,'') NOT IN ('owner','manager'))
     OR (NOT administrative AND sh.user_id<>actor AND
        (sh.status='closed' OR sh.id IS DISTINCT FROM brand_finance_private.mind_drawer_shift(sh.account_id))) THEN
   RAISE EXCEPTION 'Shift access denied' USING ERRCODE='42501';
  END IF;
  IF sh.status<>'closed' THEN
   -- Legacy handovers have a committed count; closing them never re-counts money.
   UPDATE public.bf_shifts
      SET status='closed', closed_at=coalesce(closed_at,clock_timestamp()), handover_to=NULL,
          expected_cash=CASE WHEN sh.status='handover' THEN sh.expected_cash
            ELSE brand_finance_private.mind_session_cash(sh.id,sh.account_id,sh.opening_cash) END
    WHERE cafe_id=p_cafe AND id=sh.id;
   IF administrative OR sh.user_id<>actor THEN
    INSERT INTO public.bf_shift_supervision(cafe_id,shift_id,action,reason,actor_id,actor_name,request_id,payload,result)
    VALUES(p_cafe,sh.id,'close',coalesce(nullif(btrim(p_payload->>'reason'),''),'إغلاق الوردية'),
           actor,brand_finance_private.cash_employee_name(p_cafe,actor),p_request,p_payload,jsonb_build_object('id',sh.id));
   END IF;
  END IF;
 ELSE
  RAISE EXCEPTION 'Unsupported shift operation';
 END IF;
 result:=jsonb_build_object('id',sh.id,'number',NULL,'drawerShift',brand_finance_private.mind_drawer_summary(sh.account_id));
 INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by)
 VALUES(p_cafe,p_request,p_operation,p_payload,result,actor);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION brand_finance_private.mind_session_cash(uuid,uuid,numeric),
 brand_finance_private.mind_operational_shift(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- A shift gets its normal number but its zero assigned float is not a physical
-- till count. Do not create an opening variance or sign someone else's receipt.
DO $patch$
DECLARE src text; needle text;
BEGIN
 src:=pg_get_functiondef('brand_finance_private.cash_shift_before()'::regprocedure);
 needle:='SELECT coalesce(sum(debit-credit),0) INTO NEW.opening_expected_cash';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected opening count baseline'; END IF;
 EXECUTE replace(src,needle,$insert$
 IF NEW.cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' THEN
  NEW.opening_expected_cash:=NULL;
  NEW.opening_variance:=NULL;
  RETURN NEW;
 END IF;
 $insert$||needle);

 src:=pg_get_functiondef('brand_finance_private.accept_cash_handover()'::regprocedure);
 needle:='SELECT h1.* INTO h FROM public.bf_cash_handovers h1';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected opening custody baseline'; END IF;
 EXECUTE replace(src,needle,$insert$IF NEW.cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' THEN RETURN NEW; END IF;
 $insert$||needle);

 src:=pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure);
 needle:='PERFORM brand_finance_private.seed(p_cafe_id);';
 IF strpos(src,needle)=0 OR strpos(src,'RETURN old.result') NOT BETWEEN 1 AND strpos(src,needle) THEN
  RAISE EXCEPTION 'Unexpected request replay baseline';
 END IF;
 EXECUTE replace(src,needle,$insert$IF p_cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND p_operation IN ('shift_open','shift_close') THEN
  RETURN brand_finance_private.mind_operational_shift(p_cafe_id,p_operation,p_payload,p_request_id);
 END IF;
 $insert$||needle);
END $patch$;

-- The journal keeps the authenticated employee as seller. Change only which
-- shift may receive that employee's sale, including the hospital credit route.
DO $patch$
DECLARE src text; needle text; sig regprocedure;
BEGIN
 src:=pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure);
 needle:='bf_shifts.id=sid AND user_id=auth.uid() AND status=''open'' FOR UPDATE;';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected POS sale shift baseline'; END IF;
 EXECUTE replace(src,needle,$sale$bf_shifts.id=sid AND status='open' AND
     CASE WHEN p_cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef'
          THEN bf_shifts.id=brand_finance_private.mind_drawer_shift(bf_shifts.account_id)
          ELSE user_id=auth.uid() END FOR UPDATE;$sale$);

 FOREACH sig IN ARRAY ARRAY['hospital_private.account_guard(uuid,text,uuid,uuid)'::regprocedure,
                            'hospital_private.posting_guard(uuid,uuid)'::regprocedure] LOOP
  src:=pg_get_functiondef(sig);
  needle:='id=shift AND user_id=auth.uid() AND status=''open''';
  IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected hospital sale shift baseline'; END IF;
  EXECUTE replace(src,needle,$sale$id=shift AND status='open' AND
    CASE WHEN c='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' THEN bf_shifts.id=brand_finance_private.mind_drawer_shift(bf_shifts.account_id)
         ELSE user_id=auth.uid() END$sale$);
 END LOOP;

 src:=pg_get_functiondef('public.brand_finance_shift_heartbeat(uuid,uuid,uuid,integer,integer)'::regprocedure);
 needle:='id=p_shift_id AND user_id=auth.uid()';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected cashier heartbeat baseline'; END IF;
 EXECUTE replace(src,needle,needle||$heartbeat$ OR
   (p_cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND cafe_id=p_cafe_id AND id=p_shift_id
    AND brand_finance_private.role_for(p_cafe_id) IN ('owner','manager','cashier')
    AND id=brand_finance_private.mind_drawer_shift(account_id))$heartbeat$);
END $patch$;

-- Other brands retain the recent 200 entries. For MIND include every own live
-- session outside that history window; the paginated monitor handles the team.
DO $patch$
DECLARE src text; needle text;
BEGIN
 src:=pg_get_functiondef('brand_finance_private.snapshot_before_job_roles(uuid)'::regprocedure);
 needle:='SELECT * FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND (managed OR user_id=auth.uid() OR handover_to=auth.uid()) ORDER BY opened_at DESC LIMIT 200';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected snapshot shift history baseline'; END IF;
 src:=replace(src,needle,$history$
  WITH recent AS MATERIALIZED (
   SELECT * FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND (managed OR user_id=auth.uid() OR handover_to=auth.uid())
   ORDER BY opened_at DESC,shift_number DESC LIMIT 200
  )
  SELECT * FROM recent UNION ALL SELECT live.* FROM public.bf_shifts live
   WHERE p_cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND live.cafe_id=p_cafe_id AND live.user_id=auth.uid()
    AND live.status IN ('open','handover') AND NOT EXISTS (SELECT 1 FROM recent WHERE id=live.id)
 $history$);
 needle:='WHEN s.status=''closed'' THEN s.expected_cash';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected snapshot shift cash baseline'; END IF;
 src:=replace(src,needle,needle||$cash$
    WHEN p_cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' THEN brand_finance_private.mind_session_cash(s.id,s.account_id,s.opening_cash)$cash$);
 needle:='RETURN answer;';
 IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected snapshot response baseline'; END IF;
 EXECUTE replace(src,needle,$drawers$
 IF p_cafe_id='ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef' AND r IN ('owner','manager','cashier') THEN
  answer:=answer||jsonb_build_object('mindDrawerShifts',coalesce((
   SELECT jsonb_agg(brand_finance_private.mind_drawer_summary(a.id) ORDER BY a.id)
   FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.is_cashier_drawer AND a.active
    AND EXISTS (SELECT 1 FROM public.bf_shifts s WHERE s.cafe_id=p_cafe_id AND s.account_id=a.id)
  ),'[]'::jsonb));
 END IF;
 $drawers$||needle);
END $patch$;

DO $patch$
DECLARE src text; row_alias text; sig regprocedure; needle text;
BEGIN
 FOREACH sig IN ARRAY ARRAY['public.brand_finance_shift_monitor(uuid,integer,text,date,date,uuid)'::regprocedure,
                            'public.brand_finance_shift_sessions(uuid,text,uuid,jsonb)'::regprocedure] LOOP
  row_alias:=CASE WHEN sig='public.brand_finance_shift_monitor(uuid,integer,text,date,date,uuid)'::regprocedure THEN 's' ELSE 'p' END;
  src:=pg_get_functiondef(sig);
  needle:=format('WHEN %1$s.status=''closed'' THEN %1$s.expected_cash',row_alias);
  IF strpos(src,needle)=0 THEN RAISE EXCEPTION 'Unexpected shift monitoring baseline'; END IF;
  EXECUTE replace(src,needle,needle||format(
   ' WHEN p_cafe_id=''ab9323ef-ff0e-42ad-8cf8-b8b8f92a48ef'' THEN brand_finance_private.mind_session_cash(%1$s.id,%1$s.account_id,%1$s.opening_cash)',row_alias));
 END LOOP;
END $patch$;

COMMIT;
