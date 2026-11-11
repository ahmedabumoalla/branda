import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,stubs={}) {
  const out={};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function('require','exports',code)(name=>name==='server-only'?{}:stubs[name]??(name.startsWith('@/')?{}:require(name)),out);
  return out;
}
let checks=0;
const check=(x,m)=>{assert(x,m);checks++;};
function query(resolve){const q=new Proxy({}, {get:(_,key)=>key==='then'?(yes,no)=>Promise.resolve().then(resolve).then(yes,no):()=>q});return q;}

// Execute the real directory mapper: the number of HTTP calls grows per batch,
// not ten times per brand, and errors never become invented zero statistics.
for(const count of [0,1,205]) {
  const cafes=Array.from({length:count},(_,i)=>({id:`brand-${i}`,slug:`brand-${i}`,created_at:'2026-01-01',cafe_settings:{},cafe_members:[]}));
  const calls=[];
  const client={from:table=>{calls.push(table);assert.equal(table,'cafes');return query(()=>({data:cafes}));},rpc:async(name,args)=>{calls.push(name);return {data:name==='admin_brand_onboarding_status'?[]:args.p_cafe_ids.map(cafe_id=>({cafe_id,products_count:3,offers_count:1,branches_count:1,customers_count:4,orders_count:1500,experience_submissions_count:2,experience_rewards_count:1,loyalty_cards_count:4,support_tickets_count:0,total_revenue:3750}))};}};
  const mod=load('lib/data/admin.ts',{
    '@/lib/supabase/server':{createClient:async()=>client},
    '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query(()=>({data:[]}))})},
    '@/lib/data/cafes':{requirePlatformAdmin:async()=>({id:'admin'})},
    '@/lib/platform/maintenance':{makeMaintenanceAccountNumber:()=>''},
    '@/lib/platform/business-categories':{BUSINESS_CATEGORIES:[]},
    '@/lib/data/admin-brand-subscriptions':{getAdminBrandSubscriptionStates:async ids=>new Map(ids.map(id=>[id,{planName:'Loyalty'}]))},
  });
  const result=await mod.getAdminCafes();
  check(result.length===count,'all brands preserved');
  check(calls.filter(v=>v==='admin_brand_directory_metrics').length===Math.ceil(count/100),'one metrics request per bounded batch');
  if(count)check(result[0].totalRevenue===3750&&result[0].totalOrders===1500&&result[0].productsCount===3,'complete database aggregates mapped');
}
{
  let reads=0;
  const mod=load('lib/data/admin.ts',{'@/lib/data/cafes':{requirePlatformAdmin:async()=>{throw Error('denied');}},'@/lib/supabase/server':{createClient:async()=>{reads++;}}});
  await assert.rejects(()=>mod.getAdminCafes(),/denied/);check(reads===0,'denied admin never reads metrics');
}

// Authorized wallet composition reads the card once and enriches only after the
// live customer + tenant ownership check; never a module-global membership cache.
for(const authorized of [true,false]) {
  let views=0,enrich=0,active=0,peak=0;
  const tables=[];
  const view={card:{id:'card',cafeId:'brand',cardCode:'CARD123',updatedAt:'now'},program:{enabled:true},cafeSlug:'brand'};
  const client={from:table=>query(async()=>{tables.push(table);if(table==='loyalty_cards')return {data:authorized?{id:'card'}:null};enrich++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,8));active--;return table==='customer_reward_instances'?{count:2}:{data:table==='cafes'?{business_category:'cafes_coffee'}:null};})};
  const mod=load('lib/data/loyalty-experience.ts',{
    '@/lib/supabase/admin':{createAdminClient:()=>client},
    '@/lib/data/cafes':{getCafeBySlug:async()=>({id:'brand',slug:'brand',name:'Brand'})},
    '@/lib/data/feature-entitlements':{getPublicCafeFeatureCodesBySlug:async()=>['loyalty']},
    '@/lib/platform/feature-gates':{featureCodesAllow:()=>true},
    '@/lib/data/loyalty-cards':{getLoyaltyCardViewByCode:async()=>{views++;return view;},getPublicLoyaltyProgramBySlug:async()=>view.program},
    '@/lib/auth/rast-loyalty-session':{getLoyaltyCustomerProfile:async()=>({id:'profile'})},
    '@/lib/data/settings':{getPublicCafeSettings:async()=>({})},
    '@/lib/data/loyalty-identity':{getLoyaltyBrandAppearance:async()=>({})},
    '@/lib/menu/logo-variants':{standaloneLogoVariant:()=>null},
    '@/lib/loyalty/experience-types':{defaultLoyaltyExperience:{nearbyMessage:'nearby'}},
  });
  const result=await mod.getAuthorizedWalletMember('CARD123');
  check(views===1,'card view loaded once');
  if(authorized){check(result.card.availableRewards===2,'fresh rewards retained');check(peak>=3,'independent wallet details run concurrently');}
  else {check(result===null&&enrich===0,'cross-profile denied before enrichment');}
}

// Settings query does not touch private customer history or image storage.
{
  const tables=[];const cafe={id:'brand',slug:'brand'};
  const mod=load('lib/data/loyalty-cards.ts',{
    '@/lib/data/cafes':{requireOwnerCafeContext:async()=>cafe},
    '@/lib/supabase/server':{createClient:async()=>({from:table=>{tables.push(table);return query(()=>({data:table==='menu_products'?[{id:'tea',name:'Tea',private:'never returned'}]:{enabled:true}}));}})},
    '@/lib/data/loyalty-identity':{getLoyaltyBrandAppearance:async()=>({colors:{},businessCategory:'cafes_coffee'})},
    '@/lib/loyalty/brand-stamp-artwork':{brandStampStyle:()=> 'brand'},
  });
  const settings=await mod.getOwnerLoyaltyProgramSettings();const products=await mod.getOwnerLoyaltyRewardProducts();
  check(settings.program.enabled&&settings.cafeId==='brand','owner settings contract');
  assert.deepEqual(tables,['cafe_loyalty_programs','menu_products']);checks++;
  assert.deepEqual(products,[{id:'tea',name:'Tea'}]);checks++;
}
console.log(`PASS ${checks} data hot-path batching, authorization, concurrency and minimal owner payload checks`);
