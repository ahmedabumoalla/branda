const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const React=require('react');
const slots=[];let cursor=0,effects=[],calls=0,resolveRequest,stateWrites=0;const intervals=new Map();let timerId=0;
const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>{stateWrites++;slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i].deps[n])){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
const mocks={react:hooks,'@/app/actions/finance-shift-analytics':{fetchFinanceShiftAnalyticsAction:()=>{calls++;return new Promise(r=>resolveRequest=r);}},'@/lib/finance/shift-analytics':{},'./finance-ui':{}};
const compiled=ts.transpileModule(fs.readFileSync('components/finance/finance-shift-analytics.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const moduleExports={},page={visibilityState:'visible'};
new Function('require','exports','setInterval','clearInterval','document',compiled)(n=>n in mocks?mocks[n]:n.endsWith('.css')?{__esModule:true,default:{}}:require(n),moduleExports,fn=>{intervals.set(++timerId,fn);return timerId;},id=>intervals.delete(id),page);
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const report={shiftId:'shift-1',closedAt:'2026-10-27T00:00:00Z'};
let props={shiftId:'shift-1',slug:'brand',visible:true,refreshKey:0};
function render(){cursor=0;const tree=moduleExports.FinanceShiftAnalytics(props);const pending=effects;effects=[];pending.forEach(f=>f());return tree;}
const tick=()=>{for(const fn of intervals.values())fn();};
const finish=async value=>{resolveRequest(value);await new Promise(r=>setImmediate(r));};
const displayed=tree=>nodes(tree).find(n=>n.type?.name==='ShiftAnalyticsView');
(async()=>{
 render();assert.equal(calls,1);await finish({ok:true,data:report});let tree=render();assert.equal(displayed(tree).props.report,report);
 for(let i=0;i<5;i++){props.visible=false;render();tick();props.visible=true;tree=render();assert.equal(displayed(tree).props.report,report);}
 assert.equal(calls,1,'Five tab round trips reuse the same loaded report without network calls');tick();assert.equal(calls,1,'Closed shifts do not poll');
 nodes(tree).find(n=>n.type==='button').props.onClick();tree=render();assert.equal(calls,2);assert(displayed(tree),'Manual refresh preserves the report while loading');await finish({ok:false,message:'Unavailable'});tree=render();assert(displayed(tree));assert(nodes(tree).some(n=>n.props?.role==='alert'));
 nodes(tree).find(n=>n.type==='button').props.onClick();render();await finish({ok:true,data:{...report,closedAt:null}});render();assert.equal(calls,3);
 props.visible=false;render();tick();assert.equal(calls,3,'Hidden report does not poll');props.visible=true;render();page.visibilityState='hidden';tick();assert.equal(calls,3,'Background page does not poll');page.visibilityState='visible';tick();assert.equal(calls,4);tick();assert.equal(calls,4,'Concurrent polling is deduplicated');await finish({ok:true,data:{...report,closedAt:null}});render();
 props.refreshKey++;render();assert.equal(calls,5,'Successful supervisor action can invalidate report');await finish({ok:true,data:report});render();tick();assert.equal(calls,5);
 props.shiftId='shift-2';tree=render();assert(!displayed(tree),'Never display another shift report');assert.equal(calls,6);
 for(const slot of slots)slot?.cleanup?.();assert.equal(intervals.size,0);const before=stateWrites;await finish({ok:true,data:{...report,shiftId:'shift-2'}});assert.equal(stateWrites,before,'Ignore late responses after unmount');
 console.log('Shift report loading: five tab round trips = one request; hidden/closed/background polling paused; explicit refresh, mutation invalidation, overlap guard and cleanup passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
