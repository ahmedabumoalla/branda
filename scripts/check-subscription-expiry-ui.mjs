import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(fs.existsSync(`${next}.tsx`) ? `${next}.tsx` : `${next}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}


const flush=()=>new Promise(resolve=>setImmediate(resolve));
const actualNow = Date.now;
let clock = actualNow();
Date.now = () => clock;
function withServices(snapshot) {
 if(snapshot.serviceSubscriptions || snapshot.unauthenticated) return snapshot;
 return {...snapshot,serviceSubscriptions:snapshot.subscription ? [{...snapshot.subscription,planId:snapshot.planId,features:snapshot.plans.find(plan=>plan.id===snapshot.planId)?.features??[]}] : []};
}
function harness(snapshot,pathname='/dashboard',error=false,readSnapshot){
 snapshot=withServices(snapshot);
 const values=[],effects=[],pending=[],cleanups=[];let index=0;const timers=new Map();let timerId=0;const router={refresh(){router.refreshed=true}};const listeners=new Map();
 const hooks={...React,useState(initial){const slot=index++;if(!(slot in values))values[slot]=typeof initial==='function'?initial():initial;return[values[slot],next=>values[slot]=typeof next==='function'?next(values[slot]):next]},useEffect(fn,deps){const slot=index++;if(!effects[slot]||deps.some((value,i)=>value!==effects[slot][i])){effects[slot]=deps;pending.push(()=>{cleanups[slot]?.();cleanups[slot]=fn()})}},useMemo:fn=>fn(),useTransition:()=>[false,fn=>fn()]};
 globalThis.window={addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)},setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)}};
 globalThis.localStorage={getItem:()=>null};
 const {DashboardAppLayout}=load(path.resolve('components/dashboard/dashboard-app-layout.tsx'),{react:hooks,'next/navigation':{usePathname:()=>pathname,useRouter:()=>router},'@/app/actions/maintenance':{exitMaintenanceModeAction:async()=>{}},'@/components/dashboard/DashboardSidebar':{DashboardSidebar:()=>null},'@/components/dashboard/feature-blocked-state':{DashboardFeatureBlockedState:()=>React.createElement('p',null,'feature blocked')},'@/components/dashboard/subscription-expired-state':{SubscriptionExpiredState:()=>React.createElement('p',null,'subscription expired')},'@/components/ui/responsive-app-shell':{ResponsiveAppShell:({children})=>React.createElement('main',null,children)},'@/lib/performance/dashboard-shell-client':{clearDashboardShellSnapshot(){},getCachedDashboardShellSnapshot:async()=>{if(error)throw new Error('Unauthorized');return readSnapshot ? readSnapshot() : snapshot}}});
 return {timers,router,async renew(next,event='barndaksa:subscription-updated'){snapshot=withServices(next);listeners.get(event)?.();await flush()},render(){index=0;return DashboardAppLayout({children:React.createElement('p',null,'PROTECTED CONTENT')})},async effects(){for(const fn of pending.splice(0))fn();await flush()},cleanup(){for(const fn of cleanups)fn?.()},setPath(value){pathname=value}};
}
const base={planId:'paid',settings:{cafeSlug:'brand'},plans:[{id:'paid',active:true,features:['menu']}],featureOverrides:[],subscription:{status:'active',expiresAt:new Date(Date.now()+60000).toISOString()}};
const expired=harness({...base,planId:'',subscription:{status:'trialing',expiresAt:new Date(Date.now()-1).toISOString()}});
assert.ok(!renderToStaticMarkup(expired.render()).includes('PROTECTED CONTENT'),'no protected flash during loading');
await expired.effects();assert.equal(expired.render().props.sidebar(()=>{}).props.servicesAvailable,false);assert.ok(renderToStaticMarkup(expired.render()).includes('subscription expired'));expired.cleanup();
const stale=harness({...base,subscription:{...base.subscription,expiresAt:new Date(Date.now()-1).toISOString()}});stale.render();await stale.effects();assert.ok(renderToStaticMarkup(stale.render()).includes('subscription expired'),'stale cached plan cannot pass expiry');stale.cleanup();
const active=harness(base);active.render();await active.effects();assert.equal(active.render().props.sidebar(()=>{}).props.servicesAvailable,true);assert.ok(renderToStaticMarkup(active.render()).includes('PROTECTED CONTENT'));await active.effects();assert.equal(active.timers.size,1);clock=Date.parse(base.subscription.expiresAt);[...active.timers.values()][0].fn();assert.equal(active.router.refreshed,true,'refresh subscription page at exact expiry');assert.equal(active.render().props.sidebar(()=>{}).props.servicesAvailable,false);assert.ok(renderToStaticMarkup(active.render()).includes('subscription expired'),'open dashboard locks at expiration');await active.renew({...base,subscription:{...base.subscription,expiresAt:new Date(Date.now()+120000).toISOString()}});assert.equal(active.render().props.sidebar(()=>{}).props.servicesAvailable,true,'approved renewal restores navigation without page exit');active.cleanup();clock=actualNow();
const renew=harness({...base,planId:''},'/dashboard/subscription');assert.ok(renderToStaticMarkup(renew.render()).includes('PROTECTED CONTENT'),'renewal remains reachable');await renew.effects();assert.ok(renderToStaticMarkup(renew.render()).includes('PROTECTED CONTENT'));renew.cleanup();
const failed=harness(base,'/dashboard',true);failed.render();await failed.effects();const failure=renderToStaticMarkup(failed.render());assert.ok(failure.includes('تعذر التحقق من الاشتراك')&&!failure.includes('subscription expired')&&!failure.includes('PROTECTED CONTENT'));failed.cleanup();
const blocked=load(path.resolve('components/dashboard/subscription-expired-state.tsx'),{'next/link':({href,children,...props})=>React.createElement('a',{href,...props},children)});
const html=renderToStaticMarkup(React.createElement(blocked.SubscriptionExpiredState));assert.ok(html.includes('انتهى اشتراككم مع برندة')&&html.includes('href="/dashboard/subscription"'));
assert.ok(html.includes('https://wa.me/966508424401')&&html.includes('0508424401'));
console.log('PASS expiry gate: loading, expired trials, stale cache, live deadline, paid home, renewal exception, error state and recovery link');

// Render the actual desktop/mobile sidebar with a previously loaded active plan.
const sidebar=load(path.resolve('components/dashboard/DashboardSidebar.tsx'),{
 react:React,
 'next/link':({children,...props})=>React.createElement('a',props,children),
 'next/navigation':{usePathname:()=>'/dashboard',useRouter:()=>({push(){}})},
 '@/lib/cafe/use-resolved-cafe-logo':{useResolvedCafeLogoUrl:()=>''},
 '@/lib/platform/auth':{logoutBarndaksaAuth:async()=>{}},
 '@/lib/performance/dashboard-shell-client':{},
 '@/components/cafe/cafe-logo':{CafeLogo:()=>null},
 '@/components/ui/barndaksa-logo':{BarndaksaLogo:()=>null},
 '@/components/dashboard/notifications-panel':{NotificationsPanel:()=>null},
 '@/components/dashboard/subscription-countdown':{SubscriptionCountdown:()=>null},
});
for(const collapsed of [false,true]) {
 const snapshot={...base,settings:{cafeSlug:'brand',cafeName:'Brand'},notifications:[]};
 const locked=renderToStaticMarkup(React.createElement(sidebar.DashboardSidebar,{snapshot,servicesAvailable:false,collapsed}));
 assert.ok(locked.includes('href="/dashboard/subscription"'));
 assert.ok(!locked.includes('href="/dashboard/menu"'),'expired sidebar hides service links even with stale plan');
 const enabled=renderToStaticMarkup(React.createElement(sidebar.DashboardSidebar,{snapshot,servicesAvailable:true,collapsed}));
 assert.ok(enabled.includes('href="/dashboard/menu"'),'active sidebar keeps assigned services');
}
console.log('PASS actual expanded/collapsed sidebar: only subscription navigation after expiry');

// Feed the actual layout's latest props into the actual sidebar, including focus refresh.
const original={...base,settings:{cafeSlug:'brand',cafeName:'Brand'},notifications:[]};
const withCampaigns={...original,plans:[{...original.plans[0],features:['menu','marketing_campaigns']}]};
for(const collapsed of [false,true]) {
 const ctx=harness(original,'/dashboard/campaigns');
 const markup=()=>renderToStaticMarkup(React.createElement(sidebar.DashboardSidebar,{...ctx.render().props.sidebar(()=>{}).props,collapsed}));
 assert.ok(!markup().includes('href="/dashboard/campaigns"'),'loading never guesses campaign access');
 await ctx.effects();
 assert.ok(!markup().includes('href="/dashboard/campaigns"'));
 assert.ok(renderToStaticMarkup(ctx.render()).includes('feature blocked'));
 await ctx.renew(withCampaigns,'focus');
 assert.ok(markup().includes('href="/dashboard/campaigns"'),'focus refresh updates mounted navigation');
 assert.ok(renderToStaticMarkup(ctx.render()).includes('PROTECTED CONTENT'),'guard and sidebar agree');
 await ctx.renew(original);
 assert.ok(!markup().includes('href="/dashboard/campaigns"'),'removing service updates navigation');
 await ctx.renew(withCampaigns);
 assert.ok(markup().includes('href="/dashboard/campaigns"'),'subscription update restores link');
 await ctx.renew({...withCampaigns,subscription:{...base.subscription,expiresAt:new Date(Date.now()-1).toISOString()}});
 assert.ok(!markup().includes('href="/dashboard/campaigns"'),'expired subscription hides campaigns');
 await ctx.renew({unauthenticated:true});
 assert.ok(!markup().includes('href="/dashboard/subscription"'),'lost session clears previous brand snapshot');
 ctx.cleanup();
}
console.log('PASS shared sidebar snapshot: focus refresh, plan additions/removals, expiry and lost session in expanded/collapsed navigation');

const menuEnd = clock + 30_000;
const loyaltyEnd = clock + 90_000;
const twoPlans = {...original, plans:[{id:'menu',features:['menu']},{id:'loyalty',features:['loyalty']}],serviceSubscriptions:[
 {planId:'menu',planName:'Menu',status:'active',startedAt:null,expiresAt:new Date(menuEnd).toISOString(),features:['menu']},
 {planId:'loyalty',planName:'Loyalty',status:'active',startedAt:null,expiresAt:new Date(loyaltyEnd).toISOString(),features:['loyalty']},
]};
const multi=harness(twoPlans,'/dashboard/loyalty');
multi.render();await multi.effects();
const multiMarkup=()=>renderToStaticMarkup(React.createElement(sidebar.DashboardSidebar,multi.render().props.sidebar(()=>{}).props));
assert.ok(multiMarkup().includes('href="/dashboard/menu"'));
assert.ok(multiMarkup().includes('href="/dashboard/loyalty"'));
await multi.effects();
clock=menuEnd;[...multi.timers.values()][0].fn();
assert.ok(!multiMarkup().includes('href="/dashboard/menu"'),'expired menu disappears alone');
assert.ok(multiMarkup().includes('href="/dashboard/loyalty"'),'independent loyalty remains visible');
assert.ok(renderToStaticMarkup(multi.render()).includes('PROTECTED CONTENT'),'independent loyalty remains usable');
await multi.effects();multi.render();await multi.effects();
clock=loyaltyEnd;[...multi.timers.values()][0].fn();
assert.ok(renderToStaticMarkup(multi.render()).includes('subscription expired'),'all packages expired locks dashboard');
multi.cleanup();Date.now=actualNow;
console.log('PASS concurrent navigation: independent menu expiry preserves loyalty, final expiry locks dashboard');

for (const serviceSubscriptions of [undefined, null, {}]) {
 const storageKey='barndaksa_dashboard_shell_snapshot';
 const fresh=withServices({...base,subscription:{...base.subscription,expiresAt:new Date(Date.now()+60_000).toISOString()}});
 let stored=JSON.stringify({at:Date.now()-1000,value:{...base,serviceSubscriptions}}),fetches=0,removed=0;
 globalThis.sessionStorage={getItem(key){assert.equal(key,storageKey);return stored},setItem(key,value){assert.equal(key,storageKey);stored=value},removeItem(key){assert.equal(key,storageKey);removed++;stored=null}};
 const cache=load(path.resolve('lib/performance/dashboard-shell-client.ts'),{'@/app/actions/dashboard-shell':{fetchOwnerDashboardShellAction:async()=>{fetches++;return fresh}}});
 const release=harness(base,'/dashboard/menu',false,()=>cache.getCachedDashboardShellSnapshot());
 release.render();await release.effects();
 assert.equal(fetches,1,'pre-release or malformed session snapshots fetch fresh data');
 assert.equal(removed,1,'old snapshot is invalidated without changing the storage key');
 assert.ok(renderToStaticMarkup(release.render()).includes('PROTECTED CONTENT'),'old cache must not lock active account or produce a loading error');
 assert.equal(release.render().props.sidebar(()=>{}).props.servicesAvailable,true);
 assert.deepEqual(JSON.parse(stored).value.serviceSubscriptions,fresh.serviceSubscriptions);
 assert.equal(await cache.getCachedDashboardShellSnapshot(),fresh);
 assert.equal(fetches,1,'valid new in-memory snapshot is reused');
 release.cleanup();
}
console.log('PASS release compatibility: old/malformed session cache invalidates, fetches fresh and leaves active dashboard usable');
