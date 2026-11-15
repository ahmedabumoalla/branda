BEGIN;
-- A closed RPC registry binds each approval to typed, default-expanded arguments.
-- Original functions remain private and keep all record/branch/period validation.
CREATE TABLE employee_access_private.rpc_bindings(name text PRIMARY KEY,function_oid oid NOT NULL,original_name text NOT NULL,canonical_name text NOT NULL,mutates boolean NOT NULL);
CREATE TABLE employee_access_private.rpc_results(cafe_id uuid NOT NULL,actor uuid NOT NULL,request_id uuid NOT NULL,function_name text NOT NULL,arguments jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,actor,request_id));
CREATE TABLE employee_access_private.rpc_context(cafe_id uuid NOT NULL,actor uuid NOT NULL,transaction_id bigint NOT NULL,depth integer NOT NULL,permissions text[] NOT NULL,PRIMARY KEY(cafe_id,actor,transaction_id,depth));
CREATE TABLE employee_access_private.rpc_commands(cafe_id uuid NOT NULL,actor uuid NOT NULL,request_id uuid NOT NULL,function_name text NOT NULL,arguments jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,actor,request_id));
CREATE INDEX employee_rpc_commands_lookup ON employee_access_private.rpc_commands(cafe_id,actor,function_name,created_at DESC);
CREATE TABLE employee_access_private.rpc_tokens(cafe_id uuid NOT NULL,actor uuid NOT NULL,transaction_id bigint NOT NULL,function_name text NOT NULL,arguments jsonb NOT NULL,request_id uuid NOT NULL,PRIMARY KEY(cafe_id,actor,transaction_id,function_name));
ALTER TABLE employee_access_private.rpc_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_access_private.rpc_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_access_private.rpc_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_access_private.rpc_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_access_private.rpc_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON employee_access_private.rpc_bindings,employee_access_private.rpc_results,employee_access_private.rpc_context,employee_access_private.rpc_commands,employee_access_private.rpc_tokens FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER employee_rpc_results_immutable BEFORE UPDATE OR DELETE ON employee_access_private.rpc_results FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER employee_rpc_commands_immutable BEFORE UPDATE OR DELETE ON employee_access_private.rpc_commands FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION employee_access_private.scoped_key(c uuid,k text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM employee_access_private.rpc_context WHERE cafe_id=c AND actor=auth.uid() AND transaction_id=txid_current() AND k=ANY(permissions))
$$;
CREATE FUNCTION employee_access_private.scoped_grant(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM employee_access_private.rpc_context x JOIN public.bf_staff s ON s.cafe_id=x.cafe_id AND s.user_id=x.actor AND s.active
 CROSS JOIN LATERAL unnest(x.permissions)k WHERE x.cafe_id=c AND x.actor=auth.uid() AND x.transaction_id=txid_current() AND s.action_permissions->k->>'enabled'='true')
$$;
CREATE FUNCTION employee_access_private.app_enabled(c uuid,d text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.erp_system_settings WHERE cafe_id=c AND kind='apps' AND payload->d='false'::jsonb)
$$;
CREATE FUNCTION employee_access_private.scoped_gate(c uuid,a text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT employee_access_private.scoped_grant(c) AND(a='read' OR EXISTS(
  SELECT 1 FROM employee_access_private.rpc_context x CROSS JOIN LATERAL unnest(x.permissions) AS e(permission_key)
  WHERE x.cafe_id=c AND x.actor=auth.uid() AND x.transaction_id=txid_current() AND e.permission_key NOT LIKE '%.read'))
$$;
CREATE FUNCTION employee_access_private.unclassified(c uuid) RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF brand_finance_private.role_for(c)='owner' OR NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=c AND user_id=auth.uid() AND coalesce(action_permissions,'{}')<>'{}'::jsonb) THEN RETURN '{}'::text[];END IF;
 RAISE EXCEPTION 'This operation is not enabled by the employee permission catalog' USING ERRCODE='42501';
