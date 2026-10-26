const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const slots = []; let cursor=0, effects=[], timers=[], calls=[], saves=[];
const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i].deps[n])){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
const row={id:'s1',shift_number:7,user_id:'cashier',employee_name:'Cashier',drawer_name:'Drawer',status:'open',supervisor_paused:false,monitor_status:'active',opened_at:'2026-10-26T12:00:00Z',closed_at:null,last_seen_at:'2026-10-26T12:00:00Z',pending_count:0,conflict_count:0,current_expected:100,counted_cash:null,variance:null};
let data={rows:[row,{...row,id:'s2',shift_number:8,monitor_status:'stalled'},{...row,id:'s3',shift_number:9,status:'closed',monitor_status:'closed'}],total:80,checkedAt:'now',actions:[]};
const exportsObject={};
const mocks={react:hooks,'./finance-shift-analytics':{FinanceShiftAnalytics:function FinanceShiftAnalytics(){}},'@/components/dashboard/ui/modal':{Modal:function Modal(){}},'./finance-ui':{Empty:function Empty(){},Panel:function Panel(){},Numeric:function Numeric(){},financeDate:v=>v||'—'},'./finance-cash-handover-form':{FinanceCashHandoverForm:function FinanceCashHandoverForm(){}},'@/app/actions/finance-shift-monitor':{fetchFinanceShiftMonitorAction:async f=>{calls.push(f);return{ok:true,data:f.shiftId?{...data,rows:data.rows.filter(r=>r.id===f.shiftId)}:data};},superviseFinanceShiftAction:async command=>{saves.push(command);return{ok:true,data:{id:row.id}};}},'@/app/actions/brand-finance':{executeBrandFinanceAction:async command=>{saves.push(command);return{ok:true,data:{id:row.id}};}}};
const compiled=ts.transpileModule(fs.readFileSync('components/finance/finance-shift-monitor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
new Function('require','exports','setTimeout','clearTimeout','setInterval','clearInterval',compiled)(n=>n in mocks?mocks[n]:n.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,k)=>k})}:require(n),exportsObject,fn=>{timers.push(fn);return timers.length;},()=>{},()=>1,()=>{});
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.props?.children)]:[];
const text=t=>Array.isArray(t)?t.map(text).join(''):t&&typeof t==='object'?text(t.props?.children):t==null||typeof t==='boolean'?'':String(t);
const find=(t,p)=>{const n=nodes(t).find(p);assert(n,'control missing');return n;};
const button=(t,label)=>find(t,n=>n.type==='button'&&text(n)===label);
const props={snapshot:{cafe:{id:'brand',slug:'test'},shifts:[],accounts:[],documents:[]},onChanged(){}};
function render(){cursor=0;const t=exportsObject.FinanceShiftMonitor(props);const e=effects;effects=[];e.forEach(f=>f());return t;}
async function tick(){const t=timers;timers=[];t.forEach(f=>f());await new Promise(r=>setImmediate(r));}
(async()=>{
 let tree=render();await tick();tree=render();assert.equal(calls[0].offset,0);assert.equal(nodes(tree).filter(n=>n.type==='tr').length,4);
 const status=nodes(tree).filter(n=>typeof n.type==='function'&&n.type.name==='Status');assert.equal(status.length,3);
 assert(status[0].type(status[0].props).props.className.includes('active'));assert(status[1].type(status[1].props).props.className.includes('stalled'));assert(status[2].type(status[2].props).props.className.includes('closed'));
 button(tree,'التالي').props.onClick();render();await tick();tree=render();assert.equal(calls.at(-1).offset,50);
 const search=find(tree,n=>n.props?.['aria-label']==='البحث في الورديات');search.props.onChange({target:{value:'7'}});render();await tick();tree=render();assert.equal(calls.at(-1).offset,0);assert.equal(calls.at(-1).query,'7');
 button(tree,'#7').props.onClick({stopPropagation(){}});render();await tick();tree=render();assert(find(tree,n=>n.type?.name==='Modal').props.open);assert(find(tree,n=>n.type?.name==='FinanceShiftAnalytics'));button(tree,'الصندوق والإجراءات').props.onClick();tree=render();
 button(tree,'إيقاف البيع مؤقتًا').props.onClick();tree=render();assert(button(tree,'تأكيد الإجراء').props.disabled);
 find(tree,n=>n.type==='textarea').props.onChange({target:{value:'Power failure'}});tree=render();await button(tree,'تأكيد الإجراء').props.onClick();await tick();tree=render();assert.equal(saves[0].action,'pause');assert.equal(saves[0].shiftId,'s1');assert.equal(saves[0].reason,'Power failure');
 button(tree,'إقفال إداري').props.onClick();tree=render();let form=find(tree,n=>n.type?.name==='FinanceCashHandoverForm');await form.props.onSubmit('shift_close',{countedCash:95,handoverType:'next_shift'});assert.equal(saves.length,1,'cannot close without explicit acknowledgement');
 tree=render();find(tree,n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});tree=render();form=find(tree,n=>n.type?.name==='FinanceCashHandoverForm');await form.props.onSubmit('shift_close',{countedCash:95,handoverType:'next_shift'});assert.equal(saves[1].operation,'shift_close');assert.equal(saves[1].payload.supervisorClose,true);assert.equal(saves[1].payload.countedCash,95);
 await tick();tree=render();find(tree,n=>n.type?.name==='Modal').props.onClose();tree=render();button(tree,'#9').props.onClick({stopPropagation(){}});render();await tick();tree=render();button(tree,'الصندوق والإجراءات').props.onClick();tree=render();assert(!nodes(find(tree,n=>n.type?.name==='Modal')).some(n=>n.type==='button'&&text(n)==='إقفال إداري'),'closed shifts have no repeat closing or reopen');
 console.log('Shift monitor UI: colors, pagination, search, details, reason, pause, acknowledged closure and closed-state checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
