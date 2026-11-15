BEGIN;

CREATE SCHEMA employee_access_private;
REVOKE ALL ON SCHEMA employee_access_private FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.bf_staff ADD COLUMN action_permissions jsonb;
ALTER TABLE public.bf_staff ADD COLUMN action_permissions_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.bf_staff ADD CONSTRAINT bf_staff_action_permissions_object CHECK(action_permissions IS NULL OR jsonb_typeof(action_permissions)='object');

CREATE FUNCTION employee_access_private.catalog() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY[
 'sales.read','sales.create','sales.update','sales.delete','sales.pay','sales.return',
 'pos.read','pos.create','loyalty.read','loyalty.stamp','loyalty.redeem','loyalty.issue','loyalty.settings',
 'purchases.read','purchases.create','purchases.update','purchases.delete','purchases.approve','purchases.credit','purchases.return',
 'suppliers.read','suppliers.create','suppliers.update','suppliers.delete','suppliers.pay',
 'inventory.read','inventory.create','inventory.update','inventory.delete','inventory.approve','inventory.settings',
 'finance.read','finance.create','finance.update','finance.delete','finance.approve','finance.settings',
 'accounting.read','accounting.create','accounting.update','accounting.delete','accounting.approve',
 'reports.read','shifts.read','shifts.create','shifts.update','shifts.approve']::text[]
$$;

CREATE FUNCTION employee_access_private.member(c uuid,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT u IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=u AND status='active')
 AND EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND deleted_at IS NULL AND status IN('active','published') AND
   (owner_user_id=u OR EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=c AND user_id=u AND active)))
$$;

-- This is an explicit override of an existing gate, not a replacement for its tenant,
-- shift, branch, subscription, record-state or transaction validation.
CREATE FUNCTION employee_access_private.allows(c uuid,k text,legacy boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;p jsonb;
BEGIN
 IF auth.uid() IS NULL OR k IS NULL OR NOT(k=ANY(employee_access_private.catalog())) THEN RETURN false;END IF;
 r:=brand_finance_private.role_for(c);
 IF r='owner' THEN RETURN true;END IF;
 SELECT action_permissions INTO p FROM public.bf_staff WHERE cafe_id=c AND user_id=auth.uid() AND active FOR SHARE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF p?k THEN RETURN coalesce((p->k->>'enabled')::boolean,false);END IF;
 RETURN coalesce(legacy,false);
END $$;

CREATE TABLE employee_access_private.approvals(
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 request_id uuid NOT NULL,
 permission text NOT NULL,
 operation text NOT NULL CHECK(length(operation) BETWEEN 1 AND 200),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=3000000),
 requester_id uuid NOT NULL REFERENCES auth.users(id),
 approver_id uuid NOT NULL REFERENCES auth.users(id),
 policy_revision integer NOT NULL,
 branch_id uuid,
 branch_revision integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','consumed')),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 reviewer_maintenance_expires_at timestamptz,
 review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 consumed_at timestamptz,
 consumed_transaction bigint,
 PRIMARY KEY(cafe_id,request_id,permission),
 CHECK(requester_id<>approver_id),
 CHECK(permission=ANY(employee_access_private.catalog())),
 CHECK(permission NOT LIKE '%.read'),
 CHECK((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
       (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by<>requester_id)),
 CHECK((status='consumed' AND consumed_at IS NOT NULL AND consumed_transaction IS NOT NULL) OR
       (status<>'consumed' AND consumed_at IS NULL AND consumed_transaction IS NULL)),
 FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id)
);
CREATE INDEX employee_approval_requester ON employee_access_private.approvals(cafe_id,requester_id,created_at DESC);
CREATE INDEX employee_approval_assignee ON employee_access_private.approvals(cafe_id,approver_id,status,created_at DESC);
CREATE TABLE employee_access_private.events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 request_id uuid,
 permission text,
 actor uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_approval_event_scope ON employee_access_private.events(cafe_id,request_id,created_at);
