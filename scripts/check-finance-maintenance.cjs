const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
let session = null, profile = { role: 'platform_admin', status: 'active' }, calls = [];
const cafe = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const request = '33333333-3333-4333-8333-333333333333';
const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }), rpc: async (name, args) => { calls.push({name,args}); return { data:{id:'reset'},error:null }; } };
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/data/finance-shifts.ts','utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText, {
  exports:moduleObject.exports, module:moduleObject, require: (name) => {
    if(name==='server-only') return {};
    if(name==='zod') return require('zod');
    if(name==='./brand-finance') return {getBrandFinanceContext:async()=>{throw new Error('not used');}};
    if(name==='@/lib/platform/maintenance') return {getCurrentMaintenanceSession:async()=>session};
    if(name==='@/lib/supabase/admin') return {createAdminClient:()=>admin};
    throw new Error(name);
  }, Error, Object,
});
(async()=>{
  const {resetFinanceBalances, getFinanceMaintenanceActor} = moduleObject.exports;
  const payload={note:'audited correction',confirmation:'RESET'};
  await assert.rejects(resetFinanceBalances(cafe,payload,request));
  session={adminUserId:actor,cafeId:'other'};
  assert.equal(await getFinanceMaintenanceActor(cafe),null);
  session.cafeId=cafe;
  for(const state of [{role:'owner',status:'active'},{role:'platform_admin',status:'blocked'}]) {
    profile=state; await assert.rejects(resetFinanceBalances(cafe,payload,request));
  }
  assert.equal(calls.length,0,'Denied callers cannot invoke privileged reset');
  profile={role:'platform_admin',status:'active'};
  await assert.rejects(resetFinanceBalances(cafe,{...payload,confirmation:'yes'},request));
  await assert.rejects(resetFinanceBalances(cafe,{...payload,note:''},request));
  assert.equal(calls.length,0);
  await resetFinanceBalances(cafe,{...payload,actorId:'spoofed'},request);
  assert.equal(calls[0].args.p_actor_id,actor);
  assert.equal(calls[0].args.p_cafe_id,cafe);
  assert.equal(calls[0].args.p_request_id,request);
  assert.equal(calls[0].name,'brand_finance_reset_liquid_balances');
  console.log('PASS maintenance reset: signed-session boundary, tenant, active admin, confirmation, reason, trusted actor and stable request');
})().catch(error=>{console.error(error);process.exitCode=1;});
