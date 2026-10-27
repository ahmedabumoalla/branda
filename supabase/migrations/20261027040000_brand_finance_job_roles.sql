BEGIN;

-- New job roles must never inherit the old non-cashier write fallback.
ALTER TABLE public.bf_staff DROP CONSTRAINT bf_staff_role_check;
ALTER TABLE public.bf_staff ADD CONSTRAINT bf_staff_role_check
 CHECK(role IN('manager','cashier','accountant','warehouse','auditor'));

CREATE FUNCTION brand_finance_private.operation_allowed(p_role text,p_operation text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE
 WHEN p_operation IN('settings','staff') THEN p_role='owner'
 WHEN p_operation IN('item','warehouse','stock_adjust','stock_transfer') THEN p_role IN('owner','manager','warehouse')
 WHEN p_operation IN('refund_approve','refund_reject') THEN p_role='owner'
 WHEN p_operation IN('purchase','party','account','journal','treasury','settlement') THEN p_role IN('owner','manager','accountant')
 WHEN p_operation='refund' THEN p_role IN('owner','manager','accountant','cashier')
 WHEN p_operation IN('sale','shift_open','shift_close','shift_handover','shift_accept','supplier_payout') THEN p_role IN('owner','manager','cashier')
 ELSE false END
$$;

CREATE FUNCTION brand_finance_private.assert_job_access(p_cafe uuid,p_endpoint text,p_operation text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; allowed boolean:=false;
BEGIN
 r:=brand_finance_private.role_for(p_cafe);
 IF p_endpoint='brand_finance_execute' THEN
  allowed:=brand_finance_private.operation_allowed(r,p_operation);
 ELSIF r IN('owner','manager','cashier') THEN
  -- Preserve all existing, narrower guards for the established roles.
  RETURN;
 ELSIF p_endpoint='brand_finance_snapshot' THEN allowed:=true;
 ELSIF p_endpoint='brand_finance_history' THEN
  allowed:=r IN('accountant','auditor') OR (r='warehouse' AND p_operation='movements');
 ELSIF p_endpoint IN('brand_finance_treasury_snapshot','brand_finance_treasury_statement','brand_finance_treasury_history','brand_finance_terminal_fee_history','brand_finance_cash_differences','brand_finance_cash_handovers','brand_finance_shift_monitor','brand_finance_shift_analytics','brand_finance_pos_shift_report') THEN allowed:=r IN('accountant','auditor');
 ELSIF p_endpoint IN('brand_finance_treasury_execute','brand_finance_receive_shift_cash','brand_finance_save_customer') THEN allowed:=r='accountant';
 ELSIF p_endpoint='brand_finance_treasury_attachment' THEN allowed:=r='accountant' OR (r='auditor' AND p_operation IN('list','get'));
 ELSIF p_endpoint='brand_finance_shift_attachment' THEN allowed:=r IN('accountant','auditor') AND p_operation='read';
 END IF;
 IF NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'لا تملك صلاحية تنفيذ هذه العملية' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.operation_allowed(text,text),brand_finance_private.assert_job_access(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

-- Guard every currently exposed tenant RPC, including lesser-used write endpoints
-- such as pager transitions, heartbeat and attachment finalization. Unknown
-- endpoints remain unavailable to new roles until explicitly classified.
DO $$
DECLARE f record; source text; action text; guard text;
BEGIN
 FOR f IN SELECT p.oid,p.proname,p.proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'brand_finance_%'
   AND 'p_cafe_id'=ANY(p.proargnames) AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 LOOP
  source:=pg_get_functiondef(f.oid);
  IF source NOT LIKE '%LANGUAGE plpgsql%' THEN RAISE EXCEPTION 'Unclassified finance RPC language: %',f.proname; END IF;
  action:=CASE WHEN f.proname IN('brand_finance_execute','brand_finance_treasury_execute') THEN 'p_operation'
    WHEN f.proname='brand_finance_history' THEN 'p_kind'
    WHEN f.proname='brand_finance_shift_attachment' THEN $s$CASE WHEN p_finalize THEN 'write' ELSE 'read' END$s$
    WHEN f.proname='brand_finance_treasury_attachment' THEN 'p_action' ELSE 'NULL' END;
  guard:=format(E'BEGIN\n PERFORM brand_finance_private.assert_job_access(p_cafe_id,%L,%s);',f.proname,action);
  IF source !~ '\mBEGIN\M' THEN RAISE EXCEPTION 'Finance RPC has no body: %',f.proname; END IF;
  EXECUTE regexp_replace(source,'\mBEGIN\M',guard);
 END LOOP;
END $$;

-- Expand existing read guards only; never impersonate manager or alter role_for.
DO $$
DECLARE f record; source text; before_source text;
BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' AND p.proname IN('brand_finance_snapshot','brand_finance_treasury_snapshot','brand_finance_treasury_statement','brand_finance_treasury_history','brand_finance_terminal_fee_history','brand_finance_cash_differences','brand_finance_cash_handovers','brand_finance_shift_monitor','brand_finance_shift_analytics','brand_finance_pos_shift_report'))
   OR (n.nspname='brand_finance_private' AND (p.proname LIKE 'snapshot_before_%' OR p.proname LIKE 'pos_report_before_%'))
 LOOP
  source:=pg_get_functiondef(f.oid);before_source:=source;
  source:=replace(source,$s$('owner','manager')$s$,$s$('owner','manager','accountant','auditor')$s$);
  source:=replace(source,$s$('owner','manager','cashier')$s$,$s$('owner','manager','accountant','auditor','cashier')$s$);
  IF f.proname LIKE '%snapshot%' AND f.proname NOT LIKE '%treasury%' THEN
   source:=replace(source,$s$managed:=r IN('owner','manager','accountant','auditor')$s$,$s$managed:=r IN('owner','manager','accountant','auditor','warehouse')$s$);
  END IF;
  IF f.proname='brand_finance_cash_handovers' THEN
   source:=replace(source,$s$'canReceive',managed$s$,$s$'canReceive',role_name IN('owner','manager','accountant')$s$);
   source:=replace(source,$s$s.role='manager'$s$,$s$s.role IN('manager','accountant')$s$);
  END IF;
  IF source<>before_source THEN EXECUTE source; END IF;
 END LOOP;
END $$;

-- Narrow writing guards for accountants. The outer gate still denies auditors,
-- warehouse staff and all unclassified operations before any write takes place.
DO $$
DECLARE f record; source text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' AND p.proname IN('brand_finance_treasury_execute','brand_finance_receive_shift_cash','brand_finance_save_customer','brand_finance_treasury_attachment'))
   OR (n.nspname='brand_finance_private' AND (p.proname LIKE 'treasury_execute_before_%' OR p.proname='post_refund'))
 LOOP
  source:=pg_get_functiondef(f.oid);
  source:=replace(source,$s$('owner','manager')$s$,$s$('owner','manager','accountant')$s$);
  -- Auditor attachments have an outer list/get-only guard.
  IF source LIKE '%FUNCTION public.brand_finance_treasury_attachment(%' THEN
   source:=replace(source,$s$('owner','manager','accountant')$s$,$s$('owner','manager','accountant','auditor')$s$);
  END IF;
  EXECUTE source;
 END LOOP;
END $$;

DO $$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.close_cash_handover(uuid,uuid,jsonb)'::regprocedure) INTO source;
 EXECUTE replace(source,$s$s.role='manager'$s$,$s$s.role IN('manager','accountant')$s$);
END $$;

DO $$ DECLARE source text; needle text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 needle:='public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=uid AND active';
 IF strpos(source,needle)=0 THEN RAISE EXCEPTION 'Shift handover recipient guard unavailable'; END IF;
 EXECUTE replace(source,needle,needle||$s$ AND role IN('manager','cashier')$s$);
END $$;

ALTER FUNCTION public.brand_finance_snapshot(uuid) RENAME TO snapshot_before_job_roles;
ALTER FUNCTION public.snapshot_before_job_roles(uuid) SET SCHEMA brand_finance_private;
REVOKE ALL ON FUNCTION brand_finance_private.snapshot_before_job_roles(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; answer jsonb;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 answer:=brand_finance_private.snapshot_before_job_roles(p_cafe_id);
 -- Access and editability are deliberately separate; dashboard code uses capabilities.
 answer:=answer||jsonb_build_object('canManage',r<>'cashier','canAdminister',r='owner');
 IF r IN('accountant','auditor','warehouse') THEN answer:=answer||jsonb_build_object('staff','[]'::jsonb); END IF;
 IF r='cashier' THEN
  answer:=jsonb_set(answer,'{staff}',coalesce((SELECT jsonb_agg(s) FROM jsonb_array_elements(answer->'staff') s WHERE s->>'role' IN('manager','cashier')),'[]'::jsonb));
 END IF;
 IF r='warehouse' THEN
  answer:=answer||jsonb_build_object('accounts','[]'::jsonb,'parties','[]'::jsonb,'documents','[]'::jsonb,'journal','[]'::jsonb,'trialBalance','[]'::jsonb,'shifts','[]'::jsonb,'refundRequests','[]'::jsonb,
   'summary',jsonb_build_object('sales',0,'purchases',0,'expenses',0,'profit',0,'receivables',0,'payables',0,'inventoryValue',coalesce((answer->'summary'->>'inventoryValue')::numeric,0)));
 END IF;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_snapshot(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_snapshot(uuid) TO authenticated;

-- Prevent role changes from stranding custody or allowing a read-only employee
-- to retain an open register from an earlier cashier assignment.
CREATE FUNCTION brand_finance_private.staff_role_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role AND EXISTS(SELECT 1 FROM public.bf_shifts s WHERE s.cafe_id=OLD.cafe_id AND s.status IN('open','handover') AND (s.user_id=OLD.user_id OR s.handover_to=OLD.user_id)) THEN
  RAISE EXCEPTION 'أغلق وردية الموظف وأكمل تسليم عهدته قبل تغيير دوره';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.staff_role_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_staff_role_guard BEFORE UPDATE OF role ON public.bf_staff FOR EACH ROW EXECUTE FUNCTION brand_finance_private.staff_role_guard();
COMMIT;
