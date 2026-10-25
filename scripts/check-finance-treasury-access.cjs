const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const cafe = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const request = '33333333-3333-4333-8333-333333333333';
let role = 'owner', session = null, profile = {role:'platform_admin',status:'active'}, error = null, calls=[];
const rpc = async (name,args,privileged=false) => {calls.push({name,args,privileged});return {data:{id:request,accounts:[],rows:[]},error};};
const admin = {rpc:(...args)=>rpc(...args,true),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})})})};
const moduleObject={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/data/finance-treasury.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module:moduleObject,exports:moduleObject.exports,Error,Date,JSON,Object,
  require(name){
    if(name==='server-only')return {};
    if(name==='zod')return require('zod');
    if(name==='./brand-finance')return {getBrandFinanceContext:async()=>({client:{rpc},cafe:{id:cafe,slug:'fixture',role}})};
    if(name==='@/lib/platform/maintenance')return {getCurrentMaintenanceSession:async()=>session};
    if(name==='@/lib/supabase/admin')return {createAdminClient:()=>admin};
    throw Error(name);
  }
});
(async()=>{
  const {getFinanceTreasury,getFinanceAccountStatement,getFinanceTreasuryHistory,executeFinanceTreasury,executeFinanceTreasuryCorrection}=moduleObject.exports;
  assert.equal((await getFinanceTreasury()).canCorrect,false);
  role='cashier';calls=[];
  await assert.rejects(getFinanceTreasury());
  await assert.rejects(getFinanceAccountStatement(cafe));
  await assert.rejects(getFinanceTreasuryHistory(cafe,'audit'));
  await assert.rejects(executeFinanceTreasury('transfer',{},request));
  assert.equal(calls.length,0,'cashier denied before any RPC');
  role='manager';
  await assert.rejects(executeFinanceTreasury('reset',{},request));
  await assert.rejects(executeFinanceTreasury('voucher',{},'bad'));
  await assert.rejects(executeFinanceTreasury('voucher',{note:'x'.repeat(31_000)},request));
  await assert.rejects(getFinanceAccountStatement('bad'));
  await assert.rejects(getFinanceAccountStatement(cafe,{offset:-1}));
  await assert.rejects(getFinanceAccountStatement(cafe,{from:'2026-02-30'}));
  await assert.rejects(getFinanceAccountStatement(cafe,{from:'2026-02-28',to:'2026-01-01'}));
  assert.equal(calls.length,0,'invalid inputs never reach SQL');
  await assert.rejects(getFinanceTreasuryHistory(cafe,'unknown'));
  await getFinanceTreasuryHistory(cafe,'reconciliations',100);
  assert.equal(calls.at(-1).args.p_offset,100);
  assert.equal(calls.at(-1).args.p_kind,'reconciliations');
  await getFinanceAccountStatement(cafe,{offset:100,from:'2026-01-01',to:'2026-12-31'});
  assert.equal(calls.at(-1).args.p_limit,100);
  assert.equal(calls.at(-1).args.p_offset,100);
  assert.equal(calls.at(-1).args.p_cafe_id,cafe);
  await executeFinanceTreasury('transfer',{accountId:cafe,amount:12},request);
  assert.equal(calls.at(-1).args.p_request_id,request);
  assert.equal(calls.at(-1).privileged,false);
  const before=calls.length;
  await assert.rejects(executeFinanceTreasuryCorrection('reset',{reason:'audit'},request));
  session={cafeId:'other',adminUserId:actor,expiresAt:Date.now()+10000};
  await assert.rejects(executeFinanceTreasuryCorrection('reset',{reason:'audit'},request));
  session.cafeId=cafe;
  for(const value of [{role:'owner',status:'active'},{role:'platform_admin',status:'blocked'}]){
    profile=value;await assert.rejects(executeFinanceTreasuryCorrection('reset',{reason:'audit'},request));
  }
  assert.equal(calls.length,before,'invalid maintenance sessions cannot call service RPC');
  profile={role:'platform_admin',status:'active'};
  await executeFinanceTreasuryCorrection('reset',{reason:' audit ',actorId:'spoof',expectedBalance:12},request);
  assert.equal(calls.at(-1).args.p_actor_id,actor);
  assert.equal(calls.at(-1).args.p_maintenance_expires_at,new Date(session.expiresAt).toISOString());
  assert.equal(calls.at(-1).args.p_payload.reason,'audit');
  assert.equal(calls.at(-1).privileged,true);
  error={code:'XX000',message:'secret SQL detail'};
  await assert.rejects(executeFinanceTreasury('voucher',{},request), e=>!e.message.includes('secret'));
  console.log('PASS treasury access: roles, tenant context, bounded validated inputs, dates, idempotency, signed-maintenance identity and private failures');
})().catch(error=>{console.error(error);process.exitCode=1;});
