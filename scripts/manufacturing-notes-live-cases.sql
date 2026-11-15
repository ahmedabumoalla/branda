SET LOCAL statement_timeout='90s';
CREATE TEMP TABLE note_checks(name text PRIMARY KEY,passed boolean);
CREATE FUNCTION pg_temp.note_check(v boolean,n text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',n;END IF;INSERT INTO note_checks VALUES(n,true);END$$;
CREATE FUNCTION pg_temp.note_command(extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('id',current_setting('mn.record'),'kind','orders','action','note','requestId',gen_random_uuid(),
 'revision',public.erp_manufacturing_read(current_setting('mn.c')::uuid,'orders',current_setting('mn.record')::uuid)#>'{records,0,revision}',
 'note','Legacy note','lines','[]'::jsonb,'value','{}'::jsonb)||extra
$$;
CREATE FUNCTION pg_temp.note_act(command jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.erp_branch_execute(current_setting('mn.c')::uuid,'erp_manufacturing_act',jsonb_build_object('p_cafe_id',current_setting('mn.c'),'p_command',command),public.erp_branch_context(current_setting('mn.c')::uuid)->'scope')
$$;
CREATE FUNCTION pg_temp.note_deny(command jsonb,label text) RETURNS void LANGUAGE plpgsql AS $$DECLARE blocked boolean:=false;BEGIN
 BEGIN PERFORM pg_temp.note_act(command);EXCEPTION WHEN OTHERS THEN IF SQLSTATE IN('42501','22023','40001','23503','23505','P0001','22P02','22007','22008') THEN blocked:=true;ELSE RAISE;END IF;END;
 PERFORM pg_temp.note_check(blocked,label);
END$$;
DO $$DECLARE c uuid:='e6200000-0000-4000-8000-000000000001';owner_id uuid;staff_id uuid;plan text;record_id uuid:=gen_random_uuid();file_id uuid:=gen_random_uuid();branch_a uuid:=gen_random_uuid();branch_b uuid:=gen_random_uuid();command jsonb;r jsonb;bad jsonb;counter integer:=0;denied boolean;BEGIN
 SELECT id INTO owner_id FROM public.profiles WHERE role='cafe_owner' AND status='active' ORDER BY created_at LIMIT 1;
 SELECT id INTO staff_id FROM public.profiles WHERE id<>owner_id AND status='active' AND role<>'platform_admin' ORDER BY created_at LIMIT 1;
 SELECT id INTO plan FROM public.platform_plans WHERE active AND features?'finance' LIMIT 1;
 INSERT INTO public.cafes(id,owner_user_id,name,slug,status,is_public) VALUES(c,owner_id,'MANUFACTURING-NOTES-ROLLBACK-PROBE','manufacturing-notes-rollback-probe','active',false);
 INSERT INTO public.subscriptions(cafe_id,plan_id,status,expires_at) VALUES(c,plan,'active',now()+interval '1 month');
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);PERFORM set_config('mn.c',c::text,true);PERFORM set_config('mn.record',record_id::text,true);PERFORM brand_finance_private.seed(c);
 INSERT INTO public.bf_staff(cafe_id,user_id,name,role,active) VALUES(c,staff_id,'Notes auditor','auditor',true);
 INSERT INTO public.erp_mfg_orders(cafe_id,id,name,code,payload,created_by) VALUES(c,record_id,'Manufacturing notes order','NOTE-ORDER','{}',owner_id);
 command:=pg_temp.note_command();PERFORM pg_temp.note_act(command);
 PERFORM pg_temp.note_check((public.erp_manufacturing_read(c,'orders',record_id)#>>'{events,0,note}')='Legacy note','legacy note roundtrip');
 command:=pg_temp.note_command('{"note":"<p><strong>Manufacturing note</strong></p>","format":"rich","tags":["inspection","quality"],"occurredAt":"2026-11-13T10:30:00+03:00","attachmentIds":[]}');
 EXECUTE 'SET LOCAL ROLE authenticated';r:=pg_temp.note_act(command);EXECUTE 'RESET ROLE';
 PERFORM pg_temp.note_check((SELECT count(*)=1 FROM public.erp_mfg_events WHERE cafe_id=c AND action='note' AND payload->>'requestId'=command->>'requestId'),'authenticated writer saves exactly one note');
 PERFORM pg_temp.note_check((pg_temp.note_act(command)->>'duplicate')::boolean,'same request retry returns duplicate');
 PERFORM pg_temp.note_check((SELECT count(*)=2 FROM public.erp_mfg_events WHERE cafe_id=c AND action='note'),'retry creates no extra event');
 EXECUTE 'SET LOCAL ROLE authenticated';r:=public.erp_manufacturing_read(c,'orders',record_id);EXECUTE 'RESET ROLE';
 PERFORM pg_temp.note_check(EXISTS(SELECT 1 FROM jsonb_array_elements(r->'events') e WHERE e#>>'{payload,format}'='rich' AND e#>'{payload,tags}'='["inspection","quality"]' AND e#>>'{payload,occurredAt}'='2026-11-13T10:30:00+03:00'),'authenticated reader retains note metadata');
 PERFORM pg_temp.note_deny(command||'{"note":"Changed retry"}','retry content conflict denied');
 FOR bad IN SELECT value FROM jsonb_array_elements('[{"format":"html"},{"format":null},{"format":"rich","note":"<script>alert(1)</script>"},{"format":"rich","note":"<p onclick=evil()>text</p>"},{"format":"rich","note":"<p>&nbsp;</p>"},{"tags":["A","a"]},{"tags":[null]},{"tags":"wrong"},{"tags":[" padded "]},{"occurredAt":"infinity"},{"occurredAt":"2026-13-13T10:00:00Z"},{"occurredAt":null},{"attachmentIds":null}]') LOOP
  counter:=counter+1;PERFORM pg_temp.note_deny(pg_temp.note_command(bad),'malformed note metadata '||counter);
 END LOOP;
 PERFORM pg_temp.note_deny(pg_temp.note_command(jsonb_build_object('attachmentIds',jsonb_build_array(file_id))),'unknown file denied');
 INSERT INTO public.erp_files(id,cafe_id,entity_type,record_id,name,mime,size_bytes,sha256,path,uploaded,created_by)
 VALUES(file_id,c,'manufacturing_order',record_id,'missing.pdf','application/pdf',10,repeat('a',64),c::text||'/manufacturing_order/'||record_id::text||'/'||file_id::text||'.pdf',true,owner_id);
 PERFORM pg_temp.note_deny(pg_temp.note_command(jsonb_build_object('attachmentIds',jsonb_build_array(file_id))),'metadata without stored object denied');
 -- No Storage objects are created or modified by this linked probe.
 PERFORM pg_temp.note_check(public.erp_file_delete_access((SELECT path FROM public.erp_files WHERE id=file_id)),'unreferenced file keeps prior delete authorization');
 PERFORM set_config('request.jwt.claim.sub',staff_id::text,true);
 PERFORM pg_temp.note_deny(command,'auditor cannot replay owner note');
 PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 INSERT INTO public.branches(id,cafe_id,name,active) VALUES(branch_a,c,'Notes A',true),(branch_b,c,'Notes B',true);
 INSERT INTO public.erp_branch_records(cafe_id,table_name,record_id,branch_id) VALUES(c,'erp_mfg_orders',record_id,branch_a);
 INSERT INTO public.erp_branch_scopes(cafe_id,user_id,branch_id,revision) VALUES(c,owner_id,branch_b,1);
 PERFORM pg_temp.note_deny(command,'hidden branch retry denied');
 denied:=false;BEGIN r:=public.erp_manufacturing_read(c,'orders',record_id);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;PERFORM pg_temp.note_check(denied,'hidden branch notes reader denied');
 UPDATE public.erp_branch_scopes SET branch_id=branch_a,revision=2 WHERE cafe_id=c AND user_id=owner_id;
 PERFORM pg_temp.note_check(NOT has_function_privilege('anon','erp_manufacturing_private.note_content_guard()','EXECUTE'),'private note guard has no anonymous grant');
 PERFORM pg_temp.note_check(NOT has_function_privilege('authenticated','erp_manufacturing_private.note_file_guard()','EXECUTE'),'private file guard has no authenticated grant');
 PERFORM pg_temp.note_check(NOT EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=c) AND NOT EXISTS(SELECT 1 FROM public.bf_movements WHERE cafe_id=c),'notes create no financial or stock operations');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch FROM now())::bigint)))::text,true);
 PERFORM public.cancel_brand_account(c,'manufacturing-notes-rollback-probe','isolated notes test',gen_random_uuid());
 PERFORM pg_temp.note_deny(command,'archived note replay denied');
 denied:=false;BEGIN PERFORM public.erp_manufacturing_read(c,'orders',record_id);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;PERFORM pg_temp.note_check(denied,'archived notes reader denied');
END $$;
SELECT jsonb_build_object('passed',true,'checks',(SELECT count(*) FROM note_checks),'assertions',(SELECT jsonb_agg(name ORDER BY name) FROM note_checks),'at',now()) AS result;
ROLLBACK;
