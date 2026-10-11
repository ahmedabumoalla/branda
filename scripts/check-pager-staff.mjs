import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let features=['loyalty','pager'];
let employee={id:'cashier',full_name:'Staff',email:'staff@example.test',active:true,can_use_loyalty:true,can_use_pager:false,pager_station:'Bar'};
let session={id:'session',cafe_id:'cafe',cashier_id:'cashier',expires_at:new Date(Date.now()+600000).toISOString(),revoked_at:null};
let cafe={id:'cafe',name:'Brand',slug:'brand',status:'active',deleted_at:null};
const admin={from(table){ const result=table==='cafe_cashier_sessions'?session:table==='cafe_cashiers'?employee:cafe;const chain={select(){return chain},eq(){return chain},gt(){return chain},maybeSingle:async()=>({data:result,error:null})};return chain }};
const exports={};
const source=fs.readFileSync('lib/data/cashier.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mocks={
 'next/headers':{cookies:async()=>({get:()=>({value:'token'})})},
 '@/lib/supabase/admin':{createAdminClient:()=>admin},
 '@/lib/data/feature-entitlements':{getCafeFeatureCodes:async()=>features},
 '@/lib/platform/feature-gates':{featureCodesAllow:(codes,feature)=>codes.includes(feature)},
};
vm.runInNewContext(js,{exports,require:(name)=>mocks[name]??{},console,Date,process},{filename:'cashier-permission-test.js'});
let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++};
const rejects=async(fn)=>{await assert.rejects(fn);checks++};
check((await exports.requireCashierPermission('loyalty')).pagerStation==='Bar','station returned from authenticated identity');
await rejects(()=>exports.requireCashierPermission('pager'));
employee={...employee,can_use_loyalty:false,can_use_pager:true};
check(await exports.getCashierLandingPath()==='/pager','pager-only landing');
check((await exports.requireCashierPermission('pager')).cashierId==='cashier','pager authorization');
await rejects(()=>exports.requireCashierPermission('loyalty'));
check((await exports.requireCashierSessionContext()).canUsePager,'generic session permits pager');
employee={...employee,can_use_loyalty:true};
check(await exports.getCashierLandingPath()==='/cashier','combined landing');
features=['pager'];
check(await exports.getCashierLandingPath()==='/pager','missing loyalty entitlement goes pager');
await rejects(()=>exports.requireCashierPermission('loyalty'));
features=[];
await rejects(()=>exports.requireCashierPermission('pager'));
features=['loyalty','pager'];
session={...session,revoked_at:new Date().toISOString()};
await rejects(()=>exports.requireCashierPermission('pager'));
session={...session,revoked_at:null};
employee={...employee,active:false};
await rejects(()=>exports.requireCashierPermission('pager'));
employee={...employee,active:true};
cafe={...cafe,status:'suspended'};
await rejects(()=>exports.requireCashierPermission('loyalty'));
for (const filename of ['lib/data/customer-rewards.ts','lib/data/experience-rewards.ts','lib/data/loyalty-experience.ts','app/actions/loyalty-experience.ts']) {
 const content=fs.readFileSync(filename,'utf8');
 check(content.includes('requireCashierPermission("loyalty"'),'loyalty callsite gated');
 check(!content.includes('requireCashierSessionContext'),'no unguarded legacy helper remains');
}
check(fs.readFileSync('app/actions/auth.ts','utf8').includes('redirectTo: await getCashierLandingPath()'),'unified login obeys staff permissions');
const gates=fs.readFileSync('lib/platform/feature-gates.ts','utf8');
const gateExports={};
vm.runInNewContext(ts.transpileModule(gates,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:gateExports});
check(gateExports.featureCodesAllow(['pager'],'cashier'),'pager grants staff management');
check(!gateExports.featureCodesAllow(['pager'],'loyalty'),'pager does not grant loyalty');
console.log(`PASS staff authorization: ${checks} checks`);
