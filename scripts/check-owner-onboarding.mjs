import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root=fileURLToPath(new URL("..",import.meta.url)), requireDependency=createRequire(import.meta.url);
function load(file,stubs={}) {
  const result={}; const output=ts.transpileModule(fs.readFileSync(path.join(root,file),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require","exports",output)(name=>{
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name==="server-only")return {};
    if(name.startsWith("@/"))return load(`${name.slice(2)}.ts`,stubs);
    if(name.endsWith(".module.css"))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
    return requireDependency(name);
  },result);return result;
}
let checks=0;
async function test(run){await run();checks++;}
const valid={brandNameAr:"علامة الاختبار",brandNameEn:"Test Brand",ownerName:"Test Owner",email:"owner@example.invalid",phone:"0511111111",mapsUrl:"https://google.com/maps?q=24,46",couponCode:""};
function context(options={}) {
  const events=[], jar=new Map(); let capturedCode="";
  const rpc=async(name,args)=>{events.push({name,args});
    if(name==="begin_owner_onboarding")return {data:{ok:!options.limited},error:null};
    if(name==="verify_owner_onboarding")return {data:{ok:!options.badCode},error:null};
    if(name==="get_verified_owner_onboarding")return {data:options.unverified?null:{draft:valid,phone:"966511111111"},error:null};
    return {data:true,error:null};
  };
  const stubs={
    "next/headers":{cookies:async()=>({get:key=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key,val,config)=>{jar.set(key,val);events.push({name:"cookie",config});},delete:key=>jar.delete(key)}),headers:async()=>new Headers()},
    "@/lib/barndaksa/env":{getSupabaseServiceRoleKey:()=>"test-secret-never-production"},
    "@/lib/supabase/admin":{createAdminClient:()=>({rpc,auth:{admin:{createUser:async input=>{events.push({name:"createUser",input});return {data:{user:{id:"new-owner"}},error:options.createError?{}:null};}}}})},
    "@/lib/supabase/server":{createClient:async()=>({auth:{signInWithPassword:async input=>{events.push({name:"signIn",input});return {data:{session:options.signInError?null:{}},error:null};}}})},
    "@/lib/maps/resolve-branch-location":{resolveBranchGoogleMapsUrl:async()=>{if(options.mapError)throw Error("unavailable");return {latitude:24,longitude:46};}},
    "@/lib/whatsapp/green-api":{isGreenApiConfigured:()=>!options.unconfigured,sendGreenApiOtp:async input=>{capturedCode=input.code;events.push({name:"provider"});if(options.providerError)throw Error("provider-error");return {providerMessageId:"test"};}},
  };
  return {api:load("lib/auth/owner-onboarding.ts",stubs),events,jar,get code(){return capturedCode;}};
}
await test(async()=>{const c=context();assert.equal((await c.api.completeOwnerOnboarding({password:"12345678",confirmPassword:"12345678"})).ok,false);assert.equal(c.events.length,0);});
for(const mapsUrl of ["https://evil.invalid/maps","https://google.com.evil.invalid/maps","https://user:pass@google.com/maps","https://google.com:99/maps","http://google.com/maps"])
  await test(async()=>{const c=context();assert.equal((await c.api.requestOwnerOnboarding({...valid,mapsUrl})).ok,false);assert.equal(c.events.length,0);});
