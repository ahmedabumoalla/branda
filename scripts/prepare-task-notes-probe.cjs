'use strict';
const fs=require('node:fs');
const migration='supabase/migrations/20261113163332_erp_task_rich_notes.sql';
const fixture=String.raw`
CREATE FUNCTION pg_temp.require(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Task notes assertion: %',label;END IF;PERFORM set_config('erp.notes.checks',(coalesce(nullif(current_setting('erp.notes.checks',true),''),'0')::integer+1)::text,true);END$$;
DO $$DECLARE c public.cafes;kind uuid;task uuid;r uuid:=gen_random_uuid();p jsonb;v jsonb;bad jsonb;before_count integer;BEGIN
 SELECT * INTO c FROM public.cafes WHERE owner_user_id IS NOT NULL AND deleted_at IS NULL AND status='active'AND platform_access_private.service_enabled(id,'finance')ORDER BY created_at LIMIT 1;
 PERFORM pg_temp.require(c.id IS NOT NULL,'fixture active owner');PERFORM set_config('request.jwt.claim.sub',c.owner_user_id::text,true);
 kind:=(public.erp_tasks_execute(c.id,'save_type','{"name":"ERP-TASK-NOTES-PROBE","active":true}',gen_random_uuid())->>'id')::uuid;
 task:=(public.erp_tasks_execute(c.id,'save',jsonb_build_object('title','ERP-TASK-NOTES-PROBE','typeId',kind,'assigneeId',c.owner_user_id),gen_random_uuid())->>'id')::uuid;
 p:=jsonb_build_object('id',task,'note','Legacy <literal>','occurredAt','2026-11-13T15:30:00Z');PERFORM public.erp_tasks_execute(c.id,'note',p,gen_random_uuid());
 PERFORM pg_temp.require(EXISTS(SELECT 1 FROM public.erp_task_notes WHERE task_id=task AND note_format='plain' AND tags='[]' AND note='Legacy <literal>'),'legacy note preserved');
 p:=jsonb_build_object('id',task,'note','<p><strong>نص واضح</strong></p><ul><li>بند</li></ul>','occurredAt','2026-11-13T18:30:00+03:00','format','rich','tags',jsonb_build_array('متابعة','فريق'));
 PERFORM public.erp_tasks_execute(c.id,'note',p,r);v:=public.erp_tasks_execute(c.id,'note',p,r);
 PERFORM pg_temp.require(v->>'duplicate'='true','identical retry recognized');
 PERFORM pg_temp.require((SELECT count(*)=2 FROM public.erp_task_notes WHERE task_id=task),'one note per request');
 v:=public.erp_tasks_read(c.id,jsonb_build_object('id',task));
 PERFORM pg_temp.require(EXISTS(SELECT 1 FROM jsonb_array_elements(v->'notes')n WHERE n->>'note_format'='rich' AND n->'tags'=p->'tags' AND (n->>'occurred_at')::timestamptz='2026-11-13T15:30:00Z'::timestamptz),'actual reader rich format tags date');
 BEGIN PERFORM public.erp_tasks_execute(c.id,'note',p||'{"tags":["changed"]}'::jsonb,r);RAISE EXCEPTION 'mismatched retry accepted' USING ERRCODE='XX001';EXCEPTION WHEN SQLSTATE'22023'THEN PERFORM pg_temp.require(true,'changed retry denied');END;
 FOR bad IN SELECT value FROM jsonb_array_elements('[{"note":"<script>alert(1)</script>"},{"note":"<p onclick=evil()>bad</p>"},{"note":"<p><br></p>"},{"note":"<p>&amp;nbsp;</p>"},{"note":"<p>&#160;</p>"},{"format":"html"},{"tags":["A","a"]},{"tags":["مهمة","مهمة"]},{"tags":[" padded "]},{"tags":[null]},{"tags":null},{"tags":"invalid"},{"occurredAt":"infinity"}]') LOOP
  BEGIN PERFORM public.erp_tasks_execute(c.id,'note',p||bad,gen_random_uuid());RAISE EXCEPTION 'invalid note accepted: %',bad USING ERRCODE='XX001';EXCEPTION WHEN SQLSTATE'22023'THEN PERFORM pg_temp.require(true,'malformed input denied');END;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 BEGIN PERFORM public.erp_tasks_execute(c.id,'note',p,gen_random_uuid());RAISE EXCEPTION 'outsider note accepted' USING ERRCODE='XX001';EXCEPTION WHEN SQLSTATE'42501'THEN PERFORM pg_temp.require(true,'outsider denied');END;
 PERFORM set_config('request.jwt.claim.sub',c.owner_user_id::text,true);
 PERFORM pg_temp.require((SELECT count(*)=2 FROM public.erp_task_notes WHERE task_id=task),'rejections leave notes unchanged');
 PERFORM pg_temp.require(NOT has_function_privilege('authenticated','erp_task_private.note_content_guard()','EXECUTE')AND NOT has_function_privilege('anon','erp_task_private.note_content_guard()','EXECUTE'),'private function no client grant');
 PERFORM pg_temp.require(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.erp_task_notes'::regclass AND NOT tgisinternal AND tgname<>'task_note_content_guard'),'existing archive/table guards retained');
 PERFORM set_config('erp.notes.result',jsonb_build_object('passed',true,'checks',current_setting('erp.notes.checks')::integer,'at',clock_timestamp(),'actualPublicTaskWriterAndReader',true,'transactionWillRollback',true)::text,true);
END$$;
SELECT current_setting('erp.notes.result')::jsonb verification;
ROLLBACK;
`;
fs.writeFileSync('output/erp-database/task-notes-before-apply.sql',fs.readFileSync(migration,'utf8').replace(/COMMIT;\s*$/,'')+fixture);
fs.writeFileSync('output/erp-database/task-notes-readback.sql',`BEGIN READ ONLY;
SELECT NOT EXISTS(SELECT 1 FROM public.erp_tasks WHERE title='ERP-TASK-NOTES-PROBE') tasks_clean, NOT EXISTS(SELECT 1 FROM public.erp_task_types WHERE name='ERP-TASK-NOTES-PROBE') types_clean, NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261113163332') candidate_unapplied, NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='erp_task_notes' AND column_name='note_format') candidate_rolled_back;
COMMIT;\n`);
console.log('Prepared exact-DDL task note rollback probe and independent readback');
