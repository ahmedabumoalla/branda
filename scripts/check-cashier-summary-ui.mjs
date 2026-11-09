import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root=fileURLToPath(new URL('..',import.meta.url)), dependency=createRequire(import.meta.url);
function load(relative,stubs={},cache=new Map()) {
  if(cache.has(relative)) return cache.get(relative);
  const output=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports={};cache.set(relative,exports);
  new Function('require','exports',output)(name=>{
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name.endsWith('.module.css'))return new Proxy({},{get:(_,key)=>String(key)});
    if(name.startsWith('@/')||name.startsWith('.')){const p=name.startsWith('@/')?name.slice(2):path.join(path.dirname(relative),name);return load(fs.existsSync(path.join(root,p+'.tsx'))?p+'.tsx':p+'.ts',stubs,cache);}
    return dependency(name);
  },exports);return exports;
}
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=()=>new Promise(setImmediate);
const summaryModule=load('lib/loyalty/customer-summary.ts');
const language=load('lib/cashier/language.ts');
let locale='ar',cursor=0,slots=[],effects=[],rows=[],saved=[],fetches=[],clock=0,timerId=0,controller;
const timers=new Map();
const fakeTimers={setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout(id){timers.delete(id);}};
function advance(ms){const end=clock+ms;while(true){const next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);clock=next[1].at;next[1].fn();}clock=end;}
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const hooks={...React,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useMemo(factory,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={deps,value:factory()};return slots[i].value;},
  useSyncExternalStore(_subscribe,getSnapshot){cursor++;return getSnapshot();},
  useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},
};
const languageStub={useCashierLanguage:()=>({locale,dir:locale==='ar'?'rtl':'ltr',t:v=>language.cashierText(locale,v),errorText:v=>language.cashierError(locale,v)}),CashierLanguageSwitch:()=>null};
const cache=new Map();
let rewardLookups=0,commits=[],throwSummaryLookup=false;
const stubs={react:hooks,
  '@/lib/loyalty/customer-summary':{...summaryModule,createCustomerSummaryController(options){controller=summaryModule.createCustomerSummaryController({...options,timers:fakeTimers,fetch:(url,init)=>{const task=deferred();fetches.push({url,init,...task});return task.promise;}});const lookup=controller.lookup;controller.lookup=(...args)=>{if(throwSummaryLookup)throw new TypeError('Synthetic browser API failure');return lookup(...args);};return controller;}},
  './use-read-outbox':{useReadOutbox:()=>({rows,storageError:false,authPaused:false,save(method,value){const task=deferred();saved.push({method,value,...task});return task.promise;}})},
  '@/components/cashier/cashier-language':languageStub,
  '@/components/cashier/analytics-coupon-redemption':{AnalyticsCouponRedemption:()=>null},
  '@/app/actions/cashier':{logoutCashierAction:async()=>{}},
  '@/app/actions/cashier-loyalty-phone':{lookupCashierLoyaltyPhoneAction:async()=>({ok:true,cardCode:'CARD123'})},
  '@/app/actions/loyalty-experience':{lookupRastCashierCardAction:async()=>{throw Error('Stamp must never use blocking preview');},lookupRastCashierRewardAction:async()=>{rewardLookups++;return {sourceType:'loyalty',rewardCode:'REWARD123',canRedeem:true,customerName:'A',rewardTitle:'Coffee'};},scanLoyaltyExperienceAction:async input=>{commits.push(input);return {status:'redeemed'};}},
};
const {RastCashier}=load('components/rast-loyalty/rast-cashier.tsx',stubs,cache);
const {CashierCustomerSummary}=load('components/rast-loyalty/cashier-customer-summary.tsx',stubs,cache);
let tree;
const initialData={cafe:{id:'brand-a',slug:'rast',name:'Test'},cashier:{id:'cashier-a',fullName:'Operator'}};
function render(){cursor=0;effects=[];tree=RastCashier({initialData});for(const effect of effects)effect();}
function all(node=tree){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(child=>all(child??null));return [node,...all(node.props?.children??null)];}
function text(node){if(Array.isArray(node))return node.map(text).join('');if(node&&typeof node==='object')return text(node.props?.children);return String(node??'');}
const button=label=>{const n=all().find(n=>n.type==='button'&&text(n).trim()===label);assert(n,label);return n;};
const field=()=>all().find(n=>n.props?.id==='rast-scan-code');
function input(value){field().props.onChange({target:{value}});render();}
function submit(){all().find(n=>n.type==='form'&&n.props.onSubmit).props.onSubmit({preventDefault(){}});render();}
const node=()=>all().find(n=>n.type?.name==='CashierCustomerSummary');
const summaryHTML=()=>node()?renderToStaticMarkup(React.createElement(CashierCustomerSummary,node().props)):'';
const result=(task,summary)=>task.resolve({ok:true,status:200,json:async()=>({ok:true,summary})});
const balance=(name='A',stamps=4,rewards=1)=>({customerName:name,stampsInCycle:stamps,purchasesRequired:6,availableRewards:rewards});
function operation(requestId,overrides={}){return {requestId,status:'succeeded',customerName:'A',stampsInCycle:5,purchasesRequired:6,availableRewards:1,...overrides};}