await test(async()=>{const c=context({limited:true});assert.equal((await c.api.requestOwnerOnboarding(valid)).ok,false);assert(!c.events.some(e=>e.name==="provider"));assert.equal(c.jar.size,0);});
await test(async()=>{const c=context({providerError:true});assert.equal((await c.api.requestOwnerOnboarding(valid)).ok,false);assert.equal(c.jar.size,0);assert(c.events.some(e=>e.name==="mark_owner_onboarding_sent"&&e.args.p_sent===false));});
await test(async()=>{const c=context({unconfigured:true});assert.equal((await c.api.requestOwnerOnboarding(valid)).ok,false);assert.equal(c.events.length,0);});
await test(async()=>{const c=context({mapError:true});assert.equal((await c.api.requestOwnerOnboarding(valid)).ok,true);assert(c.events.some(e=>e.name==="mark_owner_onboarding_sent"&&e.args.p_sent===true));});
await test(async()=>{const c=context();assert.equal((await c.api.requestOwnerOnboarding(valid)).ok,true);assert.match(c.code,/^\d{6}$/);const event=c.events.find(e=>e.name==="begin_owner_onboarding");assert.equal(event.args.p_phone,"966511111111");assert.equal(event.args.p_code_hash.length,64);assert(!JSON.stringify(event).includes(`"${c.code}"`));assert(!JSON.stringify(event).includes("password"));const cookie=c.events.find(e=>e.name==="cookie");assert(cookie.config.httpOnly);assert.equal(cookie.config.sameSite,"lax");});
await test(async()=>{const c=context({unverified:true});await c.api.requestOwnerOnboarding(valid);const result=await c.api.completeOwnerOnboarding({password:"12345678",confirmPassword:"12345678",verified:true});assert(!result.ok);assert(!c.events.some(e=>e.name==="createUser"));});
await test(async()=>{const c=context();await c.api.requestOwnerOnboarding(valid);assert((await c.api.verifyOwnerOnboarding(c.code)).ok);assert(!(await c.api.completeOwnerOnboarding({password:"12345678",confirmPassword:"wrongpass"})).ok);assert(!c.events.some(e=>e.name==="createUser"));});
await test(async()=>{const c=context();await c.api.requestOwnerOnboarding(valid);await c.api.verifyOwnerOnboarding(c.code);const result=await c.api.completeOwnerOnboarding({password:"12345678",confirmPassword:"12345678"});assert(result.ok);assert.equal(result.redirectTo,"/dashboard/menu");const creation=c.events.find(e=>e.name==="createUser").input;assert.equal(creation.phone_confirm,true);assert.equal(creation.email_confirm,false);assert.equal(creation.email,undefined);assert.equal(creation.app_metadata.owner_onboarding_proof.length,64);assert(!creation.user_metadata.primary_branch_name);assert.equal(c.jar.size,0);assert.equal(c.events.find(e=>e.name==="signIn").input.phone,"+966511111111");});
await test(async()=>{const c=context({createError:true});await c.api.requestOwnerOnboarding(valid);const result=await c.api.completeOwnerOnboarding({password:"12345678",confirmPassword:"12345678"});assert(!result.ok);assert(!c.events.some(e=>e.name==="signIn"));});
await test(async()=>{const c=context({signInError:true});await c.api.requestOwnerOnboarding(valid);const result=await c.api.completeOwnerOnboarding({password:"12345678",confirmPassword:"12345678"});assert(result.ok);assert.equal(result.redirectTo,"/login");});
await test(()=>{const Page=load("app/register/page.tsx",{"next/link":{__esModule:true,default:"a"},"@/app/actions/auth":{},"@/components/ui/barndaksa-logo":{BarndaksaLogo:()=>React.createElement("span",null,"brand")}}).default;const html=renderToStaticMarkup(React.createElement(Page));assert.equal((html.match(/<input/g)||[]).length,7);assert(!html.includes('type="password"'));assert(!html.includes("Mapbox"));assert(html.includes("تحقق واتساب"));assert(html.includes("٧ أيام"));});

