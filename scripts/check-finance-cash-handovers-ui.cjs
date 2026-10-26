const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
function hooks() {
 const slots=[]; let cursor=0,effects=[];
 return { api:{...React,
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},
  useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i].deps[n])){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}
 },render(fn,props){cursor=0;const tree=fn(props),todo=effects;effects=[];todo.forEach(fn=>fn());return tree;}};
}
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):tree==null||typeof tree==='boolean'?'':String(tree);
const find=(tree,p)=>{const n=nodes(tree).find(p);assert.ok(n,'Expected control');return n;};
const field=(tree,name)=>find(tree,n=>n.props?.name===name);
const button=(tree,label)=>find(tree,n=>n.type==='button'&&text(n)===label);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const row={id:'handover-private-id',shift_id:'shift',shift_number:42,drawer_id:'drawer',drawer_name:'صندوق الكاشير',amount:125,handover_type:'other',from_user_id:'employee',from_name:'موظف الوردية',recipient_user_id:null,recipient_name:'المستلم',recipient_phone:'0500000000',created_at:'2026-10-25T10:05:37Z',status:'pending',received_at:null,received_by_name:null,document_number:12,receipt_document_number:null};
function harness(kind='list',options={}) {
 const hook=hooks(),calls=[],saves=[];
 const state={data:{rows:[row],total:1,hasMore:false,canReceive:true,cashierDrawerId:'drawer',accountants:[{user_id:'accountant',name:'المحاسب'}]},...options};
 const snapshot={cafe:{slug:'brand'},accounts:[{id:'drawer',name:'صندوق الكاشير',kind:'cash',active:true,is_cashier_drawer:true,balance:9999},{id:'cash',name:'الخزينة',kind:'cash',active:true,is_primary:true,balance:0},{id:'bank',name:'البنك',kind:'bank',active:true,balance:0},{id:'archived',name:'مؤرشف',kind:'cash',active:false}],shifts:[{id:'shift',shift_number:42,account_id:'drawer',expected_cash:125}],documents:[],truncated:false};
 const props=kind==='form'?{snapshot,form:{operation:'shift_open'},pending:false,error:'',onCancel(){},onSubmit:async(...args)=>{saves.push(args);return true;}}:{snapshot,onReceived(){state.received=true;}};
 const mocks={react:hook.api,'@/components/dashboard/ui/modal':{Modal:function Modal(){}},'./finance-ui':{Numeric:function Numeric(){}},'@/app/actions/finance-cash-handovers':{fetchFinanceCashHandoversAction:async(...args)=>{calls.push(args);return state.error?{ok:false,message:state.error}:{ok:true,data:state.data};},receiveFinanceShiftCashAction:async(...args)=>{saves.push(args);if(state.wait)await state.wait;return state.saveError?{ok:false,message:state.saveError}:{ok:true,data:{id:'receipt',number:77}};}}};
 const exports={};const compiled=ts.transpileModule(fs.readFileSync(`components/finance/finance-cash-${kind==='form'?'handover-form':'handovers'}.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports',compiled)(name=>name in mocks?mocks[name]:name.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,key)=>key})}:require(name),exports);
 return {state,props,calls,saves,time:exports.cashHandoverTime,render:()=>hook.render(kind==='form'?exports.FinanceCashHandoverForm:exports.FinanceCashHandovers,props)};
}
async function ready(h){h.render();await tick();return h.render();}
const submit=tree=>find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
const change=(h,tree,name,value)=>{field(tree,name).props.onChange({target:{value}});return h.render();};
async function main(){let checks=0;
 {
  const storage=new Map();global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
  const h=harness('form');h.props.snapshot.cafe.id='brand-id';
  h.state.data.cashierDrawers=[{id:'drawer',name:'Cashier 1',busy:true},{id:'drawer-two',name:'Cashier 2',busy:false}];
  let tree=await ready(h);assert.equal(field(tree,'accountId').props.value,'');assert.equal(nodes(field(tree,'accountId')).find(n=>n.type==='option'&&n.props.value==='drawer').props.disabled,true);
  tree=change(h,tree,'openingCash','50');await submit(tree);assert.equal(h.saves.length,0);
  tree=change(h,h.render(),'accountId','drawer-two');assert.equal(field(tree,'openingCash').props.value,'');
  tree=change(h,tree,'openingCash','50');await submit(tree);assert.equal(h.saves[0][1].accountId,'drawer-two');assert.equal(storage.get('branda-pos-drawer:brand-id'),'drawer-two');
  const remembered=harness('form');remembered.props.snapshot.cafe.id='brand-id';remembered.state.data.cashierDrawers=h.state.data.cashierDrawers;assert.equal(field(await ready(remembered),'accountId').props.value,'drawer-two');
  const busy=harness('form');busy.props.snapshot.cafe.id='brand-id';busy.state.data.cashierDrawers=h.state.data.cashierDrawers.map(x=>({...x,busy:true}));tree=await ready(busy);tree=change(busy,tree,'openingCash','50');await submit(tree);assert.equal(busy.saves.length,0);
  const other=harness('form');other.props.snapshot.cafe.id='other-brand';other.state.data.cashierDrawers=h.state.data.cashierDrawers;assert.equal(field(await ready(other),'accountId').props.value,'');
  delete global.localStorage;checks++;
 }
 {
  const h=harness('form');let tree=h.render();assert.equal(find(tree,n=>n.type==='fieldset').props.disabled,true);tree=await ready(h);
  assert.equal(field(tree,'openingCash').props.value,'');assert.equal(field(tree,'openingCash').props.required,true);assert.equal(field(tree,'accountId').props.value,'drawer');assert.ok(!text(tree).includes('9999'));assert.ok(!nodes(tree).some(n=>n.type?.name==='Numeric'));
  await submit(tree);assert.equal(h.saves.length,0);tree=change(h,h.render(),'openingCash','0');await submit(tree);assert.deepEqual(h.saves[0],['shift_open',{accountId:'drawer',openingCash:0,note:''}]);checks++;
 }
 {
  const h=harness('form');h.props.form={operation:'shift_close',values:{shiftId:'shift',expectedCash:9999}};let tree=await ready(h);assert.equal(field(tree,'handoverType').props.value,'');tree=change(h,tree,'countedCash','10');await submit(tree);assert.equal(h.saves.length,0);
  tree=change(h,h.render(),'handoverType','other');await submit(tree);assert.equal(h.saves.length,0);tree=change(h,h.render(),'recipientName',' Person ');tree=change(h,tree,'recipientPhone',' 0500000000 ');await submit(tree);assert.deepEqual(h.saves[0],['shift_close',{shiftId:'shift',countedCash:10,handoverType:'other',recipientName:'Person',recipientPhone:'0500000000',note:''}]);checks++;
 }
 {
  const h=harness('form');h.props.form={operation:'shift_close',values:{shiftId:'shift'}};h.props.snapshot.shifts[0].account_id='old-cash';let tree=await ready(h);tree=change(h,tree,'countedCash','125');tree=change(h,tree,'handoverType','accountant');tree=change(h,tree,'recipientUserId','invalid');await submit(tree);assert.equal(h.saves.length,0);tree=change(h,h.render(),'recipientUserId','accountant');await submit(tree);assert.equal(h.saves[0][1].recipientUserId,'accountant');tree=change(h,h.render(),'handoverType','next_shift');assert.match(text(tree),/بقيد موثق/);await submit(tree);assert.ok(!('recipientUserId' in h.saves[1][1]));checks++;
 }
 {
  const h=harness();let tree=await ready(h);assert.match(text(tree),/#42/);assert.match(h.time(row.created_at),/١٣:٠٥:٣٧/);assert.ok(!text(tree).includes('private-id'));button(tree,'استلام بسند قبض').props.onClick();tree=h.render();assert.equal(field(tree,'handoverAmount').props.readOnly,true);assert.equal(field(tree,'handoverAmount').props.value,'125.00');assert.equal(field(tree,'accountId').props.value,'cash');assert.ok(!nodes(field(tree,'accountId')).some(n=>n.type==='option'&&['drawer','archived'].includes(n.props.value)));
  h.state.saveError='Retry';await submit(tree);tree=h.render();assert.match(text(tree),/Retry/);h.state.saveError=null;await submit(tree);assert.equal(h.saves[0][0].requestId,h.saves[1][0].requestId);assert.deepEqual(Object.keys(h.saves[1][0]).sort(),['accountId','handoverId','note','requestId']);assert.equal(h.state.received,true);checks++;
 }
 {
  const h=harness('list',{data:{rows:[{...row,handover_type:'next_shift'},{...row,id:'done',status:'received'}],total:2,hasMore:false,canReceive:true,accountants:[]}});const tree=await ready(h);assert.ok(!nodes(tree).some(n=>n.type==='button'&&text(n)==='استلام بسند قبض'));checks++;
 }
 {
  const h=harness('list',{data:{rows:[row],total:1,hasMore:false,canReceive:false,accountants:[]}});assert.ok(!nodes(await ready(h)).some(n=>n.type==='button'&&text(n)==='استلام بسند قبض'));checks++;
 }
 {
  const h=harness('list',{error:'Unavailable'});let tree=await ready(h);assert.match(text(tree),/Unavailable/);h.state.error=null;h.state.data.hasMore=true;button(tree,'إعادة المحاولة').props.onClick();tree=await ready(h);button(tree,'التالي').props.onClick();tree=await ready(h);assert.equal(h.calls.at(-1)[0],50);button(tree,'استلام بسند قبض').props.onClick();tree=h.render();h.props.slug='other-brand';tree=h.render();assert.ok(!text(tree).includes('#42')||nodes(tree).filter(n=>n.type?.name==='Modal').every(n=>!n.props.open));await submit(tree);assert.equal(h.saves.length,0);checks++;
 }
 {
  let release;const h=harness('list',{wait:new Promise(resolve=>release=resolve)});h.state.data.rows=[{...row,amount:0}];let tree=await ready(h);button(tree,'استلام بسند قبض').props.onClick();tree=h.render();assert.equal(field(tree,'handoverAmount').props.value,'0.00');const work=submit(tree);await submit(tree);assert.equal(h.saves.length,1);release();await work;checks++;
 }
 {
  const h=harness('form');h.props.form={operation:'shift_close',values:{shiftId:'shift'}};let tree=await ready(h);
  await submit(tree);assert.equal(h.saves.length,0,'blank count never becomes zero');
  tree=change(h,tree,'countedCash','0');assert.ok(!nodes(tree).some(n=>n.props?.name==='handoverType'));await submit(tree);
  assert.deepEqual(h.saves[0],['shift_close',{shiftId:'shift',countedCash:0,handoverType:'no_cash',note:''}]);
  tree=change(h,h.render(),'countedCash','1');await submit(tree);assert.equal(h.saves.length,1,'positive cash still requires recipient');checks++;
 }
 const treasury=fs.readFileSync('components/finance/finance-treasury.tsx','utf8');assert.match(treasury,/!account.is_primary && !account.is_cashier_drawer/);assert.match(treasury,/صندوق الكاشير مخصص للورديات ولا يمكن أرشفته/);checks++;
 console.log(`PASS cash handovers UI ${checks} groups: blind auto drawer, required count/recipient, zero, legacy transfer hint, exact receipt without income, permissions, retry idempotency, pagination, double submit`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
