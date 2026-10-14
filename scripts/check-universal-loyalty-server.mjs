import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,stubs) {
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const exports={};
  new Function('require','exports',output)(name=>{
    if(name==='server-only') return {};
    if(Object.hasOwn(stubs,name)) return stubs[name];
    if(name.startsWith('@/')) return load(name.slice(2)+'.ts',stubs);
    if(name.startsWith('.')) return load(path.join(path.dirname(file),name)+'.ts',stubs);
    return require(name);
  },exports);
  return exports;
}
let checks=0;
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const reject=async(fn)=>{await assert.rejects(fn);checks++;};
let role='owner', entitled=true, slug='other-cafe', enabled=true, sent=0, otp=0, mutations=0;
const featureCalls=[],paths=[];
const context={id:'10000000-0000-4000-8000-000000000001'};
const features=async()=>entitled?['loyalty']:[];
const brand=()=>({identity:{slug,name:'Own cafe',logoUrl:null},program:{enabled}});
const actions=load('app/actions/loyalty-experience.ts',{
  'next/cache':{revalidatePath:(...value)=>paths.push(value)},
  '@/app/actions/auth':{requestCustomerPhoneOtpAction:async(cafe,phone,purpose,source)=>{assert.equal(cafe,slug);assert.equal(source,'loyalty');otp++;return {required:true,ok:true};},completeCustomerPhoneOtpAction:async()=>({ok:true})},
  '@/lib/data/loyalty-experience':{getLoyaltyBrand:async(value)=>{assert.equal(value,slug);return entitled?brand():null;},saveRastLoyaltySettings:async()=>{},saveBrandLoyaltyProgram:async()=>{},saveOwnerLoyaltyExperience:async()=>{}},
  '@/lib/data/loyalty-enrollment':{enrollLoyaltyCustomer:async()=>({ok:true,returningCustomer:false})},
  '@/lib/auth/phone-otp':{isPhoneOtpRequiredForBrand:(cafe,source)=>{assert.equal(cafe,slug);assert.equal(source,'loyalty');return true;}},
  '@/lib/data/cashier':{requireCashierPermission:async()=>({cafeId:context.id,cafeSlug:slug,token:'own-token'})},
  '@/lib/data/cafes':{requireOwnerCafeContext:async()=>({...context,slug,role})},
  '@/lib/data/feature-entitlements':{getOwnerFeatureCodes:features,getPublicCafeFeatureCodesBySlug:async(value)=>{featureCalls.push(value);return features();}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{assert.equal(name,'execute_loyalty_audited_operation');assert.equal(args.p_session_token,'own-token');mutations++;return {data:{ok:true,status:'stamped',cardCode:'CARD123'},error:null};}})},
  '@/lib/wallet':{syncWalletCardByCode:async()=>{},notifyBrandWalletMembers:async(cafe,cafeSlug)=>{assert.equal(cafe,context.id);assert.equal(cafeSlug,slug);sent++;return {apple:{status:'accepted'},google:{status:'skipped'}};}},
  '@/lib/maps/resolve-branch-location':{GoogleMapsLocationError:class extends Error{}},
  '@/lib/data/customer-rewards':{},
});
check(!(await actions.requestLoyaltyOtpAction(slug,'0500000000')).ok,'retired OTP action cannot send messages');
check(!(await actions.completeLoyaltyOtpAction(slug,'0500000000','123456','Test Member')).ok,'retired verification action cannot create sessions');
check(otp===0,'no OTP provider calls');
entitled=false;
await reject(()=>actions.scanLoyaltyExperienceAction({value:'CARD123',requestId:context.id,kind:'stamp'}));
check(mutations===0,'unsubscribed scan does not call mutation');
entitled=true;
await actions.scanLoyaltyExperienceAction({value:'CARD123',requestId:context.id,kind:'stamp'});
check(featureCalls.every(value=>value===slug),'scan package lookup uses authenticated session brand');
check(mutations===1,'eligible brand uses atomic RPC');
role='staff';await reject(()=>actions.sendLoyaltyWalletAnnouncementAction('Own title','Own message'));
check(sent===0,'ordinary staff cannot send wallet announcements');
for(role of ['owner','manager','platform_admin']) await actions.sendLoyaltyWalletAnnouncementAction('Own title','Own message');
check(sent===3,'authorized owner manager and maintenance admin can notify own brand');
entitled=false;await reject(()=>actions.sendLoyaltyWalletAnnouncementAction('Own title','Own message'));
check(sent===3,'expired package blocks announcement');
await actions.saveRastLoyaltySettingsAction({});
check(paths.some(value=>value[0]==='/loyalty/[slug]' && value[1]==='page'),'settings invalidate every brand loyalty route');
let queueFinished=0,providers=0;
const queued=load('lib/wallet/index.ts',{
  '@/lib/data/feature-entitlements':{getCafeFeatureCodes:async()=>[]},
  './config':{getWalletReadiness:()=>{providers++;throw new Error('provider called');}},
  './apple':{},'./google':{},
  '@/lib/data/loyalty-experience':{loadWalletMemberByCode:async()=>null},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:[{id:'job',kind:'message',cafe_id:context.id,title:'Old title',body:'Old message',attempts:1}],error:null}),from:()=>{const q={update:()=>{queueFinished++;return q;},eq:()=>q,then:resolve=>Promise.resolve({error:null}).then(resolve)};return q;}})},
});
await queued.retryWalletNotificationJobs(1);
check(providers===0 && queueFinished===1,'queued announcements cannot send after package expires');
console.log(`PASS ${checks} universal loyalty server authorization and package checks with mocked services`);
