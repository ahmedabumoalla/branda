import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,stubs) {
 const exports={};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',js)(name=>Object.hasOwn(stubs,name)?stubs[name]:require(name),exports);
 return exports;
}
let calls=0,resolvePending;
let loader=async()=>{calls++;return {serviceSubscriptions:[],settings:{cafeSlug:'one'}}};
const stored=new Map([['barndaksa_dashboard_shell_snapshot',JSON.stringify({at:Date.now(),value:{settings:{cafeSlug:'old-account'}}})]]);
globalThis.sessionStorage={removeItem:key=>stored.delete(key),getItem:key=>stored.get(key),setItem:()=>{throw Error('Private snapshot persisted')}};
const cache=load('lib/performance/dashboard-shell-client.ts',{'@/app/actions/dashboard-shell':{fetchOwnerDashboardShellAction:()=>loader()}});
const first=await cache.getCachedDashboardShellSnapshot();assert.equal(calls,1);assert.equal(stored.size,0);
await cache.getCachedDashboardShellSnapshot();assert.equal(calls,1);
const seeded={serviceSubscriptions:[],settings:{cafeSlug:'two'}};
cache.primeDashboardShellSnapshot(seeded);assert.equal(await cache.getCachedDashboardShellSnapshot(),seeded);assert.equal(calls,1);
cache.clearDashboardShellSnapshot();
loader=()=>{calls++;return new Promise(resolve=>{resolvePending=resolve})};
const pending1=cache.getCachedDashboardShellSnapshot(),pending2=cache.getCachedDashboardShellSnapshot();
assert.equal(pending1,pending2);assert.equal(calls,2);
cache.primeDashboardShellSnapshot(seeded);resolvePending(first);
await assert.rejects(pending1,/context changed/);assert.equal(await cache.getCachedDashboardShellSnapshot(),seeded);
cache.clearDashboardShellSnapshot();let failures=0;
loader=async()=>{failures++;throw Error('offline')};
await assert.rejects(cache.getCachedDashboardShellSnapshot(),/offline/);
await assert.rejects(cache.getCachedDashboardShellSnapshot(),/offline/);assert.equal(failures,2);
cache.primeDashboardShellSnapshot(seeded);
const realNow=Date.now;Date.now=()=>realNow()+31_000;loader=async()=>{calls++;return first};
assert.equal(await cache.getCachedDashboardShellSnapshot(),first);assert.equal(calls,3);Date.now=realNow;
console.log('PASS cache: first read, warm read, SSR prime without request, deduplication, account-change pending race, retry and expiry; no private sessionStorage');

let currentSession;
let refs=[],refIndex=0,pathname="/admin/cafes";
let authCallback,cleanup,clears=0,reloads=0,refreshes=0,unsubscribe=0,redirect;
const listeners=new Map();let clock=100_000;
Date.now=()=>clock;
globalThis.window={location:{replace:value=>{redirect=value},reload:()=>reloads++},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
globalThis.document={visibilityState:'visible',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
const boundary=load('components/dashboard/dashboard-cache-boundary.tsx',{
 react:{useRef:initial=>{const index=refIndex++;return refs[index]??(refs[index]={current:initial})},useEffect:fn=>{cleanup=fn()}},
 'next/navigation':{usePathname:()=>pathname,useRouter:()=>({refresh:()=>refreshes++})},
 '@/lib/supabase/client':{createClient:()=>({auth:{getSession:async()=>({data:{session:currentSession},error:null}),onAuthStateChange:fn=>{authCallback=fn;return {data:{subscription:{unsubscribe:()=>unsubscribe++}}}}}})},
 '@/lib/performance/dashboard-shell-client':{clearDashboardShellSnapshot:()=>clears++},
});
const session=(user,id)=>({user:{id:user},access_token:'a.'+Buffer.from(JSON.stringify({session_id:id})).toString('base64url')+'.b'});
currentSession=session('one','session-1');refs=[];refIndex=0;boundary.DashboardCacheBoundary();authCallback('INITIAL_SESSION',currentSession);
authCallback('TOKEN_REFRESHED',session('one','session-1'));assert.equal(reloads,0);
await listeners.get('focus')();assert.equal(refreshes,0);clock+=60_001;await listeners.get('focus')();await listeners.get('visibilitychange')();assert.equal(refreshes,1);
clock+=60_001;document.visibilityState='hidden';await listeners.get('online')();assert.equal(refreshes,1);document.visibilityState='visible';navigator.onLine=false;await listeners.get('focus')();assert.equal(refreshes,1);navigator.onLine=true;
authCallback('SIGNED_IN',session('one','session-2'));assert.equal(reloads,1);assert.equal(clears,1);
authCallback('SIGNED_IN',session('two','session-3'));assert.equal(reloads,1,'one hard navigation per boundary');
cleanup();assert.equal(listeners.size,0);assert.equal(unsubscribe,1);
currentSession=session('one','session-1');refs=[];refIndex=0;boundary.DashboardCacheBoundary();authCallback('INITIAL_SESSION',currentSession);authCallback('SIGNED_OUT',null);assert.equal(redirect,'/login');cleanup();
currentSession=session('one','session-1');refs=[];refIndex=0;boundary.DashboardCacheBoundary();authCallback('INITIAL_SESSION',currentSession);redirect=undefined;currentSession=null;await listeners.get('focus')();assert.equal(redirect,'/login','cookie-only logout clears cached pages even before freshness timeout');cleanup();
redirect=undefined;refs=[];refIndex=0;boundary.DashboardCacheBoundary();authCallback('INITIAL_SESSION',null);assert.equal(redirect,'/login','anonymous initial session cannot keep private cached pages');cleanup();
refs=[];refIndex=0;pathname='/admin/cafes';boundary.DashboardCacheBoundary();authCallback('INITIAL_SESSION',session('one','first'));cleanup();
refIndex=0;pathname='/';boundary.DashboardCacheBoundary();
const priorReloads=reloads;refIndex=0;pathname='/admin/cafes';boundary.DashboardCacheBoundary();authCallback('INITIAL_SESSION',session('two','second'));assert.equal(reloads,priorReloads+1,'public navigation does not forget account identity');cleanup();
assert.equal(boundary.dashboardSessionIdentity(session('one','s')), 'one:s');
Date.now=realNow;
console.log('PASS boundary: token refresh keeps cache, new login/session clears all routes, logout redirects, focus/online/visibility throttled, hidden/offline suppressed and cleanup');
