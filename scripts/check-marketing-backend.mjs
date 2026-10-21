import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const env = { MARKETING_ENCRYPTION_KEY: Buffer.alloc(32,7).toString("base64"), MARKETING_PUBLIC_URL:"https://barndaksa.com", GREEN_API_PARTNER_TOKEN:"test-only", CRON_SECRET:"c".repeat(40) };
const inputs = new Set();
function loader(overrides={},variables=env) {
  const cache=new Map();
  function load(file) {
    file=path.resolve(file); if(cache.has(file))return cache.get(file);
    inputs.add(file); const exports={};cache.set(file,exports);
    const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function("require","exports","process",js)(name=>{
      if(name==="server-only")return {};
      if(name in overrides)return overrides[name];
      if(name.startsWith("@/"))return load(`${name.slice(2)}.ts`);
      return nativeRequire(name);
    },exports,{env:variables});return exports;
  }return load;
}
function database(resolve) {
  const calls=[];
  return {calls,rpc:async(name,args)=>{calls.push({rpc:name,args});return resolve({rpc:name,args});},from(table){
    const state={table,filters:[]};
    const query={select(value,options){state.select=value;state.options=options;return query;},update(value){state.update=value;return query;},
      eq(key,value){state.filters.push([key,value]);return query;},is(key,value){state.filters.push([key,value]);return query;},not(...args){state.not=args;return query;},
      order(value){state.order=value;return query;},range(start,end){state.range=[start,end];return query;},maybeSingle(){return query;},then(yes,no){calls.push({...state});return Promise.resolve(resolve(state)).then(yes,no);}};return query;
  }};
}
let checks=0;
async function test(name,run){await run();checks++;console.log(`PASS ${name}`);}
const crypto=loader()("lib/marketing/crypto.ts");
const creds={idInstance:"7103999999",apiTokenInstance:"private-test-token",apiUrl:"https://api.greenapi.com"};
class ProviderError extends Error {constructor(uncertain){super("safe");this.code="TEST_PROVIDER";this.uncertain=uncertain;}}

await test("authenticated encryption binds brand and instance, detects tampering",async()=>{
  const encrypted=crypto.encryptMarketingSecret(creds,`${id(1)}:${creds.idInstance}`);
  assert(!encrypted.includes(creds.apiTokenInstance));
  assert.deepEqual(crypto.decryptMarketingSecret(encrypted,`${id(1)}:${creds.idInstance}`),creds);
  assert.throws(()=>crypto.decryptMarketingSecret(encrypted,`${id(2)}:${creds.idInstance}`));
  const parts=encrypted.split(".");parts[3]=(parts[3][0]==="A"?"B":"A")+parts[3].slice(1);
  assert.throws(()=>crypto.decryptMarketingSecret(parts.join("."),`${id(1)}:${creds.idInstance}`));
});
await test("configuration and signed unsubscribe reject missing keys and changed recipients",async()=>{
  assert.equal(loader({},{})("lib/marketing/crypto.ts").marketingConfigured(),false);
  assert.equal(loader({},{...env,MARKETING_PUBLIC_URL:"http://evil.test"})("lib/marketing/crypto.ts").marketingConfigured(),false);
  const token=crypto.signMarketingUnsubscribe(id(1));
  assert(crypto.verifyMarketingUnsubscribe(id(1),token));assert(!crypto.verifyMarketingUnsubscribe(id(2),token));
  assert(!crypto.verifyMarketingUnsubscribe(id(1),token+"x"));
});

