BEGIN;
CREATE SCHEMA erp_treasury_private;
REVOKE ALL ON SCHEMA erp_treasury_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE erp_treasury_private.calls(name text PRIMARY KEY,original oid NOT NULL,target text NOT NULL,mutates boolean NOT NULL);
CREATE TABLE erp_treasury_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,branch_id uuid,operation text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
CREATE TRIGGER erp_treasury_requests_immutable BEFORE UPDATE OR DELETE ON erp_treasury_private.requests FOR EACH ROW EXECUTE FUNCTION erp_branch_private.immutable();
CREATE FUNCTION erp_treasury_private.fee_branch(c uuid,terminal uuid,source uuid) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE b uuid;n integer;BEGIN
 IF source IS NOT NULL THEN SELECT branch_id INTO b FROM public.erp_branch_documents WHERE cafe_id=c AND document_id=source;RETURN b;END IF;
 SELECT count(*),min(branch_id::text)::uuid INTO n,b FROM public.erp_branch_resources WHERE cafe_id=c AND kind='account' AND record_id=terminal;RETURN CASE WHEN n=1 THEN b ELSE NULL END;
END $$;
DO $$DECLARE src text;BEGIN SELECT pg_get_functiondef('erp_branch_private.current_branch(uuid)'::regprocedure) INTO src;EXECUTE replace(src,'erp_branch_private.current_branch(','erp_treasury_private.current_branch_before_treasury(');END $$;
CREATE OR REPLACE FUNCTION erp_branch_private.current_branch(c uuid) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE j jsonb;b uuid;BEGIN
 j:=nullif(current_setting('erp.treasury_fee_source',true),'')::jsonb;
 IF j IS NOT NULL AND j->>'cafe'=c::text AND j->>'actor'=auth.uid()::text THEN
  b:=erp_treasury_private.fee_branch(c,(j->>'terminal')::uuid,nullif(j->>'source','')::uuid);
  IF to_jsonb(b) IS DISTINCT FROM nullif(j->'branchId','null'::jsonb) THEN RAISE EXCEPTION 'Treasury fee source changed' USING ERRCODE='40001';END IF;
  IF b IS NOT NULL AND NOT erp_branch_private.branch_allowed(c,b) THEN RAISE EXCEPTION 'Treasury fee branch unauthorized' USING ERRCODE='42501';END IF;RETURN b;
 END IF;RETURN erp_treasury_private.current_branch_before_treasury(c);
