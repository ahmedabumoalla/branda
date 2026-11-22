import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const requireDependency=createRequire(import.meta.url);
let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const rejects=async(fn,label)=>{await assert.rejects(fn,undefined,label);checks++;};
async function load(file,stubs={}){
  const text=await readFile(file,"utf8");
  const code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={};
  new Function("require","exports",code)(name=>{
    if(name==="server-only")return {};
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name==="zod")return requireDependency(name);
    throw new Error(`Unmocked dependency ${name}`);
  },exports);
  return exports;
}
const customerId=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const fixture=(n,cafe="brand-one")=>({id:customerId(n),cafe_id:cafe,full_name:`Customer ${n}`,created_at:"2026-10-10T12:00:00Z",phone:`private-phone-${n}`,email:`private-${n}@example.test`});
async function harness(options={}){
  const calls=[],customerRequests=[],rpcCalls=[];let contextCalls=0,featureCalls=0,dbCalls=0;
  const rows=options.rows??[fixture(1),fixture(2),fixture(3,"brand-two")];
  const defaultPage={rows:[],total:2,page:0,pageSize:20};
  const db={rpc:async(name,args)=>{
    rpcCalls.push({name,args});
    if(options.rpcError)return {data:null,error:{message:"denied"}};
    if(options.rpcData)return {data:options.rpcData,error:null};
    if(name==="loyalty_customer_directory_page")return {data:defaultPage,error:null};
    assert.equal(name,"loyalty_customer_directory_detail");
    const row=rows.find(row=>row.id===args.p_customer&&row.cafe_id===args.p_cafe);
    return {data:row?{id:row.id,name:row.full_name||"عميل بدون اسم",phone:row.phone,email:row.email,birthdayEnabled:false,birthDate:null,loyalty:null}:null,error:null};
  },auth:{getUser:async()=>({data:{user:options.user===false?null:{id:"owner-id"}}})},from:table=>{
    const entry={table,select:null,selectOptions:null,eq:[],is:[],orders:[],range:null,ilike:null,single:false};calls.push(entry);
    const chain={
      select:(fields,settings)=>{entry.select=fields;entry.selectOptions=settings;return chain;},
      eq:(key,value)=>{entry.eq.push([key,value]);return chain;},
      is:(key,value)=>{entry.is.push([key,value]);return chain;},
      order:(key,value)=>{entry.orders.push([key,value]);return chain;},
      range:(from,to)=>{entry.range=[from,to];return chain;},
      ilike:(key,value)=>{entry.ilike=[key,value];return chain;},
      maybeSingle:()=>{entry.single=true;return chain;},
      then:(resolve,reject)=>Promise.resolve().then(()=>{
        if(table==="profiles")return{data:options.profileMissing?null:{status:options.profileStatus??"active"},error:options.profileError?{message:"private profile failure"}:null};
        if(table==="cafes")return{data:options.brandMissing?null:{status:options.brandStatus??"active"},error:options.brandError?{message:"private brand failure"}:null};
        if(table!=="customer_profiles")throw new Error(`Unexpected query ${table}`);
        customerRequests.push(entry);
        if(options.customerError || (options.clampError&&customerRequests.length>1))return{data:null,count:null,error:{message:"private customer phone secret DB error"}};
        let scoped=rows.filter(row=>entry.eq.every(([key,value])=>row[key]===value));
        const count=scoped.length;
        if(entry.range)scoped=scoped.slice(entry.range[0],entry.range[1]+1);
        // Deliberately return extra private fields to verify explicit response mapping
        return{data:entry.single?(scoped[0]??null):scoped,count,error:null};
      }).then(resolve,reject),
    };return chain;
  }};
  const api=await load("lib/data/loyalty-customers.ts",{
    "@/lib/data/cafes":{requireOwnerCafeContext:async()=>{contextCalls++;if(options.contextError)throw new Error("private auth error");return{id:"brand-one",slug:options.slug??"rast",role:options.role??"owner"};}},
    "@/lib/data/feature-entitlements":{getCafeFeatureCodes:async cafe=>{featureCalls++;equal(cafe,"brand-one","entitlement uses server-resolved cafe");return options.features??["loyalty"]; }},
    "@/lib/supabase/server":{createClient:async()=>{dbCalls++;return db;}},
  });
  return{api,calls,customerRequests,rpcCalls,counters:()=>({contextCalls,featureCalls,dbCalls})};
}