function workerHarness({begin=true,state="authorized",phone="966500000001",sendError,finalError=false,media=false,mediaError=false}={}) {
  const job={id:id(3),cafe_id:id(1),campaign_id:id(2),phone:"966500000002",requested_phone:"966500000001",body:"Campaign",lease_token:id(4),generation:id(5),instance_id:creds.idInstance,encrypted_credentials:crypto.encryptMarketingSecret(creds,`${id(1)}:${creds.idInstance}`)};
  if(media)job.media_id=id(42);
  let sends=0, sentMessage;
  const db=database(call=>call.rpc==="marketing_claim_jobs"?{data:[job]}:call.rpc==="marketing_begin_dispatch"?{data:begin}:call.rpc==="marketing_finish_dispatch"&&finalError?{error:{message:"test"}}:{data:null});
  const load=loader({"@/lib/marketing/media":{signMarketingMedia:async(cafe,mediaId)=>{assert.equal(cafe,id(1));assert.equal(mediaId,id(42));if(mediaError)throw Error('unavailable');return {url:'https://storage.test/signed',fileName:'campaign.mp4'};}},"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/whatsapp/green-api-marketing":{
    GreenApiProviderError:ProviderError,getGreenApiMarketingState:async()=>state,getGreenApiMarketingAccount:async()=>({phone}),
    sendGreenApiMarketingMessage:async(_,message)=>{sends++;sentMessage=message;if(sendError)throw sendError;return {providerMessageId:"provider-1"};},
    sendGreenApiMarketingMedia:async(_,message)=>{sends++;sentMessage=message;if(sendError)throw sendError;return {providerMessageId:"provider-1"};},
  }});
  return {run:load("lib/marketing/worker.ts").runMarketingJobs,db,sends:()=>sends,message:()=>sentMessage};
}
await test("worker verifies sender and last transactional gate before sending",async()=>{
  for(const config of [{begin:false},{phone:"966500000099"},{state:"notAuthorized"}]){
    const h=workerHarness(config);const result=await h.run();assert.equal(h.sends(),0);assert.equal(result.deferred,1);
    assert.equal(h.db.calls.at(-1).args.p_status,"queued");
  }
});
await test("provider acceptance is recorded separately and includes exact manual stop footer",async()=>{
  const h=workerHarness();const result=await h.run();assert.equal(h.sends(),1);assert.equal(result.accepted,1);
  assert.equal(h.db.calls.at(-1).args.p_status,"accepted");assert.equal(h.db.calls.at(-1).args.p_message,"provider-1");
  assert.equal(h.message().message,"Campaign\n\nلإيقاف الرسائل أرسل كلمة إيقاف");
  assert(!h.message().message.includes('/unsubscribe'));
});
await test("media dispatch signs tenant object and sends caption with file exactly once",async()=>{
  const h=workerHarness({media:true});assert.equal((await h.run()).accepted,1);assert.equal(h.sends(),1);
  assert.equal(h.message().caption,"Campaign\n\nلإيقاف الرسائل أرسل كلمة إيقاف");assert.equal(h.message().fileName,'campaign.mp4');
  const failed=workerHarness({media:true,mediaError:true});assert.equal((await failed.run()).deferred,1);assert.equal(failed.sends(),0);
  const uncertain=workerHarness({media:true,sendError:new ProviderError(true)});assert.equal((await uncertain.run()).uncertain,1);assert.equal(uncertain.sends(),1);
});
await test("uncertain sends and lost final acknowledgement never retry",async()=>{
  for(const config of [{sendError:new ProviderError(true)},{sendError:new Error("network failure")},{finalError:true}]){
    const h=workerHarness(config);const result=await h.run();assert.equal(h.sends(),1);assert.equal(result.uncertain,1);
    assert.equal(h.db.calls.at(-1).args.p_status,"uncertain");
  }
  const h=workerHarness({sendError:new ProviderError(false)});assert.equal((await h.run()).failed,1);assert.equal(h.sends(),1);
});

