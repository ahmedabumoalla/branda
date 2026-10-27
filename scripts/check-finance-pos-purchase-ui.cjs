const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
global.requestAnimationFrame=callback=>callback();
function load(file, mocks={}) {
  const exports={};
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','exports',compiled)(name=>{
    if(name in mocks)return mocks[name];
    if(name.endsWith('.css'))return new Proxy({},{get:(_,key)=>key});
    if(name.startsWith('@/')||name.startsWith('./')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(base+'.ts')?base+'.ts':base+'.tsx',mocks);}
    return require(name);
  },exports);return exports;
}
const nodes=x=>Array.isArray(x)?x.flatMap(nodes):x&&typeof x==='object'?[x,...nodes(x.props?.children)]:[];
const text=x=>Array.isArray(x)?x.map(text).join(''):x&&typeof x==='object'?text(x.props?.children):x==null||typeof x==='boolean'?'':String(x);
const button=(tree,label)=>nodes(tree).find(x=>x.type==='button'&&text(x)===label);
const field=(tree,name)=>nodes(tree).find(x=>x.props?.name===name);
const named=name=>Object.defineProperty(()=>null,'name',{value:name});
function hooks(){let cursor=0;const slots=[];return {api:{...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect(){cursor++;}},render(fn,props){cursor=0;return fn(props);}};}

const snapshot={role:'cashier',userId:'user',cafe:{id:'cafe',slug:'brand'},units:[],items:[{id:'item',name:'Cup',unit:'unit',active:true}],products:[],accounts:[],parties:[],warehouses:[{id:'warehouse',active:true,name:'Warehouse'}],stock:[],settings:{vat_rate:15,tax_inclusive:true},shifts:[{id:'shift',user_id:'user',status:'open',expected_cash:100,supervisor_paused:false}]};
const mocks={'./finance-inventory-item-form':{FinanceInventoryItemForm:named('InventoryEditor')},'./finance-shift-attachments':{FinanceShiftAttachments:named('Attachments')}};
async function run(){
 const h=hooks(),calls=[],states=[];let resolveSave;
 const Form=load('components/finance/finance-pos-purchase-form.tsx',{...mocks,react:h.api}).FinancePosPurchaseForm;
 const props={form:{operation:'shift_purchase',title:'Purchase',values:{shiftId:'shift'}},snapshot,pending:false,error:'',onCancel(){},onBusyChange:x=>states.push(x),onSubmit:async(op,payload)=>{calls.push({op,payload});return new Promise(resolve=>{resolveSave=resolve});}};
 let tree=h.render(Form,props);assert.equal(nodes(tree).some(x=>x.type===mocks['./finance-inventory-item-form'].FinanceInventoryItemForm),false);
 const inputs=nodes(tree).filter(x=>x.type==='input');inputs.find(x=>x.props.maxLength===150).props.onChange({target:{value:'Supplier'}});inputs.find(x=>x.props.type==='tel').props.onChange({target:{value:'0500000000'}});
 nodes(tree).find(x=>x.type==='select'&&x.props.value==='').props.onChange({target:{value:'item'}});
 inputs.find(x=>x.props.max==='10000000').props.onChange({target:{value:'10'}});tree=h.render(Form,props);
 const Original=global.FormData;global.FormData=class{get(name){return name==='warehouseId'?'warehouse':name==='note'?'invoice123':'';}};
 const event={preventDefault(){},currentTarget:{}};const form=nodes(tree).find(x=>x.type==='form');const pending=form.props.onSubmit(event);await form.props.onSubmit(event);assert.equal(calls.length,1);assert.equal(calls[0].op,'shift_purchase');assert.equal(calls[0].payload.expectedTotal,11.5);assert.equal(calls[0].payload.shiftId,'shift');assert.equal(calls[0].payload.accountId,undefined);assert.deepEqual(calls[0].payload.attachmentIds,[]);assert.equal(states.at(-1),true);resolveSave(false);await pending;assert.equal(states.at(-1),false);
 tree=h.render(Form,{...props,snapshot:{...snapshot,shifts:[{...snapshot.shifts[0],expected_cash:1}]}});await nodes(tree).find(x=>x.type==='form').props.onSubmit(event);assert.equal(calls.length,1);
 tree=h.render(Form,{...props,snapshot:{...snapshot,shifts:[{...snapshot.shifts[0],supervisor_paused:true}]}});assert.ok(nodes(tree).find(x=>x.type==='button'&&x.props.type==='submit').props.disabled);await nodes(tree).find(x=>x.type==='form').props.onSubmit(event);assert.equal(calls.length,1);
 tree=h.render(Form,{...props,snapshot:{...snapshot,userId:'another'}});assert.ok(nodes(tree).find(x=>x.type==='button'&&x.props.type==='submit').props.disabled);
 global.FormData=Original;
 console.log('PASS POS purchase UI: own shift, paused/foreign guard, cash balance, VAT payload, no account override, submit lock and recoverable failure');
}
run().catch(error=>{console.error(error);process.exitCode=1});