for(const options of [{contextError:true},{role:"staff"},{role:"unknown"},{features:[]},{user:false},
  {profileStatus:"suspended"},{profileMissing:true},{profileError:true},{brandStatus:"suspended"},{brandMissing:true},{brandError:true}]){
  const h=await harness(options);await rejects(()=>h.api.getOwnerLoyaltyCustomers(),"list fails closed without full authorization");
  await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(customerId(1)),"detail independently fails closed without full authorization");
  equal(h.customerRequests.length,0,"denied identity never queries customer rows");
}
for(const role of ["owner","manager","platform_admin"]){const h=await harness({role});equal((await h.api.getOwnerLoyaltyCustomers()).total,2,"authorized role can list current tenant");}
for(const slug of ["basilico","test-cafe","new-brand"]){const h=await harness({slug});equal((await h.api.getOwnerLoyaltyCustomers()).total,2,"every entitled brand can list its own customers");}
let h=await harness({brandStatus:"published"});equal((await h.api.getOwnerLoyaltyCustomers()).total,2,"published brand supported");
for(const input of [{page:-1},{page:1.1},{page:100001},{page:"1"},{query:"x".repeat(101)},{query:1}]){
  h=await harness();await rejects(()=>h.api.getOwnerLoyaltyCustomers(input),"invalid filter rejected");equal(h.counters().contextCalls,0,"invalid filters rejected before DB access");
}
for(const input of ["wrong",null,12,"00000000-0000-4000-8000-000000000001,phone"]){h=await harness();await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(input),"invalid customer UUID rejected");equal(h.calls.length,0,"invalid identity never reaches DB");}
h=await harness();await h.api.getOwnerLoyaltyCustomers({page:3,query:"  A%_  "});
equal(h.rpcCalls,[{name:"loyalty_customer_directory_page",args:{p_cafe:"brand-one",p_query:"A%_",p_page:3,p_members_only:false}}],"general view passes bounded input and server-derived tenant for a single consistent query");
equal(h.calls.find(x=>x.table==="profiles").eq,[["id","owner-id"]],"status check uses authenticated user");
equal(h.calls.find(x=>x.table==="cafes").is,[["deleted_at",null]],"deleted cafe excluded");
h=await harness({rpcError:true});await rejects(()=>h.api.getOwnerLoyaltyCustomers(),"list DB error is not empty success");
h=await harness();let detail=await h.api.getOwnerLoyaltyCustomerDetail(customerId(1));
equal(detail,{id:customerId(1),name:"Customer 1",phone:"private-phone-1",birthdayEnabled:false,birthDate:null,loyalty:null},"profile without an issued card has no fabricated balances");
equal(h.rpcCalls,[{name:"loyalty_customer_directory_detail",args:{p_cafe:"brand-one",p_customer:customerId(1),p_members_only:false}}],"single profile lookup uses exact tenant, customer and scope");
check(!JSON.stringify(detail).includes("email"),"detail never returns email");
await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(customerId(3)),"known customer UUID in other cafe denied");
await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(customerId(999)),"unknown selected customer denied");
h=await harness({rows:[{...fixture(1),full_name:"",phone:null}]});detail=await h.api.getOwnerLoyaltyCustomerDetail(customerId(1));
equal(detail.phone,null,"missing contact remains explicitly unavailable");check(detail.name.length>0,"missing name has readable fallback");
h=await harness({rpcError:true});await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(customerId(1)),"detail DB failure rejected");

