import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,stubs={}){const result={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','exports',code)(n=>n==='server-only'?{}:stubs[n]??(n.startsWith('@/')?load(n.slice(2)+'.ts',stubs):require(n)),result);return result}
let checks=0;const cafe='4e5a661a-7029-40ec-a3bc-dc75959a05bb';
function context(options={}){const calls=[];let finishes=0;const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='admin_claim_brand_welcome_v2')return options.claimError?{error:{message:'ACTIVE_SUBSCRIPTION_REQUIRED'}}:{data:options.sent?{sent:true}:{phone:'966511111111',brandName:'Fixture',ciphertext:'test',requestId:'test',startsTrial:options.startsTrial??false,trialTerms:[{planId:"starter",planName:"Menu",days:30}]}};if(name==='admin_finish_brand_welcome'){finishes++;return{error:finishes<=(options.finishFailures??0)?{message:'network'}:null}}return{data:null,error:null}}};const api=load('lib/data/admin-brand-onboarding.ts',{
  '@/lib/data/cafes':{requirePlatformAdmin:async()=>{if(options.denied)throw Error('denied');return{id:'admin'}}},
  '@/lib/supabase/admin':{createAdminClient:()=>admin},
  '@/lib/auth/brand-welcome-secret':{openWelcomePassword:()=> 'fixture-only'},
  '@/lib/platform/brand-onboarding':{},
  '@/lib/whatsapp/green-api':{isGreenApiConfigured:()=>true,sendGreenApiOwnerWelcome:async input=>{calls.push({name:'provider',input});if(options.providerError)throw Error(options.providerError);return{providerMessageId:'test-receipt'}}},
});return{calls,send:()=>api.sendBrandOwnerWelcome(cafe)}}
for(const startsTrial of [true,false]){const c=context({startsTrial,finishFailures:2});await c.send();assert.equal(c.calls.filter(x=>x.name==='provider').length,1);assert.equal(c.calls.find(x=>x.name==='provider').input.startsTrial,startsTrial);assert.deepEqual(c.calls.find(x=>x.name==='provider').input.trialTerms,[{planId:"starter",planName:"Menu",days:30}]);assert.equal(c.calls.filter(x=>x.name==='admin_finish_brand_welcome').length,3);checks++}
for(const options of [{denied:true},{claimError:true}]){const c=context(options);await assert.rejects(c.send);assert(!c.calls.some(x=>x.name==='provider'));checks++}
{const c=context({sent:true});await c.send();assert(!c.calls.some(x=>x.name==='provider'));checks++}
for(const providerError of ['OWNER_WELCOME_REJECTED','timeout']){const c=context({providerError});await assert.rejects(c.send);assert.equal(c.calls.filter(x=>x.name==='provider').length,1);assert.equal(c.calls.find(x=>x.name==='admin_fail_brand_welcome').args.p_uncertain,providerError!=='OWNER_WELCOME_REJECTED');assert(!c.calls.some(x=>x.name==='admin_finish_brand_welcome'));checks++}

