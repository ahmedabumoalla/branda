import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const nativeRequire=createRequire(import.meta.url);
const load=async(file,stubs={})=>{
  const source=await readFile(file,"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  new Function("require","exports",code)(name=>{
    if(name==="server-only")return {};
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name.startsWith("node:"))return nativeRequire(name);
    throw new Error(`Unmocked dependency ${name}`);
  },exports);
  return exports;
};
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const job=(n=1,kind="ready")=>({id:`job-${n}`,orderId:`order-${n}`,cafeId:"cafe-one",phone:"966500000001",
  brandName:"Test Brand",invoiceNumber:"000١٢ / أ",kind,leaseToken:`lease-${n}`,...(kind==="rating"?{feedbackToken:"a".repeat(64)}:{})});
async function workerHarness(options={}){
  let queue=options.jobs??[job()],claimed=[],sent=[],finished=[],authorized=[],sendCalls=0;
  const worker=await load("lib/pager/worker.ts",{
    "@/lib/data/pager":{
      claimPagerMessages:async limit=>{claimed.push(limit);if(options.claimError)throw options.claimError;const next=queue.slice(0,limit);queue=queue.slice(limit);return next;},
      authorizePagerDispatch:async(id,lease)=>{authorized.push([id,lease]);return options.authorize?.(id,lease)??true;},
      finishPagerMessage:async(id,lease,result)=>{finished.push({id,lease,...result});if(options.finishError)throw options.finishError;return true;},
    },
    "@/lib/whatsapp/green-api":{
      isGreenApiConfigured:()=>options.configured??true,
      sendGreenApiPagerMessage:async input=>{sent.push(input);sendCalls++;return options.send?options.send(input,sendCalls):{providerMessageId:`provider-${sendCalls}`};},
    },
  });
  return {worker,claimed,sent,finished,authorized,requeue:jobs=>{queue.push(...jobs);}};
}
const originalFetch=globalThis.fetch;
const originalNow=Date.now;
const envKeys=["CRON_SECRET","GREEN_API_API_URL","GREEN_API_ID_INSTANCE","GREEN_API_API_TOKEN_INSTANCE","GREEN_API_REQUEST_TIMEOUT_MS"];
const previous=new Map(envKeys.map(key=>[key,process.env[key]]));
// Fails closed even if a test accidentally adds an unmocked network operation
globalThis.fetch=async()=>{throw new Error("Real network disabled in pager tests");};
try {
  let h=await workerHarness();
  let text=h.worker.pagerMessageText(job());check(text.includes("000١٢ / أ"),"message keeps exact invoice zeros and punctuation");
  check(text.includes("Test Brand")&&!text.includes("undefined"),"temporary platform sender names brand");
  text=h.worker.pagerMessageText(job(1,"rating"));check(text.includes(`https://barndaksa.com/pager/feedback/${"a".repeat(64)}`),"rating invite uses first-party opaque URL");
  assert.throws(()=>h.worker.pagerMessageText({...job(1,"rating"),feedbackToken:"bad"}));checks++;
  equal(await h.worker.runPagerMessageJobs(),{claimed:1,queued:1,skipped:0,failed:0},"accepted message reported queued");
  equal(h.authorized,[["job-1","lease-1"]],"dispatch rechecks exact lease");
  equal(h.finished,[{id:"job-1",lease:"lease-1",providerId:"provider-1"}],"provider receipt persisted");
  h=await workerHarness({configured:false});await rejects(()=>h.worker.runPagerMessageJobs(),/PAGER_PROVIDER_NOT_CONFIGURED/);
  equal(h.claimed,[],"missing provider does not consume queue leases");equal(h.sent,[],"missing provider sends nothing");
  h=await workerHarness({authorize:()=>false});equal(await h.worker.runPagerMessageJobs(),{claimed:1,queued:0,skipped:1,failed:0},"expired or cancelled lease skipped");
  equal(h.sent,[],"failed authorization means zero external sends");equal(h.finished,[],"skipped job is not falsely marked sent");
  h=await workerHarness({send:async()=>{throw new Error("secret-provider-url/private-token phone-payload");}});
  equal(await h.worker.runPagerMessageJobs(),{claimed:1,queued:0,skipped:0,failed:1},"provider failure surfaced as count");
  equal(h.finished,[{id:"job-1",lease:"lease-1",error:"provider_send_failed"}],"provider errors sanitized before persistence");
  check(!JSON.stringify(h.finished).includes("private-token"),"provider credential never persisted");
  h=await workerHarness({finishError:new Error("private DB error")});
  equal(await h.worker.runPagerMessageJobs(),{claimed:1,queued:0,skipped:0,failed:1},"persistence error returned without private data");
  equal(h.sent.length,1,"successful send occurs once when persistence fails");
  equal(h.finished.length,1,"successful external send is never finalized again as provider failure");
  check(!Object.hasOwn(h.finished[0],"error"),"no false provider failure overwrites successful response");
  h=await workerHarness();const overlap=await Promise.all([h.worker.runPagerMessageJobs(),h.worker.runPagerMessageJobs()]);
  equal(overlap.reduce((sum,x)=>sum+x.queued,0),1,"overlapping workers consume atomically leased queue once");equal(h.sent.length,1,"overlap results in one send");
  h=await workerHarness({send:async(_,number)=>{if(number===1)throw new Error("temporary");return{providerMessageId:"retry-accepted"};}});
  await h.worker.runPagerMessageJobs();h.requeue([{...job(),leaseToken:"retry-lease"}]);await h.worker.runPagerMessageJobs();
  equal(h.finished.map(x=>x.error??x.providerId),["provider_send_failed","retry-accepted"],"durable retry uses fresh provider result");
  equal(h.finished[1].lease,"retry-lease","retry follows newly claimed lease");
  h=await workerHarness({jobs:[...Array(122)].map((_,i)=>job(i+1))});
  equal((await h.worker.runPagerMessageJobs(500)).claimed,100,"worker caps total invocation at hundred");equal(h.claimed,[20,20,20,20,20],"claims remain twenty per batch within individual leases");
  h=await workerHarness({jobs:[...Array(30)].map((_,i)=>job(i+1))});
  equal((await h.worker.runPagerMessageJobs(5)).claimed,5,"action kick retains five job limit");equal(h.claimed,[5],"action never opens a second batch");
  let fakeNow=1_000;Date.now=()=>fakeNow;
  h=await workerHarness({jobs:[...Array(80)].map((_,i)=>job(i+1)),send:async()=>{fakeNow+=800;return{providerMessageId:"timed"};}});
  equal((await h.worker.runPagerMessageJobs()).claimed,20,"no new batch claimed after fifteen second budget");
  equal(h.claimed,[20],"deadline leaves unclaimed work available to next scheduler");equal(h.finished.length,20,"already claimed batch completes before stopping");
  fakeNow=1_000;
  h=await workerHarness({jobs:[...Array(80)].map((_,i)=>job(i+1)),send:async(_,number)=>{fakeNow+=number<=20?700:2_000;return{providerMessageId:"timed"};}});
  equal((await h.worker.runPagerMessageJobs()).claimed,40,"second batch may begin before budget and completes after budget");
  equal(h.claimed,[20,20],"deadline prevents a third batch");
  Date.now=originalNow;
  let activeSends=0,peakSends=0;
  h=await workerHarness({jobs:[...Array(40)].map((_,i)=>job(i+1)),send:async()=>{activeSends++;peakSends=Math.max(peakSends,activeSends);await Promise.resolve();activeSends--;return{providerMessageId:"concurrency"};}});
  equal((await h.worker.runPagerMessageJobs()).queued,40,"multiple batches finish across bounded waves");
  equal(peakSends,5,"provider concurrency never exceeds five");
  h=await workerHarness({jobs:[...Array(25)].map((_,i)=>job(i+1)),send:async(_,number)=>{if(number<=20)throw new Error("temporary");return{providerMessageId:"accepted"};}});
  equal(await h.worker.runPagerMessageJobs(),{claimed:25,queued:5,skipped:0,failed:20},"failed first provider batch does not prevent later batch processing");
  h=await workerHarness({jobs:[{...job(1,"rating"),feedbackToken:"bad"}]});
  equal((await h.worker.runPagerMessageJobs()).failed,1,"malformed feedback job fails safely");equal(h.sent,[],"invalid feedback token never sent");

  let routeCalls=0,routeError=false;
  const route=await load("app/api/pager/jobs/route.ts",{ "@/lib/salon/worker":{runSalonMessageJobs:async()=>({claimed:0})},"@/lib/pager/worker":{runPagerMessageJobs:async()=>{routeCalls++;if(routeError)throw new Error("private credentials");return{claimed:0,queued:0,skipped:0,failed:0};}}});
  const request=authorization=>new Request("https://barndaksa.com/api/pager/jobs",{headers:authorization?{authorization}:{}});
  delete process.env.CRON_SECRET;
  let response=await route.GET(request());equal(response.status,401,"unconfigured scheduler denied");equal(response.headers.get("cache-control"),"no-store","denied response uncacheable");
  process.env.CRON_SECRET="short";equal((await route.GET(request("Bearer short"))).status,401,"short scheduler secret fails closed");
  process.env.CRON_SECRET="test-only-secret-at-least-32-characters";
  for(const auth of [undefined,"wrong",`Bearer ${"x".repeat(process.env.CRON_SECRET.length)}`])equal((await route.GET(request(auth))).status,401,"missing or invalid auth denied");
  equal(routeCalls,0,"unauthorized route never runs worker");
  response=await route.GET(request(`Bearer ${process.env.CRON_SECRET}`));equal(response.status,200,"authorized scheduler runs worker");
  equal(response.headers.get("cache-control"),"no-store","success response uncacheable");equal((await response.json()).claimed,0,"route returns aggregate only");
  routeError=true;response=await route.GET(request(`Bearer ${process.env.CRON_SECRET}`));equal(response.status,503,"worker unavailable status");
  equal(await response.json(),{error:"pager_queue_unavailable"},"route sanitizes provider or DB error");
  equal(response.headers.get("cache-control"),"no-store","failure response uncacheable");
  const config=JSON.parse(await readFile("vercel.json","utf8"));equal(config.crons.find(x=>x.path==="/api/pager/jobs")?.schedule,"* * * * *","minute production schedule configured");
  equal(route.maxDuration,90,"route allows final batch and database overhead within ninety seconds");

  let afters=[],transitionCalls=[],transitionError=false,actionWorkers=0;
  const actions=await load("app/actions/pager.ts",{
    "next/server":{after:fn=>afters.push(fn)},
    "@/lib/pager/worker":{runPagerMessageJobs:async limit=>{equal(limit,5,"immediate kick stays bounded");actionWorkers++;}},
    "@/lib/data/pager":{transitionPagerOrder:async(...args)=>{transitionCalls.push(args);if(transitionError)throw new Error("Unauthorized private DB details");return{id:"order-1",status:args[1]};}},
  });
  let action=await actions.updatePagerOrderAction("order-1","ready","staff");check(action.ok,"ready returns persisted status");equal(actionWorkers,0,"worker starts after response not before persistence");
  equal(transitionCalls,[['order-1','ready','staff']],"action delegates authoritative staff checks");equal(afters.length,1,"ready schedules immediate send");await afters.pop()();
  await actions.updatePagerOrderAction("order-1","received","owner");equal(afters.length,1,"received schedules feedback invitation");await afters.pop()();
  await actions.updatePagerOrderAction("order-1","cancelled","staff");equal(afters.length,0,"cancel does not kick messaging");
  transitionError=true;action=await actions.updatePagerOrderAction("order-1","ready","staff");check(!action.ok&&!action.error.includes("private"),"unauthorized mutation returns safe error");equal(afters.length,0,"failed transition never queues worker");

  process.env.GREEN_API_API_URL="https://provider.example.test";process.env.GREEN_API_ID_INSTANCE="test-instance";process.env.GREEN_API_API_TOKEN_INSTANCE="test-token";
  process.env.GREEN_API_REQUEST_TIMEOUT_MS="90000";
  const sender=await load("lib/whatsapp/green-api.ts");let fetchCalls=[];
  globalThis.fetch=async(url,options)=>{fetchCalls.push({url,options});return Response.json({idMessage:"mock-provider-id"});};
  equal(await sender.sendGreenApiPagerMessage({phone:"966500000001",message:"exact invoice"}),{providerMessageId:"mock-provider-id"},"sender accepts provider ID without claiming delivery");
  equal(JSON.parse(fetchCalls[0].options.body),{chatId:"966500000001@c.us",linkPreview:false,message:"exact invoice"},"sender address and payload exact");
  equal(fetchCalls[0].options.cache,"no-store","provider request uncacheable");check(fetchCalls[0].options.signal instanceof AbortSignal,"provider request has deadline signal");
  await rejects(()=>sender.sendGreenApiPagerMessage({phone:"0500000001",message:"x"}),/INVALID_PAGER_RECIPIENT/);equal(fetchCalls.length,1,"invalid recipient never sent");
  globalThis.fetch=async()=>new Response("private provider details",{status:500});
  await rejects(()=>sender.sendGreenApiPagerMessage({phone:"966500000001",message:"x"}),/^Error: PAGER_PROVIDER_REJECTED$/);
  globalThis.fetch=async()=>Response.json({success:true});
  await rejects(()=>sender.sendGreenApiPagerMessage({phone:"966500000001",message:"x"}),/^Error: PAGER_PROVIDER_INVALID_RESPONSE$/);
  console.log(`PASS ${checks} mocked pager worker route action sender checks with zero real sends`);
} finally {
  globalThis.fetch=originalFetch;
  Date.now=originalNow;
  for(const [key,value]of previous){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
