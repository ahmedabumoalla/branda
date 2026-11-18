const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript'),React=require('react');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',code)(name=>{if(name in mocks)return mocks[name];if(name==='server-only')return {};if(name.endsWith('.css'))return new Proxy({},{get:(_,key)=>String(key)});if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(base+(fs.existsSync(base+'.ts')?'.ts':'.tsx'),mocks);}return require(name);},exports);return exports;}
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];
const exceptions=['brand-9a8c97305195','brand-3c0437f1733a'];
const navigation=load('components/dashboard/integrated-system-navigation.ts');
for(const slug of ['new-brand','existing-brand','brand-1c2b6f7e028f','mind-hospital','khayal-aldeem',...exceptions]){
 const item=navigation.integratedSystemGroupsForBrand(slug).find(g=>g.id==='loyalty').items.find(x=>x.href==='/dashboard/loyalty/branches');assert(item);
 assert.equal(item.feature,exceptions.includes(slug)?'branches':'loyalty');
 for(const features of [[],['menu'],['loyalty'],['loyalty','branches']])assert.equal(Boolean(navigation.systemItemHref(item,{cafeSlug:slug,enabledFeatures:features,isSalon:false,isGifts:false})),exceptions.includes(slug)?features.includes('branches'):features.includes('loyalty'));
}
const hooks={...React,useEffect:()=>{},useId:()=> 'branches-test',useState:x=>[typeof x==='function'?x():x,()=>{}]};
const baseMocks={react:hooks,'next/navigation':{usePathname:()=>'/dashboard/loyalty/branches',useSearchParams:()=>new URLSearchParams(),useRouter:()=>({})},'./dashboard-navigation-link':{DashboardNavigationLink:'a'}};
const {FinanceSidebarMenu}=load('components/dashboard/finance-sidebar-menu.tsx',baseMocks);
for(const enabledFeatures of [[],['menu'],['loyalty']]){
 const tree=nodes(FinanceSidebarMenu({collapsed:false,onExpand(){},enabledFeatures,cafeSlug:'ordinary-brand',loyaltyOnly:true}));
 assert.equal(tree.some(n=>n.props?.href==='/dashboard/loyalty/branches'),enabledFeatures.includes('loyalty'));
 if(!enabledFeatures.includes('loyalty'))assert(!tree.some(n=>n.props?.children==='الفروع'));
}
const sidebarMocks={...baseMocks,'@/lib/cafe/use-resolved-cafe-logo':{useResolvedCafeLogoUrl:()=>null},'@/lib/performance/notifications-client':{retainOwnerNotificationBrand(){}},'@/lib/platform/auth':{logoutBarndaksaAuth:async()=>{}},'./finance-sidebar-menu':{FinanceSidebarMenu:()=>null}};
const source=fs.readFileSync('components/dashboard/DashboardSidebar.tsx','utf8');
for(const match of source.matchAll(/from ["']([^"']+)["']/g)){const name=match[1];if((name.startsWith('@/components/')||name==='@/components/cafe/cafe-logo')&&!(name in sidebarMocks))sidebarMocks[name]=new Proxy({},{get:()=>()=>null});}
const {DashboardSidebar}=load('components/dashboard/DashboardSidebar.tsx',sidebarMocks);
for(const slug of ['ordinary-brand',...exceptions])for(const features of [['loyalty','menu','branches','pager'],['loyalty','menu','branches','pager','finance']]){
 const tree=nodes(DashboardSidebar({servicesAvailable:true,snapshot:{planId:'test',plans:[{id:'test',features}],featureOverrides:[],notifications:[],settings:{cafeSlug:slug,cafeName:'Test',businessCategory:'cafes_coffee'}}}));
 assert(!tree.some(n=>String(n.props?.href||'').startsWith('/dashboard/pager')),'Pager and reviews absent even when old snapshots include pager');
 assert.equal(tree.some(n=>n.props?.href==='/dashboard/branches'),exceptions.includes(slug)&&!features.includes('finance'),'Only protected brands retain separate menu branch entry');
}
for(const file of ['components/rast-loyalty/rast-cashier.tsx','components/cashier/cashier-console-client.tsx'])assert(!fs.readFileSync(file,'utf8').includes('href="/pager"'));
assert(fs.readFileSync('components/finance/finance-pos.tsx','utf8').includes('<FinancePosPager'));
(async()=>{
 let slug='ordinary-brand',allowed=['loyalty'],calls=[];
 const dal=load('lib/data/loyalty-branches.ts',{'@/lib/data/cafes':{requireOwnerCafeContext:async()=>({id:'brand',slug})},'@/lib/data/owner-service-access':{assertOwnerServiceEnabled:async service=>{calls.push(service);if(!allowed.includes(service))throw Error('denied');}},'@/lib/supabase/server':{createClient:async()=>({rpc:async()=>({data:{branches:[],cashiers:[]}})})},'@/lib/supabase/admin':{createAdminClient:()=>{throw Error('No admin reads');}},'@/lib/maps/resolve-branch-location':{resolveBranchGoogleMapsUrl:()=>{throw Error('No map requests');}}});
 await dal.getOwnerLoyaltyBranches();assert.deepEqual(calls,['loyalty']);
 for(slug of exceptions){calls=[];await assert.rejects(dal.getOwnerLoyaltyBranches());assert.deepEqual(calls,['loyalty','branches']);allowed=['loyalty','branches'];await dal.getOwnerLoyaltyBranches();allowed=['loyalty'];}
 slug='ordinary-brand';allowed=[];await assert.rejects(dal.getOwnerLoyaltyBranches());
 console.log('Loyalty branches rollout passed: existing/new brand navigation, exclusions, actual sidebar, owner service guards, pager removal and retained finance POS');
})().catch(e=>{console.error(e);process.exitCode=1});