render();equal(summaryHTML(),'','No idle summary displayed');
input('123');advance(150);equal(fetches.length,1,'Typing starts one bounded lookup');
submit();equal(saved.length,1,'Local storage starts while summary fetch is unresolved');
equal(fetches.length,1,'Submit reuses current in-flight lookup');check(field().props.disabled,'Only pending local storage locks input');
submit();equal(saved.length,1,'Repeated submit cannot create second local save');
rows=[{requestId:'request-a'}];saved[0].resolve({duplicate:false,row:rows[0]});await settle();render();
equal(field().props.value,'','Durable save clears input without waiting for lookup');check(!field().props.disabled,'Unresolved network cannot lock released input');
check(node().props.saved,'Summary remains attached after automatic input clear');
result(fetches[0],balance());await settle();render();
check(summaryHTML().includes('A'),'Delayed current customer name can populate after save');
check(summaryHTML().includes('الختم قيد التسجيل'),'Snapshot is labelled pending');
rows=[{requestId:'other-request',operation:operation('other-request',{customerName:'Wrong'})}];render();
equal(controller.getSnapshot().summary.customerName,'A','Unrelated completion cannot overwrite selected customer');
rows=[{requestId:'request-a',operation:operation('request-a',{stampsInCycle:null})}];render();
check(!controller.getSnapshot().confirmed,'Missing historical balance remains unknown rather than zero');
rows=[{requestId:'request-a',operation:operation('request-a',{stampsInCycle:0,availableRewards:2})}];render();render();
equal(controller.getSnapshot().summary,balance('A',0,2),'Reward rollover uses exact confirmed zero and count');
check(controller.getSnapshot().confirmed,'Selected success confirms balance');check(summaryHTML().includes('تم تسجيل الختم'),'Confirmed status rendered');
input('456');equal(controller.getSnapshot().summary,null,'Beginning next customer hides prior customer immediately');
check(!node().props.saved,'Next input detaches previous operation');advance(150);
input('789');advance(150);check(fetches[1].init.signal.aborted,'Previous customer lookup is aborted');
result(fetches[1],balance('Old'));await settle();render();equal(controller.getSnapshot().summary,null,'Late previous response cannot reappear');
result(fetches[2],balance('B',0,0));await settle();render();equal(controller.getSnapshot().summary,balance('B',0,0),'Current zero counts are real values');
input('321');advance(150);advance(500);render();equal(controller.getSnapshot().status,'slow');
check(!button('تسجيل الختم').props.disabled,'Slow lookup does not disable stamping');check(summaryHTML().includes('data-summary-loading="compact"')&&!summaryHTML().includes('تأخر عرض الرصيد'),'Slow state uses the compact loader');
advance(1300);render();equal(controller.getSnapshot().status,'unavailable');check(!field().props.disabled,'Deadline leaves input enabled');
input('654');advance(150);fetches.at(-1).reject(Error('offline'));await settle();render();
check(summaryHTML().includes('data-summary-loading="compact"')&&!summaryHTML().includes('تعذر عرض الرصيد'),'Unavailable balance keeps the compact placeholder');check(!button('تسجيل الختم').props.disabled,'Offline lookup does not disable stamping');
input('987');advance(150);fetches.at(-1).resolve({ok:false,status:404,json:async()=>({ok:false,code:'not_found'})});await settle();render();
check(summaryHTML().includes('لم تُوجد بطاقة'),'Unknown card renders safely');check(!button('تسجيل الختم').props.disabled,'Unknown summary does not change stamp admission');