END $$;
CREATE FUNCTION erp_treasury_private.terminal_fee_accrue(p_cafe uuid,p_terminal uuid,p_source uuid,p_month date,p_base numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE b uuid;prior jsonb;BEGIN
 PERFORM erp_branch_private.assert_input(p_cafe,jsonb_build_object('accountId',p_terminal,'documentId',p_source));b:=erp_treasury_private.fee_branch(p_cafe,p_terminal,p_source);
 IF b IS NOT NULL AND NOT erp_branch_private.branch_allowed(p_cafe,b) THEN RETURN;END IF;
 prior:=jsonb_build_object('source',current_setting('erp.treasury_fee_source',true),'branch',current_setting('erp.branch_id',true),'cafe',current_setting('erp.branch_cafe',true));
 PERFORM set_config('erp.treasury_fee_source',jsonb_build_object('cafe',p_cafe,'terminal',p_terminal,'source',p_source,'actor',auth.uid(),'branchId',b)::text,true);PERFORM set_config('erp.branch_cafe',p_cafe::text,true);PERFORM set_config('erp.branch_id',coalesce(b::text,''),true);
 PERFORM brand_finance_private.terminal_fee_accrue(p_cafe,p_terminal,p_source,p_month,p_base);
 PERFORM set_config('erp.treasury_fee_source',coalesce(prior->>'source',''),true);PERFORM set_config('erp.branch_cafe',coalesce(prior->>'cafe',''),true);PERFORM set_config('erp.branch_id',coalesce(prior->>'branch',''),true);
END $$;
CREATE FUNCTION erp_treasury_private.register_account(c uuid,a uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE b uuid:=erp_branch_private.current_branch(c);BEGIN IF b IS NOT NULL THEN INSERT INTO public.erp_branch_resources(cafe_id,kind,record_id,branch_id) VALUES(c,'account',a,b) ON CONFLICT DO NOTHING;END IF;END $$;
-- Copies use the current reviewed business definitions, retaining original role/period/idempotency guards
DO $$DECLARE p record;src text;t record;readonly boolean;target text;BEGIN
 FOR p IN SELECT proc.oid,proc.proname,ns.nspname FROM pg_proc proc JOIN pg_namespace ns ON ns.oid=proc.pronamespace WHERE
 (ns.nspname='erp_finance_private' AND proc.proname IN('before_treasury_snapshot','before_treasury_statement','before_treasury_history','before_treasury_execute')) OR
 (ns.nspname='brand_finance_private' AND proc.proname IN('terminal_monthly_ensure','terminal_monthly_ensure_at')) OR
 (ns.nspname='public' AND proc.proname IN('brand_finance_treasury_snapshot','brand_finance_treasury_statement','brand_finance_treasury_history','brand_finance_terminal_fee_history','brand_finance_treasury_execute','brand_finance_treasury_correct','brand_finance_cash_handovers','brand_finance_receive_shift_cash','brand_finance_treasury_attachment')) LOOP
  SELECT pg_get_functiondef(p.oid) INTO src;target:=p.proname;src:=replace(src,p.nspname||'.'||p.proname||'(','erp_treasury_private.'||target||'(');
  src:=replace(src,'erp_finance_private.before_treasury_','erp_treasury_private.before_treasury_');src:=replace(src,'brand_finance_private.terminal_monthly_ensure','erp_treasury_private.terminal_monthly_ensure');
  IF p.proname IN('terminal_monthly_ensure','terminal_monthly_ensure_at') THEN src:=replace(src,'brand_finance_private.terminal_fee_accrue(','erp_treasury_private.terminal_fee_accrue(');END IF;
  readonly:=p.proname IN('brand_finance_treasury_snapshot','brand_finance_treasury_statement','brand_finance_treasury_history','before_treasury_snapshot','before_treasury_statement','before_treasury_history','brand_finance_terminal_fee_history','brand_finance_cash_handovers','terminal_monthly_ensure_at');
  IF readonly THEN FOR t IN SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE ns.nspname='erp_branch_private' AND cl.relkind='v' LOOP src:=regexp_replace(src,'(FROM|JOIN)([[:space:]]+)public\.'||t.relname||'([[:space:]]|$|\))','\1\2erp_branch_private.'||t.relname||'\3','gi');END LOOP;END IF;
  IF p.proname IN('before_treasury_execute','brand_finance_treasury_execute') AND src LIKE '%IF a.kind<>k%' THEN src:=regexp_replace(src,'ELSE([[:space:]]+)IF a.kind<>k','PERFORM erp_treasury_private.register_account(p_cafe_id,aid); ELSE\1IF a.kind<>k');END IF;
  EXECUTE src;
  IF p.nspname='public' AND p.proname<>'brand_finance_treasury_correct' THEN INSERT INTO erp_treasury_private.calls VALUES(p.proname,p.oid,target,p.proname IN('brand_finance_treasury_execute','brand_finance_receive_shift_cash','brand_finance_treasury_attachment'));END IF;
 END LOOP;
END $$;
CREATE FUNCTION erp_treasury_private.check_arguments(c uuid,args jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE v jsonb;row jsonb;BEGIN
 PERFORM erp_branch_private.assert_input(c,args);FOR v IN SELECT value FROM jsonb_each(args) LOOP IF jsonb_typeof(v)='string' AND (v#>>'{}')~'^[0-9a-f-]{36}$' THEN PERFORM erp_branch_private.assert_input(c,jsonb_build_object('id',v));END IF;END LOOP;
 IF args?'p_handover_id' THEN SELECT to_jsonb(h) INTO row FROM public.bf_cash_handovers h WHERE cafe_id=c AND id=(args->>'p_handover_id')::uuid;IF row IS NULL THEN RAISE EXCEPTION 'Handover unavailable';END IF;PERFORM erp_branch_private.assert_input(c,row);END IF;
END $$;
CREATE FUNCTION public.erp_treasury(p_cafe uuid,p_function text,p_arguments jsonb,p_scope jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE f record;p record;sql text;arg text;expr text;result jsonb;old_scope text;request uuid;prior erp_treasury_private.requests;actor uuid:=auth.uid();b uuid;write_action boolean;BEGIN
 SELECT * INTO f FROM erp_treasury_private.calls WHERE name=p_function;IF NOT FOUND OR jsonb_typeof(p_arguments)<>'object' OR octet_length(p_arguments::text)>50000 THEN RAISE EXCEPTION 'Invalid ERP treasury operation';END IF;
 IF (p_arguments->>'p_cafe_id')::uuid IS DISTINCT FROM p_cafe THEN RAISE EXCEPTION 'Invalid treasury tenant' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));old_scope:=current_setting('erp.branch_expected',true);PERFORM set_config('erp.branch_expected',coalesce(p_scope::text,''),true);PERFORM erp_branch_private.assert_context(p_cafe);PERFORM erp_branch_private.enter(p_cafe);b:=erp_branch_private.current_branch(p_cafe);
 PERFORM erp_access_private.assert_allowed(p_cafe,'finance',CASE WHEN p_function='brand_finance_treasury_execute' THEN CASE WHEN p_arguments->>'p_operation'='account_save' THEN CASE WHEN nullif(p_arguments#>>'{p_payload,id}','') IS NULL THEN 'create' ELSE 'update' END WHEN p_arguments->>'p_operation'='account_delete' THEN 'delete' WHEN p_arguments->>'p_operation' IN('account_archive','account_primary') THEN 'update' ELSE 'approve' END WHEN p_function='brand_finance_treasury_attachment' AND coalesce(p_arguments->>'p_action','list') NOT IN('list','get') THEN 'files' WHEN p_function='brand_finance_receive_shift_cash' THEN 'approve' ELSE 'read' END);
 PERFORM erp_treasury_private.check_arguments(p_cafe,p_arguments);
 request:=nullif(p_arguments->>'p_request_id','')::uuid;write_action:=f.mutates AND request IS NOT NULL;
 IF write_action THEN SELECT * INTO prior FROM erp_treasury_private.requests WHERE cafe_id=p_cafe AND request_id=request;IF FOUND THEN IF prior.actor<>actor OR prior.branch_id IS DISTINCT FROM b OR prior.operation<>p_function OR prior.payload<>p_arguments THEN RAISE EXCEPTION 'Treasury request context changed' USING ERRCODE='40001';END IF;PERFORM erp_branch_private.assert_input(p_cafe,prior.result);PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN prior.result;END IF;END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=f.original;sql:='SELECT erp_treasury_private.'||quote_ident(f.target)||'(';FOR i IN 1..p.pronargs LOOP
  arg:=p.proargnames[i];IF NOT p_arguments?arg THEN IF i<=p.pronargs-p.pronargdefaults THEN RAISE EXCEPTION 'Missing treasury argument';ELSE CONTINUE;END IF;END IF;
  expr:=CASE WHEN p.proargtypes[i-1]='jsonb'::regtype THEN format('($1->%L)',arg) ELSE format('($1->>%L)::%s',arg,format_type(p.proargtypes[i-1],NULL)) END;sql:=sql||quote_ident(arg)||'=>'||expr||',';
 END LOOP;sql:=rtrim(sql,',')||')';EXECUTE sql INTO result USING p_arguments;
 IF p_function='brand_finance_treasury_execute' AND p_arguments->>'p_operation'='account_save' AND nullif(p_arguments#>>'{p_payload,id}','') IS NULL AND b IS NOT NULL THEN INSERT INTO public.erp_branch_resources(cafe_id,kind,record_id,branch_id) VALUES(p_cafe,'account',(result->>'id')::uuid,b) ON CONFLICT DO NOTHING;END IF;
 PERFORM erp_branch_private.assert_input(p_cafe,result);result:=erp_branch_private.filter_json(p_cafe,b,result);
 IF jsonb_typeof(result)='object' THEN result:=result||jsonb_build_object('branchScope',erp_branch_private.scope(p_cafe));END IF;
 IF write_action THEN INSERT INTO erp_treasury_private.requests VALUES(p_cafe,request,actor,b,p_function,p_arguments,result);END IF;PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN result;
END $$;
CREATE FUNCTION public.erp_treasury_correct(p_cafe_id uuid,p_user_id uuid,p_scope jsonb,p_actor_id uuid,p_maintenance_expires_at timestamptz,p_operation text,p_payload jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE prior_sub text:=current_setting('request.jwt.claim.sub',true);prior_claims text:=current_setting('request.jwt.claims',true);old_scope text:=current_setting('erp.branch_expected',true);result jsonb;BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_user_id)::text,true);IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Treasury correction role required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));PERFORM set_config('erp.branch_expected',coalesce(p_scope::text,''),true);PERFORM erp_branch_private.assert_context(p_cafe_id);PERFORM erp_branch_private.enter(p_cafe_id);PERFORM erp_access_private.assert_allowed(p_cafe_id,'finance','approve');PERFORM erp_branch_private.assert_input(p_cafe_id,p_payload);
 result:=erp_treasury_private.brand_finance_treasury_correct(p_cafe_id,p_actor_id,p_maintenance_expires_at,p_operation,p_payload,p_request_id);PERFORM erp_branch_private.assert_input(p_cafe_id,result);
 PERFORM set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);PERFORM set_config('request.jwt.claims',coalesce(prior_claims,''),true);PERFORM set_config('erp.branch_expected',coalesce(old_scope,''),true);RETURN result;
END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['bf_treasury_reconciliations','bf_treasury_audit'] LOOP EXECUTE format('CREATE TRIGGER erp_branch_capture AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_branch_private.capture_record()',t);END LOOP;END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_treasury_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_treasury_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_treasury(uuid,text,jsonb,jsonb),public.erp_treasury_correct(uuid,uuid,jsonb,uuid,timestamptz,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_treasury(uuid,text,jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_treasury_correct(uuid,uuid,jsonb,uuid,timestamptz,text,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
