import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks) {
 const exports={};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports',js)(name=>name in mocks?mocks[name]:require(name),exports);return exports;
}
let count=0;async function test(label,fn){try{await fn();count++;}catch(e){throw new Error(label,{cause:e});}}
const jar=new Map(),writes=[],calls=[],sent=[];
let configured=true,sendFail=false,brandName='Test brand',rpcFail='',allow=true,mark=true,verified=false;
const mocks={
 'server-only':{},
 'next/headers':{cookies:async()=>({get:name=>jar.has(name)?{value:jar.get(name)}:undefined,set:(name,value,opts)=>{writes.push({name,value,opts});jar.set(name,value);},delete:name=>jar.delete(name)}),headers:async()=>new Map()},
 '@/lib/barndaksa/env':{getSupabaseServiceRoleKey:()=> 'isolated-test-key'},
 '@/lib/auth/phone-utils':load('lib/auth/phone-utils.ts',{'server-only':{}}),
 '@/lib/data/cashier':{cashierSessionCookie:'barndaksa_cashier_session'},
 '@/lib/whatsapp/green-api':{isGreenApiConfigured:()=>configured,sendGreenApiOtp:async input=>{if(sendFail)throw Error('provider secret');sent.push(input);}},
 '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {error:name===rpcFail?{message:'private sql error'}:null,data:name==='begin_staff_otp'?{ok:allow,brandName}:name==='mark_staff_otp_sent'?mark:{ok:verified,token:'a'.repeat(48),expiresAt:new Date(Date.now()+28800000).toISOString()}};}})},
};
const api=load('lib/auth/cashier-otp.ts',mocks);
await test('invalid phone never calls provider or database',async()=>{assert.equal((await api.requestCashierOtp('123')).ok,false);assert.equal(calls.length,0);});
await test('unconfigured provider rejects',async()=>{configured=false;assert.equal((await api.requestCashierOtp('0501234567')).ok,false);assert.equal(calls.length,0);configured=true;});
await test('normalizes Arabic phone and stores only browser proof after acknowledgement',async()=>{
 assert.equal((await api.requestCashierOtp('٠٥٠١٢٣٤٥٦٧')).ok,true);assert.equal(sent[0].phoneNormalized,'966501234567');
 assert.match(sent[0].code,/^\d{6}$/);assert.equal(calls[0].args.p_phone,'+966501234567');assert(!JSON.stringify(calls).includes(sent[0].code));
 assert.equal(writes[0].name,'barndaksa_staff_otp');assert(writes[0].opts.httpOnly);assert.equal(writes[0].opts.sameSite,'lax');
 assert.equal(calls[1].name,'mark_staff_otp_sent');
});
await test('wrong code is hashed and never opens session',async()=>{
 const before=writes.length;assert.equal((await api.verifyCashierOtp('١٢٣٤٥٦')).ok,false);assert.equal(writes.length,before);
 assert.match(calls.at(-1).args.p_code_hash,/^[a-f0-9]{64}$/);assert(!JSON.stringify(calls.at(-1)).includes('123456'));
});
await test('successful verify sets bounded HttpOnly session and deletes challenge',async()=>{
 verified=true;assert.equal((await api.verifyCashierOtp('123456')).ok,true);const last=writes.at(-1);
 assert.equal(last.name,'barndaksa_cashier_session');assert(last.opts.httpOnly&&last.opts.maxAge<=28800&&last.opts.maxAge>0);assert(!jar.has('barndaksa_staff_otp'));
});
await test('missing browser proof cannot verify',async()=>{const before=calls.length;assert.equal((await api.verifyCashierOtp('123456')).ok,false);assert.equal(calls.length,before);});
for(const invalid of ['bad','00000000-0000-4000-8000-000000000000.'+'f'.repeat(64)+'.extra']) await test('malformed proof rejected',async()=>{jar.set('barndaksa_staff_otp',invalid);const before=calls.length;assert.equal((await api.verifyCashierOtp('123456')).ok,false);assert.equal(calls.length,before);});
await test('rate limit never sends or writes cookie',async()=>{allow=false;const b=[sent.length,writes.length];assert.equal((await api.requestCashierOtp('0501234567')).ok,false);assert.deepEqual([sent.length,writes.length],b);allow=true;});
await test('provider failure never marks sent or writes cookie',async()=>{sendFail=true;const before=writes.length;assert.equal((await api.requestCashierOtp('0501234567')).ok,false);assert.equal(writes.length,before);assert.equal(calls.at(-1).name,'begin_staff_otp');sendFail=false;});
await test('failed acknowledgement persistence fails closed',async()=>{mark=false;const before=writes.length;assert.equal((await api.requestCashierOtp('0501234567')).ok,false);assert.equal(writes.length,before);mark=true;});
await test('unknown or legacy phone never sends OTP',async()=>{brandName=null;const before=sent.length;assert.equal((await api.requestCashierOtp('0501234567')).ok,true);assert.equal(sent.length,before);brandName='Test brand';});
await test('database errors are generic',async()=>{rpcFail='begin_staff_otp';assert(!JSON.stringify(await api.requestCashierOtp('0501234567')).includes('private'));rpcFail='';});

const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const dictionary=load('lib/cashier/messages.ts',{}).cashierEnglish;
let state=[],cursor=0,locale='ar';
const ui=load('components/cashier/cashier-login-form.tsx',{
 react:{...React,useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect:()=>{}},
 'next/link':({children,...props})=>React.createElement('a',props,children),
 '@/app/actions/cashier':{}, '@/components/ui/barndaksa-logo':{BarndaksaLogo:()=>null},
 './cashier-language':{CashierLanguageSwitch:()=>null,useCashierLanguage:()=>({locale,dir:locale==='ar'?'rtl':'ltr',t:m=>typeof m==='string'?(locale==='ar'?m:dictionary[m]??m):m.text,errorText:m=>m})},
});
function render(){cursor=0;return renderToStaticMarkup(ui.CashierLoginForm({}));}
await test('default login asks only phone',()=>{const html=render();assert(html.includes('type="tel"'));assert(!html.includes('type="email"'));assert(!html.includes('type="password"'));});
await test('legacy email/password form remains available',()=>{state[5]='password';const html=render();assert(html.includes('type="email"')&&html.includes('type="password"'));assert(!html.includes('one-time-code'));});
await test('code form supports autofill and input limits',()=>{state[5]='whatsapp';state[8]=true;const html=render();assert(html.includes('one-time-code')&&html.includes('maxLength="6"')&&html.includes('readOnly=""'));});
await test('English login labels translated',()=>{state[8]=false;locale='en';const html=render();assert(html.includes('WhatsApp number')&&html.includes('Email and password')&&html.includes('dir="ltr"'));});
console.log(`PASS ${count} staff OTP server and login UI tests; no live messages or accounts`);
