import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const load=(file,stubs={})=>{const out={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','exports',code)(n=>n==='server-only'?{}:stubs[n]??require(n),out);return out;};
const actor='00000000-0000-4000-8000-000000000001',key='00000000-0000-4000-8000-000000000002',mediaId='00000000-0000-4000-8000-000000000003';
let checks=0;
const check=(value,message)=>{assert(value,message);checks++;};
const rejects=async(fn)=>{await assert.rejects(fn);checks++;};
const originalFetch=globalThis.fetch;
const keys=['GREEN_API_API_URL','GREEN_API_ID_INSTANCE','GREEN_API_API_TOKEN_INSTANCE','NEXT_PUBLIC_SUPABASE_URL'];
const originalEnv=keys.map(k=>process.env[k]);
try{
  Object.assign(process.env,{GREEN_API_API_URL:'https://api.green-api.com',GREEN_API_ID_INSTANCE:'1234567890',GREEN_API_API_TOKEN_INSTANCE:'fixture-only-token',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co'});
  const provider=load('lib/whatsapp/green-api-platform-campaigns.ts');
  const sent=[];
  globalThis.fetch=async(url,init)=>{sent.push({url,init});return new Response(JSON.stringify(init.method==='GET'?{stateInstance:'authorized',phone:'966508333556'}:{idMessage:'receipt-1'}));};
  const sender=await provider.getBrandaCampaignSender();check(sender.ready&&sender.phone==='966508333556','Actual shared sender detected');
  await provider.sendBrandaCampaignMessage({phone:'966511111111',body:'رسالة الحملة\nكما كتبها المدير'});
  const payload=JSON.parse(sent.at(-1).init.body);check(payload.message==='رسالة الحملة\nكما كتبها المدير','No appended footer or campaign title');
  check(sent.at(-1).url.includes('/waInstance1234567890/sendMessage/'),'Uses operational Branda instance');
  await provider.sendBrandaCampaignMessage({phone:'966511111111',body:'صورة الحملة',media:{url:'https://fixture.supabase.co/storage/v1/object/sign/platform-marketing-media/actor/ready/photo.jpg?token=fixture',fileName:'campaign.jpg'}});
  check(JSON.parse(sent.at(-1).init.body).caption==='صورة الحملة'&&sent.at(-1).url.includes('sendFileByUrl'),'One media request with exact caption');
  for(const url of ['https://evil.invalid/photo.jpg','http://fixture.supabase.co/storage/v1/object/sign/platform-marketing-media/a?token=t','https://fixture.supabase.co/storage/v1/object/sign/marketing-media/a?token=t'])await rejects(()=>provider.sendBrandaCampaignMessage({phone:'966511111111',body:'Test',media:{url,fileName:'campaign.jpg'}}));
  await rejects(()=>provider.sendBrandaCampaignMessage({phone:'group@g.us',body:'Test'}));
  for(const [response,uncertain] of [[new Response('{}'),true],[new Response('{}',{status:500}),true],[new Response('{}',{status:400}),false],[new Response(JSON.stringify({code:503})),true]]){
    globalThis.fetch=async()=>response;
    try{await provider.sendBrandaCampaignMessage({phone:'966511111111',body:'Test'});assert.fail('Expected rejection');}catch(e){check(e instanceof provider.PlatformCampaignProviderError&&e.uncertain===uncertain,'Provider failure classification');}
  }
  globalThis.fetch=async()=>{throw Error('network timeout')};
  try{await provider.sendBrandaCampaignMessage({phone:'966511111111',body:'Test'});}catch(e){check(e.uncertain,'Timeout cannot trigger automatic resend');}
  check(!(await provider.getBrandaCampaignSender()).ready,'Connection failure is not ready');
}finally{globalThis.fetch=originalFetch;keys.forEach((k,i)=>{if(originalEnv[i]===undefined)delete process.env[k];else process.env[k]=originalEnv[i];});}

function dataContext(options={}){
  const calls=[];
  const chain=(value)=>{const q={select(){return q},eq(){return q},maybeSingle:async()=>value};return q;};
  const db={from(){return chain({data:options.existing?{id:key}:null,error:null});},rpc:async(name,args)=>{calls.push({name,args});return {data:{campaignId:key,total:2},error:options.dbError?{message:options.dbError}:null};}};
  const api=load('lib/data/platform-marketing.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:actor}}})},from:()=>chain({data:{role:options.role??'platform_admin',status:options.blocked?'blocked':'active'}})})},
    '@/lib/supabase/admin':{createAdminClient:()=>{calls.push({name:'service'});return db;}},
    '@/lib/whatsapp/green-api-platform-campaigns':{getBrandaCampaignSender:async()=>({ready:!options.disconnected,phone:'966508333556',status:'connected'})},
  });return {api,calls};
}
const create={action:'createCampaign',idempotencyKey:key,title:'حملة اختبار',body:'رسالة اختبار',audience:{mode:'selected',phones:['966511111111','966511111111']}};
for(const options of [{signedOut:true},{role:'owner'},{blocked:true}]){const c=dataContext(options);await rejects(()=>c.api.runPlatformCampaignAction(create));check(!c.calls.some(c=>c.name==='service'),'No privileged client before authorization');}
{const c=dataContext();await c.api.runPlatformCampaignAction(create);check(c.calls.find(c=>c.name==='platform_marketing_create_campaign').args.p_phones.length===1,'Server canonicalizes duplicate selected numbers');}
{const c=dataContext();await c.api.runPlatformCampaignAction({...create,scheduledAt:'2027-01-01T12:30:00+03:00'});check(c.calls.find(c=>c.name==='platform_marketing_create_campaign').args.p_scheduled_at==='2027-01-01T12:30:00+03:00','Schedule passed to durable database gate');await rejects(()=>c.api.runPlatformCampaignAction({...create,scheduledAt:'not-a-date'}));}
for(const dbError of ['Idempotency conflict','Media unavailable','Audience changed or unavailable','Schedule invalid']){const c=dataContext({dbError});try{await c.api.runPlatformCampaignAction(create);assert.fail('Expected conflict');}catch(e){check(e.status===409,'Deterministic SQL validation is editable, not uncertain: '+dbError);}}
{const c=dataContext({disconnected:true});await rejects(()=>c.api.runPlatformCampaignAction(create));check(!c.calls.some(c=>c.name==='platform_marketing_create_campaign'),'Disconnected sender cannot enqueue');}
{const c=dataContext({disconnected:true,existing:true});await c.api.runPlatformCampaignAction(create);check(c.calls.some(c=>c.name==='platform_marketing_create_campaign'),'Lost-response retry reconciles existing request while disconnected');}
{const c=dataContext();await rejects(()=>c.api.runPlatformCampaignAction({...create,mediaId,body:'a'.repeat(1025)}));await rejects(()=>c.api.runPlatformCampaignAction({...create,audience:{mode:'selected',phones:[]}}));await rejects(()=>c.api.getPlatformCampaignAudience({brandId:'invalid'}));}

const errors=dataContext().api;
const http=load('lib/marketing/platform-http.ts',{'@/lib/data/platform-marketing':errors});
await rejects(()=>http.platformCampaignBody(new Request('https://barndaksa.com/api/test',{method:'POST',headers:{origin:'https://evil.invalid'},body:'{}'})));
await rejects(()=>http.platformCampaignBody(new Request('https://barndaksa.com/api/test',{method:'POST',headers:{origin:'https://barndaksa.com'},body:'x'.repeat(250001)})));
check((await http.platformCampaignBody(new Request('https://barndaksa.com/api/test',{method:'POST',headers:{origin:'https://barndaksa.com'},body:'{"test":true}'}))).test,'Same origin valid JSON accepted');

const rules=load('lib/marketing/media-rules.ts');
function mediaContext(options={}){
  const calls=[];const row={id:mediaId,created_by:actor,storage_path:`${actor}/upload/${mediaId}.jpg`,mime_type:'image/jpeg',byte_size:4,file_name:'sample.jpg',status:'uploading',expires_at:new Date(Date.now()+86400000).toISOString()};
  const bytes=new Uint8Array(options.invalid?[1,2,3,4]:[255,216,255,0]);
  const storage={info:async()=>({data:{size:4,contentType:'image/jpeg'}}),download:async()=>({data:new Blob([bytes])}),upload:async(path)=>{calls.push({name:'sealed',path});return{};},remove:async()=>({}),createSignedUrl:async()=>({data:{signedUrl:'https://fixture.invalid/preview'}})};
  const q={select(){return options.updated?Promise.resolve({data:[{id:mediaId}]}):q;},eq(){return q;},maybeSingle:async()=>({data:options.foreign?null:row}),update(){options.updated=true;return q;}};
  const db={from:()=>q,storage:{from:()=>storage}};
  const api=load('lib/marketing/platform-media.ts',{'@/lib/data/platform-marketing':{...errors,requirePlatformMarketingContext:async()=>({userId:actor,db})},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/marketing/media-rules':rules});
  return {api,calls};
}
for(const options of [{foreign:true},{invalid:true}]){const c=mediaContext(options);await rejects(()=>c.api.runPlatformCampaignMediaAction({action:'finalize',mediaId}));check(!c.calls.some(c=>c.name==='sealed'),'Foreign or mismatched content cannot become media');}
{const c=mediaContext();const r=await c.api.runPlatformCampaignMediaAction({action:'finalize',mediaId});check(r.media.id===mediaId&&c.calls[0].path===`${actor}/ready/${mediaId}.jpg`,'Validated bytes sealed at actor-owned immutable path');}

const oldTimer=globalThis.setTimeout;
globalThis.setTimeout=(fn)=>{queueMicrotask(fn);return 0;};
try{
  for(const mode of ['accepted','timeout','rejected','cancelled','finish-failed','disconnected']){
    const calls=[];let claimCount=0;
    const db={rpc:async(name,args)=>{calls.push({name,args});if(name==='platform_marketing_claim_job')return{data:claimCount++===0?{id:key,phone:'966511111111',body:'unchanged',created_by:actor,lease_token:mediaId,media_id:null}:null};if(name==='platform_marketing_begin_dispatch')return{data:mode!=='cancelled'};if(name==='platform_marketing_finish_dispatch'&&mode==='finish-failed'&&args.p_status==='accepted')return{error:{}};return{data:true};}};
    class ProviderError extends Error{constructor(uncertain){super('fixture');this.uncertain=uncertain;this.code='FIXTURE';}}
    const worker=load('lib/marketing/platform-worker.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/marketing/platform-media':{signPlatformCampaignMedia:async()=>null},'@/lib/whatsapp/green-api-platform-campaigns':{PlatformCampaignProviderError:ProviderError,getBrandaCampaignSender:async()=>({ready:mode!=='disconnected'}),sendBrandaCampaignMessage:async(input)=>{calls.push({name:'send',input});if(mode==='timeout')throw new ProviderError(true);if(mode==='rejected')throw new ProviderError(false);return{providerMessageId:'fixture'};}}});
    await worker.runPlatformMarketingJobs();
    const sends=calls.filter(c=>c.name==='send');
    check(sends.length===(['cancelled','disconnected'].includes(mode)?0:1),'Single provider attempt '+mode);
    if(sends.length)check(sends[0].input.body==='unchanged','Worker preserves body exactly');
    const status=calls.filter(c=>c.name==='platform_marketing_finish_dispatch').at(-1)?.args.p_status;
    check(status===({accepted:'accepted',timeout:'uncertain',rejected:'failed',cancelled:'queued','finish-failed':'uncertain',disconnected:undefined})[mode],'Durable finish '+mode);
  }
}finally{globalThis.setTimeout=oldTimer;}
console.log(`PASS ${checks} platform marketing auth/CSRF/audience/media/shared sender/no-footer/idempotency/worker checks; all provider calls mocked`);
