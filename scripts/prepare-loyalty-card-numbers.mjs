// Create a forward-only allocator migration from reviewed live definitions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const DIR='output/loyalty-card-numbers';
export const MIGRATION='20261108201949_loyalty_card_sequential_numbers';
export const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const q=value=>`'${String(value).replaceAll("'","''")}'`;
export const protectedTables=['loyalty_cards','loyalty_transactions','loyalty_card_events','customer_profiles','wallet_passes'];
export const snapshot=`SELECT jsonb_object_agg(k,v) FROM(VALUES ${protectedTables.map(t=>`(${q(t)},(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.${t} x))`).join(',')}) h(k,v)`;

export function buildNumbers(inspection){
 const assign=inspection.functions.find(f=>f.name==='assign_display_number'),enqueue=inspection.functions.find(f=>f.name==='enqueue_loyalty_read'),process=inspection.functions.find(f=>f.name==='process_one');
 assert(assign&&enqueue&&process,'Reviewed live definitions required');
 assert.equal(inspection.constraints.find(c=>c.name==='loyalty_cards_display_number_check')?.definition,'CHECK (((display_number >= 10000) AND (display_number <= 99999)))');
 const enqueueBefore="(p_method='code' AND v !~ '^[A-Z0-9_-]{4,100}$')",enqueueAfter="(p_method='code' AND v !~ '^[1-9][0-9]{0,4}$' AND v !~ '^[A-Z0-9_-]{4,100}$')";
 const processBefore="q.identifier ~ '^[0-9]{5}$'",processAfter="q.identifier ~ '^[1-9][0-9]{0,4}$'";
 assert.equal(enqueue.definition.split(enqueueBefore).length,2,'Unexpected enqueue validation');
 assert.equal(process.definition.split(processBefore).length,2,'Unexpected queue card lookup');
 const definitions={enqueue:enqueue.definition.replace(enqueueBefore,()=>enqueueAfter),process:process.definition.replace(processBefore,()=>processAfter)};
 const sql=`-- New loyalty cards count from one independently for each brand
-- Existing display numbers, secure codes, cards and ledger rows are immutable
-- Forward-only rollback: retain this counter once any new low-number card exists
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guards$ BEGIN
 ${[assign,enqueue,process].map(f=>`IF md5(pg_get_functiondef(${q(f.signature)}::regprocedure))<>${q(f.md5)} THEN RAISE EXCEPTION 'Reviewed loyalty function changed: ${f.name}';END IF;`).join('\n ')}
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.loyalty_cards'::regclass AND tgname='loyalty_card_display_number' AND tgenabled='O' AND tgfoid='loyalty_enrollment_private.assign_display_number()'::regprocedure) THEN RAISE EXCEPTION 'Card allocator trigger changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='loyalty_enrollment_private' AND tablename='display_number_counters') THEN RAISE EXCEPTION 'Counter already exists';END IF;
END $guards$;
CREATE TEMP TABLE card_numbers_before ON COMMIT DROP AS SELECT (${snapshot}) AS snapshot;
CREATE TABLE loyalty_enrollment_private.display_number_counters(
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
 next_number integer NOT NULL DEFAULT 1 CHECK(next_number BETWEEN 1 AND 100000)
);
ALTER TABLE loyalty_enrollment_private.display_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_enrollment_private.display_number_counters FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.loyalty_cards DROP CONSTRAINT loyalty_cards_display_number_check;
ALTER TABLE public.loyalty_cards ADD CONSTRAINT loyalty_cards_display_number_check CHECK(display_number BETWEEN 1 AND 99999) NOT VALID;
ALTER TABLE public.loyalty_cards VALIDATE CONSTRAINT loyalty_cards_display_number_check;

CREATE OR REPLACE FUNCTION loyalty_enrollment_private.assign_display_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $allocator$
DECLARE v_number integer;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.display_number IS DISTINCT FROM OLD.display_number THEN RAISE EXCEPTION 'Card display number is immutable';END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-display:'||NEW.cafe_id::text,0));
 -- The existing enrollment retry does not consume a number or renumber a card
 IF EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=NEW.cafe_id AND customer_profile_id=NEW.customer_profile_id) THEN
  NEW.display_number:=NULL;
  RETURN NEW;
 END IF;
 INSERT INTO loyalty_enrollment_private.display_number_counters(cafe_id) VALUES(NEW.cafe_id) ON CONFLICT(cafe_id) DO NOTHING;
 SELECT next_number INTO STRICT v_number FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=NEW.cafe_id FOR UPDATE;
 LOOP
  IF v_number>99999 THEN RAISE EXCEPTION 'Card display numbers exhausted for this brand';END IF;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=NEW.cafe_id AND (display_number=v_number OR card_code=v_number::text));
  v_number:=v_number+1;
 END LOOP;
 NEW.display_number:=v_number;
 UPDATE loyalty_enrollment_private.display_number_counters SET next_number=v_number+1 WHERE cafe_id=NEW.cafe_id;
 RETURN NEW;
END $allocator$;
REVOKE ALL ON FUNCTION loyalty_enrollment_private.assign_display_number() FROM PUBLIC,anon,authenticated,service_role;

${definitions.enqueue};
${definitions.process};
DO $verify$ BEGIN
 IF(${snapshot}) IS DISTINCT FROM(SELECT snapshot FROM card_numbers_before) THEN RAISE EXCEPTION 'Existing loyalty data changed';END IF;
 IF EXISTS(SELECT 1 FROM loyalty_enrollment_private.display_number_counters) THEN RAISE EXCEPTION 'Migration must not allocate cards';END IF;
 IF has_table_privilege('anon','loyalty_enrollment_private.display_number_counters','SELECT') OR has_table_privilege('authenticated','loyalty_enrollment_private.display_number_counters','INSERT') OR has_table_privilege('service_role','loyalty_enrollment_private.display_number_counters','UPDATE') THEN RAISE EXCEPTION 'Counter privileges are public';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='loyalty_enrollment_private.display_number_counters'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'Counter RLS missing';END IF;
END $verify$;
COMMIT;
`;
 return {sql,definitions,guards:[assign,enqueue,process]};
}

