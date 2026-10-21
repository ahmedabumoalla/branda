import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let allowed=true,rpcError=null,calls=[],refreshed=[];
const stubs={
 '@/lib/data/cafes':{requirePlatformAdmin:async()=>{if(!allowed)throw Error('Forbidden');}},
 '@/lib/supabase/server':{createClient:async()=>({rpc:async(name,args)=>{calls.push({name,args});return{error:rpcError};}})},
 '@/lib/data/admin':{getAdminCafeSubscriptionSummary:async()=>({planExpiresAtExact:'2026-10-22T09:00:00Z',planId:'same-plan'})},
 'next/cache':{revalidatePath:(...args)=>refreshed.push(args)},
};
function load(file){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>stubs[name]??(name.startsWith('@/')?load(name.slice(2)+'.ts'):require(name)),exports);return exports;}
const {parseSaudiDeadline:parse,saudiDeadlineInput:input,formatSaudiDeadline:format}=load('lib/platform/subscription-deadline.ts');
assert.equal(parse('2026-10-22T12:00'),'2026-10-22T09:00:00.000Z');assert.equal(input('2026-10-21T23:00:00Z'),'2026-10-22T02:00');
assert.equal(input(null),'');assert.equal(input('invalid'),'');assert(format('2026-10-22T09:00:00Z').includes('12:00'));
for(const bad of ['2026-02-30T12:00','2026-10-22T24:00','2026-13-01T12:00','2026-10-22','2026-10-22T12:99','2026-10-22T12:00Z'])assert.throws(()=>parse(bad));
assert.equal(parse('2028-02-29T12:00'),'2028-02-29T09:00:00.000Z');
const {updateSubscriptionDeadlineAction:update}=load('app/actions/admin-subscription-deadline.ts');
const data={cafeId:'00000000-0000-4000-8000-000000000001',subscriptionId:'00000000-0000-4000-8000-000000000002',expectedUpdatedAt:'2026-10-21T12:00:00.123456+00:00',localDeadline:'2026-10-22T12:00'};
allowed=false;assert.equal((await update(data)).ok,false);assert.equal(calls.length,0);allowed=true;
assert.equal((await update({...data,planId:'injected'})).ok,false);assert.equal(calls.length,0);
assert.equal((await update({...data,localDeadline:'invalid'})).ok,false);assert.equal(calls.length,0);
let result=await update(data);assert(result.ok);assert.equal(result.data.planId,'same-plan');assert.equal(calls[0].name,'admin_update_subscription_deadline');assert.equal(calls[0].args.p_expires_at,'2026-10-22T09:00:00.000Z');assert.equal(calls[0].args.p_expected_updated_at,data.expectedUpdatedAt);assert(refreshed.some(([p])=>p==='/dashboard'));
rpcError={message:'expiry_conflict'};result=await update(data);assert.equal(result.ok,false);assert(result.message.includes('تغير الاشتراك'));
rpcError={message:'secret database error'};result=await update(data);assert(!result.message.includes('secret'));
const {adminSubscriptionSummary:summary}=load('lib/platform/admin-subscription-status.ts');
const row={id:data.subscriptionId,updated_at:data.expectedUpdatedAt,plan_id:'trial',status:'trialing',started_at:'2026-10-12T00:00:00Z',expires_at:'2026-10-22T09:00:00Z',created_at:'2026-10-12T00:00:00Z',platform_plans:{active:true}};
const current=summary([row],Date.parse('2026-10-21T12:00Z'));assert.equal(current.subscriptionId,row.id);assert.equal(current.planExpiresAtExact,row.expires_at);assert(current.subscriptionExpiryEditable);
assert(!summary([{...row,activation_source:'admin_prepared_trial'}]).subscriptionExpiryEditable);assert(!summary([{...row,status:'cancelled'}]).subscriptionExpiryEditable);
console.log('PASS Saudi timezone/calendar validation,admin actions,safe errors,current subscription metadata');
