import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(file,stubs={}){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n==='server-only'?{}:stubs[n]??require(n),out);return out;}
let checks=0;const check=(v,m)=>{assert(v,m);checks++;};
function context({jobs=[],finishFailures=0,claimError=false}={}){
  const calls=[];let finishes=0;
  const api=load('lib/whatsapp/owner-guide-delivery.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({
    rpc:async(name,args)=>{
      calls.push({name,args});
      if(name==='claim_owner_guide_with_activation')return {data:jobs.shift()??null,error:claimError?{}:null};
      if(name==='finish_owner_companion_guide')return {data:true,error:++finishes<=finishFailures?{}:null};
      if(name==='defer_owner_signup_guide')return {data:true,error:null};
      throw Error(name);
    },
  })}});
  return {api,calls};
}
const job=guide=>({id:guide,guide,phone:'966511111111',attempt:'lease'});
{const c=context({jobs:[job('setup'),job('cashier'),job('customer')],finishFailures:2}),sent=[];const r=await c.api.runOwnerCompanionGuides(async(phone,guide)=>{sent.push(guide);return{providerMessageId:guide+'-receipt'}});check(r.processed===3,'all three tutorials processed');assert.deepEqual(sent,['setup','cashier','customer']);checks++;check(c.calls.filter(x=>x.name==='finish_owner_companion_guide').length===5,'ack retries never resend media');}
for(const [failure,status] of [['OWNER_WELCOME_REJECTED','rejected'],['OWNER_WELCOME_UNCERTAIN','uncertain'],['timeout','uncertain']]){
  const c=context({jobs:[job('cashier')]}),sent=[];
  await c.api.runOwnerCompanionGuides(async()=>{sent.push(1);throw Error(failure)});
  check(sent.length===1,'one logical send');
  check(c.calls.find(x=>x.name==='finish_owner_companion_guide').args.p_status===status,'explicit versus ambiguous outcome');
}
{
  const c=context({jobs:[job('setup')]});
  await c.api.runOwnerCompanionGuides(async()=>{throw Error('OWNER_GUIDE_PRIMARY_UNAVAILABLE')});
  assert.deepEqual(c.calls.find(x=>x.name==='defer_owner_signup_guide').args,{p_id:'setup',p_attempt:'lease'});
  check(!c.calls.some(x=>x.name==='finish_owner_companion_guide'),'unavailable sender defers the job without finishing it');
}
{const c=context({jobs:[job('cashier')],finishFailures:3});let sends=0;await assert.rejects(()=>c.api.runOwnerCompanionGuides(async()=>{sends++;return{providerMessageId:'receipt'}}),/ack_unconfirmed/);check(sends===1,'unrecorded acknowledgement never replays');}
{const c=context({claimError:true});await assert.rejects(()=>c.api.runOwnerCompanionGuides(async()=>assert.fail('must not send')),/claim_unavailable/);checks++;}
{const old=Date.now;let now=0;Date.now=()=>now;try{const c=context({jobs:[job('cashier'),job('customer')]});const r=await c.api.runOwnerCompanionGuides(async()=>{now=30_000;return{providerMessageId:'receipt'}});check(r.processed===1,'slow attempt leaves next job durable within request budget');}finally{Date.now=old;}}
let runs=0;const route=load('app/api/owner-guides/jobs/route.ts',{'@/lib/whatsapp/owner-guide-delivery':{runOwnerCompanionGuides:async()=>{runs++;return{processed:0}}},'@/lib/whatsapp/green-api':{sendGreenApiOwnerCompanionGuide:()=>assert.fail('unauthorized network')}});const old=process.env.CRON_SECRET;
try{process.env.CRON_SECRET='s'.repeat(32);for(const token of ['', 'wrong']){const r=await route.GET(new Request('https://fixture.test',{headers:{authorization:token}}));check(r.status===401&&runs===0,'protected worker');}const r=await route.GET(new Request('https://fixture.test',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}));check(r.status===200&&runs===1,'authorized worker');}finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
console.log('PASS '+checks+' owner companion queue, acknowledgement, ordering, budget and cron authorization checks; no network or real messages');
