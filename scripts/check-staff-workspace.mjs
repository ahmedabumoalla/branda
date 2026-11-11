import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,stubs={},cache=new Map()) {
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','exports',js)(name=>{
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name.startsWith('@/')||name.startsWith('.')) {const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts',stubs,cache);}
    return require(name);
  },exports);return exports;
}
let checks=0;const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
const settle=()=>new Promise(setImmediate);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};};
const loyalty={screen:'loyalty',data:{cafe:{id:'cafe-a'},cashier:{id:'staff-a',canUsePager:true}}};
const pager={screen:'pager',context:{cafeId:'cafe-a',canUseLoyalty:true},page:{orders:[]}};
const key='scope-a';
function harness(initial=loyalty,loader=async()=>({ok:true,value:pager})) {
  const slots=[],effects=[],timers=new Map(),events=new Map(),calls=[],history=[];let cursor=0,serial=0,guardStops=0,reloads=0;
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  const hooks={...React,
    useState(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useRef(init){const i=cursor++;if(!(i in slots))slots[i]={current:init};return slots[i];},
    useCallback(fn,deps){const i=cursor++;if(!equal(slots[i]?.deps,deps))slots[i]={deps,value:fn};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++;if(!equal(slots[i]?.deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
  };
  const target={location:{pathname:initial.screen==='pager'?'/pager':'/cashier',reload(){reloads++;}},history:{pushState(_state,_unused,url){history.push(url);target.location.pathname=url;}},setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);},addEventListener(k,fn){events.set(k,fn);},removeEventListener(k){events.delete(k);}};
  globalThis.window=target;globalThis.document={};
  const {StaffWorkspace}=load('components/cashier/staff-workspace.tsx',{
    react:hooks,
    '@/app/actions/staff-workspace':{loadStaffScreenAction:(...args)=>{calls.push(args);return loader(...args);}},
    '@/lib/cashier/watch-session':{watchCashierSession:(_w,_d,k)=>{assert.equal(k,key);return ()=>guardStops++;}},
    '@/components/pager/pager-console':{PagerConsole:()=>null},
    '@/components/rast-loyalty/rast-cashier':{RastCashier:()=>null},
    './staff-screen-link':{StaffScreenNavigation:React.createContext(null)},
    './cashier-language':{useCashierLanguage:()=>({t:v=>v,dir:'rtl'})},
  });
  const h={calls,history,target,render(){cursor=0;effects.length=0;h.tree=StaffWorkspace({initial,sessionKey:key});effects.splice(0).forEach(fn=>fn());return h.tree;},navigate(screen){h.render().props.value(screen);},prefetch(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}},pop(url){target.location.pathname=url;events.get('popstate')?.();},stop(){for(const slot of slots)slot?.cleanup?.();},reloaded:()=>reloads,stopped:()=>guardStops};
  h.render();return h;
}
const activities=h=>h.render().props.children.filter(n=>n?.type===React.Activity);
const active=h=>activities(h).findIndex(n=>n.props.mode==='visible');
const h=harness();h.prefetch();await settle();
check('alternate screen is fetched once in the background with the current session scope',()=>assert.deepEqual(h.calls,[['pager',key]]));
h.navigate('pager');await settle();
check('switch uses local Activity visibility and History without loading a new route',()=>{assert.equal(active(h),1);assert.deepEqual(h.history,['/pager']);});
const savedPagerProps=activities(h)[1].props.children.props;
for(let i=0;i<10;i++){h.navigate('loyalty');await settle();h.navigate('pager');await settle();}
check('twenty repeated switches reuse both mounted screens with zero additional screen requests',()=>{assert.equal(h.calls.length,1);assert.equal(activities(h)[1].props.children.props.initialPage,savedPagerProps.initialPage);assert.equal(activities(h)[0].props.children.props.initialData,loyalty.data);});
h.pop('/cashier');await settle();
check('browser Back restores cached loyalty without adding history entries or screen fetches',()=>{assert.equal(active(h),0);assert.equal(h.calls.length,1);assert.equal(h.history.length,21);});
h.stop();check('leaving workspace stops the session guard',()=>assert.equal(h.stopped(),1));
const slow=deferred();const raced=harness(loyalty,()=>slow.promise);raced.prefetch();raced.navigate('pager');
check('first click during prefetch shares the pending request',()=>assert.equal(raced.calls.length,1));
raced.navigate('loyalty');await settle();slow.resolve({ok:true,value:pager});await settle();
check('late first-load response cannot override a newer navigation choice',()=>assert.equal(active(raced),0));
raced.navigate('pager');await settle();check('a finished background response remains available for the next switch',()=>{assert.equal(active(raced),1);assert.equal(raced.calls.length,1);});raced.stop();
let fail=true;const offline=harness(loyalty,async()=>{if(fail)throw Error('offline');return {ok:true,value:pager};});
offline.navigate('pager');await settle();
check('first-load failure keeps the current screen and does not change the URL',()=>{assert.equal(active(offline),0);assert.equal(offline.history.length,0);assert.equal(offline.render().props.children[0].props.role,'alert');});
fail=false;offline.navigate('pager');await settle();check('failed first load can be retried',()=>assert.equal(active(offline),1));offline.stop();
const restricted=harness({...loyalty,data:{...loyalty.data,cashier:{canUsePager:false}}});restricted.prefetch();restricted.navigate('pager');await settle();
check('a forbidden service is neither prefetched nor opened',()=>{assert.equal(restricted.calls.length,0);assert.equal(active(restricted),0);});restricted.stop();
const reverse=harness(pager,async()=>({ok:true,value:loyalty}));reverse.prefetch();await settle();reverse.navigate('loyalty');await settle();
check('a direct pager entry can cache and return to loyalty',()=>{assert.equal(active(reverse),0);assert.deepEqual(reverse.calls,[['loyalty',key]]);});reverse.stop();
const changed=harness(loyalty,async()=>({ok:false,reset:true}));changed.prefetch();await settle();
check('changed login reloads the current session instead of using old cached data',()=>assert.equal(changed.reloaded(),1));changed.stop();
const abandoned=deferred();const gone=harness(loyalty,()=>abandoned.promise);gone.prefetch();gone.stop();abandoned.resolve({ok:true,value:pager});await settle();
check('late responses after unmount cannot populate the retained workspace',()=>assert.equal(activities(gone)[1].props.children,false));

let permitted=true,token='token-a',seen=[],loyaltyCalls=0;
const {cashierWorkspaceKey}=load('lib/cashier/workspace-session.ts');
const {loadStaffScreenAction}=load('app/actions/staff-workspace.ts',{
  '@/lib/data/cashier':{requireCashierPermission:async permission=>{seen.push(permission);if(!permitted)throw Error('denied');return {token,businessCategory:'cafes_coffee'};},getCashierConsole:async options=>{assert.equal(options.recordEntry,false);loyaltyCalls++;return {...loyalty.data,cafe:{...loyalty.data.cafe,slug:'brand-a'}};}},
  '@/lib/data/loyalty-experience':{getLoyaltyBrand:async slug=>{assert.equal(slug,'brand-a');return {identity:{name:'A'}};}},
  '@/lib/data/pager':{getStaffPagerContext:async()=>pager.context,getPagerPage:async(filter,mode)=>{assert.deepEqual(filter,{status:'waiting'});assert.equal(mode,'staff');return pager.page;}},
});
const a=await loadStaffScreenAction('loyalty',cashierWorkspaceKey(token));
const b=await loadStaffScreenAction('pager',cashierWorkspaceKey(token));
check('server screen loaders enforce each service permission and suppress synthetic login activity',()=>{assert.equal(a.ok,true);assert.equal(b.ok,true);assert.deepEqual(seen,['loyalty','pager']);assert.equal(loyaltyCalls,1);});
const mismatch=await loadStaffScreenAction('loyalty',cashierWorkspaceKey('different-token'));
check('session mismatch returns no screen data',()=>{assert.deepEqual(mismatch,{ok:false,reset:true});assert.equal(loyaltyCalls,1);});
permitted=false;assert.deepEqual(await loadStaffScreenAction('pager',cashierWorkspaceKey(token)),{ok:false});
check('invalid and unauthorized target cannot load a screen',()=>assert.equal(seen.length,4));
assert.deepEqual(await loadStaffScreenAction('admin',cashierWorkspaceKey(token)),{ok:false});
check('arbitrary client paths do not reach the authorization/data loader',()=>assert.equal(seen.length,4));
console.log(`${checks} staff workspace checks passed`);
