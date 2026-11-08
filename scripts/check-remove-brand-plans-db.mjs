import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const source=await fs.readFile('scripts/check-shared-subscriptions-db.mjs','utf8');
const bootstrap=source.slice(0,source.indexOf('const state=')).replace(/^import .*;\r?\n/gm,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const {db,q,value,id}=await new AsyncFunction('assert','fs','path','tmpdir','pathToFileURL','createHash',bootstrap+'\nreturn {db,q,value,id};')(assert,fs,path,tmpdir,pathToFileURL,createHash);
let checks=0;const migration='supabase/migrations/20261108214442_admin_remove_brand_plans.sql',fixture='supabase/tests/admin_remove_brand_plans_rollback.sql',sql=await fs.readFile(migration,'utf8');
try{
 await db.exec("ALTER TABLE cafes ADD COLUMN IF NOT EXISTS name text,ADD COLUMN IF NOT EXISTS slug text,ADD COLUMN IF NOT EXISTS is_public boolean;ALTER TABLE brand_onboarding_private.accounts ADD COLUMN created_by uuid,ADD COLUMN fingerprint text;GRANT SELECT ON subscriptions,cafes,platform_plans,audit_logs TO authenticated;");
 const before=await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscriptions s");
 await db.exec(sql.replace(/COMMIT;\s*$/,'ROLLBACK;'));assert.equal(await value("SELECT to_regprocedure('public.admin_remove_brand_plans(uuid,text[],text)')"),null);checks++;
 await db.exec(sql);assert.equal(await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscriptions s"),before);checks++;
 await db.exec(await fs.readFile(fixture,'utf8'));checks+=28;
 assert.equal(await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscriptions s"),before);checks++;
 for(const role of ['anon','service_role']){await db.exec(`SET ROLE ${role}`);await assert.rejects(()=>value('SELECT public.admin_remove_brand_plans($1,$2,$3)',[id(1),['menu'],'0'.repeat(32)]),/permission denied/);await db.exec('RESET ROLE');checks++;}
 await db.exec('SET ROLE authenticated');
 for(const actor of [11,91,999]){await q("SELECT set_config('test.uid',$1,false)",[id(actor)]);await assert.rejects(()=>value('SELECT public.admin_remove_brand_plans($1,$2,$3)',[id(1),['menu'],'0'.repeat(32)]),/brand_subscription_forbidden/);checks++;}
 await q("SELECT set_config('test.uid',$1,false)",[id(90)]);
 for(const plans of [[['menu'],['loyalty']],Array(51).fill('menu')]){await assert.rejects(()=>value('SELECT public.admin_remove_brand_plans($1,$2,$3)',[id(1),plans,'0'.repeat(32)]),/brand_subscription_invalid_plan/);checks++;}
 await db.exec('RESET ROLE');
 assert.equal(await value("SELECT has_function_privilege('authenticated','public.admin_remove_brand_plans(uuid,text[],text)','EXECUTE') AND NOT has_function_privilege('anon','public.admin_remove_brand_plans(uuid,text[],text)','EXECUTE') AND NOT has_function_privilege('service_role','public.admin_remove_brand_plans(uuid,text[],text)','EXECUTE')"),true);checks++;
 const inputs={};for(const file of [migration,fixture,'scripts/check-remove-brand-plans-db.mjs','scripts/check-shared-subscriptions-db.mjs','scripts/check-concurrent-subscriptions-db.mjs'])inputs[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
 await fs.mkdir('output/remove-brand-plans',{recursive:true});await fs.writeFile('output/remove-brand-plans/local-checks.json',JSON.stringify({at:new Date().toISOString(),checks,passed:true,runtime:process.version,inputs,concurrency:'Single-session ordered-lock and stale-revision tests; no multi-session race claim'},null,2)+'\n');console.log(`Remove brand plans: ${checks} SQL checks passed`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.close();}
