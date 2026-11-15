const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
let checks=0;const check=(condition,label)=>{assert(condition,label);checks++;},equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
function hooks(){let cells=[],cursor=0;return {api:{...React,useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},useEffect(){},useMemo:fn=>fn(),useCallback:fn=>fn},render(fn){cursor=0;return fn();}};}
function load(file,mocks={},cache=new Map(),extra=''){file=path.resolve(file);if(cache.has(file))return cache.get(file);const out={};cache.set(file,out);const source=fs.readFileSync(file,'utf8')+extra;const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',code)(name=>{
 if(name in mocks)return mocks[name];
 if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
 if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name);const next=['.ts','.tsx'].map(ext=>base+ext).find(fs.existsSync);if(next)return load(next,mocks,cache);}
 return require(name);
},out);return out;}
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):String(tree??'');
const find=(tree,predicate)=>{const node=nodes(tree).find(predicate);assert(node,'Expected rendered control');return node;};
const html=tree=>renderToStaticMarkup(tree);
const localized=language=>({language,dir:language==='ar'?'rtl':'ltr',t:(ar,en)=>language==='en'&&en?en:ar,displayName:String,productName:item=>item.name,number:n=>String(n),money:n=>Number(n).toFixed(2)+' SAR',date:String});
const imageMock={__esModule:true,default:props=>React.createElement('img',props)};
const linkMock={__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
const localeMock=language=>({useFinancePosLocale:()=>localized(language),FinancePosModal:({children})=>React.createElement('div',null,children),PosNumeric:({value})=>React.createElement('span',null,String(value))});
function menuHarness(products){const hook=hooks();const module=load('components/menu/hospital-menu.tsx',{react:hook.api,'@/app/actions/hospital-orders':{submitHospitalOrderAction(){throw Error('Unexpected order write');}}});const menu={slug:'mind-hospital',name:'MIND',description:'',logoUrl:null,categories:[],products,contacts:{feedbackEnabled:false,instagramUrl:null,location:null}};return {render:()=>hook.render(()=>module.HospitalMenu({menu}))};}
const cashierProduct={id:'11111111-1111-4111-8111-111111111111',name:'Cashier item',category:'Coffee',description:'',ingredients:[],price:0,priceMode:'cashier',available:true,images:[],videos:[]};
const fixedProduct={...cashierProduct,id:'22222222-2222-4222-8222-222222222222',name:'Fixed item',price:9,priceMode:'fixed'};
function detailHarness({mode='cashier',status='accepted',language='ar',snapshotPatch={},orderPatch={}}={}){
 const hook=hooks(),calls=[];
 const snapshot={cafe:{id:'cafe',slug:'mind-hospital',name:'MIND'},userId:'cashier',warehouses:[{id:'warehouse',name:'Main',active:true}],accounts:[{id:'cash',kind:'cash',active:true,name:'Cash',is_primary:true}],shifts:[{id:'shift',status:'open',user_id:'cashier',account_id:'cash',supervisor_paused:false}],settings:{vat_rate:15,tax_inclusive:true},products:[],parties:[],documents:[],...snapshotPatch};
 const order={id:crypto.randomUUID(),number:1,customerName:'Doctor',doctor:'Doctor',phone:'966500000001',floor:'1',clinic:'Clinic',source:'menu',language,status,paymentStatus:'unpaid',financeDocumentId:null,total:mode==='cashier'?0:9,totalMax:mode==='cashier'?0:9,items:[{productId:cashierProduct.id,name:'Item',quantity:1,unitPrice:mode==='cashier'?0:9,maxUnitPrice:mode==='cashier'?0:9,priceMode:mode}],...orderPatch};
 const mocks={react:hook.api,'next/image':imageMock,'next/link':linkMock,'@/app/actions/hospital-orders':{manageHospitalOrderAction:async(slug,payload)=>{calls.push({slug,payload});return{ok:true,order:{id:order.id,status:order.status}};},readHospitalReceiptAction:async()=>({ok:false})},'./finance-pos-locale':localeMock(language),'./finance-receipt-dialog':{FinanceReceiptDialog(){}},'./use-finance-printer':{},'./use-hospital-inbox':{},'./use-hospital-order-sound':{}};
 const module=load('components/finance/hospital-orders-toolbar.tsx',mocks,new Map(),'\nexport { HospitalOrderDetails };');
 return {calls,render:()=>hook.render(()=>module.HospitalOrderDetails({order,snapshot,saved:async()=>{},print(){},printBusy:false,stale:false}))};
}
const invoiceButton=tree=>find(tree,n=>n.type==='button'&&/تأكيد التحصيل وإصدار الفاتورة|Confirm payment and issue invoice/.test(text(n)));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 for(const language of ['ar','en']){
  const h=menuHarness([cashierProduct]);let tree=h.render();if(language==='en'){find(tree,n=>n.type==='button'&&text(n)==='English').props.onClick();tree=h.render();}
  let markup=html(tree);check(markup.includes(language==='ar'?'يحدد الكاشير السعر':'Price set by cashier'),'cashier catalog label localized');check(!/<span class="price"><bdi>/.test(markup),'cashier catalog never displays zero price');
  find(tree,n=>n.type==='button'&&String(n.props['aria-label']??'').includes(language==='ar'?'تفاصيل المنتج':'Product details')).props.onClick();tree=h.render();markup=html(tree);check(markup.includes(language==='ar'?'يحدد الكاشير السعر':'Price set by cashier'),'cashier detail price label');
  find(tree,n=>n.type==='button'&&text(n).includes(language==='ar'?'أضف للطلب':'Add to order')).props.onClick();tree=h.render();
  find(tree,n=>n.type==='button'&&text(n).includes(language==='ar'?'راجع طلبك':'Review order')).props.onClick();tree=h.render();markup=html(tree);
  check(!/<span class="price"><bdi>/.test(markup),'cashier-only cart totals do not show zero');check(markup.includes(language==='ar'?'يحدد الكاشير السعر':'Price set by cashier'),'cashier cart label');
 }
 const fixed=menuHarness([fixedProduct]);check(html(fixed.render()).includes('<bdi>٩</bdi>'),'fixed product keeps stored9price');
 const mixed=menuHarness([cashierProduct,fixedProduct]);let mixedTree=mixed.render();
 for(const product of [cashierProduct,fixedProduct]){
  find(mixedTree,n=>n.type==='button'&&String(n.props['aria-label']??'').includes(product.name)).props.onClick();mixedTree=mixed.render();
  find(mixedTree,n=>n.type==='button'&&text(n).includes('أضف للطلب')).props.onClick();mixedTree=mixed.render();
 }
 find(mixedTree,n=>n.type==='button'&&text(n).includes('راجع طلبك')).props.onClick();mixedTree=mixed.render();
 const mixedTotal=html(find(mixedTree,n=>n.props?.className==='total'));
 check(mixedTotal.includes('يحدد الكاشير السعر')&&!mixedTotal.includes('<bdi>'),'mixed cart total never presents partial fixed sum as final');
 for(const language of ['ar','en']){
  const h=detailHarness({language});let tree=h.render();check(invoiceButton(tree).props.disabled,'blank cashier price blocks invoice');check(html(tree).includes(language==='ar'?'بانتظار السعر':'Awaiting price'),'unknown total visibly awaits price');
  const price=()=>find(h.render(),n=>n.type==='input'&&n.props.type==='number');
  price().props.onChange({target:{value:'0'}});check(invoiceButton(h.render()).props.disabled,'zero cashier price blocked');
  price().props.onChange({target:{value:'12.345'}});check(invoiceButton(h.render()).props.disabled,'fractional cents blocked');
  price().props.onChange({target:{value:'100000.01'}});check(invoiceButton(h.render()).props.disabled,'over-bound price blocked');
  price().props.onChange({target:{value:'12.50'}});tree=h.render();check(!invoiceButton(tree).props.disabled,'valid price with shift/account/warehouse enables invoice');
  check(!nodes(tree).filter(n=>n.type==='button').some(n=>/تحضير|جاهز|تسليم|Prepare|Ready|Complete|deliver/i.test(text(n))),'no preparation/readiness/delivery actions');
  invoiceButton(tree).props.onClick();await tick();equal(h.calls[0].payload.confirmedPrices,[{index:0,unitPrice:12.5}],'posted selected price');equal(h.calls[0].payload.paymentMethod,'cash','original cash method');
 }
 const fixedDetail=detailHarness({mode:'fixed'});check(!invoiceButton(fixedDetail.render()).props.disabled,'fixed price invoice initially enabled');check(!nodes(fixedDetail.render()).some(n=>n.type==='input'&&n.props.type==='number'),'fixed price has no editable price input');
 for(const patch of [{shifts:[]},{warehouses:[]},{accounts:[]}]){const h=detailHarness({mode:'fixed',snapshotPatch:patch});check(invoiceButton(h.render()).props.disabled,'missing posting prerequisite still blocks invoice');}
 const pending=detailHarness({status:'pending'});const pendingTree=pending.render();check(nodes(pendingTree).some(n=>n.type==='button'&&text(n).includes('تأكيد الطلب')),'pending confirm remains');check(nodes(pendingTree).some(n=>n.type==='button'&&text(n).includes('رفض الطلب')),'pending reject remains');check(!nodes(pendingTree).some(n=>n.type==='button'&&/تحضير|جاهز|تسليم/.test(text(n))),'pending has no fulfillment actions');
 const receiptModule=load('components/finance/finance-pos-receipt.tsx',{'./finance-pos-locale':localeMock('ar'),'./finance-ui':{documentKindNames:{sale:'فاتورة مبيعات'}}});
 const receiptDocument={id:'local-test',number:1,kind:'sale',created_at:'2026-11-14T18:00:00Z',subtotal:115,discount:0,tax:15,total:115,paid:115,outstanding:0,vat_rate:15,tax_inclusive:true,lines:[],receipt_seller:{name:'MIND',vatNumber:'300000000000003'}};
 const receiptSnapshot={cafe:{slug:'mind-hospital',name:'MIND'},parties:[],accounts:[],documents:[]};
 const receiptHtml=html(React.createElement(receiptModule.FinanceReceipt,{document:receiptDocument,snapshot:receiptSnapshot}));check(receiptHtml.includes('فاتورة ضريبية مبسطة'),'MIND simplified tax title');check(receiptHtml.includes('300000000000003')&&receiptHtml.includes('data-receipt-tax-qr'),'stored seller VAT and tax QR rendered');
 const noVat=html(React.createElement(receiptModule.FinanceReceipt,{document:{...receiptDocument,receipt_seller:null},snapshot:receiptSnapshot}));check(!noVat.includes('300000000000003')&&!noVat.includes('فاتورة ضريبية مبسطة'),'absent seller cannot fabricate tax identity');
 const qr=load('lib/finance/receipt-tax.ts').financeReceiptQr(receiptDocument),bytes=Buffer.from(qr.payload,'base64'),fields=[];for(let i=0;i<bytes.length;){const tag=bytes[i++],size=bytes[i++];fields.push([tag,bytes.subarray(i,i+size).toString('utf8')]);i+=size;}equal(fields,[[1,'MIND'],[2,'300000000000003'],[3,'2026-11-14T18:00:00.000Z'],[4,'115.00'],[5,'15.00']],'QR uses seller and actual invoice totals');
 const files=['components/menu/hospital-menu.tsx','components/finance/hospital-orders-toolbar.tsx','components/finance/finance-pos-receipt.tsx','lib/commerce/hospital-menu-cart.ts','lib/finance/hospital-pos-model.ts','lib/finance/receipt-tax.ts','lib/finance/brand-finance.ts','scripts/check-hospital-pricing-ui.cjs','package-lock.json'];const result={at:new Date().toISOString(),runtime:process.version,passed:true,checks,limits:['React hook fixture and server render only','No browser, actual database write or physical print'],inputs:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))};fs.mkdirSync('output/hospital-pricing-ui-20261114',{recursive:true});fs.writeFileSync('output/hospital-pricing-ui-20261114/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,checks}));
})().catch(error=>{console.error(error);process.exitCode=1;});