function loginContext(options={}) {
  const calls=[];const chain=data=>{const builder=new Proxy({}, {get:(_,key)=>key==="maybeSingle"?async()=>({data,error:null}):()=>builder});return builder;};
  const stubs=Object.fromEntries([...fs.readFileSync(path.join(root,"app/actions/auth.ts"),"utf8").matchAll(/from "(@\/[^\"]+)"/g)].map(match=>[match[1],{}]));
  const user={id:"owner",phone:"+966511111111",email:options.attachedEmail?"unverified@example.invalid":undefined,phone_confirmed_at:options.unconfirmed?null:"2026-10-09",app_metadata:options.noMarker?{}:{owner_onboarding_id:"verified"},user_metadata:{}};
  Object.assign(stubs,{
    "next/headers":{},"next/navigation":{},
    "@/lib/auth/phone-otp":{normalizeSaudiPhone:raw=>raw.replace(/\D/g,"").replace(/^05/,"9665")},
    "@/lib/supabase/server":{createClient:async()=>({auth:{signInWithPassword:async input=>{calls.push(input);return input.phone&&!options.badPassword?{data:{user:{...user,id:options.foreignUser?"foreign":"owner"},session:{}},error:null}:{data:{user:null,session:null},error:{code:"invalid_credentials"}};},signOut:async()=>{calls.push("signOut");}},from:table=>chain(table==="profiles"?{id:"owner",full_name:"Owner",email:valid.email,role:"cafe_owner",status:"active"}:{cafe_id:"cafe",cafes:{id:"cafe",business_category:"cafes_coffee"}})})},
    "@/lib/supabase/admin":{createAdminClient:()=>({from:()=>chain({id:"owner",phone:options.phoneMismatch?"966522222222":"966511111111"}),auth:{admin:{getUserById:async()=>({data:{user}})}}})},
    "@/lib/platform/business-categories":{getDashboardPathForCategory:()=>"/dashboard"},
    "@/lib/data/operation-events":{operationEventTypes:{brandLogin:"brand_login"},recordOperationEvent:async()=>{}},
    "@/lib/data/representatives":{loginRepresentativeWithPassword:async()=>null},
    "@/lib/data/cashier":{loginCashierWithPassword:async()=>null},
  });
  return {api:load("app/actions/auth.ts",stubs),calls};
}
await test(async()=>{const c=loginContext();const result=await c.api.loginOwnerAction(valid.email,"password");assert(result.ok);assert.equal(c.calls.length,2);assert.equal(c.calls[1].phone,"+966511111111");});
await test(async()=>{const c=loginContext();const result=await c.api.loginOwnerAction("0511111111","password");assert(result.ok);assert.equal(c.calls.length,1);assert.equal(c.calls[0].phone,"+966511111111");});
for(const options of [{noMarker:true},{unconfirmed:true},{phoneMismatch:true},{attachedEmail:true},{badPassword:true},{foreignUser:true}])await test(async()=>{const c=loginContext(options);const result=await c.api.loginOwnerAction(valid.email,"password");assert(!result.ok);assert.equal(result.message,"بيانات الدخول غير صحيحة");if(options.foreignUser)assert(c.calls.includes("signOut"));});

function changePasswordContext(options={}) {
  const calls=[]; const user={id:"owner",phone:options.noIdentity?undefined:"+966511111111",email:options.email?valid.email:undefined};
  const profile={role:"cafe_owner",status:"active"};
  const chain=new Proxy({}, {get:(_,key)=>key==="maybeSingle"?async()=>({data:profile,error:null}):()=>chain});
  const stubs=Object.fromEntries([...fs.readFileSync(path.join(root,"app/actions/auth.ts"),"utf8").matchAll(/from "(@\/[^\"]+)"/g)].map(match=>[match[1],{}]));
  Object.assign(stubs,{
    "next/headers":{},"next/navigation":{},
    "@/lib/barndaksa/env":{requireSupabaseUrl:()=>"https://example.invalid",requireSupabaseAnonKey:()=>"test"},
    "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user},error:null})},from:()=>chain})},
    "@supabase/supabase-js":{createClient:()=>({auth:{signInWithPassword:async input=>{calls.push({name:"verify",input});return {data:{user:{id:options.foreignUser?"foreign":"owner"}},error:null};},signOut:async()=>{calls.push({name:"verifySignOut"});}}})},
    "@/lib/supabase/admin":{createAdminClient:()=>({auth:{admin:{updateUserById:async(id,input)=>{calls.push({name:"update",id,input});return {error:null};}}}})},
  });
  return {api:load("app/actions/auth.ts",stubs),calls};
}
for(const email of [false,true]) await test(async()=>{const c=changePasswordContext({email});const result=await c.api.changeOwnerPasswordAction({currentPassword:"oldPassword",newPassword:"newPassword",confirmPassword:"newPassword"});assert(result.ok);assert.deepEqual(c.calls[0].input,email?{email:valid.email,password:"oldPassword"}:{phone:"+966511111111",password:"oldPassword"});assert.equal(c.calls[1].name,"verifySignOut");assert.equal(c.calls[2].id,"owner");});
for(const options of [{foreignUser:true},{noIdentity:true}]) await test(async()=>{const c=changePasswordContext(options);const result=await c.api.changeOwnerPasswordAction({currentPassword:"oldPassword",newPassword:"newPassword",confirmPassword:"newPassword"});assert(!result.ok);assert(!c.calls.some(call=>call.name==="update"));});
console.log(`PASS owner onboarding: ${checks} isolated actual server/SSR checks; no live provider messages.`);
