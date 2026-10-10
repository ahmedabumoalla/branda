import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const dependency=createRequire(import.meta.url);
function load(file,stubs={},cache=new Map()) {
 if(cache.has(file))return cache.get(file);
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const exports={};cache.set(file,exports);
 new Function('require','exports',output)(name=>{
  if(Object.hasOwn(stubs,name))return stubs[name];
  if(name.startsWith('@/')||name.startsWith('.'))return load((name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name))+'.ts',stubs,cache);
  return dependency(name);
 },exports);return exports;
}
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
const {customerDevice,activeInterval}=load('lib/analytics/customer-usage.ts');
check(customerDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari/604.1').name==='iPhone','honest iPhone family without invented model');
check(customerDevice('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36').type==='mobile','Android mobile');
check(customerDevice('Mozilla/5.0 (Linux; Android 14) Chrome/120 Safari/537.36').type==='tablet','Android tablet');
check(customerDevice('Mozilla/5.0 (Windows NT 10) Chrome/120 Safari/537 Edg/120').browser==='Edge','Edge before Chrome');
check(customerDevice('').type==='unknown','unknown remains unknown');
check(activeInterval(0,120000,0,true)===60000,'idle bound');
check(activeInterval(0,20000,0,false)===0,'hidden not counted');
check(activeInterval(80000,100000,0,true)===0,'long idle zero');
check(activeInterval(80000,100000,90000,true)===20000,'interaction resumes');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let user={id:id(1)},features=['menu','loyalty'],rpcError=null;const calls=[];
const {POST}=load('app/api/analytics/customer-activity/route.ts',{
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},
 '@/lib/data/feature-entitlements':{getPublicCafeFeatureCodesBySlug:async()=>features},
 '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error:rpcError};}})},
});
const payload={slug:'rast',kind:'menu_view',sessionId:id(10),seconds:20};
const request=(body=JSON.stringify(payload),headers={})=>new Request('https://example.test/api/analytics/customer-activity',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json','sec-fetch-site':'same-origin','user-agent':'Mozilla iPhone Safari',...headers},body});
for(const headers of [{origin:'https://other.test'},{origin:''},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}])check((await POST(request(undefined,headers))).status===403,'same-origin enforced');
check((await POST(request(undefined,{'content-type':'text/plain'}))).status===415,'JSON only');
for(const body of ['invalid',' '.repeat(2048),JSON.stringify({...payload,userId:id(2)}),JSON.stringify({...payload,device:{name:'spoof'}}),JSON.stringify({...payload,seconds:-1}),JSON.stringify({...payload,seconds:21601}),JSON.stringify({...payload,kind:'redeem'})])check((await POST(request(body))).status===400,'strict telemetry input');
check((await POST(request(' '.repeat(2048),{'content-length':'1'}))).status===400,'actual streaming size enforced');
check(calls.length===0,'invalid requests never reach DB');
user=null;check((await POST(request())).status===204&&calls.length===0,'anonymous visits not identified');
user={id:id(1),is_anonymous:true};await POST(request());check(calls.length===0,'Supabase anonymous auth not attributed');
user={id:id(1)};features=[];await POST(request());check(calls.length===0,'inactive service not recorded');
features=['menu','loyalty'];check((await POST(request())).status===204,'valid telemetry accepted');
check(calls[0].args.p_user_id===user.id&&calls[0].args.p_device.name==='iPhone','identity from server auth and device from request header');
check(!JSON.stringify(calls).includes('user-agent'),'raw UA not persisted');
rpcError={message:'private database details'};check((await POST(request())).status===503,'recording failures not disguised');

let clock=0,visible='visible',focused=true,timer;const windowEvents=new Map(),documentEvents=new Map(),bodies=[];
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
globalThis.document={get visibilityState(){return visible;},hasFocus:()=>focused,addEventListener:(name,fn)=>documentEvents.set(name,fn),removeEventListener:name=>documentEvents.delete(name)};
globalThis.window={setInterval:fn=>(timer=fn,1),clearInterval:()=>{timer=null;},addEventListener:(name,fn)=>windowEvents.set(name,fn),removeEventListener:name=>windowEvents.delete(name)};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{sendBeacon:(url,blob)=>{bodies.push({url,blob});return true;}}});
const {startCustomerUsageTracking}=load('lib/analytics/customer-usage-tracking.ts');
const stop=startCustomerUsageTracking('rast','menu_view');
check(bodies.length===1,'initial visible page registered');
clock=20000;timer();check(JSON.parse(await bodies.at(-1).blob.text()).seconds===20,'active heartbeat cumulative');
clock=25000;visible='hidden';documentEvents.get('visibilitychange')();
clock=65000;timer();check(JSON.parse(await bodies.at(-1).blob.text()).seconds===25,'background excluded');
clock=70000;visible='visible';documentEvents.get('visibilitychange')();
clock=90000;timer();check(JSON.parse(await bodies.at(-1).blob.text()).seconds===45,'foreground resumes');
clock=170000;timer();check(JSON.parse(await bodies.at(-1).blob.text()).seconds===85,'idle page capped after last interaction');
const count=bodies.length;clock=190000;timer();check(bodies.length===count,'idle does not create fake latest usage');
windowEvents.get('pointerdown')();clock=200000;timer();check(JSON.parse(await bodies.at(-1).blob.text()).seconds===95,'real interaction resumes after idle');
stop();check(timer===null&&windowEvents.size===0&&documentEvents.size===0,'all listeners and timer cleaned');
console.log(`Customer usage: ${checks} checks passed`);
