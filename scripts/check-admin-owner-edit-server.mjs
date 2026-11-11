import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('lib/data/admin-brand-onboarding.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const input={cafeId:'fixture-cafe',requestId:'fixture-edit',ownerName:'Fixture',phone:'966511111111',email:'',password:''};
let checks=0;
for(const [error,expected] of [
 [{code:'phone_exists',status:422},/رقم الجوال مرتبط بحساب موجود/],
 [{code:'email_exists',status:422},/البريد الإلكتروني مرتبط بحساب آخر/],
 [{code:'weak_password',status:422},/كلمة المرور لا تحقق متطلبات الأمان/],
 [{code:'unexpected_failure',status:500,message:'private provider payload'},/خطأ في خدمة الحساب/],
]){
 const calls=[],logs=[];let preparations=0;
 const exports={};const stubs={
  'server-only':{},'node:crypto':{randomUUID:()=> 'fixture-attempt'},zod:{},
  '@/lib/data/cafes':{requirePlatformAdmin:async()=>({id:'fixture-admin'})},
  '@/lib/auth/brand-welcome-secret':{accountFingerprint:()=> 'fingerprint',sealWelcomePassword:()=>{throw Error('Password must remain unchanged')}},
  '@/lib/platform/brand-onboarding':{adminBrandOwnerSchema:{safeParse:raw=>({success:true,data:raw})}},
  '@/lib/whatsapp/green-api':{},
  '@/lib/supabase/admin':{createAdminClient:()=>({
   rpc:async(name)=>{calls.push(name);if(name==='admin_prepare_brand_owner_edit'){preparations++;return {data:{done:false,ownerId:'fixture-owner',proof:'fixture-proof'}}}return {data:null}},
   auth:{admin:{updateUserById:async(id,body)=>{assert.equal(id,'fixture-owner');assert.equal('password' in body,false);return {error}}}},
  })},
 };
 new Function('require','exports','console',code)(name=>{assert(name in stubs,name);return stubs[name]},exports,{error:(...args)=>logs.push(args)});
 await assert.rejects(()=>exports.updateAdminBrandOwner(input),expected);
 assert.equal(preparations,2);assert.equal(calls.at(-1),'admin_cancel_brand_owner_edit');
 assert(!JSON.stringify(logs).includes('private provider payload'));
 if(error.code==='unexpected_failure')assert.equal(logs[0][1].code,error.code);
 checks++;
}
console.log(`PASS ${checks} owner edit error mappings, cancellation, password preservation and sanitized diagnostics`);
