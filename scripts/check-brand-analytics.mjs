import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
function load(relative, stubs = {}, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(relative,"utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports = {}; cache.set(relative,exports);
  new Function("require","exports",output)(name => {
    if (Object.hasOwn(stubs,name)) return stubs[name];
    if (name.endsWith(".module.css")) return new Proxy({}, { get: (_,key) => String(key) });
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative),name);
      return load(fs.existsSync(`${next}.tsx`) ? `${next}.tsx` : `${next}.ts`,stubs,cache);
    }
    return dependency(name);
  },exports);
  return exports;
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const stamp = "2026-10-05T12:00:00+00:00";
const data = { brandId: id(1), from:null,to:null,engagementStartedAt:stamp,walletStartedAt:stamp,operationsStartedAt:stamp,
  engagement:{menu_view:{events:12,visitors:5},menu_loyalty_click:{events:3,visitors:2},loyalty_qr_visit:{events:2,visitors:1}},
  wallet:{customers:2,issuances:4,appleCustomers:2,appleDownloads:3,googleCustomers:1,googleSaveLinks:1},
  confirmed:{stamp:{operations:7,customers:2},redeem:{operations:1,customers:1}},
};
let checks=0;
const check = (condition,message) => { assert.ok(condition,message); checks++; };
const rejects = async operation => { await assert.rejects(operation); checks++; };
const schema = load("lib/analytics/brand-analytics.ts");
for (const input of [{brandId:id(1),from:"2026-02-30"},{brandId:id(1),from:"2026-10-06",to:"2026-10-05"},
  {brandId:"bad"},{brandId:id(1),from:"2026-1-1"},{brandId:id(1),userId:id(2)}]) {
  check(!schema.brandAnalyticsInputSchema.safeParse(input).success,"invalid filters rejected");
}
check(schema.brandAnalyticsInputSchema.safeParse({brandId:id(1),from:"2024-02-29"}).success,"real leap date accepted");
for (const [source,kind] of [["qr","loyalty_qr_visit"],["menu","loyalty_menu_visit"],[undefined,"loyalty_direct_visit"],["unknown","loyalty_direct_visit"],[["qr","menu"],"loyalty_direct_visit"]]) {
  check(schema.loyaltyVisitKind(source)===kind,"explicit sources only");
}
const calls=[];
let rpcError=null;
let publicFeatures=["menu", "loyalty"];
const { POST } = load("app/api/analytics/events/route.ts",{
  "@/lib/data/feature-entitlements":{getPublicCafeFeatureCodesBySlug:async()=>publicFeatures},
  "@/lib/barndaksa/env":{getSupabaseServiceRoleKey:()=>"test-server-secret"},
  "@/lib/supabase/admin":{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error:rpcError};}})},
});
const payload = {slug:"rast",kind:"menu_view",visitorId:id(20),eventId:id(21)};
const request = (body=JSON.stringify(payload),headers={}) => new Request("https://example.test/api/analytics/events",{
  method:"POST",headers:{origin:"https://example.test","content-type":"application/json","sec-fetch-site":"same-origin",...headers},body,
});
for (const headers of [{origin:"https://foreign.test"},{origin:""},{"sec-fetch-site":"cross-site"},{"sec-fetch-site":"same-site"}]) {
  check((await POST(request(undefined,headers))).status===403,"cross-origin/no-origin rejected before service access");
}
check((await POST(request(undefined,{"content-type":"application/jsonextra"}))).status===415,"exact JSON media type required");
for (const body of ["invalid",JSON.stringify({...payload,kind:"redeem"}),JSON.stringify({...payload,cardId:id(30)}),
  JSON.stringify({...payload,visitorId:"bad"}),JSON.stringify({...payload,slug:"../rast"})," ".repeat(2048)]) {
  check((await POST(request(body))).status===400,"invalid/oversize public body rejected");
}
check((await POST(request(" ".repeat(2048),{"content-length":"1"}))).status===400,"actual streamed body bounded despite false content length");
check(calls.length===0,"invalid events never reach privileged database client");
for (const [features, kind] of [[[], "menu_view"], [["loyalty"], "menu_view"], [["menu"], "menu_loyalty_click"], [["menu"], "loyalty_direct_visit"]]) {
  publicFeatures=features;
  check((await POST(request(JSON.stringify({...payload,kind})))).status===204,"unavailable service telemetry ignored");
  check(calls.length===0,"unavailable service never records an event");
}
publicFeatures=["menu", "loyalty"];
const accepted=await POST(request());
check(accepted.status===204 && (await accepted.text())==="" && accepted.headers.get("cache-control")==="no-store","accepted telemetry has no sensitive response");
check(calls[0].name==="record_brand_engagement" && /^[a-f0-9]{64}$/.test(calls[0].args.p_visitor_key),"server-only recorder receives hash");
check(!JSON.stringify(calls[0]).includes(payload.visitorId) && !JSON.stringify(calls[0]).includes("test-server-secret"),"raw visitor and secret never persisted in event arguments");
await POST(request(JSON.stringify({...payload,kind:"menu_loyalty_click"})));
check(calls[0].args.p_visitor_key===calls[1].args.p_visitor_key,"stable browser identity across event types");
rpcError={message:"private database payload"};
const failure=await POST(request());
check(failure.status===503 && !(await failure.text()).includes("private"),"database failure not exposed or claimed successful");

