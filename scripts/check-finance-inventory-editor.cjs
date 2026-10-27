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
const unit={id:'10000000-0000-4000-8000-000000000001',name:'كيلو'};
const product={id:'20000000-0000-4000-8000-000000000001',name:'منتج المنيو'};
const saved={id:'30000000-0000-4000-8000-000000000001',name:'بن',unit_id:unit.id,unit:unit.name,barcode:'123456',active:true,average_cost:10,min_quantity:0,product_links:[],sku:'',menu_product_id:null};
const snapshot={role:'owner',cafe:{id:'cafe',slug:'brand'},units:[unit],items:[],products:[product],accounts:[],parties:[],warehouses:[{id:'warehouse',active:true}],stock:[],settings:{vat_rate:15,tax_inclusive:true}};
const mocks={'next/image':{default:named('Image'),__esModule:true},'./finance-inventory-barcode':{FinanceInventoryBarcode:named('FinanceInventoryBarcode')},'./finance-inventory-barcode-scanner':{FinanceInventoryBarcodeScanner:named('FinanceInventoryBarcodeScanner')}};
async function run(){
  let count=0;const pass=name=>{count++;console.log('PASS '+name)};
  const h=hooks(), calls=[], results=[];
  const api={saveFinanceInventoryItemAction:async(input)=>{calls.push(input);return calls.length===1?{ok:false,message:'تعذر تأكيد الحفظ'}:{ok:true,item:saved,units:[unit]}},saveFinanceInventoryUnitAction:async()=>({ok:true,unit})};
  const Form=load('components/finance/finance-inventory-item-form.tsx',{...mocks,react:h.api,'@/app/actions/finance-inventory-catalog':api}).FinanceInventoryItemForm;
  const props={snapshot,onSaved:(...args)=>results.push(args),onCancel(){}};
  let tree=h.render(Form,props);
  field(tree,'name').props.onChange({target:{value:'بن'}});
  tree=h.render(Form,props);
  let prevented=false;field(tree,'barcode').props.onKeyDown({key:'Enter',preventDefault(){prevented=true}});
  assert.equal(prevented,true);assert.equal(calls.length,0);pass('scanner keyboard Enter never saves item');
  await tree.props.onSubmit({preventDefault(){}});tree=h.render(Form,props);
  assert.match(text(tree),/تعذر تأكيد الحفظ/);assert.equal(results.length,0);
  await tree.props.onSubmit({preventDefault(){}});assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(calls[1].payload.barcode,'');assert.equal(results.length,1);pass('blank barcode reaches server and uncertain save retries same request');
  tree=h.render(Form,props);field(tree,'name').props.onChange({target:{value:'بن جديد'}});tree=h.render(Form,props);await tree.props.onSubmit({preventDefault(){}});assert.notEqual(calls[1].requestId,calls[2].requestId);pass('changed draft receives different idempotency key');
  button(tree,'ربط منتج').props.onClick();tree=h.render(Form,props);
  nodes(tree).find(x=>x.type==='select'&&!x.props.name).props.onChange({target:{value:product.id}});
  tree=h.render(Form,props);nodes(tree).find(x=>x.props?.['aria-label']==='كمية استهلاك المنتج 1').props.onChange({target:{value:'0'}});
  tree=h.render(Form,props);const before=calls.length;await tree.props.onSubmit({preventDefault(){}});assert.equal(calls.length,before);pass('invalid component consumption blocked before action');
  const file=nodes(tree).find(x=>x.type==='input'&&x.props.type==='file');file.props.onChange({target:{files:[{type:'text/html',size:1}],value:'fake'}});tree=h.render(Form,props);assert.match(text(tree),/3 ميجابايت/);pass('unsupported image rejected locally');
  const unitChanges=[];tree=h.render(Form,{...props,onUnitsChanged:units=>unitChanges.push(units)});button(tree,'إضافة وحدة قياس').props.onClick();tree=h.render(Form,{...props,onUnitsChanged:units=>unitChanges.push(units)});nodes(tree).find(x=>x.props?.['aria-label']==='اسم وحدة القياس الجديدة').props.onChange({target:{value:'كيلو'}});tree=h.render(Form,{...props,onUnitsChanged:units=>unitChanges.push(units)});button(tree,'حفظ الوحدة').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(unitChanges.length,1);assert.equal(unitChanges[0][0].id,unit.id);pass('saved unit merges into parent immediately even before item save');
  for(const role of ['auditor','accountant']){tree=h.render(Form,{...props,snapshot:{...snapshot,role}});assert.equal(nodes(tree).some(x=>x.type==='form'),false);}pass('inventory write gate blocks accountant and auditor editor');
  const hp=hooks();const child=named('FinanceInventoryItemForm');
  const Operation=load('components/finance/finance-operation-form.tsx',{react:hp.api,'./finance-inventory-item-form':{FinanceInventoryItemForm:child},'./finance-refund-form':{},'./sales-cashier-form':{},'./finance-supplier-payout-form':{},'./finance-cash-handover-form':{},'./finance-shift-forms':{},'./finance-shift-purchase-form':{}}).FinanceOperationForm;
  const purchaseProps={form:{operation:'purchase'},snapshot,pending:false,error:'',onCancel(){},onSubmit:async()=>true};
  tree=hp.render(Operation,purchaseProps);nodes(tree).find(x=>x.type==='input'&&x.props.value===1).props.onChange({target:{value:'7'}});tree=hp.render(Operation,purchaseProps);
  button(tree,'إنشاء صنف جديد').props.onClick({currentTarget:{focus(){}}});tree=hp.render(Operation,purchaseProps);
  const editor=nodes(tree).find(x=>x.type===child);assert.ok(editor);const preserved=nodes(tree).find(x=>x.type==='div'&&x.props.hidden===true);assert.ok(nodes(preserved).some(x=>x.type==='form'));assert.ok(nodes(preserved).some(x=>x.type==='input'&&x.props.value===7));assert.ok(!nodes(preserved).some(x=>x.type===child));
  editor.props.onSaved(saved,[unit]);tree=hp.render(Operation,purchaseProps);assert.ok(nodes(tree).some(x=>x.type==='select'&&x.props.value===saved.id));assert.ok(nodes(tree).some(x=>x.type==='input'&&x.props.value===7));pass('purchase editor is sibling and preserves draft quantities while selecting saved item');
  tree=hp.render(Operation,{...purchaseProps,snapshot:{...snapshot,role:'accountant'}});assert.equal(button(tree,'إنشاء صنف جديد'),undefined);pass('purchase permission does not grant inventory edit permission');
  const {startInventoryCameraSession}=load('components/finance/inventory-camera-session.ts');
  let resolveStream;let stopped=0;const video={srcObject:'stream'};
  const stop=startInventoryCameraSession({video,onDetected(){throw Error('late detection')},onError(){throw Error('late error')},loadReader:async()=>({decodeFromStream:async()=>({stop(){}})}),acquireStream:()=>new Promise(resolve=>{resolveStream=resolve})});
  await new Promise(resolve=>setImmediate(resolve));stop();resolveStream({getTracks:()=>[{stop(){stopped++}}]});await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,1);assert.equal(video.srcObject,null);pass('camera acquired after cancel stops all tracks');
  let detected=[];let scan;let readerStopped=0;let tracksStopped=0;
  const cleanup=startInventoryCameraSession({video:{srcObject:null},onDetected:value=>detected.push(value),onError(){throw Error('unexpected camera error')},loadReader:async()=>({decodeFromStream:async(_s,_v,cb)=>{scan=cb;return{stop(){readerStopped++}}}}),acquireStream:async()=>({getTracks:()=>[{stop(){tracksStopped++}}]})});
  await new Promise(resolve=>setImmediate(resolve));scan({getText:()=>'<script>'},null,{stop(){}});assert.equal(detected.length,0);scan({getText:()=>saved.barcode},null,{stop(){readerStopped++}});scan({getText:()=>saved.barcode},null,{stop(){}});assert.deepEqual(detected,[saved.barcode]);assert.ok(readerStopped);assert.ok(tracksStopped);cleanup();pass('camera validates codes, reports once and releases resources');
  const barcode=require('jsbarcode');const z=require('@zxing/library');for(const value of ['000123','123456','CUP-12/A','CODE-128/test.01','A'.repeat(64)]){const result={};barcode(result,value,{format:'CODE128'});const bits='0'.repeat(20)+result.encodings[0].data+'0'.repeat(20);const row=new z.BitArray(bits.length);[...bits].forEach((bit,index)=>{if(bit==='1')row.set(index)});assert.equal(new z.Code128Reader().decodeRow(0,row).getText(),value);}pass('real Code128 generator round-trips six digits and 64-character manual codes through independent scanner');
  let failed=0;const deniedVideo={srcObject:null};startInventoryCameraSession({video:deniedVideo,onDetected(){throw Error('denied camera detected')},onError(){failed++},loadReader:async()=>({decodeFromStream:async()=>({stop(){}})}),acquireStream:async()=>{throw Error('permission denied')}});await new Promise(resolve=>setImmediate(resolve));assert.equal(failed,1);assert.equal(deniedVideo.srcObject,null);pass('camera denial safely reports manual-input fallback');
  console.log(`PASS ${count} inventory editor groups`);
}
run().catch(error=>{console.error(error);process.exitCode=1});
