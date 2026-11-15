const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let active;
const same = (a,b) => a && a.length === b.length && a.every((v,i)=>Object.is(v,b[i]));
const react = {
  useState(initial) { const c=active,i=c.i++; if(!(i in c.slots))c.slots[i]=initial; return [c.slots[i],v=>{c.slots[i]=typeof v==='function'?v(c.slots[i]):v;}]; },
  useRef(initial) {const c=active,i=c.i++; return c.slots[i]??(c.slots[i]={current:initial});},
  useCallback(fn,deps) {const c=active,i=c.i++;if(!same(c.slots[i]?.deps,deps))c.slots[i]={fn,deps};return c.slots[i].fn;},
  useEffect(fn,deps) {const c=active,i=c.i++;if(!same(c.effects[i]?.deps,deps)){c.effects[i]?.cleanup?.();c.effects[i]={deps};c.queue.push(()=>c.effects[i].cleanup=fn());}},
};
let reads=[],saves=[],saveResult={ok:true,data:{sourceId:'source-a',revision:1,issued:false}};
const actions = {
  getFinanceOrderSourceContext(slug,id){return new Promise(resolve=>reads.push({slug,id,resolve}));},
  saveFinanceInvoiceOrderSource:async(slug,input)=>{saves.push({slug,input});return saveResult;},
};
const moduleExports={};
new Function('require','exports',ts.transpileModule(fs.readFileSync('components/finance/use-invoice-order-source.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='react'?react:actions,moduleExports);
function runner(slug,initial){const c={i:0,slots:[],effects:[],queue:[]};return {render(){active=c;c.i=0;return moduleExports.useInvoiceOrderSource(slug,initial);},async flush(){for(const fn of c.queue.splice(0))fn();await Promise.resolve();await Promise.resolve();},cleanup(){Object.values(c.effects).forEach(e=>e.cleanup?.());}};}
const context=(extra={})=>({settings:{sources:[{id:'source-a',name:'العنوان الحصري',active:true}],defaultMode:'specific',defaultSourceId:'source-a',required:false},settingsRevision:1,selectedSourceId:null,selectionRevision:0,hasSelection:false,defaultSelectionId:'source-a',issued:false,...extra});
(async()=>{
  const app=runner('tenant-a'); let hook=app.render();assert.equal(hook.ready,false);await app.flush();
  reads.shift().resolve({ok:true,data:context()});await app.flush();hook=app.render();assert.equal(hook.selected,'source-a');assert.equal(hook.ready,true);
  hook.choose('');hook=app.render();assert.equal(hook.selected,null,'user can override default');
  saveResult={ok:true,data:{sourceId:null,revision:1,issued:false}};
  assert((await hook.save('draft-a',3)).ok);hook=app.render();assert.equal(saves.at(-1).input.draftRevision,3);assert.equal(saves.at(-1).input.sourceId,null);assert.equal(saves.at(-1).input.revision,0);
  saveResult={ok:true,data:{sourceId:null,revision:2,issued:false}};await hook.save('draft-a',4);assert.equal(saves.at(-1).input.revision,1,'subsequent save uses server revision');
  hook=app.render();const restoring=hook.loadDraft('draft-b');await app.flush();reads.shift().resolve({ok:true,data:context({hasSelection:true,selectedSourceId:null,selectionRevision:8})});await restoring;hook=app.render();assert.equal(hook.selected,null,'saved empty selection wins over default');
  saveResult={ok:false,message:'تغير المصدر في جلسة أخرى'};assert.equal((await hook.save('draft-b',9)).ok,false);hook=app.render();assert.equal(hook.ready,false,'save conflict requires reload');
  const retry=hook.retry();reads.shift().resolve({ok:true,data:context({hasSelection:true,selectedSourceId:'source-a',selectionRevision:9})});await retry;hook=app.render();assert.equal(hook.ready,true);assert.equal(hook.selected,'source-a');
  const old=hook.loadDraft('old'),newest=hook.loadDraft('new');const a=reads.shift(),b=reads.shift();b.resolve({ok:true,data:context({hasSelection:true,selectedSourceId:null})});await newest;a.resolve({ok:true,data:context()});await old;assert.equal(app.render().selected,null,'stale source cannot replace current draft selection');
  const fail=app.render().loadDraft('failed');reads.shift().resolve({ok:false,message:'تعذر التحميل'});await fail;hook=app.render();assert.equal(hook.ready,false);assert.equal((await hook.save('failed',1)).ok,false);
  const issued=hook.loadDraft('issued');reads.shift().resolve({ok:true,data:context({issued:true,hasSelection:false})});await issued;assert.equal(app.render().selected,null,'new defaults do not rewrite an older issued invoice');
  app.cleanup();
  const draft=runner('tenant-b','existing');draft.render();await draft.flush();assert.equal(reads.length,0,'existing draft waits for restore flow before applying defaults');draft.cleanup();
  console.log('PASS: defaults, saved empty source, revision persistence, conflict recovery, stale-response isolation, fail-closed loading, restore ordering');
})().catch(error=>{console.error(error);process.exitCode=1;});