let user={id:id(3)},profile={role:"platform_admin",status:"active"},authError=null,profileError=null,adminCalls=0,reply=data;
const supabase={auth:{getUser:async()=>({data:{user},error:authError})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:profileError})})})}),
  rpc:async()=>{adminCalls++;return{data:reply,error:null};}};
const backend = load("lib/data/brand-analytics.ts",{"server-only":{},"@/lib/supabase/server":{createClient:async()=>supabase}});
for (const next of [null,{role:"owner",status:"active"},{role:"platform_admin",status:"suspended"},{role:"customer",status:"active"}]) {
  profile=next; await rejects(()=>backend.getAdminBrandAnalytics({brandId:id(1)}));
}
profile={role:"platform_admin",status:"active"}; user=null;
await rejects(()=>backend.getAdminBrandAnalytics({brandId:id(1)})); user={id:id(3)};
authError=new Error("auth private"); await rejects(()=>backend.getAdminBrandAnalytics({brandId:id(1)}));authError=null;
profileError=new Error("profile private"); await rejects(()=>backend.getAdminBrandAnalytics({brandId:id(1)}));profileError=null;
check(adminCalls===0,"unauthorized admin reads never invoke aggregate RPC");
check((await backend.getAdminBrandAnalytics({brandId:id(1)})).confirmed.stamp.operations===7,"authorized server returns validated counts");
reply={...data,brandId:id(9)};await rejects(()=>backend.getAdminBrandAnalytics({brandId:id(1)}));reply=data;
const action = load("app/actions/brand-analytics.ts",{"@/lib/data/brand-analytics":{getAdminBrandAnalytics:async()=>{throw new Error("secret backend details");}}});
const denied=await action.loadBrandAnalyticsAction({brandId:id(1)});
check(!denied.ok && !JSON.stringify(denied).includes("secret"),"server action sanitizes failures");

