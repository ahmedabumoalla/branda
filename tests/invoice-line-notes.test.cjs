const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
let active;
const same=(a,b)=>a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const react={
 useState(initial){const c=active,i=c.i++;if(!(i in c.slots))c.slots[i]=initial;return[c.slots[i],v=>c.slots[i]=typeof v==='function'?v(c.slots[i]):v];},
 useRef(initial){const c=active,i=c.i++;return c.slots[i]??(c.slots[i]={current:initial});},
 useCallback(fn,deps){const c=active,i=c.i++;if(!same(c.slots[i]?.deps,deps))c.slots[i]={fn,deps};return c.slots[i].fn;},
 useEffect(fn,deps){const c=active,i=c.i++;if(!same(c.effects[i]?.deps,deps)){c.effects[i]?.cleanup?.();c.effects[i]={deps};c.queue.push(()=>c.effects[i].cleanup=fn());}},
};
const load=(file,mocks)=>{const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n in mocks?mocks[n]:require(n),exports);return exports;};
let pending=[],saves=[],failure=false;
const initial={enabled:true,notes:[{id:'a',text:'العنوان الحصري - بدون سكر'}],settingsRevision:1,lines:[{key:9,notes:['العنوان الحصري - بدون سكر']},{key:3,notes:['العنوان الحصري - ساخن']}],revision:4,hasSelection:true,issued:false};
const actions={
 getFinanceInvoiceLineNoteContext:()=>new Promise(resolve=>pending.push(resolve)),
 saveFinanceInvoiceLineNoteSelection:async(slug,input)=>{saves.push(input);return failure?{ok:false,message:'تعارض النسخة'}:{ok:true,data:{revision:input.revision+1,lines:input.lines,issued:false}};},
 saveFinanceInvoiceCustomLineNotes:async()=>({ok:false,message:'تغيرت المكتبة'}),
 getFinanceInvoiceLineNoteOptions:async()=>({ok:true,data:{enabled:true,notes:[{id:'b',text:'العنوان الحصري - جديد'}],revision:7}}),
};
const {useInvoiceLineNotes}=load('components/finance/use-invoice-line-notes.ts',{'react':react,'@/app/actions/finance-invoice-line-notes':actions});
const c={i:0,slots:[],effects:[],queue:[]};const render=()=>{active=c;c.i=0;return useInvoiceLineNotes('tenant');};const flush=async()=>{for(const fn of c.queue.splice(0))fn();await Promise.resolve();await Promise.resolve();await Promise.resolve();};
(async()=>{
 let h=render();await flush();pending.shift()({ok:true,data:initial});await flush();h=render();assert.equal(h.ready,true);assert.deepEqual(h.values[9],initial.lines[0].notes);
 h.change(3,['العنوان الحصري - بارد']);h=render();await h.save('draft',2,[3,9]);assert.deepEqual(saves.at(-1).lines.map(l=>l.key),[3,9]);assert.equal(saves.at(-1).revision,0);h=render();
 await h.save('draft',3,[9]);assert.deepEqual(saves.at(-1).lines.map(l=>l.key),[9],'deleted line notes do not migrate to a new index');h=render();assert(!h.values[3]);
 const saved=h.values[9];await h.saveCustom(['العنوان الحصري - جديد']);h=render();assert.equal(h.context.settingsRevision,7);assert.deepEqual(h.values[9],saved,'library conflict refresh does not discard unsaved invoice notes');
 failure=true;assert.equal((await h.save('draft',4,[9])).ok,false);assert.equal(render().ready,false);failure=false;
 const a=render().loadDraft('a'),b=render().loadDraft('b');const ra=pending.shift(),rb=pending.shift();rb({ok:true,data:{...initial,enabled:false,lines:[{key:5,notes:['العنوان الحصري - محفوظة']}],revision:8}});await b;ra({ok:true,data:initial});await a;h=render();assert.equal(h.context.enabled,false);assert.deepEqual(Object.keys(h.values),['5']);await h.save('b',5,[5]);assert.equal(saves.at(-1).revision,8);assert.equal(saves.at(-1).lines[0].notes[0],'العنوان الحصري - محفوظة','disabled library preserves saved notes');
 for(const e of Object.values(c.effects))e.cleanup?.();
 const model=load('lib/finance/invoice-line-notes.ts',{});
 const {withInvoiceLineNotes}=load('lib/data/invoice-line-notes.ts',{'server-only':{},'@/lib/finance/invoice-line-notes':model});
 const original={id:'invoice',total:46,tax:6,lines:[{name:'first',description:'untouched',quantity:1,total:23},{name:'second',description:'original',quantity:1,total:23}]};
 const payload={recorded:true,lines:[{lineIndex:1,key:9,notes:['العنوان الحصري - بارد']}]};
 const enriched=await withInvoiceLineNotes({rpc:async()=>({data:payload,error:null})},'tenant',original);
 assert.equal(enriched.lines[1].description,'original');assert.deepEqual(enriched.lines[1].notes,payload.lines[0].notes);assert.equal(enriched.total,46);assert.equal(enriched.tax,6);assert.equal(original.lines[1].notes,undefined,'financial source object unchanged');
 await assert.rejects(()=>withInvoiceLineNotes({rpc:async()=>({error:{code:'42501'}})},'tenant',original));
 await assert.rejects(()=>withInvoiceLineNotes({rpc:async()=>({data:{recorded:true,lines:[{lineIndex:4,key:9,notes:['test']}]},error:null})},'tenant',original));
 console.log('PASS: keyed reorder/removal, revision conflicts, stale isolation, disabled preservation, library refresh, immutable presentation mapping and read failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
