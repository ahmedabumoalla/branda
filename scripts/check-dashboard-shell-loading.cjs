const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
let owner={id:'brand',slug:'brand',name:'Brand',businessCategory:'cafes_coffee'},calls=[];
const query=table=>new Proxy({}, {get(_,key){if(key==='then')return done=>{calls.push(table);done({data:table==='cafe_settings'?{logo_storage_path:'brand/logo.webp'}:[],error:null});};return()=>query(table);}});
const mocks={
 '@/lib/data/feature-entitlements':{getCafeServiceAccess:async id=>{assert.equal(id,'brand');calls.push('access');return{planId:'finance',features:['finance'],subscription:null,serviceSubscriptions:[]};}},
 '@/lib/data/cafes':{getOwnerCafeContext:async()=>owner},
 '@/lib/data/admin':{getPlatformPlans:async()=>{calls.push('plans');return[{id:'finance',features:[]}];}},
 '@/lib/data/mappers':{mapDbSettingsToCafeSettings:(slug,row)=>({cafeSlug:slug,logoAssetId:row.logo_storage_path})},
 '@/lib/supabase/server':{createClient:async()=>({from:query})},
};
const exportsForTest={};const js=ts.transpileModule(fs.readFileSync('app/actions/dashboard-shell.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports',js)(name=>{assert.ok(name in mocks,`Unexpected blocking dependency ${name}`);return mocks[name];},exportsForTest);
(async()=>{const s=await exportsForTest.fetchOwnerDashboardShellAction();assert.equal(s.settings.logoAssetId,'brand/logo.webp');assert.equal(s.settings.logoDataUrl,undefined);assert.equal(s.settings.cafeName,'Brand');assert.deepEqual(s.plans[0].features,['finance']);assert.deepEqual(calls.sort(),['access','cafe_settings','notifications','plans']);owner=null;calls=[];const denied=await exportsForTest.fetchOwnerDashboardShellAction();assert.equal(denied.unauthenticated,true);assert.deepEqual(calls,['plans']);console.log('PASS dashboard shell: branding is nonblocking, live service access retained, unauthenticated path never reads brand data');})().catch(e=>{console.error(e);process.exitCode=1;});
