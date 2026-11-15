BEGIN;

-- An independent loyalty credential remains independent until the authenticated
-- finance identity is proved to be the same named owner or verified phone holder.
ALTER TABLE public.cafe_cashier_sessions ADD COLUMN finance_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.cafe_cashiers ADD COLUMN finance_user_id uuid REFERENCES auth.users(id);

CREATE FUNCTION public.brand_finance_bind_loyalty_session(p_session_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.cafe_cashier_sessions; c public.cafe_cashiers; u auth.users;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.cafe_cashier_sessions WHERE token=p_session_token AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid cashier session';END IF;
 SELECT * INTO c FROM public.cafe_cashiers WHERE id=s.cashier_id AND cafe_id=s.cafe_id AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid cashier session';END IF;
 IF s.finance_user_id IS NOT NULL AND s.finance_user_id<>auth.uid() THEN RAISE EXCEPTION 'Loyalty session belongs to another employee' USING ERRCODE='42501';END IF;
 IF c.finance_user_id IS NOT NULL AND c.finance_user_id<>auth.uid() THEN RAISE EXCEPTION 'Loyalty cashier belongs to another employee' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=s.cafe_id AND user_id=auth.uid() AND active) THEN
  RETURN jsonb_build_object('linked',s.finance_user_id IS NOT NULL);
 END IF;
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF c.owner_user_id IS DISTINCT FROM auth.uid() AND (u.phone_confirmed_at IS NULL OR public.normalize_customer_phone(u.phone) IS NULL OR public.normalize_customer_phone(u.phone) IS DISTINCT FROM public.normalize_customer_phone(c.phone)) THEN
  RAISE EXCEPTION 'Use your own loyalty cashier account with the same verified phone' USING ERRCODE='42501';
 END IF;
 UPDATE public.cafe_cashier_sessions SET finance_user_id=auth.uid() WHERE id=s.id;
 UPDATE public.cafe_cashiers SET finance_user_id=auth.uid() WHERE id=c.id;
 -- Persist the proved identity even when read is denied; the subsequent guard
 -- rejects access without allowing a logout to detach this cashier token.
 RETURN jsonb_build_object('linked',true,'allowed',employee_access_private.allows(s.cafe_id,'loyalty.read',true));
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_bind_loyalty_session(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_bind_loyalty_session(text) TO authenticated;

CREATE FUNCTION public.brand_finance_loyalty_session_guard(p_session_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.cafe_cashier_sessions;c public.cafe_cashiers;matched uuid[];actor uuid;allowed boolean;old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);
BEGIN
 SELECT * INTO s FROM public.cafe_cashier_sessions WHERE token=p_session_token AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid cashier session';END IF;
 SELECT * INTO c FROM public.cafe_cashiers WHERE id=s.cashier_id AND cafe_id=s.cafe_id AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid cashier session';END IF;
 actor:=coalesce(s.finance_user_id,c.finance_user_id);
 IF actor IS NULL AND c.owner_user_id IS NULL AND c.phone IS NOT NULL THEN
  SELECT array_agg(DISTINCT u.id) INTO matched FROM auth.users u JOIN public.bf_staff f ON f.user_id=u.id AND f.cafe_id=s.cafe_id
   WHERE u.phone_confirmed_at IS NOT NULL AND public.normalize_customer_phone(u.phone)=public.normalize_customer_phone(c.phone);
  IF cardinality(matched)>1 THEN RAISE EXCEPTION 'Ambiguous finance employee identity' USING ERRCODE='42501';END IF;
  actor:=matched[1];
 END IF;
 IF actor IS NOT NULL THEN
  IF s.finance_user_id IS NOT NULL AND c.finance_user_id IS NOT NULL AND s.finance_user_id<>c.finance_user_id THEN RAISE EXCEPTION 'Employee identity conflict' USING ERRCODE='42501';END IF;
  UPDATE public.cafe_cashier_sessions SET finance_user_id=actor WHERE id=s.id;UPDATE public.cafe_cashiers SET finance_user_id=actor WHERE id=c.id;
  s.finance_user_id:=actor;
 END IF;
 IF s.finance_user_id IS NULL THEN RETURN jsonb_build_object('linked',false);END IF;
 PERFORM set_config('request.jwt.claim.sub',s.finance_user_id::text,true);
 PERFORM set_config('request.jwt.claims',(coalesce(nullif(old_claims,'')::jsonb,'{}')||jsonb_build_object('sub',s.finance_user_id))::text,true);
 BEGIN
  allowed:=CASE WHEN employee_access_private.member(s.cafe_id,s.finance_user_id) THEN employee_access_private.allows(s.cafe_id,'loyalty.read',true) ELSE false END;
 EXCEPTION WHEN insufficient_privilege THEN allowed:=false;
 END;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 RETURN jsonb_build_object('linked',true,'allowed',allowed);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_loyalty_session_guard(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_loyalty_session_guard(text) TO service_role;

CREATE FUNCTION employee_access_private.loyalty_request(c uuid,k text,op text,p jsonb,r uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing uuid;revision integer;scope jsonb;
BEGIN
 scope:=erp_branch_private.scope(c);
 SELECT action_permissions_revision INTO revision FROM public.bf_staff WHERE cafe_id=c AND user_id=auth.uid() AND active;
 SELECT request_id INTO existing FROM employee_access_private.approvals a WHERE a.cafe_id=c AND a.requester_id=auth.uid() AND a.permission=k AND a.operation=op AND a.payload=p
  AND a.policy_revision=revision AND a.branch_id IS NOT DISTINCT FROM (scope->>'branchId')::uuid AND a.branch_revision=(scope->>'revision')::integer AND a.status IN('pending','approved') ORDER BY a.created_at DESC LIMIT 1;
 RETURN public.brand_finance_approval_prepare(c,k,op,p,coalesce(existing,r));
END $$;
REVOKE ALL ON FUNCTION employee_access_private.loyalty_request(uuid,text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE employee_access_private.loyalty_scan_aliases(
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),user_id uuid NOT NULL REFERENCES auth.users(id),request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(cafe_id,user_id,request_id)
);
ALTER TABLE employee_access_private.loyalty_scan_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON employee_access_private.loyalty_scan_aliases FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.execute_loyalty_audited_operation(text,text,uuid,text) SET SCHEMA employee_access_private;
ALTER FUNCTION employee_access_private.execute_loyalty_audited_operation(text,text,uuid,text) RENAME TO execute_loyalty_before_policy;
REVOKE ALL ON FUNCTION employee_access_private.execute_loyalty_before_policy(text,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.execute_loyalty_audited_operation(p_session_token text,p_code text,p_request_id uuid,p_operation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.cafe_cashier_sessions;old_sub text:=current_setting('request.jwt.claim.sub',true);old_claims text:=current_setting('request.jwt.claims',true);p jsonb;prepared jsonb;result jsonb;r uuid; k text;cached employee_access_private.loyalty_scan_aliases;
BEGIN
 PERFORM public.brand_finance_loyalty_session_guard(p_session_token);
 SELECT * INTO s FROM public.cafe_cashier_sessions WHERE token=p_session_token AND revoked_at IS NULL AND expires_at>now() FOR SHARE;
 IF NOT FOUND OR s.finance_user_id IS NULL THEN RETURN employee_access_private.execute_loyalty_before_policy(p_session_token,p_code,p_request_id,p_operation);END IF;
 IF p_request_id IS NULL OR p_operation NOT IN('stamp','redeem') OR p_code IS NULL OR p_code !~ '^[A-Za-z0-9_-]{4,100}$' THEN RAISE EXCEPTION 'Invalid scan request';END IF;
 k:='loyalty.'||p_operation;p:=jsonb_build_object('code',upper(btrim(p_code)),'kind',p_operation,'cashierId',s.cashier_id);
 PERFORM set_config('request.jwt.claim.sub',s.finance_user_id::text,true);
 PERFORM set_config('request.jwt.claims',(coalesce(nullif(old_claims,'')::jsonb,'{}')||jsonb_build_object('sub',s.finance_user_id))::text,true);
 IF NOT employee_access_private.allows(s.cafe_id,'loyalty.read',true) OR NOT employee_access_private.allows(s.cafe_id,k,true) THEN RAISE EXCEPTION 'Employee loyalty permission denied' USING ERRCODE='42501';END IF;
 SELECT * INTO cached FROM employee_access_private.loyalty_scan_aliases WHERE cafe_id=s.cafe_id AND user_id=s.finance_user_id AND request_id=p_request_id;
 IF FOUND THEN
  IF cached.payload<>p THEN RAISE EXCEPTION 'Scan request conflict';END IF;
  PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);RETURN cached.result||jsonb_build_object('replayed',true);
 END IF;
 -- Preserve the original ledger's request conflict/idempotency checks on retries.
 IF EXISTS(SELECT 1 FROM public.loyalty_scan_requests WHERE cafe_id=s.cafe_id AND request_id=p_request_id) THEN
  result:=employee_access_private.execute_loyalty_before_policy(p_session_token,p_code,p_request_id,p_operation);
 ELSE
  prepared:=employee_access_private.loyalty_request(s.cafe_id,k,k,p,p_request_id);r:=(prepared->>'requestId')::uuid;
  IF prepared->>'status' NOT IN('ready','approved') THEN
   result:=jsonb_build_object('ok',false,'errorCode','approval_'||(prepared->>'status'),'status','approval_'||(prepared->>'status'),'requestId',r);
  ELSE
   BEGIN
    PERFORM employee_access_private.assert_and_consume(s.cafe_id,k,k,p,r);
    result:=employee_access_private.execute_loyalty_before_policy(p_session_token,p_code,r,p_operation);
    IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION USING ERRCODE='P7001',MESSAGE='Loyalty operation did not commit';END IF;
   EXCEPTION WHEN SQLSTATE 'P7001' THEN NULL;
   END;
  END IF;
 END IF;
 IF result->>'ok'='true' THEN INSERT INTO employee_access_private.loyalty_scan_aliases VALUES(s.cafe_id,s.finance_user_id,p_request_id,p,result);END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);RAISE;
END $$;
REVOKE ALL ON FUNCTION public.execute_loyalty_audited_operation(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execute_loyalty_audited_operation(text,text,uuid,text) TO service_role;

-- All application scanners use the audited entry; remove direct service bypasses.
REVOKE EXECUTE ON FUNCTION public.scan_loyalty_stamp(text,text,uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_reward(text,text,uuid) FROM service_role;

-- Automatic queued reads can issue cards and stamp without a confirmation step.
-- Linked employees must use the confirmed scanner or the delegated issue action.
ALTER FUNCTION public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz) SET SCHEMA employee_access_private;
ALTER FUNCTION employee_access_private.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz) RENAME TO enqueue_loyalty_before_policy;
REVOKE ALL ON FUNCTION employee_access_private.enqueue_loyalty_before_policy(text,uuid,text,text,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.enqueue_loyalty_read(p_session_token text,p_request_id uuid,p_method text,p_value text,p_expected_cafe_id uuid,p_expected_cashier_id uuid,p_client_created_at timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.brand_finance_loyalty_session_guard(p_session_token);
 IF EXISTS(SELECT 1 FROM public.cafe_cashier_sessions WHERE token=p_session_token AND finance_user_id IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'errorCode','finance_confirmation_required');END IF;
 RETURN employee_access_private.enqueue_loyalty_before_policy(p_session_token,p_request_id,p_method,p_value,p_expected_cafe_id,p_expected_cashier_id,p_client_created_at);
END $$;
REVOKE ALL ON FUNCTION public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz) TO service_role;
ALTER FUNCTION loyalty_read_private.process_one(uuid,uuid) RENAME TO process_one_before_employee_policy;
CREATE FUNCTION loyalty_read_private.process_one(p_cafe_id uuid,p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text;
BEGIN
 SELECT s.token INTO token FROM loyalty_read_private.operations q JOIN public.cafe_cashier_sessions s ON s.id=q.session_id WHERE q.cafe_id=p_cafe_id AND q.request_id=p_request_id;
 IF token IS NOT NULL THEN PERFORM public.brand_finance_loyalty_session_guard(token);END IF;
 IF EXISTS(SELECT 1 FROM loyalty_read_private.operations q JOIN public.cafe_cashier_sessions s ON s.id=q.session_id WHERE q.cafe_id=p_cafe_id AND q.request_id=p_request_id AND s.finance_user_id IS NOT NULL) THEN
  UPDATE loyalty_read_private.operations SET status='failed',retryable=false,error_code='finance_confirmation_required',completed_at=now(),updated_at=now() WHERE cafe_id=p_cafe_id AND request_id=p_request_id AND status='pending';RETURN;
 END IF;
 PERFORM loyalty_read_private.process_one_before_employee_policy(p_cafe_id,p_request_id);
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.process_one(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION loyalty_read_private.process_one_before_employee_policy(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE employee_access_private.loyalty_issues(
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),user_id uuid NOT NULL REFERENCES auth.users(id),request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(cafe_id,user_id,request_id)
);
ALTER TABLE employee_access_private.loyalty_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON employee_access_private.loyalty_issues FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_finance_loyalty_issue(p_session_token text,p_request_id uuid,p_name text,p_phone text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.cafe_cashier_sessions;p jsonb;previous employee_access_private.loyalty_issues;prepared jsonb;r uuid;result jsonb;card text;phone text:=public.normalize_customer_phone(p_phone);name text:=regexp_replace(btrim(p_name),'\s+',' ','g');
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR phone IS NULL OR name IS NULL OR length(name) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Invalid loyalty issue';END IF;
 PERFORM public.brand_finance_bind_loyalty_session(p_session_token);
 SELECT s0.* INTO s FROM public.cafe_cashier_sessions s0 JOIN public.cafe_cashiers c ON c.id=s0.cashier_id AND c.cafe_id=s0.cafe_id AND c.active AND c.can_use_loyalty
  WHERE s0.token=p_session_token AND s0.expires_at>now() AND s0.revoked_at IS NULL AND(s0.finance_user_id=auth.uid() OR c.owner_user_id=auth.uid()) FOR SHARE OF s0,c;
 IF NOT FOUND OR NOT employee_access_private.allows(s.cafe_id,'loyalty.read',true) OR NOT employee_access_private.allows(s.cafe_id,'loyalty.issue',false) THEN RAISE EXCEPTION 'Loyalty issue denied' USING ERRCODE='42501';END IF;
 p:=jsonb_build_object('cashierId',s.cashier_id,'name',name,'phone',phone);
 PERFORM pg_advisory_xact_lock(hashtextextended(s.cafe_id::text||auth.uid()::text||p_request_id::text,621));
 SELECT * INTO previous FROM employee_access_private.loyalty_issues WHERE cafe_id=s.cafe_id AND user_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN IF previous.payload<>p THEN RAISE EXCEPTION 'Loyalty issue request changed';END IF;RETURN previous.result;END IF;
 prepared:=employee_access_private.loyalty_request(s.cafe_id,'loyalty.issue','loyalty.issue',p,p_request_id);r:=(prepared->>'requestId')::uuid;
 IF prepared->>'status' NOT IN('ready','approved') THEN RETURN jsonb_build_object('ok',false,'status','approval_'||(prepared->>'status'),'requestId',r);END IF;
 BEGIN
  PERFORM employee_access_private.assert_and_consume(s.cafe_id,'loyalty.issue','loyalty.issue',p,r);
  result:=public.enroll_loyalty_customer_direct(s.cafe_id,name,phone,md5(auth.uid()::text)||md5(s.cafe_id::text));
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION USING ERRCODE='P7001',MESSAGE='Loyalty issue did not commit';END IF;
  SELECT card_code INTO card FROM public.loyalty_cards WHERE cafe_id=s.cafe_id AND customer_profile_id=(result->>'profile_id')::uuid AND status='active';
  IF card IS NULL THEN RAISE EXCEPTION 'Issued loyalty card is unavailable';END IF;
  result:=jsonb_build_object('ok',true,'cardCode',card,'returningCustomer',result->'returning_customer');
  INSERT INTO employee_access_private.loyalty_issues VALUES(s.cafe_id,auth.uid(),r,p,result);
  IF r<>p_request_id THEN INSERT INTO employee_access_private.loyalty_issues VALUES(s.cafe_id,auth.uid(),p_request_id,p,result);END IF;
 EXCEPTION WHEN SQLSTATE 'P7001' THEN NULL;
 END;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_loyalty_issue(text,uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_loyalty_issue(text,uuid,text,text) TO authenticated;

COMMIT;