const originals=Object.fromEntries(["navigator","localStorage","document","fetch"].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
const override=(name,value)=>Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
try {
  const storage=new Map(),beacons=[],fetches=[];
  override("localStorage",{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)});
  override("navigator",{sendBeacon:(url,body)=>{beacons.push({url,body});return true;}});
  override("fetch",async(url,options)=>{fetches.push({url,options});throw new Error("offline");});
  const tracker=load("lib/analytics/public-tracking.ts");
  tracker.trackBrandEngagement("rast","menu_view");tracker.trackBrandEngagement("rast","menu_loyalty_click");
  const first=JSON.parse(await beacons[0].body.text()),second=JSON.parse(await beacons[1].body.text());
  check(first.visitorId===second.visitorId && first.eventId!==second.eventId,"same browser UUID, distinct event IDs");
  check(schema.engagementInputSchema.safeParse(first).success,"client produces valid recorder payload");
  check(beacons[0].url==="/api/analytics/events","first-party telemetry only");
  override("navigator",{sendBeacon:()=>false});tracker.trackBrandEngagement("rast","loyalty_qr_visit");
  check(fetches[0].options.keepalive && fetches[0].options.credentials==="same-origin","fallback survives navigation without blocking");
  override("localStorage",{getItem:()=>{throw new Error("blocked");},setItem:()=>{throw new Error("blocked");}});
  const blocked=load("lib/analytics/public-tracking.ts");blocked.trackBrandEngagement("rast","menu_view");blocked.trackBrandEngagement("rast","menu_loyalty_click");
  check(JSON.parse(fetches[1].options.body).visitorId===JSON.parse(fetches[2].options.body).visitorId,"blocked storage uses stable current-session identifier");
  const tracked=[],listeners=new Map();
  const doc={visibilityState:"hidden",addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
  override("document",doc);
  let ref,effect;
  const page=load("components/analytics/public-page-analytics.tsx",{
    react:{useRef:initial=>ref??={current:initial},useEffect:run=>{effect=run;}},
    "@/lib/analytics/public-tracking":{trackBrandEngagement:(...args)=>tracked.push(args)},
  });
  page.PublicPageAnalytics({slug:"rast",kind:"menu_view"});let cleanup=effect();
  check(tracked.length===0,"hidden page/prefetch never counted");doc.visibilityState="visible";listeners.get("visibilitychange")();listeners.get("visibilitychange")();
  check(tracked.length===1,"visible page counted once across visibility changes");cleanup();
  page.PublicPageAnalytics({slug:"rast",kind:"menu_view"});cleanup=effect();
  check(tracked.length===1,"React repeated mount effect does not duplicate");cleanup();check(listeners.size===0,"visibility listener cleaned up");

  const slots=[],effects=[],pending=[],requests=[];
  let cursor=0,tree;
  const react={useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],next=>{slots[index]=typeof next==="function"?next(slots[index]):next;}];},
    useEffect(run,deps){const index=cursor++;if(!effects[index]||deps.some((value,i)=>!Object.is(value,effects[index].deps[i])))pending.push(()=>{effects[index]?.cleanup?.();effects[index]={deps,cleanup:run()};});}};
  const panel=load("components/admin/brand-analytics-panel.tsx",{react,"@/app/actions/brand-analytics":{loadBrandAnalyticsAction:input=>new Promise(resolve=>requests.push({input,resolve}))}});
  const render=()=>{cursor=0;tree=panel.BrandAnalyticsPanel({brandId:id(1)});pending.splice(0).forEach(run=>run());return renderToStaticMarkup(tree);};
  const nodes=node=>Array.isArray(node)?node.flatMap(nodes):!node||typeof node!=="object"?[]:[node,...nodes(node.props?.children)];
  const find=predicate=>nodes(tree).find(predicate);
  check(render().includes("جارٍ تحميل"),"accessible initial loading state");
  requests[0].resolve({ok:false,message:"تعذر الاختبار"});await Promise.resolve();await Promise.resolve();
  check(render().includes('role="alert"') && !render().includes("عمليات الختم المؤكدة"),"failure never displays misleading zero counts");
  find(node=>node.type==="button"&&node.props.children==="إعادة المحاولة").props.onClick();render();
  requests[1].resolve({ok:true,data});await Promise.resolve();await Promise.resolve();const html=render();
  check(html.includes("عمليات الختم المؤكدة") && html.includes("رابط حفظ صادر") && html.includes("ليس هوية عميل مؤكدة"),"confirmed-only operations and honest measurement copy");
  find(node=>node.type==="input"&&node.props["aria-label"]==="بداية فترة الإحصاءات").props.onChange({target:{value:"2026-10-05"}});render();
  find(node=>node.type==="form").props.onSubmit({preventDefault(){}});render();
  check(requests[2].input.from==="2026-10-05" && !render().includes("عمليات الختم المؤكدة"),"filter starts fresh load and hides previous counts");
  find(node=>node.type==="button"&&node.props.children==="كل الفترات").props.onClick();render();
  requests[2].resolve({ok:true,data});await Promise.resolve();await Promise.resolve();
  check(render().includes("جارٍ تحميل"),"superseded date request cannot overwrite current results");
  requests[3].resolve({ok:true,data:{...data,engagement:{},confirmed:{},wallet:{customers:0,issuances:0,appleCustomers:0,appleDownloads:0,googleCustomers:0,googleSaveLinks:0}}});
  await Promise.resolve();await Promise.resolve();check(render().includes("عمليات الختم المؤكدة"),"valid empty aggregate renders zero counters");
  effects.forEach(item=>item?.cleanup?.());
} finally {
  for (const [name,descriptor] of Object.entries(originals)) {
    if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
  }
}
console.log(`PASS brand analytics API/client/admin UI: ${checks} checks`);
