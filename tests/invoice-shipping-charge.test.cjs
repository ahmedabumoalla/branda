const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const load=(file,mocks={})=>{const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name in mocks?mocks[name]:require(name),exports);return exports;};
const amounts=load('lib/finance/company-invoice.ts');
const {invoiceShippingAmounts}=load('lib/finance/invoice-shipping-amounts.ts',{'./company-invoice':amounts});
assert.deepEqual(invoiceShippingAmounts(null),{amount:0,tax:0,total:0,sar:{amount:0,tax:0,total:0}});
assert.deepEqual(invoiceShippingAmounts({amount:15,taxRate:15}),{amount:15,tax:2.25,total:17.25,sar:{amount:15,tax:2.25,total:17.25}});
assert.equal(invoiceShippingAmounts({amount:15,taxRate:null}).total,15);
assert.deepEqual(invoiceShippingAmounts({amount:10.01,taxRate:15},3.75),{amount:10.01,tax:1.5,total:11.51,sar:{amount:37.54,tax:5.63,total:43.17}});
const goods=amounts.companyAmounts([{key:0,productId:'p',quantity:1,price:115}],[],10,'percent',15,true,{kind:'addition',amount:11.5,taxable:true});
const shipping=invoiceShippingAmounts({amount:15,taxRate:15});
assert.equal(goods.total,115);assert.equal(amounts.moneyRound(goods.total+shipping.total),132.25,'shipping is added after item discount and adjustment');
const {invoiceShippingAddress}=load('lib/finance/company-invoice-options.ts');
const address={street:'main',city:'Riyadh',country:'SA',shippingStreet:'secondary',shippingCity:'Jeddah',shippingCountry:'SA'};
assert.equal(invoiceShippingAddress(address,'auto'),'secondary Jeddah SA');
assert.equal(invoiceShippingAddress({...address,shippingCity:''},'auto'),'main Riyadh SA');
assert.equal(invoiceShippingAddress(address,'none'),'');
let active;
const same=(a,b)=>a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
const react={
 useState(initial){const c=active,i=c.i++;if(!(i in c.slots))c.slots[i]=initial;return[c.slots[i],v=>c.slots[i]=typeof v==='function'?v(c.slots[i]):v];},
 useRef(initial){const c=active,i=c.i++;return c.slots[i]??(c.slots[i]={current:initial});},
 useCallback(fn,deps){const c=active,i=c.i++;if(!same(c.slots[i]?.deps,deps))c.slots[i]={fn,deps};return c.slots[i].fn;},
 useEffect(fn,deps){const c=active,i=c.i++;if(!same(c.effects[i]?.deps,deps)){c.effects[i]?.cleanup?.();c.effects[i]={deps};c.queue.push(()=>c.effects[i].cleanup=fn());}},
};
let pending=[],saves=[],failure=false;
const choice={optionId:'option',name:'العنوان الحصري - توصيل تجريبي',amount:15,taxRate:15};
const context={enabled:true,settingsRevision:3,options:[{id:'option',name:choice.name,fee:15,taxRate:15,revision:7}],selection:choice,revision:2,hasSelection:true,issued:false};
const actions={getFinanceInvoiceShippingChargeContext:()=>new Promise(resolve=>pending.push(resolve)),saveFinanceInvoiceShippingCharge:async(slug,input)=>{saves.push(input);return failure?{ok:false,message:'تغيرت النسخة'}:{ok:true,data:{revision:input.revision+1,selection:input.selection,issued:false}};}};
const {useInvoiceShippingCharge}=load('components/finance/use-invoice-shipping-charge.ts',{'react':react,'@/app/actions/finance-invoice-shipping-charge':actions});
const c={i:0,slots:[],effects:[],queue:[]};const render=()=>{active=c;c.i=0;return useInvoiceShippingCharge('tenant');};
const flush=async()=>{for(const fn of c.queue.splice(0))fn();await Promise.resolve();await Promise.resolve();await Promise.resolve();};
(async()=>{
 let h=render();await flush();pending.shift()({ok:true,data:{...context,selection:null,hasSelection:false,revision:0}});await flush();h=render();assert(h.ready);assert.equal(h.selection,null);
 h.change(choice);h=render();await h.save('draft',4);assert.equal(saves.at(-1).settingsRevision,3);assert.equal(saves.at(-1).optionRevision,7);assert.equal(saves.at(-1).draftRevision,4);assert.equal(saves.at(-1).revision,0);
 h=render();h.change(null);h=render();await h.save('draft',5);assert.equal(saves.at(-1).selection,null);assert.equal(saves.at(-1).revision,1);
 const a=render().loadDraft('old'),b=render().loadDraft('new'),ra=pending.shift(),rb=pending.shift();rb({ok:true,data:{...context,enabled:false}});await b;ra({ok:true,data:{...context,selection:null}});await a;h=render();assert.equal(h.context.enabled,false);assert.deepEqual(h.selection,choice,'disabled library and stale responses never erase saved charge');
 await h.save('new',9);assert.equal(saves.at(-1).revision,2);assert.equal(saves.at(-1).selection.amount,15);
 failure=true;assert.equal((await render().save('new',10)).ok,false);assert.equal(render().ready,false,'save conflict blocks issue until reload');
 for(const e of Object.values(c.effects))e.cleanup?.();console.log('PASS: independent shipping amounts, FX cents, auto address, draft revisions, stale responses, preserved disabled selection and conflict guard');
})().catch(error=>{console.error(error);process.exitCode=1;});