export function prepare(){
 const inspection=read(`${DIR}/db-inspect-result.json`).data.rows[0].inspection,{sql,definitions,guards}=buildNumbers(inspection);
 const file=`supabase/migrations/${MIGRATION}.sql`;assert(fs.existsSync(file),'CLI-created migration required');
 if(fs.existsSync(`${DIR}/db-apply-result.json`))assert.equal(fs.readFileSync(file,'utf8'),sql,'Applied migration immutable');
 fs.writeFileSync(file,sql);
 const md5=crypto.createHash('md5').update(sql).digest('hex');
 const proof=`SELECT jsonb_build_object('result','PASS','at',clock_timestamp(),'protectedHashes',(SELECT snapshot FROM card_numbers_before),'counterRows',(SELECT count(*) FROM loyalty_enrollment_private.display_number_counters),'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN('loyalty_enrollment_private.assign_display_number()'::regprocedure,'loyalty_read_private.process_one(uuid,uuid)'::regprocedure,'public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz)'::regprocedure))) AS verification;`;
 const assertions=fs.existsSync('supabase/tests/loyalty_card_numbers_rollback.sql')?fs.readFileSync('supabase/tests/loyalty_card_numbers_rollback.sql','utf8').replace(/^BEGIN;\s*/,'').replace(/ROLLBACK;\s*$/,''):'';
 fs.writeFileSync(`${DIR}/db-rollback.sql`,sql.replace(/COMMIT;\s*$/,()=>`${assertions}\n${proof}\nROLLBACK;\n`));
 fs.writeFileSync(`${DIR}/db-apply.sql`,sql.replace(/COMMIT;\s*$/,()=>`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261108201949','loyalty_card_sequential_numbers',ARRAY[${q(sql)}]);\n${proof}\nCOMMIT;\n`));
 fs.writeFileSync(`${DIR}/db-post-rollback.sql`,`BEGIN TRANSACTION READ ONLY;SELECT jsonb_build_object('hashes',(${snapshot}),'counterExists',to_regclass('loyalty_enrollment_private.display_number_counters') IS NOT NULL) AS verification;ROLLBACK;\n`);
 fs.writeFileSync(`${DIR}/db-verify.sql`,`BEGIN TRANSACTION READ ONLY;SELECT jsonb_build_object('at',clock_timestamp(),'history',(SELECT jsonb_build_object('version',version,'md5',md5(statements[1])) FROM supabase_migrations.schema_migrations WHERE version='20261108201949'),'hashes',(${snapshot}),'counterRows',(SELECT count(*) FROM loyalty_enrollment_private.display_number_counters),'counterPrivate',NOT has_table_privilege('anon','loyalty_enrollment_private.display_number_counters','SELECT') AND NOT has_table_privilege('authenticated','loyalty_enrollment_private.display_number_counters','INSERT') AND NOT has_table_privilege('service_role','loyalty_enrollment_private.display_number_counters','UPDATE'),'constraint',(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.loyalty_cards'::regclass AND conname='loyalty_cards_display_number_check'),'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN('loyalty_enrollment_private.assign_display_number()'::regprocedure,'loyalty_read_private.process_one(uuid,uuid)'::regprocedure,'public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz)'::regprocedure))) AS verification;ROLLBACK;\n`);
 fs.writeFileSync(`${DIR}/db-plan.json`,JSON.stringify({at:new Date().toISOString(),migration:MIGRATION,migrationMd5:md5,migrationSha256:sha(sql),inspectionSha256:sha(fs.readFileSync(`${DIR}/db-inspect-result.json`)),guardHashes:Object.fromEntries(guards.map(f=>[f.signature,f.md5])),protectedTables,existingState:inspection.state},null,2)+'\n');
 fs.writeFileSync(`${DIR}/db-definitions.json`,JSON.stringify(definitions,null,2)+'\n');
 console.log(JSON.stringify({prepared:true,applied:false,migration:MIGRATION,md5,existingCards:inspection.state.cards}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)prepare();
