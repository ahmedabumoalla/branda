const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
let current; let route='section=shifts';
const browser={location:{pathname:'/dashboard/finance'},history:{pushState(_a,_b,url){route=url.split('?')[1]||'';},replaceState(_a,_b,url){route=url.split('?')[1]||'';}}};
const hooks = { ...React, useState(initial) { const context=current,index=context.index++; if (!(index in context.slots)) context.slots[index]=typeof initial==='function'?initial():initial; return [context.slots[index], value=>context.slots[index]=typeof value==='function'?value(context.slots[index]):value]; }, useRef(initial) { const context=current,index=context.index++;return context.slots[index]??(context.slots[index]={current:initial}); }, useEffect(fn,deps) { const context=current,index=context.index++,previous=context.effects[index]; if (!previous || deps.some((value,i)=>value!==previous.deps[i])) {previous?.cleanup?.(); context.effects[index]={deps}; context.queue.push(()=>context.effects[index].cleanup=fn());} } };
function runner(fn,props) { const context={slots:[],effects:[],queue:[],index:0}; return { render() {current=context;context.index=0;return fn(props);}, async flush() {for(const effect of context.queue.splice(0))effect();await Promise.resolve();await Promise.resolve();}, context }; }
function load(file,mocks={}) {const exports={}; const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports','document','window','setInterval','clearInterval',code)(name=>name==='react'?hooks:name in mocks?mocks[name]:name.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,key)=>key})}:require(name),exports,{visibilityState:'visible'},browser,()=>1,()=>{});return exports;}
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):tree==null||typeof tree==='boolean'?'':String(tree);
const find=(tree,predicate)=>{const item=nodes(tree).find(predicate);assert(item,'expected control');return item;};
const button=(tree,label)=>find(tree,node=>node.type==='button'&&text(node)===label);
const permissions=load('lib/finance/permissions.ts');
const model=load('lib/finance/shift-sessions.ts');
const ui={Empty:function Empty(){},Numeric:function Numeric(){},financeDate:value=>value||'—'};
let calls=[],pending=[];
const row={id:'f127c2c2-0051-433e-bfbf-e47f19a09999',shift_number:7,employee_name:'العنوان الحصري',drawer_name:'صندوق تجريبي',status:'open',opened_at:'2026-11-12',closed_at:null,current_expected:12,net_sales:10,sales_total:15,refunded_total:5};
const actions={readShiftSessionsAction:(filters)=>{calls.push(filters);return new Promise(resolve=>pending.push(resolve));}};
const sessionStub={FinanceShiftSession:function FinanceShiftSession(){},ShiftSessionPagination:function ShiftSessionPagination(){}};
const monitor=load('components/finance/finance-shift-monitor.tsx',{'next/link':{__esModule:true,default:'a'},'next/navigation':{useSearchParams:()=>new URLSearchParams(route)},'@/app/actions/finance-shift-sessions':actions,'@/lib/finance/permissions':permissions,'@/lib/finance/shift-sessions':model,'./finance-shift-session':sessionStub,'./finance-ui':ui});
const props={snapshot:{cafe:{id:'cafe',slug:'test'},role:'owner',accounts:[]},onChanged(){},onInvoice(){}};
(async()=>{
 const app=runner(monitor.FinanceShiftMonitor,props);let tree=app.render();await app.flush();assert.equal(calls.length,1);
 pending.shift()({ok:true,data:{rows:[row],total:1,offset:0,limit:30}});await app.flush();tree=app.render();assert(text(tree).includes('العنوان الحصري'));
 find(tree,node=>node.type==='input'&&node.props.maxLength===120).props.onChange({target:{value:'42'}});tree=app.render();await app.flush();assert.equal(calls.length,1,'editing query does not issue requests');
 find(tree,node=>node.type==='form').props.onSubmit({preventDefault(){}});tree=app.render();assert(!text(tree).includes('العنوان الحصري'),'old data hidden for new filters');await app.flush();assert.equal(calls[1].query,'42');
 find(tree,node=>node.type==='input'&&node.props.maxLength===120).props.onChange({target:{value:'43'}});tree=app.render();find(tree,node=>node.type==='form').props.onSubmit({preventDefault(){}});app.render();await app.flush();
 pending.shift()({ok:true,data:{rows:[{...row,employee_name:'stale'}],total:1,offset:0,limit:30}});await app.flush();assert(!text(app.render()).includes('stale'),'out of order response ignored');
 pending.shift()({ok:true,data:{rows:[row],total:1,offset:0,limit:30}});await app.flush();tree=app.render();button(tree,'#7').props.onClick();tree=app.render();assert.equal(tree.type,sessionStub.FinanceShiftSession,'detail opens full page');assert.equal(tree.props.id,'f127c2c2-0051-433e-bfbf-e47f19a09999');assert.equal(new URLSearchParams(route).get('shiftSession'),tree.props.id,'selected shift is addressable');const reloaded=runner(monitor.FinanceShiftMonitor,props);assert.equal(reloaded.render().type,sessionStub.FinanceShiftSession,'reload retains selected shift');tree.props.onBack();tree=app.render();assert.equal(find(tree,node=>node.type==='input'&&node.props.maxLength===120).props.value,'43','return preserves filters');
 assert.throws(()=>model.shiftSessionFiltersSchema.parse({from:'2026-12-01',to:'2026-01-01'}));assert.throws(()=>model.shiftSessionFiltersSchema.parse({status:'confirmed'}));assert.throws(()=>model.shiftSessionFiltersSchema.parse({accountId:'not-a-uuid'}));
 console.log('PASS: submitted filters, stale response isolation, full-page details, preserved search, filter validation');
})().catch(error=>{console.error(error);process.exitCode=1;});