const loyalty={mode:"points",stampsInCycle:1,stampsCollected:8,rewardsRedeemed:2,availableStampRewards:0,pointsEarned:211,pointsSpent:200,pointsBalance:11,affordablePointRewards:0};
const downloadedPage={rows:[{id:customerId(1),name:"Wallet customer",joinedAt:"2026-11-14T00:00:00Z",loyalty}],total:1,page:0,pageSize:20};
h=await harness({rpcData:{...downloadedPage,rows:downloadedPage.rows.map(row=>({...row,phone:"must-not-leak",email:"must-not-leak"}))}});
equal(await h.api.getOwnerLoyaltyCustomers({downloadedOnly:true,page:2,query:"  Wallet  "}),downloadedPage,"downloaded directory uses bounded authorized RPC result");
equal(h.rpcCalls,[{name:"loyalty_customer_directory_page",args:{p_cafe:"brand-one",p_page:2,p_query:"Wallet",p_members_only:true}}],"downloaded RPC uses server-resolved tenant and parsed filters");
equal(h.customerRequests.length,0,"downloaded directory never falls back to all profiles");
const downloadedDetail={id:customerId(1),name:"Wallet customer",phone:"selected-phone",birthdayEnabled:true,birthDate:null,loyalty};
h=await harness({rpcData:downloadedDetail});
equal(await h.api.getOwnerLoyaltyCustomerDetail(customerId(1),true),downloadedDetail,"downloaded modal uses membership-guarded detail RPC");
equal(h.rpcCalls,[{name:"loyalty_customer_directory_detail",args:{p_cafe:"brand-one",p_customer:customerId(1),p_members_only:true}}],"member detail remains exact tenant and customer");
equal(h.customerRequests.length,0,"downloaded detail cannot fall back to unrelated profile");
for(const run of [api=>api.getOwnerLoyaltyCustomers({downloadedOnly:true}),api=>api.getOwnerLoyaltyCustomerDetail(customerId(1),true)]){
 h=await harness({rpcError:true});await rejects(()=>run(h.api),"downloaded RPC denial is not empty success");equal(h.customerRequests.length,0,"downloaded RPC denial never widens membership");
 h=await harness({profileStatus:"suspended"});await rejects(()=>run(h.api),"downloaded mode keeps account authorization");equal(h.rpcCalls.length,0,"suspended account never reaches download RPC");
}
let throwAction=false,actionCalls=[];
const actions=await load("app/actions/loyalty-customers.ts",{"@/lib/data/loyalty-customers":{
  getOwnerLoyaltyCustomers:async input=>{actionCalls.push(input);if(throwAction)throw new Error("private-query-token customer-phone");return{rows:[],total:0,page:0,pageSize:20};},
  getOwnerLoyaltyCustomerDetail:async id=>{actionCalls.push(id);if(throwAction)throw new Error("private-query-token customer-phone");return{id,name:"One",phone:"selected-phone"};},
}});
check((await actions.loadLoyaltyCustomersAction({page:2})).ok,"list action returns typed success");equal(actionCalls[0],{page:2},"list filter delegated to guarded data function");
check((await actions.loadLoyaltyCustomerDetailAction(customerId(1))).ok,"selected detail action success");
throwAction=true;
for(const operation of [()=>actions.loadLoyaltyCustomersAction(),()=>actions.loadLoyaltyCustomerDetailAction(customerId(1))]){
  const failure=await operation();check(!failure.ok,"action failure is explicit");check(!JSON.stringify(failure).includes("private-query-token")&&!JSON.stringify(failure).includes("customer-phone"),"action never exposes sensitive DB errors");check(/[\u0600-\u06ff]/.test(failure.message),"action failure message readable Arabic");
}

