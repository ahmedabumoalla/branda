import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,stubs={}) {
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports={};
  new Function('require','exports',output)(name=>{
    if(name==='server-only')return {};
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts',stubs);
    if(name.startsWith('.'))return load(path.join(path.dirname(file),name)+'.ts',stubs);
    return require(name);
  },exports);
  return exports;
}
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;};
const cafe='10000000-0000-4000-8000-000000000001',profileId='20000000-0000-4000-8000-000000000002';
const base={'@/lib/barndaksa/env':{getSupabaseServiceRoleKey:()=> 'isolated-test-only-signing-key'}};
const tokens=load('lib/auth/loyalty-session-token.ts',base);
const claims={slug:'taza',cafeId:cafe,profileId,phoneHash:tokens.loyaltyIdentityHash('966500000001')};
const now=Date.now(),token=tokens.createLoyaltySessionToken(claims,now);
check(tokens.readLoyaltySessionToken(token,'taza',now)?.profileId===profileId,'Valid scoped token');
for(const [value,slug,time] of [[token,'rast',now],[token,'taza',now+tokens.LOYALTY_SESSION_SECONDS*1000],[token+'x','taza',now],['bad.signature','taza',now],[token.split('.')[0]+'.'+'ع'.repeat(43),'taza',now],['a'.repeat(1300),'taza',now]]) {
  check(tokens.readLoyaltySessionToken(value,slug,time)===null,'Wrong brand, expiry and tampering rejected');
}
check(!Buffer.from(token.split('.')[0],'base64url').toString().includes('966500000001'),'Cookie does not contain raw phone');
let cookie=token,blocked=false,conflict=false,changedPhone=false,wrongCafe=false,dbFailure=false,otpCalls=0;
const filters=[];
const session=load('lib/auth/rast-loyalty-session.ts',{
  ...base,'next/headers':{cookies:async()=>({get:()=>cookie?{value:cookie}:undefined})},
  '@/lib/data/cafes':{getPublicCafeBySlugAdmin:async()=>({id:wrongCafe?'wrong':cafe})},
  '@/lib/data/customers':{getCustomerProfileByUser:async()=>null},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>{otpCalls++;return {data:{user:null}};}}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>{const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},maybeSingle:async()=>({error:dbFailure?{}:null,data:{id:profileId,cafe_id:cafe,status:'active',blocked_at:blocked?'blocked':null,phone_auth_conflict:conflict,phone_normalized:changedPhone?'966500000002':'966500000001'}})};return q;}})},
});
check((await session.getLoyaltyCustomerProfile('taza'))?.id===profileId,'Name/phone session authorizes own profile');
check(filters.some(([k,v])=>k==='cafe_id'&&v===cafe)&&filters.some(([k,v])=>k==='id'&&v===profileId),'Lookup requires both profile and tenant');
check(otpCalls===0,'Direct membership needs no Supabase Auth session');
for(const state of ['blocked','conflict','changedPhone','wrongCafe','dbFailure']) {
  blocked=state==='blocked';conflict=state==='conflict';changedPhone=state==='changedPhone';wrongCafe=state==='wrongCafe';dbFailure=state==='dbFailure';
  check(await session.getLoyaltyCustomerProfile('taza')===null,state+' rejects session');
}
blocked=conflict=changedPhone=wrongCafe=dbFailure=false;cookie=token+'x';
check(await session.getLoyaltyCustomerProfile('taza')===null&&otpCalls===0,'Invalid explicit cookie does not fall back to a different identity');
cookie='';await session.getLoyaltyCustomerProfile('taza');check(otpCalls===1,'Legacy verified session remains a fallback');
let eligible=true,enabled=true,rpcCalls=0,returning=false,reason=null,fail=false;
const writes=[];
const enrollment=load('lib/data/loyalty-enrollment.ts',{
  ...base,'next/headers':{headers:async()=>new Map([['x-vercel-forwarded-for','192.0.2.1']]),cookies:async()=>({set:(...args)=>writes.push(args)})},
  './loyalty-experience':{getLoyaltyBrand:async()=>eligible?{cafeId:cafe,program:{enabled}}:null},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{
    rpcCalls++;assert.equal(name,'enroll_loyalty_customer_direct');assert.equal(args.p_cafe_id,cafe);assert.equal(args.p_phone,'966500000001');
    assert.match(args.p_client_key,/^[a-f0-9]{64}$/);check(!JSON.stringify(args).includes('192.0.2.1'),'IP is hashed');
    return {error:fail?{}:null,data:reason?{ok:false,reason}:{ok:true,profile_id:profileId,returning_customer:returning}};
  }})},
});
const input={slug:'taza',name:'Test Member',phone:'٠٥٠٠٠٠٠٠٠١'};
check((await enrollment.enrollLoyaltyCustomer(input)).ok,'Arabic digits normalize before atomic RPC');
const [name,signed,options]=writes[0];check(name==='branda_loyalty_taza'&&options.httpOnly&&options.sameSite==='lax'&&options.path==='/'&&options.maxAge===tokens.LOYALTY_SESSION_SECONDS,'Separate cookie available to wallet endpoints');
check(tokens.readLoyaltySessionToken(signed,'taza')?.profileId===profileId,'Enrollment cookie resolves same membership');
returning=true;check((await enrollment.enrollLoyaltyCustomer({...input,phone:'00966500000001'})).returningCustomer,'Returning member keeps identity');
const count=rpcCalls;
for(const invalid of [{...input,phone:'123'},{...input,name:'x'},{...input,slug:'../taza'}])check(!(await enrollment.enrollLoyaltyCustomer(invalid)).ok,'Invalid input rejected');
eligible=false;check(!(await enrollment.enrollLoyaltyCustomer(input)).ok,'Unsubscribed brand rejected');eligible=true;enabled=false;
check(!(await enrollment.enrollLoyaltyCustomer(input)).ok,'Disabled program rejected');enabled=true;
check(rpcCalls===count,'Invalid or unavailable registration never mutates');
const cookieCount=writes.length;reason='rate_limited';check(!(await enrollment.enrollLoyaltyCustomer(input)).ok,'Rate limit handled');reason=null;fail=true;
check(!(await enrollment.enrollLoyaltyCustomer(input)).ok&&writes.length===cookieCount,'No session on RPC failure');
console.log(`PASS ${checks} direct loyalty enrollment and session checks`);
