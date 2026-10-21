import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let state,calls,checks=0;
const date='2026-10-21T09:00:00Z';
const row={id:id(20),title:'<script>title</script>',body:'First\nSecond',status:'completed',createdAt:date,scheduledAt:date,mediaKind:'image',total:9,sent:3,pending:2,failed:1,uncertain:1,cancelled:1,suppressed:1,phone:'PRIVATE',storage_path:'PRIVATE',encrypted_credentials:'PRIVATE'};
function reset(patch={}){calls=[];state={user:{id:id(1)},profile:{role:'platform_admin',status:'active'},error:null,history:{page:0,total:21,campaigns:[row]},...patch};}
const db={auth:{getUser:async()=>({data:{user:state.user}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:state.profile})})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:state.response??{from:args.p_from,to:args.p_to,metrics:state.metrics??[],history:args.p_cafe?state.history:null},error:state.error};}};
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(name=>name==='server-only'?{}:name==='@/lib/supabase/server'?{createClient:async()=>db}:name.startsWith('@/')?load(name.slice(2)+'.ts'):require(name),exports);return exports;}
const {getAdminCampaignReport}=load('lib/data/marketing-report.ts'),{GET}=load('app/api/admin/marketing-campaigns/history/route.ts');
const {emptyCampaignMetrics}=load('lib/analytics/marketing-report.ts');
const check=(ok,message)=>{assert(ok,message);checks++;};
const period={from:'2026-10-21',to:'2026-10-21'};
for(const patch of [{user:null},{profile:null},{profile:{role:'cafe_owner',status:'active'}},{profile:{role:'cafe_staff',status:'active'}},{profile:{role:'platform_admin',status:'suspended'}}]){reset(patch);await assert.rejects(()=>getAdminCampaignReport(period,id(10)),/denied/);check(calls.length===0,'non-admin blocked before RPC');}
for(const [filters,brand,page]of [[{from:'2026-02-30',to:''},id(10),0],[{from:'2026-10-22',to:'2026-10-21'},id(10),0],[period,'bad',0],[period,id(10),-1],[period,id(10),.5],[period,id(10),100001]]){reset();await assert.rejects(()=>getAdminCampaignReport(filters,brand,page));check(calls.length===0,'invalid scope rejected before DB');}
reset();const report=await getAdminCampaignReport(period,id(10));
check(calls[0].name==='get_admin_marketing_campaign_report'&&calls[0].args.p_cafe===id(10)&&calls[0].args.p_from===period.from&&calls[0].args.p_to===period.to,'brand and loaded period forwarded');
check(report.history.campaigns[0].body===row.body&&report.history.campaigns[0].title===row.title,'original text retained');
check(!JSON.stringify(report).includes('PRIVATE'),'private fields stripped by response schema');
reset({history:{page:1,total:21,campaigns:[]}});await getAdminCampaignReport(period,id(10),1);check(calls[0].args.p_page===1,'bounded page forwarded');
for(const patch of [{error:{message:'PRIVATE'}},{history:null},{history:{page:1,total:0,campaigns:[]}},{response:{from:null,to:null,metrics:[],history:null}}]){reset(patch);await assert.rejects(()=>getAdminCampaignReport(period,id(10)));checks++;}
const request=query=>new Request('https://example.test/api/admin/marketing-campaigns/history?'+query);
reset({user:null});let response=await GET(request(`brandId=${id(10)}`));check(response.status===403&&response.headers.get('cache-control')==='private, no-store','private unauthorized response');
for(const query of ['',`brandId=${id(10)}&page=-1`,`brandId=${id(10)}&from=2026-02-30`,`brandId=${id(10)}&extra=1`]){reset();response=await GET(request(query));check(response.status===400&&calls.length===0,'invalid HTTP query denied');}
reset({error:{message:'PRIVATE'}});response=await GET(request(`brandId=${id(10)}`));check(response.status===503&&!(await response.text()).includes('PRIVATE'),'sanitized error without fabricated empty result');
reset();response=await GET(request(`brandId=${id(10)}&from=${period.from}&to=${period.to}`));check(response.status===200&&(await response.json()).campaigns[0].title===row.title,'authorized history response');
// Exercise real report merge with the two independent aggregate responses.
const {getAdminOperationsReport}=load('lib/data/operations-report.ts');
const baseBrand=n=>({id:id(n),name:`Brand ${n}`,slug:`brand-${n}`,status:'active',subscriptionStatus:'active',planName:'Plan',expiresAt:null,subscribed:true,planFeatures:['marketing_campaigns'],featureOverrides:[],lastMenuVisit:null,periodLastMenuVisit:null,metrics:{pagerUses:0,promotionCustomers:0,promotionSends:0,menuVisitors:0,menuVisits:0,loyaltyCards:0,loyaltyCustomers:0,appleCards:0,googleCards:0,stampOperations:0,rewardOperations:0}});
const originalRpc=db.rpc;
db.rpc=async(name,args)=>name==='get_admin_operations_report_v2'?{data:{generatedAt:date,from:args.p_from,to:args.p_to,menuTrackingSince:date,walletTrackingSince:date,promotionTrackingSince:date,brands:[baseBrand(10),baseBrand(11)]},error:null}:originalRpc(name,args);
reset({metrics:[{cafeId:id(10),...emptyCampaignMetrics,campaignLaunched:2,campaignTargets:3,campaignSent:4,campaignPending:1,campaignFailed:2}]});
const combined=await getAdminOperationsReport(period);check(combined.brands[0].metrics.campaignSent===4&&combined.brands[1].metrics.campaignSent===0,'merge scoped by brand; zero only when successful aggregate has no campaigns');
reset({error:{message:'PRIVATE'}});await assert.rejects(()=>getAdminOperationsReport(period));checks++;
console.log(`PASS marketing report: ${checks} auth, validation, privacy, period, API and report-merge assertions`);
