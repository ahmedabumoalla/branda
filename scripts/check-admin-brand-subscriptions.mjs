import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createRequire} from 'node:module';
const requireDependency=createRequire(import.meta.url);
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/i,'$1')),'..');
function load(file,stubs={}){
  const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','exports',code)(name=>name==='server-only'?{}:Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('@/')?load(name.slice(2)+'.ts',stubs):requireDependency(name),exports);return exports;
}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cafeId=id(1),revision='a'.repeat(32),newRevision='b'.repeat(32);
const starts='2026-10-01T00:00:00Z',ends='2028-11-06T09:00:00Z';
const row=(plan,index)=>({id:id(index),plan_id:plan,plan_name_snapshot:plan,status:'active',activation_source:'admin_assignment',started_at:starts,expires_at:ends,created_at:starts,updated_at:starts,platform_plans:{active:true,name:plan}});
const state=(overrides={})=>({revision,currentPlanIds:['menu','loyalty'],sharedExpiresAt:ends,trialAwaitingDelivery:false,subscriptions:[row('menu',11),row('loyalty',12)],...overrides});
function harness(){
  const h={guardError:null,profileStatus:'active',rpcError:null,result:state(),calls:[],clients:0,guards:0,revalidated:[],refetches:0};
  const stubs={
    '@/lib/data/cafes':{requirePlatformAdmin:async()=>{h.guards++;if(h.guardError)throw Error(h.guardError);return{id:id(3)};}},
    '@/lib/supabase/server':{createClient:async()=>{h.clients++;return{
      from:table=>{assert.equal(table,'profiles');const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:{role:'platform_admin',status:h.profileStatus},error:null})};return q;},
      rpc:async(name,args)=>{h.calls.push({name,args});return {data:name==='admin_brand_subscription_states'?Object.fromEntries(args.p_cafe_ids.map(key=>[key,h.result])):h.result,error:h.rpcError};},
    };}},
    '@/lib/data/admin':{getAdminCafeSubscriptionSummary:async()=>{h.refetches++;throw Error('Unexpected independent snapshot read');}},
    '@/lib/supabase/admin':{createAdminClient:()=>{throw Error('No service-role bypass permitted');}},
    'next/cache':{revalidatePath:(...args)=>h.revalidated.push(args)},
  };
  h.data=load('lib/data/admin-brand-subscriptions.ts',stubs);
  h.deadline=load('app/actions/admin-subscription-deadline.ts',stubs);
  h.actions=load('app/actions/admin.ts',stubs);
  return h;
}
let groups=0;
async function test(name,run){await run();groups++;console.log('PASS '+name);}
await test('administrative guard precedes every read or mutation RPC',async()=>{
  for(const operation of [h=>h.data.getAdminBrandSubscriptionStates([cafeId]),h=>h.data.getAdminBrandSubscriptionSummary(cafeId),h=>h.data.addAdminBrandPlans({cafeId,planIds:['menu'],expectedRevision:revision}),h=>h.data.removeAdminBrandPlans({cafeId,planIds:['menu'],expectedRevision:revision})]){
    const h=harness();h.guardError='Unauthorized';await assert.rejects(()=>operation(h),/Unauthorized/);assert.equal(h.clients,0);assert.equal(h.calls.length,0);
  }
});
await test('batch snapshots deduplicate IDs and request at most 100 brands per atomic RPC',async()=>{
  const h=harness(),ids=Array.from({length:205},(_,i)=>id(i+1));const result=await h.data.getAdminBrandSubscriptionStates([...ids,ids[0],ids[90]]);
  assert.equal(result.size,205);assert.deepEqual(h.calls.map(c=>c.args.p_cafe_ids.length),[100,100,5]);
  assert.deepEqual(h.calls.flatMap(c=>c.args.p_cafe_ids),ids);assert(h.calls.every(c=>c.name==='admin_brand_subscription_states'));
  for(const summary of result.values())assert.equal(summary.subscriptionRevision,revision);
});
await test('malformed revisions and snapshot payloads fail closed',()=>{
  const h=harness();
  for(const bad of [null,{},state({revision:'x'}),state({revision:'A'.repeat(32)}),state({subscriptions:null}),state({subscriptions:['x']}),state({currentPlanIds:null}),state({sharedExpiresAt:'invalid'}),state({trialAwaitingDelivery:'false'})])assert.throws(()=>h.data.summaryFromSubscriptionState(bad),undefined,JSON.stringify(bad));
});
await test('snapshot retains whole standing cohort and database revision without computing its own token',async()=>{
  const h=harness();h.result=state({revision:newRevision});const summary=await h.data.getAdminBrandSubscriptionSummary(cafeId);
  assert.equal(h.calls[0].name,'admin_brand_subscription_state');assert.equal(h.calls[0].args.p_cafe_id,cafeId);
  assert.deepEqual(new Set(summary.planIds),new Set(['menu','loyalty']));assert.equal(summary.subscriptionRevision,newRevision);assert.equal(summary.subscriptionsCount,2);
});
await test('add plans deduplicates IDs and sends the entire cohort revision unchanged',async()=>{
  const h=harness();h.result=state({revision:newRevision});const summary=await h.data.addAdminBrandPlans({cafeId,planIds:['menu','loyalty','menu'],expectedRevision:revision});
  assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0],{name:'admin_add_brand_plans',args:{p_cafe_id:cafeId,p_plan_ids:['menu','loyalty'],p_expected_revision:revision}});assert.equal(summary.subscriptionRevision,newRevision);
});
await test('remove plans deduplicates only requested IDs and returns the committed remaining cohort',async()=>{
  const h=harness();h.result=state({revision:newRevision,currentPlanIds:['loyalty'],subscriptions:[row('loyalty',12)]});
  const summary=await h.data.removeAdminBrandPlans({cafeId,planIds:['menu','menu'],expectedRevision:revision});
  assert.deepEqual(h.calls,[{name:'admin_remove_brand_plans',args:{p_cafe_id:cafeId,p_plan_ids:['menu'],p_expected_revision:revision}}]);
  assert.deepEqual(summary.planIds,['loyalty']);assert.equal(summary.subscriptionRevision,newRevision);assert.equal(h.refetches,0);
});
await test('removing the last or all plans accepts the atomic empty cohort without replacing it',async()=>{
  const h=harness();h.result=state({revision:newRevision,currentPlanIds:[],sharedExpiresAt:null,subscriptions:[]});
  const summary=await h.data.removeAdminBrandPlans({cafeId,planIds:['menu','loyalty'],expectedRevision:revision});
  assert.deepEqual(h.calls[0].args.p_plan_ids,['menu','loyalty']);assert.deepEqual(summary.planIds,[]);assert.equal(summary.hasActivePlan,false);assert.equal(summary.subscriptionRevision,newRevision);assert.equal(h.calls.length,1);
});
await test('invalid identifiers oversized selections and injected fields never reach persistence',async()=>{
  const h=harness();const valid={cafeId,planIds:['menu'],expectedRevision:revision};
  for(const mutation of ['addAdminBrandPlans','removeAdminBrandPlans'])for(const patch of [{cafeId:'bad'},{planIds:[]},{planIds:['']},{planIds:['Finance']},{planIds:['menu plan']},{planIds:['x'.repeat(61)]},{planIds:Array.from({length:51},(_,i)=>`plan-${i}`)},{expectedRevision:'bad'},{expectedRevision:'A'.repeat(32)},{expiresAt:ends},{subscriptionId:id(8)}])await assert.rejects(()=>h.data[mutation]({...valid,...patch}));
  assert.equal(h.calls.length,0);assert.equal(h.clients,0);
  await assert.rejects(()=>h.data.getAdminBrandSubscriptionStates([cafeId,'bad']));assert.equal(h.calls.length,0);
});
await test('database inactive-admin invalid-plan and conflict denials remain Arabic and do not bypass RPC',async()=>{
  for(const mutation of ['addAdminBrandPlans','removeAdminBrandPlans'])for(const code of ['brand_subscription_forbidden','brand_subscription_invalid_plan','brand_subscription_conflict']){
    const h=harness();h.rpcError={message:code};await assert.rejects(()=>h.data[mutation]({cafeId,planIds:['menu'],expectedRevision:revision}),error=>/[\u0600-\u06ff]/.test(error.message)&&!error.message.includes(code));assert.equal(h.calls.length,1);
  }
});
await test('unexpected database details are never exposed to the action client',async()=>{
  for(const action of ['addCafePlansAction','removeCafePlansAction']){
    const h=harness();h.rpcError={message:'SECRET_PRIVATE_DATABASE_CONTEXT'};const result=await h.actions[action](cafeId,['menu'],revision);
    assert.equal(result.ok,false);assert(!result.message.includes('SECRET'));assert.equal(h.revalidated.length,0);
  }
});
await test('add action returns the same committed snapshot and invalidates all affected public routes',async()=>{
  const h=harness();h.result=state({revision:newRevision});const result=await h.actions.addCafePlansAction(cafeId,['menu','loyalty'],revision);assert.equal(result.ok,true);assert.equal(result.data.subscriptionRevision,newRevision);assert.equal(h.refetches,0);
  assert.deepEqual(h.revalidated,[['/admin/cafes'],['/dashboard','layout'],['/c/[slug]','layout'],['/menu/[slug]','page'],['/loyalty/[slug]','page']]);
});
await test('removal action returns the atomic remaining state and invalidates all affected public routes',async()=>{
  const h=harness();h.result=state({revision:newRevision,currentPlanIds:['loyalty'],subscriptions:[row('loyalty',12)]});
  const result=await h.actions.removeCafePlansAction(cafeId,['menu'],revision);
  assert.equal(result.ok,true);assert.deepEqual(result.data.planIds,['loyalty']);assert.equal(result.data.subscriptionRevision,newRevision);assert.equal(h.refetches,0);
  assert.deepEqual(h.calls,[{name:'admin_remove_brand_plans',args:{p_cafe_id:cafeId,p_plan_ids:['menu'],p_expected_revision:revision}}]);
  assert.deepEqual(h.revalidated,[['/admin/cafes'],['/dashboard','layout'],['/c/[slug]','layout'],['/menu/[slug]','page'],['/loyalty/[slug]','page']]);
});
await test('removal action authorization input conflict and malformed snapshot failures invalidate nothing',async()=>{
  for(const scenario of ['unauthorized','empty','stale','malformed']){
    const h=harness();if(scenario==='unauthorized')h.guardError='Unauthorized';if(scenario==='stale')h.rpcError={message:'brand_subscription_conflict'};if(scenario==='malformed')h.result={privateContext:'DO_NOT_LEAK'};
    const result=await h.actions.removeCafePlansAction(cafeId,scenario==='empty'?[]:['menu'],revision);
    assert.equal(result.ok,false);assert(!result.message.includes('DO_NOT_LEAK'));assert(!result.message.includes('brand_subscription_conflict'));assert.equal(h.revalidated.length,0);assert.equal(h.refetches,0);
    assert.equal(h.calls.length,['unauthorized','empty'].includes(scenario)?0:1);
    if(scenario==='unauthorized')assert.equal(h.clients,0);
  }
});
const deadlineInput={cafeId,expectedRevision:revision,localDeadline:'2028-11-06T12:00'};
await test('deadline mutation converts Riyadh time and returns its atomic whole-cohort state',async()=>{
  const h=harness();h.result=state({revision:newRevision});const result=await h.deadline.updateSubscriptionDeadlineAction(deadlineInput);
  assert.equal(result.ok,true);assert.deepEqual(h.calls,[{name:'admin_update_brand_subscription_deadline',args:{p_cafe_id:cafeId,p_expected_revision:revision,p_expires_at:'2028-11-06T09:00:00.000Z'}}]);
  assert.equal(result.data.subscriptionRevision,newRevision);assert.equal(result.data.planExpiresAtExact,ends);assert.equal(h.refetches,0);
  assert.deepEqual(h.revalidated,[['/admin/cafes'],['/dashboard','layout'],['/c/[slug]','layout'],['/menu/[slug]','page'],['/loyalty/[slug]','page']]);
});
await test('invalid deadline or stale legacy single-subscription inputs never mutate',async()=>{
  const h=harness();for(const patch of [{localDeadline:'2028-02-30T12:00'},{localDeadline:'2028-11-06T24:00'},{localDeadline:'2028-11-06T12:00Z'},{expectedRevision:'bad'},{subscriptionId:id(7)},{expectedUpdatedAt:starts}]){
    const result=await h.deadline.updateSubscriptionDeadlineAction({...deadlineInput,...patch});assert.equal(result.ok,false);
  }assert.equal(h.calls.length,0);assert.equal(h.revalidated.length,0);
  h.guardError='Forbidden';assert.equal((await h.deadline.updateSubscriptionDeadlineAction(deadlineInput)).ok,false);assert.equal(h.calls.length,0);
});
await test('deadline cohort conflict and future-start rejection invalidate nothing and return safe Arabic',async()=>{
  for(const code of ['brand_subscription_conflict','brand_subscription_invalid_deadline','brand_subscription_prepared_trial']){
    const h=harness();h.rpcError={message:code};const result=await h.deadline.updateSubscriptionDeadlineAction(deadlineInput);assert.equal(result.ok,false);assert(/[\u0600-\u06ff]/.test(result.message));assert(!result.message.includes(code));assert.equal(h.revalidated.length,0);
  }
});
console.log(`PASS admin brand subscriptions: ${groups} guarded read/mutation, batching, revision, error and atomic deadline groups`);