ALTER TABLE employee_access_private.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_access_private.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON employee_access_private.approvals,employee_access_private.events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER employee_approval_events_immutable BEFORE UPDATE OR DELETE ON employee_access_private.events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION employee_access_private.approval_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Approval audit cannot be deleted' USING ERRCODE='42501';END IF;
 IF (to_jsonb(NEW)-ARRAY['status','reviewed_by','reviewed_at','reviewer_maintenance_expires_at','review_note','consumed_at','consumed_transaction']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','reviewed_by','reviewed_at','reviewer_maintenance_expires_at','review_note','consumed_at','consumed_transaction']) THEN
  RAISE EXCEPTION 'Approval command is immutable' USING ERRCODE='42501';
 END IF;
 IF NOT(OLD.status='pending' AND NEW.status IN('approved','rejected') OR OLD.status='approved' AND NEW.status='consumed') THEN
  RAISE EXCEPTION 'Invalid approval transition' USING ERRCODE='42501';
 END IF;
 IF OLD.status='approved' AND (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.review_note IS DISTINCT FROM OLD.review_note OR NEW.reviewer_maintenance_expires_at IS DISTINCT FROM OLD.reviewer_maintenance_expires_at) THEN
  RAISE EXCEPTION 'Approval review is immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_approval_guard BEFORE UPDATE OR DELETE ON employee_access_private.approvals FOR EACH ROW EXECUTE FUNCTION employee_access_private.approval_guard();

CREATE FUNCTION employee_access_private.reviewer_valid(c uuid,u uuid,maintenance_expiry timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE verified jsonb;
BEGIN
 IF maintenance_expiry IS NULL THEN RETURN employee_access_private.member(c,u);END IF;
 verified:=public.brand_finance_maintenance_cashier(c,u,maintenance_expiry,'authorize','{}');
 RETURN verified->>'authorized'='true';
EXCEPTION WHEN SQLSTATE '42501' THEN RETURN false;
END $$;

-- Called only by the owner wrapper or after the original maintenance wrapper has
-- validated its service-only, expiring, audited maintenance session.
CREATE FUNCTION employee_access_private.set_policy(c uuid,u uuid,p jsonb,actor uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k text;v jsonb;a uuid;who uuid:=coalesce(auth.uid(),actor);
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'Employee permissions require an actor' USING ERRCODE='42501';END IF;
 IF auth.uid() IS NOT NULL AND brand_finance_private.role_for(c) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Only the owner can set employee permissions' USING ERRCODE='42501';END IF;
 IF p IS NOT NULL AND (jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>30000) THEN RAISE EXCEPTION 'Invalid employee permissions';END IF;
 IF EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND owner_user_id=u) THEN RAISE EXCEPTION 'Owner permissions cannot be restricted';END IF;
 FOR k,v IN SELECT * FROM jsonb_each(coalesce(p,'{}')) LOOP
  IF NOT(k=ANY(employee_access_private.catalog())) OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid employee permission';END IF;
  IF jsonb_typeof(v->'enabled') IS DISTINCT FROM 'boolean' OR NOT(v?'approverId') OR jsonb_typeof(v->'approverId') NOT IN('null','string')
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v)x WHERE x NOT IN('enabled','approverId')) THEN RAISE EXCEPTION 'Invalid employee permission values';END IF;
  a:=nullif(v->>'approverId','')::uuid;
  IF a IS NOT NULL AND (NOT(v->>'enabled')::boolean OR k LIKE '%.read' OR a=u OR NOT employee_access_private.member(c,a)) THEN RAISE EXCEPTION 'Select another active employee or owner as approver';END IF;
 END LOOP;
 PERFORM 1 FROM public.bf_staff WHERE cafe_id=c AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee is not linked to this brand' USING ERRCODE='42501';END IF;
 UPDATE public.bf_staff SET action_permissions=p,action_permissions_revision=action_permissions_revision+1 WHERE cafe_id=c AND user_id=u AND action_permissions IS DISTINCT FROM p;
 IF NOT FOUND THEN RETURN;END IF;
 INSERT INTO employee_access_private.events(cafe_id,actor,action,detail) VALUES(c,who,'policy_saved',jsonb_build_object('userId',u,'permissions',p));
 INSERT INTO public.audit_logs(actor_id,cafe_id,action,entity_table,entity_id,new_data) VALUES(who,c,'employee_permissions_updated','bf_staff',u,jsonb_build_object('employeePermissions',p));
