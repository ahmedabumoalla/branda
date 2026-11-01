import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function load(path,stubs){const exports={};new Function('require','exports',compile(fs.readFileSync(path,'utf8')))(name=>stubs[name]??require(name),exports);return exports;}
function nodes(t){return !t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)]}
function hookHarness(){let cursor=0,pending=false;const state=[];let effects=[];const hooks={...React,useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next}];},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useTransition(){return[pending,fn=>{pending=true;fn()}]},useMemo:fn=>fn(),useLayoutEffect(){},useEffect(fn,deps){const i=cursor++;if(!state[i]||deps.some((v,n)=>v!==state[i][n])){state[i]=deps;effects.push(fn)}}};return{hooks,start(){cursor=0},async effects(){for(const fn of effects)fn();effects=[];await new Promise(resolve=>setTimeout(resolve,0))}}}
const branches=[{id:'main',slug:'murooj',name:'فرع المروج',primary:true},{id:'drive',slug:'drive-thru',name:'الدرايف ثرو',primary:false}];
let checks=0;const check=fn=>{fn();checks++};
const nav=hookHarness(),pushed=[];
const BranchSwitcher=()=>null;
const shared=({children})=>React.createElement('div',null,children);
const {MenuPageClient}=load('components/dashboard/pages/menu-page.tsx',{
 react:nav.hooks,'next/navigation':{useRouter:()=>({push:(...args)=>pushed.push(args)})},'next/dynamic':{__esModule:true,default:()=>()=>null},
 '@/app/actions/menu':{},'@/components/dashboard/menu/category-manager':{CategoryManager:()=>null},'@/components/dashboard/menu/product-card':{MenuProductCard:({product})=>React.createElement('div',null,product.name)},'@/components/dashboard/menu/branch-switcher':{MenuBranchSwitcher:BranchSwitcher},
 '@/components/ui/design-system':{BentoCard:shared,DashboardPageShell:({title,children})=>React.createElement('section',null,title,children),NeumoInput:props=>React.createElement('input',props),PrimaryButton:props=>React.createElement('button',props)},
 '@/lib/mock/menu-categories':{getCategoryNameById:()=>''},'@/components/ui/app-toast':{AppToast:()=>null,useAppToast:()=>({toast:null,showToast(){}})},'@/lib/platform/business-copy':{getBusinessCopy:()=>({kind:'cafe'})},'@/lib/menu/product-position':{},'@/lib/menu/menu-change':{},'@/lib/menu/product-copy':{},'@/lib/commerce/product-details':{},'@/components/dashboard/menu/menu-dashboard.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>key})}
});
const props={initialProducts:[{id:'old',name:'Old branch product',available:true,category:'Coffee'}],initialCategories:[],cafeSlug:'loco',branchId:'main',branchName:'فرع المروج',branches};
const renderMenu=()=>{nav.start();return MenuPageClient(props)};
check(()=>assert(renderToStaticMarkup(renderMenu()).includes('Old branch product')));
nodes(renderMenu()).find(n=>n.type===BranchSwitcher).props.onSwitch(branches[1]);
check(()=>{assert.deepEqual(pushed,[['/dashboard/menu?branch=drive',{scroll:false}]]);const html=renderToStaticMarkup(renderMenu());assert(html.includes('جارٍ تحميل منيو الدرايف ثرو'));assert(html.includes('aria-busy="true"'));assert(!html.includes('Old branch product'));assert(nodes(renderMenu()).find(n=>n.type===BranchSwitcher).props.busy)});
const controls=hookHarness();let response={ok:true,menuEnabled:true,branches};let calls=0;
const {StandaloneMenuControl}=load('components/admin/standalone-menu-control.tsx',{react:controls.hooks,'next/link':{__esModule:true,default:props=>{const rest={...props};delete rest.prefetch;return React.createElement('a',rest)}},'@/app/actions/admin-menu-branches':{loadAdminMenuBranchesAction:async()=>{calls++;return response}},'@/lib/platform/feature-access':{getBrandFeatureOverrides:()=>[],getPlanIncludedFeatures:()=>[],getEffectiveBrandFeatureAccess:()=>[{feature:{id:'menu'},effectiveEnabled:true}]}});
const cafe={id:'one',name:'LOCO',slug:'loco',status:'نشط',hasActivePlan:true,planId:'plan'},plans=[{id:'plan',active:true}];
const renderControl=()=>{controls.start();return StandaloneMenuControl({cafe,plans})};
check(()=>assert(renderToStaticMarkup(renderControl()).includes('جارٍ تحميل منيوهات الفروع')));await controls.effects();
check(()=>{const html=renderToStaticMarkup(renderControl());assert(html.includes('/menu/loco?branch=murooj'));assert(html.includes('/menu/loco?branch=drive-thru'));assert(html.includes('منيو الفرع'));assert(html.includes('منيو الدرايف ثرو'));assert(!html.includes('href="/menu/loco"'))});
cafe.id='two';cafe.slug='another';response={ok:true,menuEnabled:true,branches:[]};check(()=>{const html=renderToStaticMarkup(renderControl());assert(!html.includes('murooj'));assert(html.includes('جارٍ تحميل'))});await controls.effects();check(()=>assert(renderToStaticMarkup(renderControl()).includes('href="/menu/another"')));
cafe.id='three';response={ok:false,error:'Failed'};renderControl();await controls.effects();check(()=>assert(renderToStaticMarkup(renderControl()).includes('إعادة المحاولة')));
response={ok:true,menuEnabled:true,branches};nodes(renderControl()).find(n=>n.type==='button').props.onClick();renderControl();await controls.effects();check(()=>assert(renderToStaticMarkup(renderControl()).includes('منيو الدرايف ثرو')));
cafe.hasActivePlan=false;cafe.planId='finance';plans.push({id:'finance',active:true,features:['finance']});const before=calls;renderControl();await controls.effects();check(()=>{assert.equal(calls,before+1);assert(renderToStaticMarkup(renderControl()).includes('?branch='))});
response={ok:true,menuEnabled:false,branches:[]};cafe.status='موقوف';renderControl();await controls.effects();check(()=>{assert(!renderToStaticMarkup(renderControl()).includes('?branch='));assert(renderToStaticMarkup(renderControl()).includes('المنيو غير متاح'))});
const active=load('lib/platform/active-subscription.ts',{});
const {getServiceSubscriptionAccess}=load('lib/platform/service-subscriptions.ts',{'@/lib/platform/active-subscription':active});
const {adminSubscriptionSummary}=load('lib/platform/admin-subscription-status.ts',{'@/lib/platform/active-subscription':active});
const subscriptions=[{id:'finance',plan_id:'finance',status:'trialing',created_at:'2026-11-01T01:00:00Z',started_at:'2026-11-01T01:00:00Z',expires_at:'2026-11-08T01:00:00Z',platform_plans:{active:true,features:['finance']}},{id:'menu-loyalty',plan_id:'menu-loyalty',status:'trialing',created_at:'2026-10-31T23:00:00Z',started_at:'2026-10-31T23:00:00Z',expires_at:'2026-11-15T23:00:00Z',platform_plans:{active:true,features:['menu','loyalty']}}];
const now=Date.parse('2026-11-02T00:00:00Z'),serviceRows=subscriptions.map(s=>({planId:s.plan_id,status:s.status,startedAt:s.started_at,expiresAt:s.expires_at,features:s.platform_plans.features}));
check(()=>{assert.equal(adminSubscriptionSummary(subscriptions,now).planId,'finance');assert(getServiceSubscriptionAccess(serviceRows,now).features.includes('menu'))});
let authorized=false,clients=0,features=getServiceSubscriptionAccess(serviceRows,now).features,cafeStatus='active',deletedAt=null;const filters=[];const query={select(){return this},eq(...args){filters.push(['eq',...args]);return this},not(...args){filters.push(['not',...args]);return this},is(...args){filters.push(['is',...args]);return this},order(){return this},then(resolve){resolve({data:[{id:'main',name:'Murooj',menu_slug:'murooj',is_primary:true}],error:null})}};
const cafeQuery={select(){return this},eq(){return this},async maybeSingle(){return{data:{id:'c570fc68-c11e-4c67-9574-acd81ddbc365',status:cafeStatus,deleted_at:deletedAt},error:null}}};
const {loadAdminMenuBranchesAction}=load('app/actions/admin-menu-branches.ts',{'@/lib/data/cafes':{requirePlatformAdmin:async()=>{if(!authorized)throw Error('denied')}},'@/lib/data/feature-entitlements':{getCafeFeatureCodes:async()=>features},'@/lib/platform/feature-gates':{featureCodesAllow:(codes,feature)=>codes.includes(feature)},'@/lib/supabase/server':{createClient:async()=>{clients++;return{from:table=>table==='cafes'?cafeQuery:query}}}});
check(()=>assert.equal(clients,0));const blocked=await loadAdminMenuBranchesAction('c570fc68-c11e-4c67-9574-acd81ddbc365');check(()=>{assert.equal(blocked.ok,false);assert.equal(clients,0)});authorized=true;const invalid=await loadAdminMenuBranchesAction('invalid');check(()=>{assert.equal(invalid.ok,false);assert.equal(clients,0)});const loaded=await loadAdminMenuBranchesAction('c570fc68-c11e-4c67-9574-acd81ddbc365');check(()=>{assert(loaded.ok);assert(filters.some(f=>f[1]==='cafe_id'&&f[2]==='c570fc68-c11e-4c67-9574-acd81ddbc365'));assert(filters.some(f=>f[1]==='active'&&f[2]===true));assert(filters.some(f=>f[1]==='deleted_at'&&f[2]===null));assert(filters.some(f=>f[1]==='menu_slug'));assert.equal(loaded.branches[0].primary,true)});
check(()=>assert.equal(loaded.menuEnabled,true));
features=['finance','loyalty'];const disabled=await loadAdminMenuBranchesAction('c570fc68-c11e-4c67-9574-acd81ddbc365');check(()=>{assert.equal(disabled.menuEnabled,false);assert.deepEqual(disabled.branches,[])});
features=getServiceSubscriptionAccess(serviceRows,Date.parse('2026-11-20T00:00:00Z')).features;const expired=await loadAdminMenuBranchesAction('c570fc68-c11e-4c67-9574-acd81ddbc365');check(()=>assert.equal(expired.menuEnabled,false));
features=['menu'];cafeStatus='suspended';const paused=await loadAdminMenuBranchesAction('c570fc68-c11e-4c67-9574-acd81ddbc365');check(()=>assert.equal(paused.menuEnabled,false));
cafeStatus='published';const published=await loadAdminMenuBranchesAction('c570fc68-c11e-4c67-9574-acd81ddbc365');check(()=>assert.equal(published.menuEnabled,true));deletedAt='2026-11-01';const removed=await loadAdminMenuBranchesAction('c570fc68-c11e-4c67-9574-acd81ddbc365');check(()=>assert.equal(removed.menuEnabled,false));
console.log(`Menu branch navigation: ${checks} pending, isolation, combined subscription and authorization checks passed`);