// Execute the server page using a tiny JSX runtime to inspect the actual client props
const jsx=(type,props)=>({type,props});
let brandAvailable=true;
let pageSlug="rast";
const page=await load("components/loyalty/owner-loyalty-page.tsx",{
  "@/lib/data/cafes":{getDashboardCafeContext:async()=>({staff:false})},
  "@/lib/data/nearby-schedule":{getNearbySchedule:async()=>null},
  "@/lib/loyalty/nearby-schedule":{supportsNearbySchedule: cafeId => cafeId === "nearby-demo"},
  "next/navigation":{redirect:()=>{throw new Error("redirect");}},
  "react/jsx-runtime":{jsx,jsxs:jsx,Fragment:"Fragment"},
  "@/components/dashboard/pages/loyalty-dashboard-page":{LoyaltyDashboardPage:"GenericLoyalty"},
  "@/components/dashboard/feature-blocked-state":{DashboardFeatureBlockedState:"Blocked"},
  "@/lib/data/feature-entitlements":{getOwnerFeatureCodes:async()=>["loyalty","menu"]},
  "@/lib/data/loyalty-cards":{getOwnerLoyaltyProgramSettings:async()=>({cafeSlug:pageSlug,cafeId:"brand-one",program:{enabled:true}}),getOwnerLoyaltyRewardProducts:async()=>[{id:"product-one",name:"Tea"}]},
  "@/lib/data/loyalty":{getOwnerLoyalty:async()=>({settings:{}})},
  "@/lib/platform/feature-gates":{featureCodesAllow:(features,code)=>features.includes(code)},
  "@/components/rast-loyalty/rast-dashboard":{RastLoyaltyDashboard:"RastLoyaltyDashboard"},
  "@/lib/data/loyalty-experience":{getLoyaltyBrand:async()=>brandAvailable?({identity:{brandName:"Kawakib"}}):null,getLoyaltyExperience:async()=>({})},
  "@/lib/loyalty/experience-types":{defaultLoyaltyExperience:{}},
  "@/lib/wallet":{getWalletReadiness:()=>({})},
  "@/components/loyalty/loyalty-activity-log":{LoyaltyActivityLog:"ActivityLog"},
  "@/app/actions/loyalty-activity":{loadLoyaltyActivityAction:async()=>({ok:true,data:[]})},
  "@/lib/loyalty/activity-types":{defaultLoyaltyActivityFilters:()=>({})},
});
const rendered=await page.OwnerLoyaltyPage();
const find=node=>{if(!node||typeof node!=="object")return null;if(node.type==="RastLoyaltyDashboard")return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child);if(found)return found;}return null;};
const rast=find(rendered);check(!!rast,"Rast owner receives intended client component");
equal(rast.props.initialDashboard,{program:{enabled:true}},"server passes program only to Rast client");
check(!JSON.stringify(rendered).includes("private-bulk-phone")&&!JSON.stringify(rendered).includes("private-bulk-email"),"rendered client props exclude bulk customer contacts");
equal(rast.props.products,[{id:"product-one",name:"Tea"}],"product props also use explicit safe projection");
for(const slug of ["basilico","test-cafe","new-brand"]){pageSlug=slug;const tree=await page.OwnerLoyaltyPage();const shared=find(tree);check(!!shared,"every entitled brand receives approved loyalty experience");check(shared.props.pointsAvailable,"every entitled brand owner can configure points");check(shared.props.signupUrl.endsWith(`/loyalty/${slug}?source=qr`),"signup URL belongs to current brand");check(!JSON.stringify(tree).includes("private-bulk"),"all brands omit bulk contact props");}
brandAvailable=false;
const unavailable=await page.OwnerLoyaltyPage();
equal(unavailable.props.role,"alert","missing brand fails closed with an alert");
check(!JSON.stringify(unavailable).includes("private-bulk"),"missing brand never falls through to bulk contact dashboard");
console.log(`PASS ${checks} mocked loyalty directory authorization privacy pagination and server-prop checks`);
