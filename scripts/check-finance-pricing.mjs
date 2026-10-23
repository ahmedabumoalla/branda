import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const dependency=createRequire(import.meta.url);
function load(file,stubs={}) {
 const exports={}; const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',source)(name=>Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('@/')?load(path.resolve(`${name.slice(2)}.ts`),stubs):dependency(name),exports);return exports;
}
const duration=load('lib/platform/subscription-durations.ts');
const finance={id:'finance',name:'Finance',priceMonthly:1099,active:true,annualDiscountPercent:0,durationOptions:[1,3]};
assert.deepEqual(duration.getPlanDurationOptions(finance).map(item=>item.months),[1,3]);
assert.deepEqual(duration.calculateSubscriptionPricing(finance,3),{baseAmount:3297,discountPercent:20,discountAmount:659.4,totalAmount:2637.6});
assert.equal(duration.calculateSubscriptionAmount(finance,1),1099);
for(const months of [2,6,12,24,0,-1,1.5,null,NaN]) assert.throws(()=>duration.calculateSubscriptionAmount(finance,months));
assert.equal(duration.calculateSubscriptionAmount({id:'menu',priceMonthly:100,annualDiscountPercent:10},12),1080);
const writes=[];
const admin={from(table){assert.equal(table,'subscriptions');const q={update(payload){writes.push({kind:'update',payload});return q},eq(){return q},insert(payload){writes.push({kind:'insert',payload});return q},select(){return q},single:async()=>({data:{id:'subscription'},error:null}),then(resolve){resolve({data:[],error:null})}};return q}};
const checkout=load('lib/data/subscription.ts',{
 '@/lib/data/cafes':{requireOwnerCafeContext:async()=>({id:'owner-brand'})},
 '@/lib/data/admin':{getPlatformPlans:async()=>[finance]},
 '@/lib/supabase/admin':{createAdminClient:()=>admin},
 '@/lib/supabase/server':{createClient:async()=>{throw Error('Unexpected session DB access')}},
});
assert.equal(await checkout.startOwnerPlanCheckout('finance',undefined,3),'subscription');
const quarterly=writes.find(row=>row.kind==='insert').payload;
assert.equal(quarterly.amount_sar,2637.6);assert.equal(quarterly.base_amount_sar,3297);assert.equal(quarterly.discount_amount_sar,659.4);
assert.equal(quarterly.duration_unit,'month');assert.equal(quarterly.duration_count,3);assert.equal(quarterly.cafe_id,'owner-brand');
writes.length=0;
for(const months of [6,12,24]) {await assert.rejects(checkout.startOwnerPlanCheckout('finance',undefined,months));await assert.rejects(checkout.validateOwnerPlanCoupon('finance',undefined,months));}
assert.equal(writes.length,0,'unsupported terms cause no pending cancellation or payment writes');
await checkout.startOwnerPlanCheckout('finance',undefined,1);
assert.equal(writes.find(row=>row.kind==='insert').payload.amount_sar,1099);
console.log('PASS finance pricing: monthly/quarterly, exact cent discount, unsupported durations before mutations, card checkout authoritative persisted amount and invoice breakdown, legacy annual unchanged');
