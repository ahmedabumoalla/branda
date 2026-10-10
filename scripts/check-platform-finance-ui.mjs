import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { transform } from 'lightningcss';
const dependency=createRequire(import.meta.url);
function load(file,stubs={}) {
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const exports={};
  new Function('require','exports',output)(name=>{
    if(Object.hasOwn(stubs,name))return stubs[name];
    if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
    if(name.startsWith('@/'))return load(path.resolve(name.slice(2)+'.ts'),stubs);
    return dependency(name);
  },exports);return exports;
}
globalThis.requestAnimationFrame=callback=>callback();
const id='00000000-0000-4000-8000-000000000001';
const helpers=load('lib/finance/platform-finance.ts');
const page={entries:[{id,voucher_number:1,kind:'collection',source:'manual_subscription',category:'subscription',party:'علامة الاختبار',description:'اشتراك سنوي',occurred_on:'2026-01-01',currency:'SAR',amount:1104,amount_sar:1104,exchange_rate:1,reference:'reference',notes:'',subscription_id:id,subscription_request_id:id,hasReceipt:true}],total:21,filter:{page:0,kind:'all',from:'2026-01-01',to:'2026-12-31'},totals:{collections:1104,payments:75,count:2}};
const options={cafes:[{id,name:'علامة الاختبار'}],plans:[{id:'paid',name:'الباقة',price_sar:115,annual_discount_percent:20,duration_options:[1,3,6,12]}],requests:[]};
function harness(actions={},props={}) {
  const state=[],calls=[];let cursor=0;
  const hooks={...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}};
  const {AdminFinancePage}=load('components/admin/pages/admin-finance-page.tsx',{react:hooks,'@/app/actions/platform-finance':{
    fetchFinanceAction:async input=>{calls.push(['fetch',input]);return{ok:true,data:{...page,filter:input}}},
    financeOptionsAction:async()=>({ok:true,data:options}),
    financeReceiptAction:async input=>{calls.push(['receipt',input]);return{ok:true,data:'https://example.invalid/receipt'}},
    postFinanceAction:async(input,form)=>{calls.push(['post',input,form]);return{ok:true,data:{id:input.id,kind:input.kind}}},...actions}});
  return{calls,render(){cursor=0;return AdminFinancePage({initialData:page,...props})}};
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
const text=tree=>tree==null||typeof tree==='boolean'?'':Array.isArray(tree)?tree.map(text).join(''):typeof tree==='object'?text(tree.props?.children):String(tree);
const button=(h,label)=>nodes(h.render()).find(n=>n.type==='button'&&text(n)===label);
const html=h=>renderToStaticMarkup(h.render());
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const h=harness();
for(const label of ['المالية','علامة الاختبار','تم تفعيل الباقة','١٬٠٢٩٫٠٠','2026-01-01'])assert.ok(html(h).includes(label),label);
button(h,'عرض الإيصال').props.onClick();await flush();assert.equal(h.calls[0][0],'receipt');assert.ok(html(h).includes('https://example.invalid/receipt'));
button(h,'التالي').props.onClick();await flush();assert.equal(h.calls[1][1].page,1);
button(h,'سند تحصيل').props.onClick();await flush();
let selects=nodes(h.render()).filter(n=>n.type==='select');
selects[0].props.onChange({target:{value:id}});
selects=nodes(h.render()).filter(n=>n.type==='select');selects[2].props.onChange({target:{value:'paid'}});
selects=nodes(h.render()).filter(n=>n.type==='select');selects[3].props.onChange({target:{value:'12'}});
assert.equal(nodes(h.render()).find(n=>n.type==='input'&&n.props.type==='number').props.value,1104,'annual quote preview matches DB rounding');
assert.ok(html(h).includes('تحل محل الاشتراك الحالي'));
const file=new File(['%PDF-test'],'receipt.pdf',{type:'application/pdf'});
const ready=client=>{
  nodes(client.render()).find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[file]}});
  nodes(client.render()).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
};
ready(h);await nodes(h.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
assert.ok(html(h).includes('تم تسجيل التحصيل وتفعيل الباقة للعميل'));
assert.equal(h.calls.find(([kind])=>kind==='post')[1].amount,1104);
let resolveSave;const duplicate=harness({postFinanceAction:(input)=>{duplicate.calls.push(['post',input]);return new Promise(resolve=>resolveSave=()=>resolve({ok:true,data:{id:input.id,kind:input.kind}}))}});
button(duplicate,'تسجيل مدفوعات').props.onClick();await flush();ready(duplicate);
const submit=nodes(duplicate.render()).find(n=>n.type==='form').props.onSubmit;
const pending=submit({preventDefault(){}});await submit({preventDefault(){}});assert.equal(duplicate.calls.length,1);
assert.equal(nodes(duplicate.render()).find(n=>n.type==='fieldset').props.disabled,true);resolveSave();await pending;
let attempts=0;const retries=[];
const retry=harness({postFinanceAction:async input=>{retries.push(input.id);if(attempts++===0)throw new Error('lost response');return{ok:true,data:{id:input.id,kind:input.kind}}}});
button(retry,'تسجيل مدفوعات').props.onClick();await flush();ready(retry);
await nodes(retry.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
assert.ok(html(retry).includes('دون تكرار السند'));
await nodes(retry.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(retries[0],retries[1],'lost response keeps idempotency key');
const refreshFailure=harness({fetchFinanceAction:async()=>({ok:false,message:'تعذر التحديث'})});
button(refreshFailure,'تسجيل مدفوعات').props.onClick();await flush();ready(refreshFailure);
await nodes(refreshFailure.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
assert.ok(html(refreshFailure).includes('تم تسجيل المدفوعات'));assert.ok(html(refreshFailure).includes('تعذر التحديث'));
assert.equal(button(refreshFailure,'حفظ المدفوعات'),undefined,'successful post cannot be resubmitted after list failure');
const existing=harness({financeOptionsAction:async()=>({ok:true,data:{...options,requests:[{id,cafe_id:id,plan_id:'paid',plan_name:'الباقة',amount_sar:103.5,duration_count:1,coupon_code_snapshot:'MONTH10'}]}})});
button(existing,'سند تحصيل').props.onClick();await flush();nodes(existing.render()).find(n=>n.type==='select').props.onChange({target:{value:id}});
assert.equal(nodes(existing.render()).find(n=>n.type==='input'&&n.props.type==='number').props.value,103.5);assert.ok(html(existing).includes('MONTH10'));
assert.equal(helpers.financeDate.safeParse('2026-02-30').success,false);
assert.equal(helpers.financeFilterSchema.safeParse({page:0,kind:'all',from:'2026-02-01',to:'2026-01-01'}).success,false);
// Direct data entry points must deny before storage, query or RPC access
const forbidden=load('lib/data/platform-finance.ts',{'@/lib/data/cafes':{requirePlatformAdmin:async()=>{throw new Error('forbidden')}},'@/lib/supabase/server':{createClient(){throw new Error('must not access database')}}});
for(const operation of [()=>forbidden.getFinancePage(),()=>forbidden.getFinanceOptions(),()=>forbidden.getFinanceReceipt(id),()=>forbidden.postFinanceEntry({},new FormData())])await assert.rejects(operation,/forbidden/);
transform({filename:'finance.css',code:Buffer.from(fs.readFileSync('components/admin/pages/admin-finance-page.module.css'))});
console.log('PASS finance SSR, annual/coupon pricing, activation form, receipts, pagination, duplicate lock, retry, committed refresh failure, authorization and responsive CSS');
