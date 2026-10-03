import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";

const root=fileURLToPath(new URL("..",import.meta.url));
const dependency=createRequire(import.meta.url);
let adminCalls=0;
let admittedSlug=null;
const deliveries=[];
const mocks={
  "@/app/actions/loyalty-experience": {},
  "@/lib/supabase/admin": {createAdminClient:()=>({rpc:async(name,args)=>{
    adminCalls++;
    assert.equal(name,"claim_customer_phone_otp_dispatch");
    assert.equal(args.p_provider_instance,"isolated-provider");
    assert.match(args.p_phone_normalized,/^9665\d{8}$/);
    const data=admittedSlug; admittedSlug=null;
    return {data,error:null};
  }})},
  "@/lib/supabase/server": {createClient:()=>{throw new Error("unexpected real auth access");}},
  "@/lib/data/cafes": {},
  "@/lib/auth/customer-phone-auth": {},
  "@/lib/whatsapp/green-api": {
    greenApiProviderInstanceKey:()=>"isolated-provider",
    sendGreenApiSupabaseOtp:async(value)=>{deliveries.push(value);},
  },
};
const cache=new Map();
function load(relative) {
  if(cache.has(relative)) return cache.get(relative);
  const exports={}; cache.set(relative,exports);
  const code=ts.transpileModule(readFileSync(path.join(root,relative),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  new Function("require","exports",code)((name)=>{
    if(Object.hasOwn(mocks,name)) return mocks[name];
    if(name==="server-only") return {};
    if(name.endsWith(".module.css")) return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
    if(name.startsWith("@/") || name.startsWith(".")) {
      const next=name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative),name);
      return load(existsSync(path.join(root,`${next}.tsx`))?`${next}.tsx`:existsSync(path.join(root,`${next}.ts`))?`${next}.ts`:next);
    }
    return dependency(name);
  },exports);
  return exports;
}
const envKeys=["PHONE_OTP_ENABLED","WHATSAPP_PROVIDER","PHONE_OTP_TEST_MODE","PHONE_OTP_ALLOWED_BRAND_SLUGS","PHONE_OTP_ALLOWED_PHONES","SUPABASE_SEND_SMS_HOOK_SECRET"];
const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
const key=randomBytes(32);
Object.assign(process.env,{
  PHONE_OTP_ENABLED:"true",WHATSAPP_PROVIDER:"green_api",PHONE_OTP_TEST_MODE:"true",
  PHONE_OTP_ALLOWED_BRAND_SLUGS:"legacy-test",PHONE_OTP_ALLOWED_PHONES:"966500000001",
  SUPABASE_SEND_SMS_HOOK_SECRET:`v1,whsec_${key.toString("base64")}`,
});
let checks=0;
const expect=(actual,expected,message)=>{assert.equal(actual,expected,message);checks++;};
try {
  const {POST}=load("app/api/auth/hooks/send-sms/route.ts");
  const {isPhoneOtpRequiredForBrand,isAllowedCustomerOtpPhone}=load("lib/auth/phone-otp.ts");
  const body=(phone="+966500000099")=>JSON.stringify({user:{phone},sms:{otp:"123456"}});
  function request(raw=body(),options={}) {
    const id="isolated-webhook-id";
    const timestamp=String(options.timestamp ?? Math.floor(Date.now()/1000));
    const signature=createHmac("sha256",key).update(`${id}.${timestamp}.${raw}`).digest("base64");
    return new Request("https://example.test/api/auth/hooks/send-sms",{
      method:"POST",body:raw,headers:options.unsigned?{}:{
        "webhook-id":id,"webhook-timestamp":timestamp,"webhook-signature":`v1,${options.invalid?"invalid":signature}`,
      },
    });
  }
  expect((await POST(request(body(),{unsigned:true}))).status,401,"missing signature rejected");
  expect((await POST(request(body(),{invalid:true}))).status,401,"invalid signature rejected");
  expect((await POST(request(body(),{timestamp:Math.floor(Date.now()/1000)-301}))).status,401,"expired signature rejected");
  expect((await POST(request(body(),{timestamp:Math.floor(Date.now()/1000)+301}))).status,401,"future signature rejected");
  expect(adminCalls,0,"untrusted hooks cannot access database");
  expect((await POST(request('{"user":{}}'))).status,400,"invalid signed payload rejected");
  expect((await POST(request("x".repeat(32769)))).status,413,"oversized payload rejected");
  expect(adminCalls,0,"invalid payload cannot consume dispatch admission");
  expect((await POST(request(body("+12025550123")))).status,403,"unsupported phone rejected");
  expect(adminCalls,0,"invalid phone does not query database");
  admittedSlug="rast";
  expect((await POST(request())).status,200,"admitted public Rast phone bypasses old test phone list");
  expect(deliveries.length,1,"one WhatsApp send");
  expect(deliveries[0].phoneNormalized,"966500000099","normalized request phone delivered");
  expect((await POST(request())).status,403,"signed hook replay without fresh admitted request rejected");
  expect(deliveries.length,1,"replay cannot send again");
  expect((await POST(request(body("+966500000088")))).status,403,"unadmitted phone rejected");
  expect(deliveries.length,1,"unadmitted phone never sent");
  admittedSlug="legacy-test";
  expect((await POST(request(body("+966500000001")))).status,200,"existing allowed test brand/phone remains supported");
  admittedSlug="legacy-test";
  expect((await POST(request())).status,403,"other-brand test phone restriction retained");
  admittedSlug="unlisted-brand";
  expect((await POST(request(body("+966500000001")))).status,403,"other-brand test slug restriction retained");
  expect(deliveries.length,2,"only valid Rast and existing test sends occurred");
  expect(isPhoneOtpRequiredForBrand("rast"),true,"Rast enabled in test mode");
  expect(isPhoneOtpRequiredForBrand("unlisted-brand"),false,"test mode is not globally broadened");
  expect(isAllowedCustomerOtpPhone("966500000099","rast"),true,"public Rast phone accepted");
  expect(isAllowedCustomerOtpPhone("966500000099","legacy-test"),false,"existing test phone restriction retained");
  process.env.PHONE_OTP_ENABLED="false"; admittedSlug="rast";
  expect((await POST(request())).status,403,"global OTP off blocks delivery");
  process.env.PHONE_OTP_ENABLED="true"; process.env.WHATSAPP_PROVIDER="disabled"; admittedSlug="rast";
  expect((await POST(request())).status,403,"wrong provider blocks delivery");
  const {RastEnrollment}=load("components/rast-loyalty/rast-enrollment.tsx");
  const identity={slug:"rast",name:"Rast",logoUrl:null};
  const renderEnrollment=(enabled,authenticated)=>renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{refresh(){}}},React.createElement(RastEnrollment,{identity,program:{enabled,purchasesRequired:7,rewardName:"Coffee"},authenticated})));
  for(const authenticated of [false,true]) {
    const paused=renderEnrollment(false,authenticated);
    expect(paused.includes("<form"),false,"disabled program has no OTP form for any session");
    expect(paused.includes("<input"),false,"disabled program does not collect customer data");
    expect(paused.includes("<button"),false,"disabled program has no send or blocked-session retry CTA");
    expect(paused.includes('href="/menu/rast"'),true,"disabled program keeps its actual menu link");
  }
  expect(renderEnrollment(true,false).includes('<form'),true,"enabled program retains its enrollment form");
  console.log(`PASS: ${checks} OTP hook and enrollment checks with actual HMAC verification; database/provider isolated, no messages sent.`);
} finally {
  for(const key of envKeys) { if(previous[key]===undefined) delete process.env[key]; else process.env[key]=previous[key]; }
}