function ownerHarness({profile={role:"cafe_owner",status:"active"},user={id:id(1)},owner=id(1),member="staff",eligible=true,maintenance=null,connection=null,provisionError,reused=false, customers=[{id:id(30),full_name:"Customer",phone:"0500000001",status:"active"}],cards=[],suppressed=[],audienceError=false,state="authorized",stateError,qrError,accountPhone="966500000099"}={}) {
  let row=connection, provisions=[],settings=0,qrCalls=0;
  const db=database(call=>{
    if(call.rpc==="marketing_actor_allowed")return {data:eligible};
    if(call.rpc==="marketing_campaign_history")return {data:[]};
    if(call.rpc==="marketing_claim_connection"){
      row={cafe_id:id(10),requested_phone:call.args.p_phone,status:"provisioning",generation:id(5),lease_token:id(6),allow_create:!row?.provision_attempted_at,provision_attempted_at:new Date().toISOString()};return {data:row};
    }
    if(call.rpc==="marketing_suppress"){suppressed.push(call.args.p_phone);return {data:true};}
    if(call.rpc)return {data:true};
    if(call.table==="cafes")return {data:{id:id(10),name:"Brand",owner_user_id:owner,status:"active"}};
    if(call.table==="cafe_members")return {data:{role:member}};
    if(call.table==="brand_marketing_suppressions")return {count:suppressed.length,data:suppressed.map(phone=>({phone}))};
    if(["customer_profiles","loyalty_cards"].includes(call.table))return audienceError?{error:{message:"private"}}:{data:(call.table==="customer_profiles"?customers:cards).slice(call.range[0],call.range[1]+1)};
    if(call.table==="brand_marketing_connections"){
      if(call.update)row={...row,...call.update};return {data:row};
    }
    throw new Error(`Unexpected table ${call.table}`);
  });
  const session={auth:{getUser:async()=>({data:{user}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile})})})})};
  const load=loader({"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/supabase/server":{createClient:async()=>session},"@/lib/data/cafes":{requireOwnerCafeContext:async()=>({id:id(10)})},"@/lib/platform/maintenance":{readMaintenanceSessionCookie:async()=>maintenance},"@/lib/whatsapp/green-api-marketing":{
    GreenApiProviderError:ProviderError,provisionGreenApiMarketingInstance:async args=>{provisions.push(args);if(provisionError)throw provisionError;return {credentials:creds,reused};},configureGreenApiMarketingWebhook:async()=>{settings++;},getGreenApiMarketingState:async()=>{if(stateError)throw stateError;return state;},getGreenApiMarketingAccount:async()=>({phone:accountPhone}),getGreenApiMarketingQr:async()=>{qrCalls++;if(qrError)throw qrError;return {type:"qrCode",message:"YWJj"};},
  }});
  return {...load("lib/data/marketing.ts"),db,provisions,row:()=>row,settings:()=>settings,qrCalls:()=>qrCalls};
}
await test("inactive profiles, staff and admin without selected maintenance brand denied",async()=>{
  for(const config of [{user:null},{profile:{role:"cafe_owner",status:"suspended"}},{owner:id(2),member:"staff"},{profile:{role:"platform_admin",status:"active"}}]){
    await assert.rejects(()=>ownerHarness(config).getMarketingDashboard(),error=>[401,403].includes(error.status));
  }
  const manager=ownerHarness({owner:id(2),member:"manager"});
  assert.equal((await manager.getMarketingDashboard()).brandName,"Brand");
  assert.deepEqual(manager.db.calls.find(c=>c.table==="cafe_members").filters,[["cafe_id",id(10)],["user_id",id(1)]]);
});
await test("admin maintenance session must be current and bound to actor and selected tenant",async()=>{
  const profile={role:"platform_admin",status:"active"};
  for(const maintenance of [{adminUserId:id(2),cafeId:id(11),expiresAt:Date.now()+60000},{adminUserId:id(1),cafeId:id(11),expiresAt:Date.now()-1000}])await assert.rejects(()=>ownerHarness({profile,maintenance}).getMarketingDashboard(),e=>e.status===403);
  const h=ownerHarness({profile,maintenance:{adminUserId:id(1),cafeId:id(11),expiresAt:Date.now()+60000}});
  await h.getMarketingDashboard();assert.deepEqual(h.db.calls.find(c=>c.table==="cafes").filters,[["id",id(11)],["deleted_at",null]]);
  assert.equal(h.db.calls.find(c=>c.rpc==="marketing_actor_allowed").args.p_cafe,id(11));
});
await test("expiry blocks new sends but permits opt-out and cancellation",async()=>{
  const h=ownerHarness({eligible:false});
  await assert.rejects(()=>h.runMarketingAction({action:"connect",phone:"0500000001"}),e=>e.status===403);
  await h.runMarketingAction({action:"optOut",customerId:`customer:${id(30)}`});await h.runMarketingAction({action:"cancelCampaign",campaignId:id(2)});
  assert(h.db.calls.some(c=>c.rpc==="marketing_suppress"));
});
await test("recipient validation, consent and idempotency canonicalization",async()=>{
  const h=ownerHarness();const base={action:"createCampaign",idempotencyKey:id(20),title:"Campaign",body:"Body",customerIds:[`customer:${id(30)}`,`customer:${id(30)}`],consent:true};
  await h.runMarketingAction(base);const first=h.db.calls.find(c=>c.rpc==="marketing_create_campaign");assert.deepEqual(first.args.p_phones,["966500000001"]);
  await assert.rejects(()=>h.runMarketingAction({...base,consent:false}));
  await assert.rejects(()=>h.runMarketingAction({...base,recipients:["bad966500000001"]}));
  await assert.rejects(()=>h.runMarketingAction({...base,scheduledAt:new Date(Date.now()+91*86400000).toISOString()}));
});
await test("audience is tenant scoped, deduplicated and excludes blocked and stale card contacts",async()=>{
  const h=ownerHarness({customers:[{id:id(30),full_name:"Customer",phone:"٠٥٠٠٠٠٠٠٠١",status:"active"},{id:id(31),phone:"0500000002",status:"blocked"},{id:id(32),phone:"0500000003",status:"active",phone_auth_conflict:true}],cards:[
    {id:id(40),customer_name:"Old name",customer_phone:"0500000099",customer_profile_id:id(30),status:"active"},
    {id:id(41),customer_phone:"0500000002",status:"active"},
    {id:id(42),customer_phone:"0500000004",customer_profile_id:id(31),status:"active"},
    {id:id(43),customer_name:"Card only",customer_phone:"0500000005",status:"active"},
    {id:id(44),customer_phone:"0500000006",status:"suspended"},
    {id:id(45),customer_phone:"0500000007",customer_profile_id:id(90),status:"active"}],suppressed:["966500000005"]});
  const result=await h.getMarketingDashboard();assert.equal(result.audience.length,2);
  assert.deepEqual(result.audience.find(row=>row.id===`customer:${id(30)}`),{id:`customer:${id(30)}`,name:"Customer",phone:"966500000001",source:"both",suppressed:false});
  assert.equal(result.audience.find(row=>row.id===`loyalty:${id(43)}`).suppressed,true);
  for(const call of h.db.calls.filter(call=>["customer_profiles","loyalty_cards","brand_marketing_suppressions"].includes(call.table)))assert(call.filters.some(([key,value])=>key==="cafe_id"&&value===id(10)));
});
await test("audience pagination has no default row truncation and query failures fail closed",async()=>{
  const h=ownerHarness({customers:Array.from({length:501},(_,index)=>({id:id(index+100),full_name:"Customer",phone:`050${String(index).padStart(7,"0")}`,status:"active"}))});
  assert.equal((await h.getMarketingDashboard()).audience.length,501);
  assert.deepEqual(h.db.calls.filter(call=>call.table==="customer_profiles").map(call=>call.range),[[0,499],[500,999]]);
  await assert.rejects(()=>ownerHarness({audienceError:true}).getMarketingDashboard(),error=>error.status===503);
});
await test("only current tenant customer IDs can enqueue or suppress, never arbitrary phone input",async()=>{
  const h=ownerHarness();const base={action:"createCampaign",idempotencyKey:id(20),title:"Campaign",body:"Body",customerIds:[`customer:${id(30)}`],consent:true};
  for(const input of [{...base,customerIds:[`customer:${id(99)}`]},{...base,recipients:["0500000099"]},{...base,customerIds:undefined,recipients:["0500000099"]},{action:"optOut",customerId:`customer:${id(99)}`},{action:"optOut",phone:"0500000001"}])await assert.rejects(()=>h.runMarketingAction(input));
  assert(!h.db.calls.some(call=>["marketing_create_campaign","marketing_suppress"].includes(call.rpc)));
  const stopped=await h.runMarketingAction({action:"optOut",customerId:`customer:${id(30)}`});assert.equal(stopped.dashboard.audience[0].suppressed,true);
  assert.deepEqual(h.db.calls.find(call=>call.rpc==="marketing_suppress").args,{p_cafe:id(10),p_phone:"966500000001",p_reason:"manual"});
  await assert.rejects(()=>h.runMarketingAction(base));assert(!h.db.calls.some(call=>call.rpc==="marketing_create_campaign"));
});
await test("QR waits for ready state and safely retries only temporary provider reads",async()=>{
  const connection={cafe_id:id(10),requested_phone:"966500000001",status:"pairing",instance_id:creds.idInstance,encrypted_credentials:crypto.encryptMarketingSecret(creds,`${id(10)}:${creds.idInstance}`),generation:id(5)};
  for(const state of ["starting","sleepMode"]){const h=ownerHarness({connection,state});assert.equal((await h.runMarketingAction({action:"qr"})).qrStatus,"timeout");assert.equal(h.qrCalls(),0);assert.equal(h.provisions.length,0);}
  for(const code of ["GREEN_API_MARKETING_REQUEST_FAILED","GREEN_API_MARKETING_REQUEST_REJECTED_408","GREEN_API_MARKETING_REQUEST_REJECTED_429","GREEN_API_MARKETING_REQUEST_REJECTED_502"]){
    const error=new ProviderError(false);error.code=code;
    for(const errors of [{stateError:error},{qrError:error}]){const h=ownerHarness({connection,state:"notAuthorized",...errors});assert.equal((await h.runMarketingAction({action:"qr"})).qrStatus,"timeout");assert.equal(h.provisions.length,0);}
  }
  for(const state of ["blocked","suspended"]){const h=ownerHarness({connection,state});await assert.rejects(()=>h.runMarketingAction({action:"qr"}),error=>error.status===409);assert.equal(h.qrCalls(),0);}
  const paired=ownerHarness({connection,accountPhone:"966500000001"});assert.equal((await paired.runMarketingAction({action:"qr"})).qrStatus,"alreadyLogged");assert.equal(paired.qrCalls(),0);
  const mismatch=ownerHarness({connection});await assert.rejects(()=>mismatch.runMarketingAction({action:"qr"}),error=>error.status===409);assert.equal(mismatch.qrCalls(),0);
  const ready=ownerHarness({connection,state:"notAuthorized"});assert.equal((await ready.runMarketingAction({action:"qr"})).qr,"YWJj");assert.equal(ready.qrCalls(),1);
  const denied=new ProviderError(false);denied.code="GREEN_API_MARKETING_REQUEST_REJECTED_401";await assert.rejects(()=>ownerHarness({connection,stateError:denied}).runMarketingAction({action:"qr"}),error=>error===denied);
});
await test("creation persists encrypted credentials without duplicate provider settings",async()=>{
  const h=ownerHarness();const result=await h.runMarketingAction({action:"connect",phone:"0500000001"});
  assert.equal(h.settings(),0);assert.equal(h.row().status,"pairing");assert(h.row().encrypted_credentials);assert(!JSON.stringify(result).includes(creds.apiTokenInstance));assert(!JSON.stringify(result).includes("encrypted_credentials"));
  const reuse=ownerHarness({reused:true});await reuse.runMarketingAction({action:"connect",phone:"0500000001"});assert.equal(reuse.settings(),1);
});
await test("uncertain provision reconciles only while definite rejection allows retry",async()=>{
  const h=ownerHarness({provisionError:new ProviderError(true)});
  await assert.rejects(()=>h.runMarketingAction({action:"connect",phone:"0500000001"}));await assert.rejects(()=>h.runMarketingAction({action:"connect",phone:"0500000001"}));
  assert.deepEqual(h.provisions.map(p=>p.allowCreate),[true,false]);assert.equal(h.row().status,"uncertain");
  const rejected=ownerHarness({provisionError:new ProviderError(false)});await assert.rejects(()=>rejected.runMarketingAction({action:"connect",phone:"0500000001"}));assert.equal(rejected.row().provision_attempted_at,null);assert.equal(rejected.row().status,"error");
});
await test("phone identity mismatch cannot become connected",async()=>{
  const h=ownerHarness({connection:{cafe_id:id(10),requested_phone:"966500000001",status:"pairing",instance_id:creds.idInstance,encrypted_credentials:crypto.encryptMarketingSecret(creds,`${id(10)}:${creds.idInstance}`),generation:id(5)}});
  await h.runMarketingAction({action:"refresh"});assert.equal(h.row().status,"mismatch");
});

