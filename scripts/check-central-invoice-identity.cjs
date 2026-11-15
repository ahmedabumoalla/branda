const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),crypto=require('node:crypto'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=a=>{assert(a);checks++;};
const files=new Set();
function load(file,mocks={}){files.add(file);const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',code)(name=>{if(name in mocks)return mocks[name];if(name==='server-only')return{};if(name.endsWith('.css'))return new Proxy({},{get:(_,key)=>key});if(name.startsWith('@/')||name.startsWith('./')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(base+'.ts')?base+'.ts':base+'.tsx',mocks);}return require(name);},exports);return exports;}
async function main(){
 const model=load('lib/erp/settings.ts'),address=load('lib/erp/invoice-identity.ts');
 const vat='300000000000003',general={...model.defaultSystemGeneral,businessName:'الاسم المركزي',taxNumber:vat,building:' 1234 ',street:'شارع الاختبار',city:'الرياض',country:'SA'};
 equal(address.systemInvoiceAddress(general),'1234، شارع الاختبار، الرياض، المملكة العربية السعودية');equal(address.systemInvoiceAddress({country:'SA'}),'');
 for(const invalid of ['123','100000000000003','300000000000001',vat+'9'])equal(model.systemGeneralSchema.safeParse({...general,taxNumber:invalid}).success,false);
 equal(model.systemGeneralSchema.parse({...general,taxNumber:' '+vat+' '}).taxNumber,vat);equal(model.systemGeneralSchema.safeParse({...general,taxNumber:''}).success,true);
 let failure=false,owner=true,calls=[],views=[];
 const settingsActions=load('app/actions/erp-settings.ts',{
  'next/cache':{revalidatePath:(...args)=>views.push(args)},
  '@/lib/data/erp-settings':{systemSettingsContext:async()=>{if(!owner)throw Error('إعدادات النظام متاحة للمالك فقط');return{cafe:{id:'tenant-a',slug:'mind-hospital'},client:{rpc:async(name,args)=>{calls.push({name,args});return{data:{revision:1},error:failure?{message:'تعذر حفظ الإعدادات'}:null};}}};},systemSettingsError:error=>{if(error)throw Error(error.message);}},
  '@/lib/performance/finance-route-invalidation':{invalidateFinanceViews:slug=>views.push(['finance',slug])},
  '@/lib/erp/settings-secrets':{},'@/lib/supabase/admin':{},'@/lib/erp/settings-providers':{},'@/lib/erp/roles':{},'@/lib/erp/settings-generic-provider':{},'@/lib/erp/settings-payments':{},sharp:{},
 });
 const request='00000000-0000-4000-8000-000000000001';
 ok((await settingsActions.saveSystemGeneral('mind-hospital',general,request)).ok);equal(calls[0].args.p_cafe,'tenant-a');equal(calls[0].args.p_data.taxNumber,vat);ok(views.some(v=>v[0]==='finance'&&v[1]==='mind-hospital'));
 calls=[];views=[];const invalid=await settingsActions.saveSystemGeneral('mind-hospital',{...general,taxNumber:'123'},request);equal(invalid.ok,false);ok(invalid.message.includes('15'));equal(calls.length,0);equal(views.length,0);
 failure=true;equal((await settingsActions.saveSystemGeneral('mind-hospital',general,request)).ok,false);equal(views.length,0);owner=false;calls=[];equal((await settingsActions.saveSystemGeneral('mind-hospital',general,request)).ok,false);equal(calls.length,0);
 let role='owner',central={payload:general},readFailure=false;const queries=[];
 const issuerActions=load('app/actions/finance-company-invoices.ts',{
  '@/lib/data/brand-finance':{getBrandFinanceContext:async()=>({cafe:{id:'tenant-a',name:general.businessName,role}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:table=>{const filters=[];return{select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){queries.push({table,filters});return{data:table==='cafe_settings'?{cafe_name:'Legacy name',tax_number:vat}:central,error:readFailure?{}:null};}};}})},
  '@/lib/data/company-invoices':{},'@/lib/whatsapp/company-document':{},'@/lib/email/resend':{},'@/lib/performance/finance-route-invalidation':{},
 });
 const issuer=await issuerActions.companyInvoiceIssuerAction('mind-hospital');ok(issuer.ok);equal(issuer.data,{name:general.businessName,vatNumber:vat,address:address.systemInvoiceAddress(general),fromAccountSettings:true});ok(queries.every(q=>q.filters.some(([k,v])=>k==='cafe_id'&&v==='tenant-a')));ok(queries.find(q=>q.table==='erp_system_settings').filters.some(([k,v])=>k==='kind'&&v==='general'));
 central=null;const legacy=await issuerActions.companyInvoiceIssuerAction('mind-hospital');equal(legacy.data.name,'Legacy name');equal(legacy.data.address,'');equal(legacy.data.fromAccountSettings,false);
 readFailure=true;equal((await issuerActions.companyInvoiceIssuerAction('mind-hospital')).ok,false);role='cashier';const before=queries.length;equal((await issuerActions.companyInvoiceIssuerAction('mind-hospital')).ok,false);equal(queries.length,before);
 const shared=load('components/finance/finance-ui.tsx'),tax=load('lib/finance/receipt-tax.ts');
 const seller={name:general.businessName,vatNumber:vat};const document={id:'local-fixture',number:7,kind:'sale',created_at:'2026-11-14T18:00:00Z',receipt_seller:seller,party_id:null,account_id:null,subtotal:115,discount:0,tax:15,total:115,paid:115,outstanding:0,vat_rate:15,tax_inclusive:true,lines:[]};
 for(const slug of ['mind-hospital','ordinary-finance-brand']){
  const snapshot={cafe:{name:'Different current display name',slug,businessCategory:'cafes'},parties:[],accounts:[],documents:[]};
  const html=renderToStaticMarkup(React.createElement(shared.FinanceReceipt,{document,snapshot}));ok(html.includes(vat));ok(html.includes(seller.name));ok(html.includes('فاتورة ضريبية مبسطة'));ok(html.includes('data-receipt-tax-qr'));
  const historical=renderToStaticMarkup(React.createElement(shared.FinanceReceipt,{document:{...document,receipt_seller:null},snapshot}));ok(!historical.includes(vat));ok(!historical.includes('فاتورة ضريبية مبسطة'));
  const prep=renderToStaticMarkup(React.createElement(shared.FinanceReceipt,{document,snapshot,copy:'preparation'}));ok(!prep.includes(vat));ok(!prep.includes('data-receipt-tax-qr'));
  for(const language of ['ar','en']){const localized=load('components/finance/finance-pos-receipt.tsx',{'./finance-pos-locale':{PosNumeric:({value})=>React.createElement('span',null,value),useFinancePosLocale:()=>({language,dir:language==='ar'?'rtl':'ltr',t:(ar,en)=>language==='en'?(en||ar):ar,displayName:v=>v,productName:p=>p.name,date:v=>v})}});const markup=renderToStaticMarkup(React.createElement(localized.FinanceReceipt,{document,snapshot}));ok(markup.includes(vat));ok(markup.includes(language==='ar'?'فاتورة ضريبية مبسطة':'Simplified tax invoice'));}
 }
 const bytes=Buffer.from(tax.financeReceiptQr(document).payload,'base64'),tags=[];for(let i=0;i<bytes.length;){const tag=bytes[i++],length=bytes[i++];tags.push([tag,bytes.subarray(i,i+length).toString('utf8')]);i+=length;}equal(tags,[[1,seller.name],[2,vat],[3,'2026-11-14T18:00:00.000Z'],[4,'115.00'],[5,'15.00']]);
 files.add('scripts/check-central-invoice-identity.cjs');files.add('package-lock.json');fs.mkdirSync('output/mind-central-tax-20261114',{recursive:true});fs.writeFileSync('output/mind-central-tax-20261114/server-render.json',JSON.stringify({at:new Date().toISOString(),runtime:process.version,checks,passed:true,inputs:Object.fromEntries([...files].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),limits:['Mocked server credentials and database','Local receipt render and QR decode only','No real invoice or messages']},null,2));console.log('PASS '+checks+' central identity action and receipt checks');
}
main().catch(e=>{console.error(e);process.exitCode=1});
