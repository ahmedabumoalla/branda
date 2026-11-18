const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript'),React=require('react');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',code)(name=>{if(name in mocks)return mocks[name];if(name==='server-only')return {};if(name.endsWith('.css'))return new Proxy({},{get:(_,key)=>String(key)});if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(base+(fs.existsSync(base+'.ts')?'.ts':'.tsx'),mocks);}return require(name);},exports);return exports;}
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];
(async()=>{
 const {featureCodesAllow}=load('lib/platform/feature-gates.ts');const {cafeHasFeature}=load('lib/platform/permissions.ts');
 for(const features of [[],['loyalty'],['menu'],['offers'],['settings'],['finance'],['finance','settings']]){
  const expected=!features.includes('finance')||features.includes('settings');assert.equal(featureCodesAllow(features,'settings'),expected);
  assert.equal(cafeHasFeature('settings',{planId:'plan',plans:[{id:'plan',active:true,features}]}),expected);
  if(features.includes('loyalty')){assert(!featureCodesAllow(features,'menu'));assert(!featureCodesAllow(features,'offers'));}
 }
 assert(cafeHasFeature('settings',{planId:'',plans:[]}));
 assert(cafeHasFeature('settings',{planId:'plan',plans:[{id:'plan',active:true,features:['loyalty','settings']}],overrides:[{featureId:'settings',enabled:false}]}));
 const hooks={...React,useEffect:()=>{},useId:()=> 'settings-test',useState:x=>[typeof x==='function'?x():x,()=>{}]};
 const mocks={react:hooks,'next/navigation':{usePathname:()=>'/dashboard/settings',useSearchParams:()=>new URLSearchParams(),useRouter:()=>({})},'./dashboard-navigation-link':{DashboardNavigationLink:'a'},'@/lib/cafe/use-resolved-cafe-logo':{useResolvedCafeLogoUrl:()=>null},'@/lib/performance/notifications-client':{retainOwnerNotificationBrand(){}},'@/lib/platform/auth':{logoutBarndaksaAuth:async()=>{}},'./finance-sidebar-menu':{FinanceSidebarMenu:()=>null}};
 for(const m of fs.readFileSync('components/dashboard/DashboardSidebar.tsx','utf8').matchAll(/from ["']([^"']+)["']/g)){if(m[1].startsWith('@/components/')&&!(m[1] in mocks))mocks[m[1]]=new Proxy({},{get:()=>()=>null});}
 const {DashboardSidebar}=load('components/dashboard/DashboardSidebar.tsx',mocks);
 for(const features of [[],['loyalty'],['menu','settings'],['finance'],['finance','settings']])for(const collapsed of [false,true]){
  const snapshot={planId:features.length?'plan':'',plans:[{id:'plan',features}],featureOverrides:[{featureId:'settings',enabled:false}],settings:{cafeSlug:'brand',cafeName:'Brand',businessCategory:'cafes_coffee'},notifications:[]};
  const tree=nodes(DashboardSidebar({snapshot,servicesAvailable:features.length>0,collapsed}));
  assert.equal(tree.filter(n=>n.props?.href==='/dashboard/settings').length,features.includes('finance')?0:1,'Exactly one account settings link; finance keeps separate screens');
  const staff=nodes(DashboardSidebar({snapshot:{...snapshot,staff:{menu:true}},servicesAvailable:true}));assert(!staff.some(n=>n.props?.href==='/dashboard/settings'),'No new owner settings grant to staff');
 }
 let features=['loyalty'],authError=false,saves=0,uploads=0;
 const guard=load('lib/data/owner-service-access.ts',{'@/lib/data/feature-entitlements':{getOwnerFeatureCodes:async()=>{if(authError)throw Error('Unauthorized');return features;}}});
 const actions=load('app/actions/settings.ts',{'@/lib/data/owner-service-access':guard,'@/lib/data/settings':{getOwnerCafeSettings:async()=>({cafeSlug:'brand'}),updateCafeSettings:async()=>{saves++;return {cafeSlug:'brand'};}},'next/cache':{revalidatePath(){}}});
 const upload=load('app/actions/upload.ts',{'@/lib/data/owner-service-access':guard,'@/lib/storage/upload-server':{uploadOptimizedImage:async bucket=>{uploads++;return {bucket};}}});
 const form=new FormData();form.set('file',new File(['test'],'logo.png',{type:'image/png'}));
 for(features of [[],['loyalty'],['menu']]){await actions.fetchOwnerSettingsAction();await actions.saveSettingsAction({cafeName:'Brand'});await upload.uploadImageAction('cafe-logos',form,'logo','identity');}
 assert.equal(saves,3);assert.equal(uploads,3);features=['loyalty'];await assert.rejects(upload.uploadImageAction('menu-products',form,'product','product'));await assert.rejects(upload.uploadImageAction('offer-banners',form,'offer-banner','offer'));
 features=['finance'];await assert.rejects(actions.saveSettingsAction({cafeName:'Brand'}));await assert.rejects(upload.uploadImageAction('cafe-logos',form,'logo','identity'));authError=true;await assert.rejects(actions.fetchOwnerSettingsAction());assert.equal(saves,3);assert.equal(uploads,3);
 console.log('Brand settings passed: all non-finance packages and no-package access, no duplicate sidebar link, collapsed navigation, staff exclusion, finance preservation, save/logo upload gating and unavailable services denied');
})().catch(e=>{console.error(e);process.exitCode=1});
