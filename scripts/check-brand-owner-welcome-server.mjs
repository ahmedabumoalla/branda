import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,stubs={}){const result={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','exports',code)(n=>n==='server-only'?{}:stubs[n]??require(n),result);return result}
let checks=0;const cafe='4e5a661a-7029-40ec-a3bc-dc75959a05bb';
function context(options={}){const calls=[];let finishes=0;const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='admin_claim_brand_welcome')return options.claimError?{error:{message:'ACTIVE_SUBSCRIPTION_REQUIRED'}}:{data:options.sent?{sent:true}:{phone:'966511111111',brandName:'Fixture',ciphertext:'test',requestId:'test',startsTrial:options.startsTrial??false}};if(name==='admin_finish_brand_welcome'){finishes++;return{error:finishes<=(options.finishFailures??0)?{message:'network'}:null}}return{data:null,error:null}}};const api=load('lib/data/admin-brand-onboarding.ts',{
  '@/lib/data/cafes':{requirePlatformAdmin:async()=>{if(options.denied)throw Error('denied');return{id:'admin'}}},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/auth/brand-welcome-secret':{openWelcomePassword:()=> 'fixture-only'},
  '@/lib/platform/brand-onboarding':{},
  '@/lib/whatsapp/green-api':{isGreenApiConfigured:()=>true,sendGreenApiOwnerWelcome:async input=>{calls.push({name:'provider',input});if(options.providerError)throw Error(options.providerError);return{providerMessageId:'test-receipt'}}},
});return{calls,send:()=>api.sendBrandOwnerWelcome(cafe)}}
for(const startsTrial of [true,false]){const c=context({startsTrial,finishFailures:2});await c.send();assert.equal(c.calls.filter(x=>x.name==='provider').length,1);assert.equal(c.calls.find(x=>x.name==='provider').input.startsTrial,startsTrial);assert.equal(c.calls.filter(x=>x.name==='admin_finish_brand_welcome').length,3);checks++}
for(const options of [{denied:true},{claimError:true}]){const c=context(options);await assert.rejects(c.send);assert(!c.calls.some(x=>x.name==='provider'));checks++}
{const c=context({sent:true});await c.send();assert(!c.calls.some(x=>x.name==='provider'));checks++}
for(const providerError of ['OWNER_WELCOME_REJECTED','timeout']){const c=context({providerError});await assert.rejects(c.send);assert.equal(c.calls.filter(x=>x.name==='provider').length,1);assert.equal(c.calls.find(x=>x.name==='admin_fail_brand_welcome').args.p_uncertain,providerError!=='OWNER_WELCOME_REJECTED');assert(!c.calls.some(x=>x.name==='admin_finish_brand_welcome'));checks++}
const envKeys=['GREEN_API_API_URL','GREEN_API_ID_INSTANCE','GREEN_API_API_TOKEN_INSTANCE'];const oldEnv=envKeys.map(k=>process.env[k]),oldFetch=globalThis.fetch;let payload;
try{Object.assign(process.env,{GREEN_API_API_URL:'https://provider.example.invalid',GREEN_API_ID_INSTANCE:'fixture',GREEN_API_API_TOKEN_INSTANCE:'fixture'});globalThis.fetch=async(_url,init)=>{payload=JSON.parse(init.body);return{ok:true,json:async()=>({idMessage:'fixture'})}};const api=load('lib/whatsapp/green-api.ts');for(const startsTrial of [true,false]){await api.sendGreenApiOwnerWelcome({phone:'966511111111',brandName:'Fixture',password:'fixture-only',startsTrial});assert.equal(payload.message.includes('٧ أيام'),startsTrial);assert.equal(payload.message.includes('دون تغيير مدة الاشتراك'),!startsTrial);checks++}}finally{globalThis.fetch=oldFetch;envKeys.forEach((k,i)=>{if(oldEnv[i]===undefined)delete process.env[k];else process.env[k]=oldEnv[i]})}
console.log(`PASS ${checks} mocked owner handoff authorization, modes, single-send retry and message checks; no live messages`);