input('111');throwSummaryLookup=true;const saveCount=saved.length;
submit();equal(saved.length,saveCount+1,'Synchronous summary exception cannot prevent durable stamp intake');
rows=[{requestId:'request-without-summary'}];saved.at(-1).resolve({duplicate:false,row:rows[0]});await settle();render();
equal(field().props.value,'','Saved input clears even when the optional summary throws');
check(!field().props.disabled,'Summary exception cannot leave the form locked');
throwSummaryLookup=false;
button('صرف مكافأة').props.onClick();render();equal(node(),undefined,'Redemption has no stamp summary');input('CARD123');const before=fetches.length;submit();await settle();render();
equal(fetches.length,before,'Redemption performs no speculative summary request');equal(rewardLookups,1,'Existing reward preview remains');
button('تأكيد تسليم المكافأة وصرفها').props.onClick();await settle();render();equal(commits[0].value,'REWARD123','Confirmation keeps exact selected reward code');

for(const selectedLocale of ['ar','en']){
  locale=selectedLocale;
  const state={id:1,status:'ready',summary:balance('Customer',0,0),confirmed:true};
  const markup=renderToStaticMarkup(React.createElement(CashierCustomerSummary,{state,saved:true,operation:operation('a',{stampsInCycle:0,availableRewards:0})}));
  check(markup.includes('aria-live="polite"')&&markup.includes('aria-atomic="true"'),'Accessible concise live region');
  check(markup.includes(selectedLocale==='en'?'Available rewards':'المكافآت المتاحة'),'Locale labels translated');
  check(markup.includes(new Intl.NumberFormat(selectedLocale).format(0)),'Zero rendered in selected locale');
  check(!markup.includes('NaN')&&!markup.includes('undefined'),'No fabricated or invalid values');
  const slow=renderToStaticMarkup(React.createElement(CashierCustomerSummary,{state:{id:1,status:'slow',summary:null,confirmed:false},saved:false}));
  check(!slow.includes('<dd'),'Unknown state never displays zero balances');
  for(const status of ['loading','slow','unavailable']){
    const pending=renderToStaticMarkup(React.createElement(CashierCustomerSummary,{state:{id:1,status,summary:null,confirmed:false},saved:true}));
    check(pending.includes('data-summary-loading="compact"')&&pending.includes(selectedLocale==='en'?'Loading customer details':'جارٍ عرض بيانات العميل'),'Compact loader has a localized accessible name');
    check(pending.includes(selectedLocale==='en'?'Stamp pending':'الختم قيد التسجيل'),'Actual stamp status stays visible beside the loader');
  }
}
const css=fs.readFileSync(path.join(root,'components/rast-loyalty/rast-cashier.module.css'),'utf8');
for(const selector of ['customerSummary','customerSummaryHeading','customerSummaryStats','customerSummaryStatus'])check(css.includes('.'+selector),'Every summary CSS selector exists');
check(/\.customerSummary\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/.test(css),'Long names wrap in constrained panels');
check(/\.customerSummaryStats\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(css),'Balance columns shrink on small screens');
controller.clear();
console.log(`PASS: ${checks} cashier summary UI assertions; real controller/hook and handlers, deferred storage/network, selected confirmation, stale-response isolation, zero/null/rollover, locales, redemption and CSS`);
