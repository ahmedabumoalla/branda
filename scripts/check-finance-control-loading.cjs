const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
function harness(name){
 const slots=[];let cursor=0,effects=[],calls=0,resolvers=[];
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i].deps[n])){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const fetch=()=>{calls++;return new Promise(r=>resolvers.push(r));};
 const mocks={react:hooks,'@/app/actions/finance-control-report':{fetchFinanceControlReportAction:fetch,fetchFinancePeriodClosuresAction:fetch},'@/lib/finance/control-report':{controlReportDifferences:()=>({trial:0,inventory:0,costComplete:true})},'./finance-ui':{financeDate:x=>x,Numeric:()=>null}};
 const compiled=ts.transpileModule(fs.readFileSync('components/finance/finance-control-panel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,exports={};
 new Function('require','exports',compiled)(n=>n in mocks?mocks[n]:n.endsWith('.css')?{__esModule:true,default:{}}:require(n),exports);
 return {render(props){cursor=0;const tree=exports[name](props);const e=effects;effects=[];e.forEach(f=>f());return tree;},get calls(){return calls;},async finish(value){resolvers.shift()(value);await tick();},unmount(){slots.forEach(s=>s?.cleanup?.());}};
}
const tick=()=>new Promise(r=>setImmediate(r));
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const button=tree=>nodes(tree).find(n=>n.type==='button');
(async()=>{
 const h=harness('FinanceControlPanel'),props={slug:'a',visible:true,snapshotVersion:{}};
 h.render(props);await tick();assert.equal(h.calls,1);
 props.visible=false;h.render(props);props.visible=true;h.render(props);await tick();assert.equal(h.calls,1,'deduplicate in-flight tab switches');
 await h.finish({ok:true,data:{generatedAt:'today'}});let tree=h.render(props);await tick();
 for(let i=0;i<5;i++){props.visible=false;h.render(props);props.visible=true;tree=h.render(props);}await tick();assert.equal(h.calls,1,'cached five round trips');
 button(tree).props.onClick();h.render(props);await tick();assert.equal(h.calls,2);
 props.snapshotVersion={};h.render(props);await h.finish({ok:true,data:{generatedAt:'old'}});h.render(props);await tick();assert.equal(h.calls,3,'mutation during request queues a fresh report');
 await h.finish({ok:false,message:'Unavailable'});h.render(props);await tick();h.render(props);await tick();assert.equal(h.calls,3,'no retry storm on failure');
 props.slug='b';tree=h.render(props);assert(!nodes(tree).some(n=>n.type==='h3'),'no cross-brand cached report');await tick();assert.equal(h.calls,4);h.unmount();await h.finish({ok:true,data:{generatedAt:'late'}});
 const p=harness('FinancePeriodHistory'),pp={slug:'a',visible:true};tree=p.render(pp);button(tree).props.onClick();p.render(pp);assert.equal(p.calls,1);
 tree=p.render(pp);button(tree).props.onClick();p.render(pp);await p.finish({ok:true,data:{rows:[],total:0,hasMore:false}});
 for(let i=0;i<5;i++){tree=p.render(pp);button(tree).props.onClick();p.render(pp);}assert.equal(p.calls,1,'closing/reopening history reuses the response even if closed while loading');p.unmount();
 console.log('Control report loading: tab cache, in-flight deduplication, mutation invalidation, bounded retry, brand isolation and history cache PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