await test("owner API enforces same-origin mutations and sanitizes unexpected errors",async()=>{
  let actions=0;class MarketingError extends Error{}
  const api=loader({"@/lib/data/marketing":{MarketingError,getMarketingDashboard:async()=>{throw new Error("private-secret");},runMarketingAction:async()=>{actions++;return {};}}})("app/api/marketing/route.ts");
  assert.equal((await api.POST(new Request("https://barndaksa.com/api/marketing",{method:"POST",body:"{}"}))).status,403);
  assert.equal((await api.POST(new Request("https://barndaksa.com/api/marketing",{method:"POST",headers:{origin:"https://attacker.test"},body:"{}"}))).status,403);
  const ok=await api.POST(new Request("https://barndaksa.com/api/marketing",{method:"POST",headers:{origin:"https://barndaksa.com"},body:"{}"}));assert.equal(ok.status,200);assert.equal(actions,1);
  const fail=await api.GET();assert.equal(fail.status,503);assert(!(await fail.text()).includes("private-secret"));assert.equal(fail.headers.get("cache-control"),"private, no-store");
});
await test("provider error logging contains only safe codes and never message or stack",async()=>{
  const provider=new ProviderError(false);provider.code="GREEN_API_MARKETING_REQUEST_REJECTED_502";provider.message="private-token-in-provider-url";
  const events=[],original=console.error;console.error=(...args)=>events.push(args);
  try {
    const api=loader({"@/lib/whatsapp/green-api-partner":{GreenApiProviderError:ProviderError},"@/lib/data/marketing":{MarketingError:class extends Error{},getMarketingDashboard:async()=>{throw provider;}}})("app/api/marketing/route.ts");
    const response=await api.GET();assert.equal(response.status,503);assert(!(await response.text()).includes(provider.message));
    assert.equal(events.length,1);assert.deepEqual(events[0],["[marketing:request]",{code:provider.code}]);assert(!JSON.stringify(events).includes(provider.message));
  } finally {console.error=original;}
});
await test("cron requires exact secret before running worker",async()=>{
  let runs=0;const api=loader({"@/lib/marketing/worker":{runMarketingJobs:async()=>{runs++;return {};}}})("app/api/marketing/jobs/route.ts");
  assert.equal((await api.GET(new Request("https://barndaksa.com/api/marketing/jobs"))).status,401);
  assert.equal((await api.GET(new Request("https://barndaksa.com/api/marketing/jobs",{headers:{authorization:`Bearer ${env.CRON_SECRET}`}}))).status,200);assert.equal(runs,1);
});
await test("authenticated webhook rejects wrong instance, leaves STOP manual and records delivery",async()=>{
  const token="t".repeat(43),db=database(c=>c.rpc?{data:null}:{data:{instance_id:creds.idInstance,webhook_token_hash:crypto.hashMarketingToken(token),generation:id(5),status:"connected"}});
  const api=loader({"@/lib/supabase/admin":{createAdminClient:()=>db}})("app/api/marketing/webhook/[brandId]/route.ts");
  const event={typeWebhook:"incomingMessageReceived",instanceData:{idInstance:creds.idInstance},senderData:{sender:"966500000001@c.us"},messageData:{textMessageData:{textMessage:"إيقاف"}}};
  const send=(payload,authorization=`Bearer ${token}`)=>api.POST(new Request("https://barndaksa.com/api/marketing/webhook/"+id(10),{method:"POST",headers:{authorization},body:JSON.stringify(payload)}),{params:Promise.resolve({brandId:id(10)})});
  assert.equal((await send(event,token)).status,401);assert.equal((await send({...event,instanceData:{idInstance:"12345"}})).status,400);assert(!db.calls.some(c=>c.rpc));
  assert.equal((await send(event)).status,204);assert(!db.calls.some(c=>c.rpc==='marketing_suppress'));
  assert.equal((await send({...event,typeWebhook:"outgoingMessageStatus",idMessage:"message",status:"delivered"})).status,204);assert.equal(db.calls.at(-1).args.p_status,"delivered");
  const count=db.calls.filter(c=>c.rpc).length;await send({...event,senderData:{sender:"966500000001@g.us"}});assert.equal(db.calls.filter(c=>c.rpc).length,count);
});
await test("unsubscribe GET is read-only and signed POST suppresses only original tenant",async()=>{
  const db=database(c=>c.rpc?{data:null}:{data:{cafe_id:id(10),phone:"966500000001"}});
  const api=loader({"@/lib/supabase/admin":{createAdminClient:()=>db}})("app/api/marketing/unsubscribe/route.ts");
  const token=crypto.signMarketingUnsubscribe(id(3));const url=`https://barndaksa.com/api/marketing/unsubscribe?id=${id(3)}&token=${token}`;
  assert.equal((await api.GET(new Request(url))).status,200);assert.equal(db.calls.length,0);
  assert.equal((await api.POST(new Request(url,{method:"POST",body:new URLSearchParams({id:id(3),token})}))).status,200);assert.equal(db.calls.at(-1).args.p_cafe,id(10));
  assert.equal((await api.GET(new Request(url.replace(id(3),id(4))))).status,400);
});
await test("operations diagnostic authenticates before reads and never returns QR credentials or personal data",async()=>{
  const secret=crypto.encryptMarketingSecret(creds,`${id(10)}:${creds.idInstance}`);
  const db=database(()=>({data:{cafe_id:id(10),instance_id:creds.idInstance,encrypted_credentials:secret,status:"pairing"}}));
  const api=loader({"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/whatsapp/green-api-marketing":{GreenApiProviderError:ProviderError,getGreenApiMarketingState:async()=>"notAuthorized",getGreenApiMarketingQr:async()=>({type:"qrCode",message:"PRIVATE_QR_PAYLOAD"})}})("app/api/marketing/diagnostics/route.ts");
  const url=`https://barndaksa.com/api/marketing/diagnostics?brand=${id(10)}`;
  assert.equal((await api.GET(new Request(url))).status,401);assert.equal(db.calls.length,0);
  const result=await api.GET(new Request(url,{headers:{authorization:`Bearer ${env.CRON_SECRET}`}}));
  assert.deepEqual(await result.json(),{stage:"qr",ok:true,state:"notAuthorized",qrType:"qrCode",qrAvailable:true});
  assert(result.headers.get("cache-control").includes("no-store"));assert(db.calls.every(c=>c.filters.some(([key,value])=>key==="cafe_id"&&value===id(10))));
});
inputs.add(path.resolve(import.meta.filename));
fs.writeFileSync(".git/marketing-backend-checks.json",JSON.stringify({executedAt:new Date().toISOString(),node:process.version,checks,providerMutations:0,liveDatabaseWrites:0,inputs:Object.fromEntries([...inputs].map(file=>[path.relative(process.cwd(),file),createHash("sha256").update(fs.readFileSync(file)).digest("hex")]))},null,2));
console.log(`Marketing backend: ${checks} grouped checks passed with mocked provider and database`);
