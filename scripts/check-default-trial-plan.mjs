import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const dependency=createRequire(import.meta.url);
let authorized=true, rpcError=false;
const writes=[];
const client={
  async rpc(name,args){writes.push({name,args});return {error:rpcError?{code:'PGRST202'}:null};},
  from(table){return {upsert(value){writes.push({table,value});return Promise.resolve({error:null});},update(value){writes.push({table,value});return {eq:async()=>({error:null})};}};
  },
};
const stubs={
 '@/lib/supabase/server':{createClient:async()=>client},
 '@/lib/supabase/admin':{createAdminClient:()=>client},
 '@/lib/data/cafes':{requirePlatformAdmin:async()=>{if(!authorized)throw Error('Forbidden');}},
 '@/lib/platform/maintenance':{},'@/lib/data/feature-entitlements':{},
};
function load(file,cache=new Map()){
 if(cache.has(file))return cache.get(file);
 const exports={};cache.set(file,exports);
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',source)(name=>Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('@/')?load(path.resolve(name.slice(2)+'.ts'),cache):dependency(name),exports);return exports;
}
const {savePlatformPlans,updateCafePlan}=load('lib/data/admin.ts');
const trial={id:'configured',name:'Configured trial',priceMonthly:0,offerEnabled:false,durationUnit:'day',durationCount:15,description:'',active:true,isDefault:true,features:['menu','offers','loyalty','pager','settings'],trialDays:7,categoryId:'cafes_coffee'};
const paid={...trial,id:'paid',priceMonthly:100,isDefault:false,trialDays:0,durationCount:12,durationUnit:'month'};
for(const fallback of [false,true]){
 rpcError=fallback;writes.length=0;await savePlatformPlans([trial,paid]);
 const rpc=writes.find(w=>w.args?.p_id==='configured').args;
 assert.equal(rpc.p_duration_count,7);assert.equal(rpc.p_duration_unit,'day');assert.equal(rpc.p_trial_days,7);
 assert.equal(rpc.p_free_after_trial,false);
 assert.equal(writes.find(w=>w.args?.p_id==='paid').args.p_duration_count,1);
 if(fallback){const row=writes.find(w=>w.table==='platform_plans'&&w.value.id==='configured').value;assert.equal(row.duration_count,7);}
}
for(const trialDays of [0,null,-1,366]){writes.length=0;await assert.rejects(()=>savePlatformPlans([{...trial,trialDays}]));assert.equal(writes.length,0,'invalid default rejected before any write');}
writes.length=0;authorized=false;await assert.rejects(()=>savePlatformPlans([trial]),/Forbidden/);assert.equal(writes.length,0);
console.log('PASS default trial save: authorization, configured duration, RPC/fallback consistency, paid billing and invalid-day rejection');
authorized=true;rpcError=true;writes.length=0;
await assert.rejects(()=>updateCafePlan('00000000-0000-4000-8000-000000000001','configured'));
assert.equal(writes.length,1);assert.equal(writes[0].name,'admin_assign_plan_without_payment','failed RPC never falls back to a non-atomic unlimited grant');
