const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const cache=new Map(),inputs=new Set();
function load(file){if(cache.has(file))return cache.get(file);inputs.add(file);const exports={};cache.set(file,exports);new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{if(name==='@/components/erp/navigation')return{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};if(name.endsWith('.css'))return new Proxy({},{get:(_,key)=>key});if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(base+'.ts')?base+'.ts':base+'.tsx');}return require(name);},exports);return exports;}
const {PurchaseInvoiceList}=load('components/erp/purchases/invoice-list.tsx');
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++};
const common={records:[],financial:[],allFinancial:[],suppliers:[],canCreate:true,filtered:false,onReset(){},onExport(){}};
for(const section of ['requests','rfqs','quotations','orders','invoices']){
 const html=renderToStaticMarkup(React.createElement(PurchaseInvoiceList,{...common,section,title:section,createLabel:'Create'}));
 check(html.includes(`href="/dashboard/system/purchases/${section}/new"`),`${section} create stays in selected purchase section`);
 const denied=renderToStaticMarkup(React.createElement(PurchaseInvoiceList,{...common,section,canCreate:false}));
 check(!denied.includes('/new"'),`${section} create permission retained`);
 const filtered=renderToStaticMarkup(React.createElement(PurchaseInvoiceList,{...common,section,filtered:true}));
 check(!filtered.includes('/new"')&&filtered.includes('مسح التصفية'),`${section} empty search offers reset without misleading create`);
}
const financial={id:'finance-1',number:9,party_id:'supplier-1',created_at:'2026-11-15T00:00:00Z',total:115,outstanding:25};
const record={id:'record-1',financeId:'finance-1',number:'P-1',supplierId:'supplier-1',date:'2026-11-15',status:'posted',customStatus:'',title:'<safe title>',currency:'SAR',lines:[],discount:0,discountType:'amount',shipping:0,adjustment:0,taxInclusive:false,exchangeRate:1};
const html=renderToStaticMarkup(React.createElement(PurchaseInvoiceList,{...common,records:[record],financial:[financial],allFinancial:[financial],suppliers:[{id:'supplier-1',name:'Supplier'}]}));
check((html.match(/<tbody><tr/g)||[]).length===1&&html.indexOf('</tr><tr')<0,'linked posted invoice listed once');
check(html.includes('/invoices/record-1')&&!html.includes('/invoices/finance-1'),'deduplicated invoice links to editable source');
check(html.includes('&lt;safe title&gt;'),'customer-authored title remains escaped');
const order=renderToStaticMarkup(React.createElement(PurchaseInvoiceList,{...common,section:'orders',records:[{...record,financeId:null,status:'approved'}]}));
check(order.includes('/orders/record-1')&&!order.includes('/invoices/record-1'),'order detail link stays in orders');
check(!order.includes('المتبقي للسداد'),'noninvoice list does not imply receivables');
console.log(JSON.stringify({at:new Date().toISOString(),runtime:process.version,checks,passed:true,scope:'Actual shared list rendering/navigation/permissions/deduplication; no database writes',inputs:[...inputs]}));