END $$;
CREATE FUNCTION employee_access_private.purchase_credit(c uuid,p jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p->>'kind' IS DISTINCT FROM 'invoice' THEN RETURN false;END IF;
 RETURN round(coalesce((p->>'paid')::numeric,0)*coalesce((p->>'exchangeRate')::numeric,1),2)<(erp_purchase_private.validate(c,p)->>'total')::numeric;
END $$;

CREATE FUNCTION employee_access_private.rpc_keys(c uuid,f text,j jsonb) RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op text:=coalesce(j->>'p_operation',j->>'p_action',j#>>'{p_command,action}',j#>>'{p_input,action}');p jsonb:=coalesce(j->'p_payload',j->'p_data',j#>'{p_command,payload}',j->'p_input','{}');a text;ks text[];kind text;document_payload jsonb;
BEGIN
 IF f='brand_finance_execute' THEN
  IF op IN('staff','settings','refund_approve','refund_reject') THEN RETURN '{}'::text[];END IF;
  a:=CASE WHEN nullif(p->>'id','') IS NULL THEN 'create' ELSE 'update' END;
  CASE op
   WHEN 'sale' THEN ks:=ARRAY['sales.create'];
   WHEN 'shift_purchase' THEN ks:=ARRAY['purchases.create'];
   WHEN 'purchase' THEN ks:=ARRAY['purchases.create'];
   WHEN 'supplier_payout' THEN ks:=ARRAY['suppliers.pay'];
   WHEN 'party' THEN ks:=ARRAY[(CASE WHEN p->>'kind'='supplier' THEN 'suppliers.' ELSE 'sales.' END)||a];
   WHEN 'item' THEN ks:=ARRAY['inventory.'||a];
   WHEN 'warehouse' THEN ks:=ARRAY['inventory.'||a];
   WHEN 'stock_adjust' THEN ks:=ARRAY['inventory.approve'];
   WHEN 'stock_transfer' THEN ks:=ARRAY['inventory.approve'];
   WHEN 'account' THEN ks:=ARRAY['accounting.'||a];
   WHEN 'journal' THEN ks:=ARRAY['accounting.create'];
   WHEN 'treasury' THEN ks:=ARRAY['finance.approve'];
   WHEN 'settlement' THEN ks:=ARRAY[CASE WHEN p->>'kind'='payment' THEN 'suppliers.pay' ELSE 'sales.pay' END];
   WHEN 'refund' THEN
    SELECT d.kind INTO kind FROM public.bf_documents d WHERE d.cafe_id=c AND d.id=nullif(p->>'documentId','')::uuid;
    ks:=ARRAY[CASE WHEN kind='purchase' THEN 'purchases.return' ELSE 'sales.return' END];
   WHEN 'shift_open' THEN ks:=ARRAY['shifts.create'];
   WHEN 'shift_close' THEN ks:=ARRAY[CASE WHEN p->>'supervisorClose'='true' THEN 'shifts.approve' ELSE 'shifts.update' END];
   WHEN 'shift_handover' THEN ks:=ARRAY['shifts.update'];
   WHEN 'shift_accept' THEN ks:=ARRAY['shifts.approve'];
   ELSE RETURN employee_access_private.unclassified(c);
  END CASE;
  IF op='shift_purchase' AND p?'invoice' THEN
   IF round(coalesce((p#>>'{invoice,paid}')::numeric,0)*coalesce((p#>>'{invoice,exchangeRate}')::numeric,1),2)<coalesce((p->>'expectedTotal')::numeric,0) THEN ks:=ks||'purchases.credit'::text;END IF;
   IF p->'newSupplier' IS NOT NULL AND p->'newSupplier'<>'null'::jsonb THEN ks:=ks||'suppliers.create'::text;END IF;
   IF jsonb_array_length(coalesce(p->'newItems','[]'))>0 THEN ks:=ks||'inventory.create'::text;END IF;
  END IF;
  IF op='supplier_payout' AND nullif(p->>'supplierId','') IS NULL THEN ks:=ks||'suppliers.create'::text;END IF;
  RETURN ks;
 ELSIF f='erp_purchases_write' THEN
  IF op='settings' THEN RETURN '{}'::text[];END IF;
  IF op='supplier' THEN RETURN ARRAY['suppliers.'||CASE WHEN coalesce((p->>'revision')::integer,0)=0 THEN 'create' ELSE 'update' END];END IF;
  IF op IN('delete_supplier','import_suppliers','payment') THEN RETURN ARRAY[CASE op WHEN 'delete_supplier' THEN 'suppliers.delete' WHEN 'import_suppliers' THEN 'suppliers.create' ELSE 'suppliers.pay' END];END IF;
  a:=CASE WHEN op='save' THEN CASE WHEN coalesce((p->>'revision')::integer,0)=0 THEN 'create' ELSE 'update' END WHEN op='copy' THEN 'create' WHEN op='delete' THEN 'delete' WHEN op='return' THEN 'return' WHEN op IN('note','submit') THEN 'update' ELSE 'approve' END;
  IF op NOT IN('save','copy','delete','return','note','submit','post','approve','reject','cancel','convert','receive','allocate','debit','apply_credit','credit') THEN RETURN employee_access_private.unclassified(c);END IF;
  ks:=ARRAY['purchases.'||a];
  IF op='save' THEN document_payload:=p;
  ELSIF op='post' THEN SELECT d.payload INTO document_payload FROM public.erp_purchase_documents d WHERE d.cafe_id=c AND d.id=nullif(p->>'id','')::uuid;
  END IF;
  IF document_payload IS NOT NULL AND employee_access_private.purchase_credit(c,document_payload) THEN ks:=ks||'purchases.credit'::text;END IF;
  RETURN ks;
 ELSIF f IN('erp_finance_write','erp_accounting_write','brand_finance_gl_execute','brand_finance_treasury_execute') THEN
  kind:=CASE WHEN f IN('erp_accounting_write','brand_finance_gl_execute') THEN 'accounting' ELSE 'finance' END;
  IF kind='accounting' AND op IN('settings','configuration','period_close','period_reopen') THEN RETURN '{}'::text[];END IF;
  a:=CASE WHEN op='settings' THEN 'settings' WHEN op IN('save_voucher','save_custody','category','schedule','save','account_save','cost_center') THEN CASE WHEN nullif(p->>'id','') IS NULL THEN 'create' ELSE 'update' END WHEN op='voucher' THEN 'create' WHEN op IN('delete_voucher','delete_category','cost_center_delete','account_delete') THEN 'delete' WHEN op='import_bank' THEN 'create' WHEN op IN('account_archive','account_primary','account_update') THEN 'update' ELSE 'approve' END;
  RETURN ARRAY[kind||'.'||a];
 ELSIF f='erp_inventory_write' THEN
  a:=CASE WHEN op IN('settings','employee_warehouse') THEN 'settings' WHEN op='delete' THEN 'delete' WHEN op IN('post','reverse','fulfill','acknowledge') THEN 'approve' WHEN nullif(j#>>'{p_command,id}','') IS NULL THEN 'create' ELSE 'update' END;
  RETURN ARRAY['inventory.'||a];
 ELSIF f='brand_finance_save_invoice_draft' THEN RETURN ARRAY[CASE WHEN coalesce((j->>'p_revision')::integer,0)=0 THEN 'sales.create' ELSE 'sales.update' END];
 ELSIF f='brand_finance_issue_company_invoice' THEN RETURN ARRAY['sales.create'];
 ELSIF f='brand_finance_invoice_management' THEN RETURN ARRAY[CASE WHEN op IN('delete','delete_draft') THEN 'sales.delete' WHEN op IN('refund','return','cancel') THEN 'sales.return' ELSE 'sales.update' END];
 ELSIF f='brand_finance_amend_invoice' THEN RETURN ARRAY['sales.update'];
 ELSIF f IN('brand_finance_save_credit_note','brand_finance_transition_credit_note') THEN RETURN ARRAY[CASE WHEN op='delete' THEN 'sales.delete' ELSE 'sales.return' END];
 ELSIF f='brand_finance_invoice_extensions' THEN RETURN ARRAY[CASE WHEN op='read' THEN 'sales.read' ELSE 'sales.update' END];
 ELSIF f='brand_finance_customer_credit' THEN RETURN ARRAY[CASE WHEN op='list' THEN 'sales.read' WHEN op='refund' THEN 'sales.return' ELSE 'sales.pay' END];
 ELSIF f='brand_finance_sales_return_stock' THEN RETURN ARRAY['inventory.approve'];
 ELSIF f IN('brand_finance_inventory_unit_save','erp_purchase_product_create','brand_finance_pos_purchase_item_save') THEN RETURN ARRAY['inventory.create'];
 ELSIF f IN('finance_loyalty_settings_read','finance_loyalty_settings_save') THEN RETURN ARRAY['loyalty.settings'];
 ELSIF f='erp_purchases_read' THEN RETURN ARRAY[CASE WHEN NOT employee_access_private.allows(c,'purchases.read',true) AND employee_access_private.allows(c,'suppliers.read',true) THEN 'suppliers.read' ELSE 'purchases.read' END];
 ELSIF f='brand_finance_pos_purchase_catalog' THEN RETURN ARRAY['purchases.read'];
 ELSIF f IN('erp_finance_read','erp_finance_detail','brand_finance_treasury_snapshot','brand_finance_treasury_statement','brand_finance_treasury_history') THEN RETURN ARRAY['finance.read'];
 ELSIF f IN('erp_accounting_read','brand_finance_journal_detail') THEN RETURN ARRAY['accounting.read'];
 ELSIF f IN('erp_inventory_read','erp_inventory_sales_catalog','brand_finance_inventory_catalog') THEN RETURN ARRAY['inventory.read'];
 ELSIF f IN('brand_finance_invoice_drafts','brand_finance_invoice_detail','brand_finance_invoice_context','brand_finance_customer_detail','brand_finance_sales_returns','brand_finance_credit_notes','brand_finance_customer_payments') THEN RETURN ARRAY['sales.read'];
 ELSIF f IN('erp_reports_read','erp_report_run','erp_report_export') THEN RETURN ARRAY['reports.read'];
 END IF;
 RAISE EXCEPTION 'Unclassified employee RPC';
END $$;

-- Legacy eligibility is only used when no explicit per-employee key exists.
-- Every original endpoint is also executed and retains its narrower old checks.
CREATE FUNCTION employee_access_private.legacy(c uuid,k text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text:=brand_finance_private.role_for(c);d text:=split_part(k,'.',1);a text:=split_part(k,'.',2);
BEGIN
 IF r='owner' THEN RETURN true;END IF;
 IF d IN('pos','shifts') THEN RETURN r IN('manager','cashier');END IF;
 IF d='inventory' THEN RETURN r IN('manager','warehouse') OR a='read' AND r IN('accountant','auditor');END IF;
 IF d='suppliers' AND a='pay' THEN RETURN r IN('manager','accountant','cashier');END IF;
 IF d='purchases' AND a IN('read','create','credit') AND r='cashier' THEN RETURN true;END IF;
 IF d='sales' AND a='return' AND r='cashier' THEN RETURN true;END IF;
 RETURN r IN('manager','accountant') OR(a='read' AND r='auditor');
END $$;

CREATE FUNCTION employee_access_private.call_sql(f text,j jsonb,canonical boolean) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b employee_access_private.rpc_bindings;p record;i integer;sql text;arg text;expr text;
BEGIN
 SELECT * INTO b FROM employee_access_private.rpc_bindings WHERE name=f;
 IF NOT FOUND OR jsonb_typeof(j) IS DISTINCT FROM 'object' OR octet_length(j::text)>3000000 THEN RAISE EXCEPTION 'Unsupported employee RPC arguments';END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=b.function_oid;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(j)k WHERE NOT(k=ANY(p.proargnames))) THEN RAISE EXCEPTION 'Unknown employee RPC argument';END IF;
 sql:='SELECT employee_access_private.'||quote_ident(CASE WHEN canonical THEN b.canonical_name ELSE b.original_name END)||'(';
 FOR i IN 1..p.pronargs LOOP
  arg:=p.proargnames[i];
  IF NOT(j?arg) THEN IF i<=p.pronargs-p.pronargdefaults THEN RAISE EXCEPTION 'Missing employee RPC argument';ELSE CONTINUE;END IF;END IF;
  expr:=CASE WHEN p.proargtypes[i-1]='jsonb'::regtype THEN format('($1->%L)',arg) ELSE format('($1->>%L)::%s',arg,p.proargtypes[i-1]::regtype) END;
  IF right(sql,1)<>'(' THEN sql:=sql||',';END IF;
  sql:=sql||quote_ident(arg)||'=>'||expr;
 END LOOP;
 RETURN sql||')';
END $$;

CREATE FUNCTION employee_access_private.mask_snapshot(c uuid,f text,j jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d text;create_allowed boolean;update_allowed boolean;delete_allowed boolean;approve_allowed boolean;settings_allowed boolean;
BEGIN
 IF jsonb_typeof(j) IS DISTINCT FROM 'object' THEN RETURN j;END IF;
 d:=CASE WHEN f='erp_purchases_read' THEN 'purchases' WHEN f='erp_inventory_read' THEN 'inventory' WHEN f='erp_accounting_read' THEN 'accounting' WHEN f='erp_finance_read' THEN 'finance' END;
 IF d IS NULL OR NOT employee_access_private.app_enabled(c,d) THEN RETURN j;END IF;
 create_allowed:=employee_access_private.allows(c,d||'.create',coalesce((j->>'canCreate')::boolean,(j->>'canWrite')::boolean,false));
 update_allowed:=employee_access_private.allows(c,d||'.update',coalesce((j->>'canUpdate')::boolean,(j->>'canWrite')::boolean,false));
 delete_allowed:=employee_access_private.allows(c,d||'.delete',coalesce((j->>'canDelete')::boolean,(j->>'canWrite')::boolean,false));
 approve_allowed:=employee_access_private.allows(c,d||'.approve',coalesce((j->>'canApprove')::boolean,(j->>'canWrite')::boolean,false));
 settings_allowed:=CASE WHEN d IN('accounting','purchases') THEN coalesce((j->>'canSettings')::boolean,(j->>'canConfigure')::boolean,false) ELSE employee_access_private.allows(c,d||'.settings',coalesce((j->>'canSettings')::boolean,(j->>'canConfigure')::boolean,false)) END;
 j:=j||jsonb_build_object('canCreate',create_allowed,'canUpdate',update_allowed,'canDelete',delete_allowed,'canApprove',approve_allowed,'canSettings',settings_allowed,'canConfigure',settings_allowed,'canWrite',create_allowed OR update_allowed OR delete_allowed OR approve_allowed OR settings_allowed);
 IF d='purchases' THEN j:=j||jsonb_build_object('canCreateSupplier',employee_access_private.allows(c,'suppliers.create',create_allowed),'canUpdateSupplier',employee_access_private.allows(c,'suppliers.update',update_allowed),'canDeleteSupplier',employee_access_private.allows(c,'suppliers.delete',delete_allowed),'canPaySupplier',employee_access_private.allows(c,'suppliers.pay',approve_allowed));END IF;
 RETURN j;
END $$;

CREATE FUNCTION public.brand_finance_approval_prepare_rpc(p_cafe_id uuid,p_function text,p_arguments jsonb,p_scope jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE args jsonb;keys text[];k text;request uuid;native_request text;answer jsonb;entries jsonb:='[]';status text:='ready';previous_scope text;mutation boolean;
BEGIN
 PERFORM brand_finance_private.role_for(p_cafe_id);
 previous_scope:=current_setting('erp.branch_expected',true);
 IF p_scope IS NOT NULL THEN
  PERFORM set_config('erp.branch_expected',p_scope::text,true);
  PERFORM erp_branch_private.assert_context(p_cafe_id);
 END IF;
 EXECUTE employee_access_private.call_sql(p_function,p_arguments,true) INTO args USING p_arguments;
 IF coalesce(args->>'p_cafe_id',args->>'p_cafe') IS DISTINCT FROM p_cafe_id::text THEN RAISE EXCEPTION 'Employee RPC tenant mismatch' USING ERRCODE='42501';END IF;
 keys:=employee_access_private.rpc_keys(p_cafe_id,p_function,args);
 SELECT mutates INTO mutation FROM employee_access_private.rpc_bindings WHERE name=p_function;
 native_request:=coalesce(args->>'p_request_id',args->>'p_request',args#>>'{p_command,requestId}',args#>>'{p_input,requestId}');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF native_request IS NOT NULL THEN request:=md5(p_cafe_id::text||auth.uid()::text||p_function||native_request)::uuid;
 ELSE
  SELECT x.request_id INTO request FROM employee_access_private.rpc_commands x WHERE x.cafe_id=p_cafe_id AND x.actor=auth.uid() AND x.function_name=p_function AND x.arguments=args
   AND EXISTS(SELECT 1 FROM employee_access_private.approvals a WHERE a.cafe_id=x.cafe_id AND a.request_id=x.request_id AND a.requester_id=x.actor AND a.status IN('pending','approved','rejected') AND a.policy_revision=coalesce((SELECT action_permissions_revision FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=auth.uid()),0))
   AND NOT EXISTS(SELECT 1 FROM employee_access_private.rpc_results r WHERE r.cafe_id=x.cafe_id AND r.actor=x.actor AND r.request_id=x.request_id)
   ORDER BY x.created_at DESC LIMIT 1;
  request:=coalesce(request,gen_random_uuid());
 END IF;
 IF EXISTS(SELECT 1 FROM employee_access_private.rpc_commands WHERE cafe_id=p_cafe_id AND actor=auth.uid() AND request_id=request AND(function_name<>p_function OR arguments<>args)) THEN RAISE EXCEPTION 'Employee request identifier conflict' USING ERRCODE='40001';END IF;
 INSERT INTO employee_access_private.rpc_commands VALUES(p_cafe_id,auth.uid(),request,p_function,args,now()) ON CONFLICT DO NOTHING;
 FOREACH k IN ARRAY keys LOOP
  IF NOT employee_access_private.allows(p_cafe_id,k,true) THEN RAISE EXCEPTION 'Employee permission denied' USING ERRCODE='42501';END IF;
  IF k LIKE '%.read' OR NOT mutation THEN CONTINUE;END IF;
  answer:=public.brand_finance_approval_prepare(p_cafe_id,k,p_function,args,request);entries:=entries||jsonb_build_array(answer);
  IF answer->>'status'='rejected' THEN status:='rejected';ELSIF answer->>'status'='pending' AND status<>'rejected' THEN status:='pending';END IF;
 END LOOP;
 PERFORM set_config('erp.branch_expected',coalesce(previous_scope,''),true);
 RETURN jsonb_build_object('status',status,'requestId',request,'permissions',keys,'approvals',entries);
END $$;

CREATE FUNCTION employee_access_private.invoke(f text,args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=coalesce(args->>'p_cafe_id',args->>'p_cafe')::uuid;keys text[];k text;request uuid;native_request text;prior employee_access_private.rpc_results;result jsonb;scope_depth integer;mutation boolean;
BEGIN
 PERFORM brand_finance_private.role_for(c);
 keys:=employee_access_private.rpc_keys(c,f,args);
 FOREACH k IN ARRAY keys LOOP
  IF NOT employee_access_private.allows(c,k,true) THEN RAISE EXCEPTION 'Employee permission denied' USING ERRCODE='42501';END IF;
 END LOOP;
 SELECT b.mutates INTO mutation FROM employee_access_private.rpc_bindings b WHERE b.name=f;
 mutation:=mutation AND EXISTS(SELECT 1 FROM unnest(keys) AS entry(permission_key) WHERE entry.permission_key NOT LIKE '%.read');
 SELECT t.request_id INTO request FROM employee_access_private.rpc_tokens t WHERE t.cafe_id=c AND t.actor=auth.uid() AND t.transaction_id=txid_current() AND t.function_name=f AND t.arguments=args;
 IF request IS NULL THEN
  native_request:=coalesce(args->>'p_request_id',args->>'p_request',args#>>'{p_command,requestId}',args#>>'{p_input,requestId}');
  request:=CASE WHEN native_request IS NULL THEN gen_random_uuid() ELSE md5(c::text||auth.uid()::text||f||native_request)::uuid END;
 END IF;
 IF mutation THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(c::text,60412));
  SELECT * INTO prior FROM employee_access_private.rpc_results WHERE cafe_id=c AND actor=auth.uid() AND request_id=request;
  IF FOUND THEN
   IF prior.function_name<>f OR prior.arguments<>args THEN RAISE EXCEPTION 'Employee request identifier conflict' USING ERRCODE='40001';END IF;
   RETURN prior.result;
  END IF;
  FOREACH k IN ARRAY keys LOOP
   IF k NOT LIKE '%.read' AND NOT employee_access_private.scoped_key(c,k) THEN PERFORM employee_access_private.assert_and_consume(c,k,f,args,request);END IF;
  END LOOP;
 END IF;
 SELECT coalesce(max(x.depth),0)+1 INTO scope_depth FROM employee_access_private.rpc_context x WHERE x.cafe_id=c AND x.actor=auth.uid() AND x.transaction_id=txid_current();
 INSERT INTO employee_access_private.rpc_context VALUES(c,auth.uid(),txid_current(),scope_depth,keys);
 EXECUTE employee_access_private.call_sql(f,args,false) INTO result USING args;
 IF result->>'ok'='false' THEN RAISE EXCEPTION '%',coalesce(result->>'message',result->>'error','Employee operation was rejected');END IF;
 result:=employee_access_private.mask_snapshot(c,f,result);
 IF f='erp_purchases_read' THEN
  IF NOT employee_access_private.allows(c,'purchases.read',true) THEN
   result:=result||jsonb_build_object('records','[]'::jsonb,'invoices','[]'::jsonb,'inventoryDocuments','[]'::jsonb,'items','[]'::jsonb,'canCreate',false,'canUpdate',false,'canDelete',false,'canApprove',false,'canSettings',false);
  END IF;
  IF NOT employee_access_private.allows(c,'suppliers.read',true) THEN
   result:=result||jsonb_build_object('suppliers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s->'id','name',s->'name','active',s->'active')) FROM jsonb_array_elements(result->'suppliers')s),'[]'::jsonb),'payments','[]'::jsonb,'credits','[]'::jsonb,'supplierBalances','{}'::jsonb);
  END IF;
 END IF;
 DELETE FROM employee_access_private.rpc_context x WHERE x.cafe_id=c AND x.actor=auth.uid() AND x.transaction_id=txid_current() AND x.depth=scope_depth;
 IF mutation THEN INSERT INTO employee_access_private.rpc_results VALUES(c,auth.uid(),request,f,args,result,now());END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.erp_my_permissions(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;p jsonb;permissions jsonb:='{}';d text;a text;v jsonb;enabled boolean;
BEGIN
 result:=employee_access_private.erp_permissions_before_policy(p_cafe_id);
 SELECT action_permissions INTO p FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=auth.uid() AND active;
 IF p IS NULL OR p='{}'::jsonb THEN RETURN result||jsonb_build_object('employeePermissions',p);END IF;
 FOREACH d IN ARRAY erp_access_private.domains() LOOP
  v:='{}';
  FOREACH a IN ARRAY ARRAY['read','create','update','delete','approve','settings','files'] LOOP
   enabled:=erp_access_private.allowed(p_cafe_id,d,a);
   IF p?(d||'.'||a) THEN enabled:=employee_access_private.allows(p_cafe_id,d||'.'||a,enabled) AND employee_access_private.app_enabled(p_cafe_id,d);END IF;
   v:=v||jsonb_build_object(a,enabled);
  END LOOP;
  permissions:=permissions||jsonb_build_object(d,v);
 END LOOP;
 RETURN result||jsonb_build_object('custom',true,'permissions',permissions,'employeePermissions',p,
 'blocked',coalesce((SELECT jsonb_agg(b) FROM jsonb_array_elements_text(coalesce(result->'blocked','[]'))b WHERE NOT(coalesce((p->(b||'.read')->>'enabled')::boolean,false) AND employee_access_private.app_enabled(p_cafe_id,b))),'[]'::jsonb));
END $$;

CREATE FUNCTION public.brand_finance_employee_rpc_execute(p_cafe_id uuid,p_function text,p_arguments jsonb,p_request_id uuid,p_scope jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE args jsonb;result jsonb;previous_scope text;
BEGIN
 PERFORM brand_finance_private.role_for(p_cafe_id);
 EXECUTE employee_access_private.call_sql(p_function,p_arguments,true) INTO args USING p_arguments;
 IF coalesce(args->>'p_cafe_id',args->>'p_cafe') IS DISTINCT FROM p_cafe_id::text OR NOT EXISTS(SELECT 1 FROM employee_access_private.rpc_commands WHERE cafe_id=p_cafe_id AND actor=auth.uid() AND request_id=p_request_id AND function_name=p_function AND arguments=args) THEN RAISE EXCEPTION 'Prepared employee command is required' USING ERRCODE='42501';END IF;
 previous_scope:=current_setting('erp.branch_expected',true);
 IF p_scope IS NOT NULL THEN PERFORM set_config('erp.branch_expected',p_scope::text,true);PERFORM erp_branch_private.assert_context(p_cafe_id);END IF;
 INSERT INTO employee_access_private.rpc_tokens VALUES(p_cafe_id,auth.uid(),txid_current(),p_function,args,p_request_id);
 result:=employee_access_private.invoke(p_function,args);
 DELETE FROM employee_access_private.rpc_tokens WHERE cafe_id=p_cafe_id AND actor=auth.uid() AND transaction_id=txid_current() AND function_name=p_function;
 PERFORM set_config('erp.branch_expected',coalesce(previous_scope,''),true);
 RETURN result;
END $$;

-- Preserve original public OIDs, including the branch-dispatch registry.
DO $$DECLARE p record;f text;source text;original text;canonical text;json_args text;arguments text;names text[]:=ARRAY[
 'brand_finance_execute','erp_purchases_write','erp_finance_write','erp_accounting_write','brand_finance_gl_execute','erp_inventory_write',
 'brand_finance_treasury_execute','brand_finance_issue_company_invoice','brand_finance_save_invoice_draft',
 'brand_finance_invoice_management','brand_finance_amend_invoice','brand_finance_customer_credit',
 'brand_finance_save_credit_note','brand_finance_transition_credit_note','brand_finance_invoice_extensions',
 'brand_finance_sales_return_stock','brand_finance_inventory_unit_save','erp_purchase_product_create','finance_loyalty_settings_read','finance_loyalty_settings_save',
 'erp_purchases_read','brand_finance_pos_purchase_catalog','erp_finance_read','erp_finance_detail',
 'brand_finance_treasury_snapshot','brand_finance_treasury_statement','brand_finance_treasury_history',
 'erp_accounting_read','brand_finance_journal_detail','erp_inventory_read','erp_inventory_sales_catalog','brand_finance_inventory_catalog',
 'brand_finance_invoice_drafts','brand_finance_invoice_detail','brand_finance_invoice_context','brand_finance_customer_detail',
 'brand_finance_sales_returns','brand_finance_credit_notes','brand_finance_customer_payments','erp_reports_read','erp_report_run','erp_report_export'];
BEGIN
 FOREACH f IN ARRAY names LOOP
  SELECT proc.* INTO p FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace WHERE ns.nspname='public' AND proc.proname=f;
  IF NOT FOUND OR p.prorettype<>'jsonb'::regtype THEN RAISE EXCEPTION 'Required employee RPC missing or unsupported: %',f;END IF;
  IF (SELECT count(*) FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace WHERE ns.nspname='public' AND proc.proname=f)<>1 THEN RAISE EXCEPTION 'Overloaded employee RPC requires explicit binding: %',f;END IF;
  original:='original_'||f;canonical:='args_'||f;source:=pg_get_functiondef(p.oid);arguments:=pg_get_function_arguments(p.oid);
  EXECUTE replace(source,'public.'||f||'(','employee_access_private.'||original||'(');
  SELECT string_agg(format('%L,%I',name,name),',' ORDER BY n) INTO json_args FROM unnest(p.proargnames) WITH ORDINALITY a(name,n);
  EXECUTE format('CREATE FUNCTION employee_access_private.%I(%s) RETURNS jsonb LANGUAGE sql SET search_path='''' AS %L',canonical,arguments,'SELECT jsonb_build_object('||json_args||')');
  INSERT INTO employee_access_private.rpc_bindings VALUES(f,p.oid,original,canonical,f!~'(_read|_detail|_catalog|_snapshot|_statement|_history|_drafts|_returns|_notes|_payments|_context|_run|_export)$');
  EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS %L',f,arguments,'BEGIN RETURN employee_access_private.invoke('||quote_literal(f)||',jsonb_build_object('||json_args||'));END');
 END LOOP;
END $$;

-- Explicit action grants extend the old module gate; ordinary calls and every
-- unmapped policy keep the existing behavior. These helpers never change roles.
DO $$DECLARE p record;source text;schema_name text;function_name text;arguments text;call_args text;body text;cname text;app_guard text;domain_name text;
BEGIN
 FOR p IN SELECT proc.*,ns.nspname FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace
 WHERE (ns.nspname IN('erp_finance_private','erp_accounting_private','erp_inventory_private','erp_purchase_private','erp_reports_private') AND proc.proname IN('authorize','allowed'))
 OR(ns.nspname='brand_finance_private' AND proc.proname='assert_job_access') OR(ns.nspname='erp_access_private' AND proc.proname='allowed') LOOP
  source:=pg_get_functiondef(p.oid);schema_name:=p.nspname;function_name:=p.proname;arguments:=pg_get_function_arguments(p.oid);cname:=p.proargnames[1];
  EXECUTE replace(source,schema_name||'.'||function_name||'(','employee_access_private.legacy_'||schema_name||'_'||function_name||'(');
  SELECT string_agg(quote_ident(name),',' ORDER BY n) INTO call_args FROM unnest(p.proargnames) WITH ORDINALITY a(name,n);
  domain_name:=CASE schema_name WHEN 'erp_purchase_private' THEN 'purchases' WHEN 'erp_inventory_private' THEN 'inventory' WHEN 'erp_finance_private' THEN 'finance' WHEN 'erp_accounting_private' THEN 'accounting' WHEN 'erp_reports_private' THEN 'reports' END;
  app_guard:=CASE WHEN schema_name='erp_access_private' THEN ' AND employee_access_private.app_enabled('||quote_ident(cname)||','||quote_ident(p.proargnames[2])||')' WHEN domain_name IS NOT NULL THEN ' AND employee_access_private.app_enabled('||quote_ident(cname)||','||quote_literal(domain_name)||')' ELSE '' END;
  body:='BEGIN IF '||CASE WHEN schema_name='brand_finance_private' THEN 'employee_access_private.scoped_grant('||quote_ident(cname)||')' ELSE 'employee_access_private.scoped_gate('||quote_ident(cname)||','||quote_ident(p.proargnames[CASE WHEN schema_name='erp_access_private' THEN 3 ELSE 2 END])||')' END||app_guard||' THEN '||CASE WHEN p.prorettype='boolean'::regtype THEN 'RETURN true;' WHEN p.prorettype='text'::regtype THEN 'RETURN brand_finance_private.role_for('||quote_ident(cname)||');' ELSE 'RETURN;' END||' END IF;';
  body:=body||CASE WHEN p.prorettype='void'::regtype THEN 'PERFORM ' ELSE 'RETURN ' END||'employee_access_private.'||quote_ident('legacy_'||schema_name||'_'||function_name)||'('||call_args||');END';
  EXECUTE format('CREATE OR REPLACE FUNCTION %I.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS %L',schema_name,function_name,arguments,p.prorettype::regtype,body);
 END LOOP;
END $$;

-- Patch only the known role-denial predicates inside selected original paths.
-- The proof is a private context inserted after the exact operation's policies
-- and approvals have passed. Owner/staff settings and self/shift checks stay intact.
DO $$DECLARE p record;source text;body text;patched text;needle text;cname text;matches integer;
BEGIN
 FOR p IN SELECT proc.*,ns.nspname FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace
 WHERE (ns.nspname='employee_access_private' AND proc.proname IN(
 'original_brand_finance_issue_company_invoice','original_brand_finance_save_invoice_draft','original_brand_finance_invoice_management',
 'original_brand_finance_amend_invoice','original_brand_finance_customer_credit','original_brand_finance_sales_return_stock','original_brand_finance_inventory_unit_save','original_erp_purchase_product_create',
 'original_brand_finance_save_credit_note','original_brand_finance_transition_credit_note','original_brand_finance_invoice_extensions',
 'original_brand_finance_invoice_drafts','original_brand_finance_invoice_detail','original_brand_finance_invoice_context','original_brand_finance_customer_detail','original_brand_finance_sales_returns','original_brand_finance_credit_notes','original_brand_finance_customer_payments',
 'original_brand_finance_treasury_snapshot','original_brand_finance_treasury_statement','original_brand_finance_treasury_history','original_brand_finance_journal_detail','original_erp_inventory_sales_catalog','original_brand_finance_inventory_catalog','original_brand_finance_gl_execute'))
 OR(ns.nspname='brand_finance_private' AND proc.proname='execute_before_treasury')
 OR(ns.nspname='erp_finance_private' AND proc.proname='before_treasury_execute')
 OR(ns.nspname='erp_accounting_private' AND proc.proname IN('gl_execute','gl_snapshot','gl_report','gl_document','gl_events'))
 OR(ns.nspname='employee_access_private' AND proc.proname IN('original_finance_loyalty_settings_read','original_finance_loyalty_settings_save'))
 OR(ns.nspname='erp_branch_private' AND proc.proname='erp_accounting_write_before_scope') LOOP
  source:=pg_get_functiondef(p.oid);body:=p.prosrc;cname:=p.proargnames[1];patched:=body;matches:=0;
  FOREACH needle IN ARRAY ARRAY[
   'brand_finance_private.role_for(p_cafe)<>''owner''',
   'brand_finance_private.role_for(p_cafe) IS DISTINCT FROM ''owner''',
   'coalesce(role_name,'''') NOT IN(''owner'',''manager'',''accountant'')',
   'coalesce(role_name,'''') NOT IN(''owner'',''manager'',''accountant'',''auditor'')',
   'coalesce(role_name,'''') NOT IN(''owner'',''manager'',''warehouse'')',
   'coalesce(r,'''') NOT IN (''owner'',''manager'',''accountant'')',
   'coalesce(r,'''') NOT IN(''owner'',''manager'',''accountant'',''auditor'')',
   'r NOT IN(''owner'',''manager'')',
   'r NOT IN(''owner'',''manager'',''accountant'')',
   'r NOT IN(''owner'',''manager'',''accountant'',''auditor'')',
   'role_name NOT IN(''owner'',''manager'',''accountant'')',
   'role_name NOT IN(''owner'',''accountant'')',
   'brand_finance_private.role_for(p_cafe_id) NOT IN(''owner'',''manager'',''warehouse'')',
   'brand_finance_private.role_for(p_cafe_id) NOT IN(''owner'',''manager'',''accountant'',''warehouse'',''auditor'')',
   'coalesce(brand_finance_private.role_for(p_cafe_id),'''') NOT IN(''owner'',''manager'',''accountant'')',
   'r=''cashier'' AND p_operation NOT IN(''sale'',''refund'',''shift_open'',''shift_close'',''shift_handover'',''shift_accept'')'
  ] LOOP
   IF p.nspname='brand_finance_private' AND p.proname='execute_before_treasury' AND needle NOT LIKE 'r=''cashier'' AND p_operation%' THEN CONTINUE;END IF;
   IF position(needle IN patched)>0 THEN patched:=replace(patched,needle,'('||needle||' AND NOT employee_access_private.scoped_grant('||quote_ident(cname)||'))');matches:=matches+1;END IF;
  END LOOP;
  IF matches>0 THEN EXECUTE replace(source,body,patched);END IF;
 END LOOP;
END $$;

-- Keep the original POS permission compatibility fields synchronized with the
-- new explicit keys while preserving all inherited owner settings.
ALTER FUNCTION erp_purchase_private.pos_permissions(uuid) RENAME TO pos_permissions_before_employee_actions;
CREATE FUNCTION erp_purchase_private.pos_permissions(c uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb:=erp_purchase_private.pos_permissions_before_employee_actions(c);
BEGIN
 RETURN p||jsonb_build_object('createItem',employee_access_private.allows(c,'inventory.create',(p->>'createItem')::boolean),
 'createSupplier',employee_access_private.allows(c,'suppliers.create',(p->>'createSupplier')::boolean),
 'credit',employee_access_private.allows(c,'purchases.credit',(p->>'credit')::boolean),
 'supplierPayout',employee_access_private.allows(c,'suppliers.pay',(p->>'supplierPayout')::boolean));
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA employee_access_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_purchase_private.pos_permissions(uuid),erp_purchase_private.pos_permissions_before_employee_actions(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_approval_prepare_rpc(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_approval_prepare_rpc(uuid,text,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_employee_rpc_execute(uuid,text,jsonb,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_employee_rpc_execute(uuid,text,jsonb,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
