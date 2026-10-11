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
  const calls=[],customerRequests=[];let contextCalls=0,featureCalls=0,dbCalls=0;
  const rows=options.rows??[fixture(1),fixture(2),fixture(3,"brand-two")];
  const db={auth:{getUser:async()=>({data:{user:options.user===false?null:{id:"owner-id"}}})},from:table=>{
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
  return{api,calls,customerRequests,counters:()=>({contextCalls,featureCalls,dbCalls})};
}

for(const options of [{contextError:true},{slug:"other-brand"},{role:"staff"},{role:"unknown"},{features:[]},{user:false},
  {profileStatus:"suspended"},{profileMissing:true},{profileError:true},{brandStatus:"suspended"},{brandMissing:true},{brandError:true}]){
  const h=await harness(options);await rejects(()=>h.api.getOwnerLoyaltyCustomers(),"list fails closed without full authorization");
  await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(customerId(1)),"detail independently fails closed without full authorization");
  equal(h.customerRequests.length,0,"denied identity never queries customer rows");
}
for(const role of ["owner","manager","platform_admin"]){const h=await harness({role});equal((await h.api.getOwnerLoyaltyCustomers()).total,2,"authorized role can list current tenant");}
let h=await harness({brandStatus:"published"});equal((await h.api.getOwnerLoyaltyCustomers()).total,2,"published brand supported");
for(const input of [{page:-1},{page:1.1},{page:100001},{page:"1"},{query:"x".repeat(101)},{query:1}]){
  h=await harness();await rejects(()=>h.api.getOwnerLoyaltyCustomers(input),"invalid filter rejected");equal(h.counters().contextCalls,0,"invalid filters rejected before DB access");
}
for(const input of ["wrong",null,12,"00000000-0000-4000-8000-000000000001,phone"]){h=await harness();await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(input),"invalid customer UUID rejected");equal(h.calls.length,0,"invalid identity never reaches DB");}
h=await harness();let result=await h.api.getOwnerLoyaltyCustomers();
equal(result,{rows:[{id:customerId(1),name:"Customer 1",joinedAt:"2026-10-10T12:00:00Z"},{id:customerId(2),name:"Customer 2",joinedAt:"2026-10-10T12:00:00Z"}],total:2,page:0,pageSize:20},"list serializes names and join times only");
check(!JSON.stringify(result).includes("private"),"no phone or email leaks even when mocked DB returns extra fields");
equal(h.customerRequests[0].select,"id,full_name,created_at","list requests only safe fields");equal(h.customerRequests[0].selectOptions,{count:"exact"},"server gets exact pagination count");
equal(h.customerRequests[0].eq,[["cafe_id","brand-one"]],"list tenant filter is mandatory");
equal(h.customerRequests[0].range,[0,19],"list fetch bounded at twenty");
equal(h.customerRequests[0].orders,[["created_at",{ascending:false}],["id",{ascending:false}]],"stable pagination ordering");
equal(h.calls.find(x=>x.table==="profiles").eq,[["id","owner-id"]],"status check uses authenticated user");
equal(h.calls.find(x=>x.table==="cafes").is,[["deleted_at",null]],"deleted cafe excluded");
h=await harness();await h.api.getOwnerLoyaltyCustomers({query:"  A%_\\B  "});
equal(h.customerRequests[0].ilike,["full_name","%A\\%\\_\\\\B%"],"search trims edges and escapes wildcard and backslash literals");
h=await harness({rows:Array.from({length:25},(_,i)=>fixture(i+1))});result=await h.api.getOwnerLoyaltyCustomers({page:50});
equal(result.page,1,"out-of-range page clamps to last available page");equal(result.rows.length,5,"clamped page refetched");
equal(h.customerRequests.map(x=>x.range),[[1000,1019],[20,39]],"clamp uses fresh bounded query");
h=await harness({rows:[]});result=await h.api.getOwnerLoyaltyCustomers({page:3});equal(result.page,0,"empty directory clamps to first page");equal(result.total,0,"empty directory count honest");
h=await harness({customerError:true});await rejects(()=>h.api.getOwnerLoyaltyCustomers(),"list DB error is not empty success");
h=await harness({clampError:true});await rejects(()=>h.api.getOwnerLoyaltyCustomers({page:9}),"clamp refetch error is not swallowed");
h=await harness();let detail=await h.api.getOwnerLoyaltyCustomerDetail(customerId(1));
equal(detail,{id:customerId(1),name:"Customer 1",phone:"private-phone-1"},"detail reveals one selected phone only");
equal(h.customerRequests[0].select,"id,full_name,phone","detail never selects email or unrelated fields");
equal(h.customerRequests[0].eq,[["cafe_id","brand-one"],["id",customerId(1)]],"detail requires both tenant and exact selected UUID");
check(!JSON.stringify(detail).includes("email"),"detail never returns email");
await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(customerId(3)),"known customer UUID in other cafe denied");
await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(customerId(999)),"unknown selected customer denied");
h=await harness({rows:[{...fixture(1),full_name:"",phone:null}]});detail=await h.api.getOwnerLoyaltyCustomerDetail(customerId(1));
equal(detail.phone,null,"missing contact remains explicitly unavailable");check(detail.name.length>0,"missing name has readable fallback");
h=await harness({customerError:true});await rejects(()=>h.api.getOwnerLoyaltyCustomerDetail(customerId(1)),"detail DB failure rejected");

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
const page=await load("app/dashboard/loyalty/page.tsx",{
  "react/jsx-runtime":{jsx,jsxs:jsx,Fragment:"Fragment"},
  "@/components/dashboard/pages/loyalty-dashboard-page":{LoyaltyDashboardPage:"GenericLoyalty"},
  "@/components/dashboard/feature-blocked-state":{DashboardFeatureBlockedState:"Blocked"},
  "@/lib/data/feature-entitlements":{getOwnerFeatureCodes:async()=>["loyalty"]},
  "@/lib/data/loyalty-cards":{getOwnerLoyaltyCardsDashboard:async()=>({cafeSlug:"rast",cafeId:"brand-one",program:{enabled:true},cards:[{phone:"private-bulk-phone"}],customers:[{email:"private-bulk-email"}]})},
  "@/lib/data/loyalty":{getOwnerLoyalty:async()=>({settings:{}})},
  "@/lib/platform/feature-gates":{featureCodesAllow:()=>true},
  "@/components/rast-loyalty/rast-dashboard":{RastLoyaltyDashboard:"RastLoyaltyDashboard"},
  "@/lib/data/loyalty-experience":{getLoyaltyBrand:async()=>brandAvailable?({identity:{brandName:"Kawakib"}}):null,getLoyaltyExperience:async()=>({})},
  "@/lib/loyalty/experience-types":{defaultLoyaltyExperience:{}},
  "@/lib/wallet":{getWalletReadiness:()=>({})},
  "@/lib/data/menu":{getOwnerMenu:async()=>({products:[{id:"product-one",name:"Tea",private:"excluded"}]})},
  "@/components/loyalty/loyalty-activity-log":{LoyaltyActivityLog:"ActivityLog"},
  "@/app/actions/loyalty-activity":{loadLoyaltyActivityAction:async()=>({ok:true,data:[]})},
  "@/lib/loyalty/activity-types":{defaultLoyaltyActivityFilters:()=>({})},
});
const rendered=await page.default();
const find=node=>{if(!node||typeof node!=="object")return null;if(node.type==="RastLoyaltyDashboard")return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child);if(found)return found;}return null;};
const rast=find(rendered);check(!!rast,"Rast owner receives intended client component");
equal(rast.props.initialDashboard,{program:{enabled:true}},"server passes program only to Rast client");
check(!JSON.stringify(rendered).includes("private-bulk-phone")&&!JSON.stringify(rendered).includes("private-bulk-email"),"rendered client props exclude bulk customer contacts");
equal(rast.props.products,[{id:"product-one",name:"Tea"}],"product props also use explicit safe projection");
brandAvailable=false;
const unavailable=await page.default();
equal(unavailable.props.role,"alert","missing brand fails closed with an alert");
check(!JSON.stringify(unavailable).includes("private-bulk"),"missing brand never falls through to bulk contact dashboard");
console.log(`PASS ${checks} mocked loyalty directory authorization privacy pagination and server-prop checks`);