END $$;

CREATE FUNCTION public.brand_finance_employee_permissions(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;p jsonb;revision integer;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 SELECT action_permissions,action_permissions_revision INTO p,revision FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=auth.uid() AND active;
 RETURN jsonb_build_object('policy',p,'revision',coalesce(revision,0),'catalog',to_jsonb(employee_access_private.catalog()),'owner',r='owner');
END $$;

CREATE FUNCTION public.brand_finance_approval_prepare(p_cafe_id uuid,p_permission text,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE staff public.bf_staff;r employee_access_private.approvals;assignee uuid;scope jsonb;
BEGIN
 IF p_request_id IS NULL OR p_operation IS NULL OR length(p_operation) NOT BETWEEN 1 AND 200 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>3000000 THEN RAISE EXCEPTION 'Invalid approval command';END IF;
 -- Missing policy entries preserve the original operation's authorization. The
 -- original RPC remains responsible for evaluating its legacy role gate.
 IF NOT employee_access_private.allows(p_cafe_id,p_permission,true) THEN RAISE EXCEPTION 'Employee permission denied' USING ERRCODE='42501';END IF;
 IF brand_finance_private.role_for(p_cafe_id)='owner' THEN RETURN jsonb_build_object('status','ready','requestId',p_request_id);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO staff FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=auth.uid() AND active FOR SHARE;
 assignee:=nullif(staff.action_permissions->p_permission->>'approverId','')::uuid;
 IF assignee IS NULL THEN RETURN jsonb_build_object('status','ready','requestId',p_request_id);END IF;
 IF assignee=auth.uid() OR NOT employee_access_private.member(p_cafe_id,assignee) THEN RAISE EXCEPTION 'Assigned approver is unavailable' USING ERRCODE='42501';END IF;
 PERFORM erp_branch_private.assert_input(p_cafe_id,p_payload);scope:=erp_branch_private.scope(p_cafe_id);
 SELECT * INTO r FROM employee_access_private.approvals WHERE cafe_id=p_cafe_id AND request_id=p_request_id AND permission=p_permission FOR UPDATE;
 IF FOUND THEN
  IF r.requester_id<>auth.uid() OR r.operation<>p_operation OR r.payload<>p_payload OR r.approver_id<>assignee OR r.policy_revision<>staff.action_permissions_revision OR
     r.branch_id IS DISTINCT FROM (scope->>'branchId')::uuid OR r.branch_revision<>(scope->>'revision')::integer THEN RAISE EXCEPTION 'Approval command or permissions changed; create a new request' USING ERRCODE='40001';END IF;
 ELSE
  INSERT INTO employee_access_private.approvals(cafe_id,request_id,permission,operation,payload,requester_id,approver_id,policy_revision,branch_id,branch_revision)
   VALUES(p_cafe_id,p_request_id,p_permission,p_operation,p_payload,auth.uid(),assignee,staff.action_permissions_revision,(scope->>'branchId')::uuid,(scope->>'revision')::integer) RETURNING * INTO r;
  INSERT INTO employee_access_private.events(cafe_id,request_id,permission,actor,action) VALUES(p_cafe_id,p_request_id,p_permission,auth.uid(),'submitted');
 END IF;
 RETURN jsonb_build_object('status',r.status,'requestId',r.request_id,'permission',r.permission,'approverId',r.approver_id,'note',r.review_note);
END $$;

CREATE FUNCTION public.brand_finance_approval_review(p_cafe_id uuid,p_request_id uuid,p_permission text,p_decision text,p_note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employee_access_private.approvals;role text;staff public.bf_staff;maintenance_expiry timestamptz;
BEGIN
 role:=brand_finance_private.role_for(p_cafe_id);
 IF role='owner' AND NOT employee_access_private.member(p_cafe_id,auth.uid()) THEN
  SELECT CASE WHEN action='maintenance_mode_started' THEN (new_data->>'expires_at')::timestamptz END INTO maintenance_expiry FROM public.audit_logs WHERE actor_id=auth.uid() AND cafe_id=p_cafe_id AND action IN('maintenance_mode_started','maintenance_mode_ended') ORDER BY created_at DESC,id DESC LIMIT 1;
  IF maintenance_expiry IS NULL OR NOT employee_access_private.reviewer_valid(p_cafe_id,auth.uid(),maintenance_expiry) THEN RAISE EXCEPTION 'Active audited maintenance review required' USING ERRCODE='42501';END IF;
 END IF;
 IF p_decision IS NULL OR p_decision NOT IN('approved','rejected') OR p_note IS NULL OR length(p_note)>2000 OR(p_decision='rejected' AND length(btrim(p_note))=0) THEN RAISE EXCEPTION 'Invalid approval decision';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO r FROM employee_access_private.approvals WHERE cafe_id=p_cafe_id AND request_id=p_request_id AND permission=p_permission FOR UPDATE;
 IF NOT FOUND OR r.requester_id=auth.uid() OR(role<>'owner' AND r.approver_id<>auth.uid()) THEN RAISE EXCEPTION 'Approval review is not permitted' USING ERRCODE='42501';END IF;
 IF NOT employee_access_private.member(p_cafe_id,r.requester_id) OR NOT employee_access_private.member(p_cafe_id,r.approver_id) THEN RAISE EXCEPTION 'Approval participant is no longer active' USING ERRCODE='42501';END IF;
 SELECT * INTO staff FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=r.requester_id AND active FOR SHARE;
 IF staff.action_permissions_revision<>r.policy_revision OR NOT coalesce((staff.action_permissions->r.permission->>'enabled')::boolean,false)
  OR nullif(staff.action_permissions->r.permission->>'approverId','')::uuid IS DISTINCT FROM r.approver_id THEN RAISE EXCEPTION 'Employee permissions changed; a new approval is required' USING ERRCODE='40001';END IF;
 IF r.status<>'pending' THEN
  IF r.status=p_decision AND r.reviewed_by=auth.uid() AND r.review_note=p_note THEN RETURN jsonb_build_object('status',r.status,'requestId',r.request_id);END IF;
  RAISE EXCEPTION 'Approval was already reviewed' USING ERRCODE='40001';
 END IF;
 UPDATE employee_access_private.approvals SET status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note,reviewer_maintenance_expires_at=maintenance_expiry WHERE cafe_id=p_cafe_id AND request_id=p_request_id AND permission=p_permission;
 INSERT INTO employee_access_private.events(cafe_id,request_id,permission,actor,action,detail) VALUES(p_cafe_id,p_request_id,p_permission,auth.uid(),p_decision,jsonb_build_object('note',p_note));
 RETURN jsonb_build_object('status',p_decision,'requestId',p_request_id);
END $$;

CREATE FUNCTION public.brand_finance_approvals(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE viewer_role text;result jsonb;
BEGIN
 viewer_role:=brand_finance_private.role_for(p_cafe_id);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]') INTO result FROM (
  SELECT a.request_id,a.permission,a.operation,a.payload,a.requester_id,a.approver_id,a.status,a.reviewed_by,a.reviewed_at,a.review_note,a.created_at,a.consumed_at,a.branch_id,
   coalesce(s.name,'') requester_name,coalesce(t.name,c.name) approver_name,
   (a.status='pending' AND a.requester_id<>auth.uid() AND(viewer_role='owner' OR a.approver_id=auth.uid())) can_review
  FROM employee_access_private.approvals a
  LEFT JOIN public.bf_staff s ON s.cafe_id=a.cafe_id AND s.user_id=a.requester_id
  LEFT JOIN public.bf_staff t ON t.cafe_id=a.cafe_id AND t.user_id=a.approver_id
  LEFT JOIN public.cafes c ON c.id=a.cafe_id AND c.owner_user_id=a.approver_id
  WHERE a.cafe_id=p_cafe_id AND(viewer_role='owner' OR a.requester_id=auth.uid() OR a.approver_id=auth.uid())
  ORDER BY a.created_at DESC LIMIT 100
 )x;
 RETURN result;
END $$;

CREATE FUNCTION employee_access_private.assert_and_consume(c uuid,k text,operation text,payload jsonb,request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employee_access_private.approvals;staff public.bf_staff;assignee uuid;scope jsonb;
BEGIN
 IF NOT employee_access_private.allows(c,k,true) THEN RAISE EXCEPTION 'Employee permission denied' USING ERRCODE='42501';END IF;
 IF brand_finance_private.role_for(c)='owner' THEN RETURN;END IF;
 SELECT * INTO staff FROM public.bf_staff WHERE cafe_id=c AND user_id=auth.uid() AND active FOR SHARE;
 assignee:=nullif(staff.action_permissions->k->>'approverId','')::uuid;
 IF assignee IS NULL THEN RETURN;END IF;
 IF assignee=auth.uid() OR NOT employee_access_private.member(c,assignee) THEN RAISE EXCEPTION 'Assigned approver is unavailable' USING ERRCODE='42501';END IF;
 PERFORM erp_branch_private.assert_input(c,payload);scope:=erp_branch_private.scope(c);
 SELECT * INTO r FROM employee_access_private.approvals a WHERE a.cafe_id=c AND a.request_id=request AND a.permission=k FOR UPDATE;
 IF NOT FOUND OR r.requester_id<>auth.uid() OR r.operation IS DISTINCT FROM operation OR r.payload IS DISTINCT FROM payload OR r.approver_id<>assignee
  OR r.policy_revision<>staff.action_permissions_revision OR r.branch_id IS DISTINCT FROM(scope->>'branchId')::uuid OR r.branch_revision<>(scope->>'revision')::integer
  OR r.status NOT IN('approved','consumed') OR NOT employee_access_private.reviewer_valid(c,r.reviewed_by,r.reviewer_maintenance_expires_at) THEN RAISE EXCEPTION 'Approved request matching this operation is required' USING ERRCODE='42501';END IF;
 IF r.status='consumed' THEN
  IF r.consumed_transaction=txid_current() THEN RETURN;END IF;
  RAISE EXCEPTION 'Approval has already been consumed' USING ERRCODE='40001';
 END IF;
 UPDATE employee_access_private.approvals a SET status='consumed',consumed_at=now(),consumed_transaction=txid_current() WHERE a.cafe_id=c AND a.request_id=request AND a.permission=k;
 INSERT INTO employee_access_private.events(cafe_id,request_id,permission,actor,action) VALUES(c,request,k,auth.uid(),'consumed');
END $$;

-- Preserve the original staff mutation and its transaction, including idempotency,
-- legacy POS permissions and verified maintenance admission.
ALTER FUNCTION public.brand_finance_cashier_with_permissions(uuid,text,jsonb) SET SCHEMA employee_access_private;
ALTER FUNCTION employee_access_private.brand_finance_cashier_with_permissions(uuid,text,jsonb) RENAME TO cashier_before_policy;
CREATE FUNCTION public.brand_finance_cashier_with_permissions(p_cafe uuid,p_mode text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=employee_access_private.cashier_before_policy(p_cafe,p_mode,p_payload);
 IF p_payload?'employeePermissions' THEN PERFORM employee_access_private.set_policy(p_cafe,(result->>'id')::uuid,nullif(p_payload->'employeePermissions','null'::jsonb));END IF;
 RETURN result;
END $$;

ALTER FUNCTION public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) SET SCHEMA employee_access_private;
ALTER FUNCTION employee_access_private.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) RENAME TO maintenance_before_policy;
CREATE FUNCTION public.brand_finance_maintenance_cashier(p_cafe_id uuid,p_actor_id uuid,p_maintenance_expires_at timestamptz,p_operation text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=employee_access_private.maintenance_before_policy(p_cafe_id,p_actor_id,p_maintenance_expires_at,p_operation,p_payload-'employeePermissions');
 IF p_operation<>'authorize' AND p_payload?'employeePermissions' THEN PERFORM employee_access_private.set_policy(p_cafe_id,(result->>'id')::uuid,nullif(p_payload->'employeePermissions','null'::jsonb),p_actor_id);END IF;
 RETURN result;
END $$;

ALTER FUNCTION public.brand_finance_execute(uuid,text,jsonb,uuid) SET SCHEMA employee_access_private;
ALTER FUNCTION employee_access_private.brand_finance_execute(uuid,text,jsonb,uuid) RENAME TO execute_before_policy;
CREATE FUNCTION public.brand_finance_execute(p_cafe_id uuid,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;u uuid;
BEGIN
 IF p_operation='staff' AND p_payload?'employeePermissions' AND brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Only the owner can set employee permissions' USING ERRCODE='42501';END IF;
 result:=employee_access_private.execute_before_policy(p_cafe_id,p_operation,p_payload,p_request_id);
 IF p_operation='staff' AND p_payload?'employeePermissions' THEN
  u:=nullif(p_payload->>'userId','')::uuid;
  IF u IS NULL THEN SELECT id INTO u FROM auth.users WHERE lower(email)=lower(p_payload->>'email');END IF;
  PERFORM employee_access_private.set_policy(p_cafe_id,u,nullif(p_payload->'employeePermissions','null'::jsonb));
 END IF;
 RETURN result;
END $$;

ALTER FUNCTION public.brand_finance_snapshot(uuid) SET SCHEMA employee_access_private;
ALTER FUNCTION employee_access_private.brand_finance_snapshot(uuid) RENAME TO snapshot_before_policy;
CREATE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;sales_read boolean;purchases_read boolean;suppliers_read boolean;inventory_read boolean;finance_read boolean;accounting_read boolean;pos_read boolean;shifts_read boolean;own_accounts jsonb;own_shifts jsonb;
BEGIN
 result:=employee_access_private.snapshot_before_policy(p_cafe_id);
 sales_read:=employee_access_private.allows(p_cafe_id,'sales.read',true);
 purchases_read:=employee_access_private.allows(p_cafe_id,'purchases.read',true);
 suppliers_read:=employee_access_private.allows(p_cafe_id,'suppliers.read',true);
 inventory_read:=employee_access_private.allows(p_cafe_id,'inventory.read',true);
 finance_read:=employee_access_private.allows(p_cafe_id,'finance.read',true);
 accounting_read:=employee_access_private.allows(p_cafe_id,'accounting.read',true);
 pos_read:=employee_access_private.allows(p_cafe_id,'pos.read',true);
 shifts_read:=employee_access_private.allows(p_cafe_id,'shifts.read',true);
 SELECT coalesce(jsonb_agg(s->>'id'),'[]'),coalesce(jsonb_agg(s->>'account_id'),'[]') INTO own_shifts,own_accounts FROM jsonb_array_elements(coalesce(result->'shifts','[]'))s WHERE s->>'user_id'=auth.uid()::text;
 IF NOT sales_read OR NOT purchases_read OR NOT finance_read OR NOT accounting_read THEN
  result:=jsonb_set(result,'{documents}',coalesce((SELECT jsonb_agg(d) FROM jsonb_array_elements(coalesce(result->'documents','[]'))d WHERE
   CASE d->>'kind' WHEN 'sale' THEN sales_read OR(pos_read AND own_shifts?(d->>'shift_id')) WHEN 'purchase' THEN purchases_read
   WHEN 'refund' THEN CASE WHEN EXISTS(SELECT 1 FROM public.bf_documents b WHERE b.cafe_id=p_cafe_id AND b.id=nullif(d->>'reference_id','')::uuid AND b.kind='purchase') THEN purchases_read ELSE sales_read OR(pos_read AND own_shifts?(d->>'shift_id')) END
   ELSE finance_read AND accounting_read END),'[]'::jsonb));
  result:=jsonb_set(result,'{summary}',coalesce((SELECT jsonb_object_agg(k,'0'::jsonb) FROM jsonb_object_keys(coalesce(result->'summary','{}'))k),'{}'));
 END IF;
 IF NOT sales_read THEN result:=jsonb_set(result,'{refundRequests}','[]'::jsonb);END IF;
 IF NOT accounting_read THEN result:=result||jsonb_build_object('journal','[]'::jsonb,'trialBalance','[]'::jsonb);END IF;
 IF NOT finance_read THEN result:=jsonb_set(result,'{accounts}',coalesce((SELECT jsonb_agg(a) FROM jsonb_array_elements(coalesce(result->'accounts','[]'))a WHERE pos_read AND own_accounts?(a->>'id')),'[]'::jsonb));END IF;
 IF NOT inventory_read THEN
  result:=result||jsonb_build_object('items','[]'::jsonb,'stock','[]'::jsonb,'movements','[]'::jsonb);
  result:=jsonb_set(result,'{products}',coalesce((SELECT jsonb_agg(p-'quantity'-'average_cost') FROM jsonb_array_elements(coalesce(result->'products','[]'))p),'[]'::jsonb));
 END IF;
 IF NOT sales_read AND NOT pos_read THEN result:=jsonb_set(result,'{products}','[]'::jsonb);END IF;
 IF NOT shifts_read THEN result:=jsonb_set(result,'{shifts}',coalesce((SELECT jsonb_agg(s) FROM jsonb_array_elements(coalesce(result->'shifts','[]'))s WHERE pos_read AND s->>'user_id'=auth.uid()::text),'[]'::jsonb));END IF;
 IF NOT sales_read OR NOT suppliers_read THEN result:=jsonb_set(result,'{parties}',coalesce((SELECT jsonb_agg(CASE WHEN p->>'kind'='customer' AND NOT sales_read THEN jsonb_build_object('id',p->'id','kind',p->'kind','name',p->'name','phone',p->'phone','active',p->'active','balance',0) ELSE p END) FROM jsonb_array_elements(coalesce(result->'parties','[]'))p WHERE CASE p->>'kind' WHEN 'supplier' THEN suppliers_read WHEN 'customer' THEN sales_read OR pos_read ELSE finance_read END),'[]'::jsonb));END IF;
 RETURN result||jsonb_build_object('employeePermissions',(SELECT action_permissions FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=auth.uid() AND active),
  'employeePermissionApprovers',CASE WHEN brand_finance_private.role_for(p_cafe_id)='owner' THEN coalesce((SELECT jsonb_agg(x ORDER BY x.name) FROM (
   SELECT owner_user_id "userId",name FROM public.cafes WHERE id=p_cafe_id
   UNION SELECT user_id "userId",name FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active
  )x),'[]'::jsonb) ELSE '[]'::jsonb END,
  'staff',coalesce((SELECT jsonb_agg(s||jsonb_build_object('employeePermissions',b.action_permissions)) FROM jsonb_array_elements(result->'staff')s LEFT JOIN public.bf_staff b ON b.cafe_id=p_cafe_id AND b.user_id=(s->>'user_id')::uuid),'[]'));
END $$;

ALTER FUNCTION public.brand_finance_context(text) SET SCHEMA employee_access_private;
ALTER FUNCTION employee_access_private.brand_finance_context(text) RENAME TO context_before_policy;
CREATE FUNCTION public.brand_finance_context(p_slug text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=employee_access_private.context_before_policy(p_slug);
 RETURN result||jsonb_build_object('employeePermissions',(SELECT action_permissions FROM public.bf_staff WHERE cafe_id=(result->>'id')::uuid AND user_id=auth.uid() AND active));
END $$;

ALTER FUNCTION public.erp_my_permissions(uuid) SET SCHEMA employee_access_private;
ALTER FUNCTION employee_access_private.erp_my_permissions(uuid) RENAME TO erp_permissions_before_policy;
CREATE FUNCTION public.erp_my_permissions(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 result:=employee_access_private.erp_permissions_before_policy(p_cafe_id);
 RETURN result||jsonb_build_object('employeePermissions',(SELECT action_permissions FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=auth.uid() AND active));
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA employee_access_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA employee_access_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_context(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_context(text) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_my_permissions(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_my_permissions(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_employee_permissions(uuid),public.brand_finance_approval_prepare(uuid,text,text,jsonb,uuid),public.brand_finance_approval_review(uuid,uuid,text,text,text),public.brand_finance_approvals(uuid),public.brand_finance_cashier_with_permissions(uuid,text,jsonb),public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb),public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_employee_permissions(uuid),public.brand_finance_approval_prepare(uuid,text,text,jsonb,uuid),public.brand_finance_approval_review(uuid,uuid,text,text,text),public.brand_finance_approvals(uuid),public.brand_finance_cashier_with_permissions(uuid,text,jsonb),public.brand_finance_execute(uuid,text,jsonb,uuid),public.brand_finance_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_maintenance_cashier(uuid,uuid,timestamptz,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