const oldEnv={...process.env},oldFetch=globalThis.fetch;
const input={phone:'966511111111',brandName:'Fixture',password:'fixture-only',startsTrial:false};
let posts=[],outcomes=[];
try {
  for(const key of Object.keys(process.env))if(key.startsWith('GREEN_API_'))delete process.env[key];
  Object.assign(process.env,{GREEN_API_API_URL:'https://api.green-api.com',GREEN_API_ID_INSTANCE:'123456',GREEN_API_API_TOKEN_INSTANCE:'fixture-token'});
  globalThis.fetch=async(url,init={})=>{
    if(init.method!=='POST'){assert(String(url).includes('/getStateInstance/'));return {ok:true,json:async()=>({stateInstance:'authorized'})};}
    posts.push({url:String(url),payload:JSON.parse(init.body)});
    assert(String(url).includes('/sendFileByUrl/'));
    const result=outcomes.shift();if(result instanceof Error)throw result;
    return result??{ok:true,json:async()=>({idMessage:'fixture-receipt'})};
  };
  const api=load('lib/whatsapp/green-api.ts');
  function video(){const p=posts.at(-1).payload;assert.equal(p.chatId,'966511111111@c.us');assert.equal(p.urlFile,'https://barndaksa.com/guides/owner-loyalty-setup-20261118.mp4');assert.equal(p.fileName,'branda-loyalty-account-setup.mp4');assert(p.caption.length<=1024);assert(p.caption.includes('https://barndaksa.com/login'));assert.equal(p.message,undefined);return p.caption;}
  for(const startsTrial of [true,false]){
    await api.sendGreenApiOwnerWelcome({...input,startsTrial,trialTerms:[{planId:'starter',planName:'Menu',days:30}]});
    const caption=video();assert(caption.includes(input.password));assert.equal(caption.includes('شهر كامل (٣٠ يومًا)'),startsTrial);assert.equal(caption.includes('دون تغيير مدة الاشتراك'),!startsTrial);checks++;
  }
  for(const planId of ['-','pro','plan-b523d348']){await api.sendGreenApiOwnerWelcome({...input,startsTrial:true,trialTerms:[{planId,planName:planId,days:30}]});assert(video().includes('شهر كامل'));checks++;}
  await api.sendGreenApiOwnerWelcome({...input,startsTrial:true,trialTerms:[{planId:'finance',planName:'Finance',days:7}]});assert(video().includes('٧ أيام'));assert(!video().includes('شهر'));checks++;
  await api.sendGreenApiOwnerWelcome({...input,startsTrial:true,trialTerms:[{planId:'starter',planName:'Menu',days:30},{planId:'finance',planName:'Finance',days:7}]});assert(video().includes('٣٠ يومًا) من اليوم لباقات: Menu'));assert(video().includes('٧ أيام من اليوم لباقات: Finance'));checks++;
  for(const trialTerms of [undefined,[],[{planId:'finance',planName:'Finance',days:30}],[{planId:'pro',planName:'Loyalty',days:7}]]){const count=posts.length;await assert.rejects(()=>api.sendGreenApiOwnerWelcome({...input,startsTrial:true,trialTerms}),/OWNER_WELCOME_REJECTED/);assert.equal(posts.length,count);checks++;}
  await api.sendGreenApiOwnerWelcome({...input,brandName:'ب'.repeat(120),password:'a'.repeat(72),startsTrial:true,trialTerms:[{planId:'pro',planName:'L'.repeat(400),days:30},{planId:'finance',planName:'F'.repeat(400),days:7}]});assert(video().includes('٣٠ يومًا أو ٧ أيام'));checks++;
  const count=posts.length;await api.sendGreenApiOwnerSignupWelcome({phone:input.phone,brandName:input.brandName});assert.equal(posts.length,count+1);assert(!video().includes(input.password));assert(video().includes('كلمة المرور التي اخترتها'));checks++;
  for(const phone of ['+966511111111','966111111111','not-phone']){const count=posts.length;await assert.rejects(()=>api.sendGreenApiOwnerSignupWelcome({phone,brandName:'Fixture'}),/INVALID_OWNER_RECIPIENT/);assert.equal(posts.length,count);checks++;}
  for(const [result,expected] of [[{ok:false,status:400},'REJECTED'],[{ok:false,status:503},'UNCERTAIN'],[{ok:true,json:async()=>({})},'UNCERTAIN'],[new Error('network'),'UNCERTAIN']]){outcomes=[result];const count=posts.length;await assert.rejects(()=>api.sendGreenApiOwnerWelcome(input),new RegExp('OWNER_WELCOME_'+expected));assert.equal(posts.length,count+1);checks++;}
  Object.assign(process.env,{GREEN_API_OTP_BACKUP_API_URL:'https://api.green-api.com',GREEN_API_OTP_BACKUP_ID_INSTANCE:'987654',GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE:'fixture-backup'});
  outcomes=[{ok:false,status:401}];const before=posts.length;await api.sendGreenApiOwnerWelcome(input);assert.equal(posts.length,before+2);assert(posts.at(-1).url.includes('/waInstance987654/'));assert.deepEqual(posts.at(-1).payload,posts.at(-2).payload);checks++;
  outcomes=[new Error('unknown')];const single=posts.length;await assert.rejects(()=>api.sendGreenApiOwnerWelcome(input),/UNCERTAIN/);assert.equal(posts.length,single+1);checks++;
} finally {globalThis.fetch=oldFetch;for(const key of Object.keys(process.env))if(key.startsWith('GREEN_API_'))delete process.env[key];for(const [key,value] of Object.entries(oldEnv))if(key.startsWith('GREEN_API_'))process.env[key]=value;}
console.log('PASS '+checks+' owner welcome authorization, video, trial, failover and no-duplicate checks; no live messages');
