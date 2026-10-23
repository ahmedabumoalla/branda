const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),path=require('node:path');
function load(file,mocks={}){const exports={};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',js)(name=>{if(name in mocks)return mocks[name];if(name==='server-only')return{};if(name.endsWith('.css'))return{};if(name.startsWith('@/')||name.startsWith('./')){const p=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'.tsx',mocks);}return require(name);},exports);return exports;}
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];}
const redirect=url=>{throw Error('REDIRECT '+url);};
async function main(){
 let identity='cashier',tables=[],rpcCalls=0;
 const client={auth:{getUser:async()=>({data:{user:identity==='anonymous'?null:{id:identity}}})},rpc:async()=>{rpcCalls++;return{data:null,error:{code:'42501'}};},from:table=>{tables.push(table);return{select(){return this;},eq(){return this;},is(){return this;},limit(){return this;},order(){return this;},maybeSingle:async()=>({data:table==='profiles'?{role:identity==='admin'?'platform_admin':'customer'}:table==='cafes'&&['owner','admin'].includes(identity)?{id:'brand',slug:'brand-test',name:'Brand'}:null})};}};
 const mocks={react:{...React,cache:fn=>fn},'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:()=>{throw Error('No admin bypass');}},'@/lib/platform/maintenance':{readMaintenanceSessionCookie:async()=>null,getCurrentMaintenanceSession:async()=>null}};
 const cafes=load('lib/data/cafes.ts',mocks);
 for(const who of ['cashier','finance-manager','anonymous']){identity=who;assert.equal(await cafes.getOwnerCafeContext(),null);await assert.rejects(cafes.requireOwnerCafeContext(),/Unauthorized/);}
 assert(!tables.includes('bf_staff'),'Financial membership must not become dashboard authority');
 let analytics=0;
 const layout=load('app/dashboard/layout.tsx',{...mocks,'@/lib/data/cafes':cafes,'next/navigation':{redirect},'next/font/google':{IBM_Plex_Sans_Arabic:()=>({className:'font'})},'next/server':{after:()=>analytics++},'@/lib/data/operation-events':{},'@/components/dashboard/dashboard-app-layout':{DashboardAppLayout:()=>null}}).default;
 for(const who of ['cashier','finance-manager','anonymous']){identity=who;await assert.rejects(layout({children:'private'}),/REDIRECT \/login/);}assert.equal(analytics,0);
 for(const who of ['owner','admin']){identity=who;assert(await layout({children:'authorized'}));}assert.equal(analytics,2);
 identity='cashier';
 const finance=load('lib/data/brand-finance.ts',{...mocks,'@/lib/data/cafes':cafes,'@/lib/menu/standalone-menu':{isOwnedMenuAsset:()=>true}});
 await assert.rejects(finance.getBrandFinanceSnapshot(),/Unauthorized/);assert.equal(rpcCalls,0);
 await assert.rejects(finance.getBrandFinanceSnapshot('other-brand'));assert.equal(rpcCalls,1,'Explicit slug must still pass authenticated RPC authorization');
 let features=['finance'];
 const legacy=load('app/dashboard/finance/pos/page.tsx',{'@/lib/data/cafes':cafes,'next/navigation':{redirect},'@/lib/data/feature-entitlements':{getOwnerFeatureCodes:async()=>features},'@/components/dashboard/feature-blocked-state':{DashboardFeatureBlockedState:()=>null}}).default;
 identity='owner';await assert.rejects(legacy(),/REDIRECT \/finance\/brand-test\/pos/);features=[];assert(await legacy());
 let user=null,canManage=false,allowed=true;
 const standaloneMocks={'next/navigation':{redirect,notFound:()=>{throw Error('404');}},'@/lib/data/auth':{getSessionUser:async()=>user},'@/lib/data/brand-finance':{getBrandFinanceSnapshot:async()=>{if(!allowed)throw Error('Denied');return{canManage};}},'@/components/finance/finance-pos':{FinancePOS:function POS(){}},'@/components/finance/finance-workspace':{FinanceWorkspace:function Workspace(){}},'@/components/finance/finance-access-denied':{FinanceAccessDenied:function Denied(){}}};
 // Use the actual route's session module, without performing real authentication.
 const posSource=fs.readFileSync('app/finance/[slug]/pos/page.tsx','utf8');const authModule=posSource.match(/import\s*\{\s*getSessionUser\s*\}\s*from\s*"([^"]+)"/)[1];standaloneMocks[authModule]={getSessionUser:async()=>user};
 const pos=load('app/finance/[slug]/pos/page.tsx',standaloneMocks).default;
 const params={params:Promise.resolve({slug:'brand-test'})};await assert.rejects(pos(params),/REDIRECT \/finance\/brand-test\/login/);user={id:'cashier'};assert.equal((await pos(params)).type.name,'POS');allowed=false;assert.equal((await pos(params)).type.name,'Denied');allowed=true;
 const workspace=load('app/finance/[slug]/page.tsx',standaloneMocks).default;await assert.rejects(workspace(params),/REDIRECT \/finance\/brand-test\/pos/);canManage=true;assert.equal((await workspace(params)).type.name,'Workspace');
 let states=[],cursor=0,pathname='/dashboard/finance',search='section=sales',expandedSidebar=0,navigated=0,history=[];
 const menu=load('components/dashboard/finance-sidebar-menu.tsx',{react:{...React,useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];}},'next/navigation':{usePathname:()=>pathname,useSearchParams:()=>new URLSearchParams(search)},'next/link':{__esModule:true,default:function Link(){}}}).FinanceSidebarMenu;
 let collapsed=false;const render=()=>{cursor=0;return menu({slug:'brand-test',collapsed,onExpand:()=>expandedSidebar++,onNavigate:()=>navigated++});};
 let tree=render();let button=nodes(tree).find(n=>n.type==='button');assert.equal(button.props['aria-expanded'],true);assert.equal(nodes(tree).filter(n=>n.props['aria-current']==='page').length,1);
 button.props.onClick();tree=render();assert.equal(nodes(tree).find(n=>n.props.id==='dashboard-finance-sections').props.hidden,true);
 collapsed=true;tree=render();nodes(tree).find(n=>n.type==='button').props.onClick();assert.equal(expandedSidebar,1);collapsed=false;tree=render();assert.equal(nodes(tree).find(n=>n.props.id==='dashboard-finance-sections').props.hidden,false);
 global.window={history:{pushState:(_s,_t,url)=>history.push(url)}};let prevented=0;
 const sales=nodes(tree).find(n=>n.props.href==='/dashboard/finance?section=sales');assert.equal(sales.props.prefetch,false);sales.props.onClick({button:0,preventDefault:()=>prevented++});assert.equal(prevented,1);assert.deepEqual(history,['/dashboard/finance?section=sales']);
 sales.props.onClick({button:0,ctrlKey:true,preventDefault:()=>prevented++});assert.equal(prevented,1);assert(nodes(tree).some(n=>n.props.href==='/finance/brand-test/pos'));assert(!nodes(tree).some(n=>n.props.href==='/dashboard/finance/pos'));
 search='section=reports';tree=render();assert.equal(nodes(tree).find(n=>n.props['aria-current']==='page').props.href,'/dashboard/finance?section=reports');
 delete global.window;
 const {resolveFinanceSection}=load('components/finance/finance-navigation.ts');assert.equal(resolveFinanceSection('settings',false),'overview');assert.equal(resolveFinanceSection('garbage',true),'overview');
 console.log('PASS finance separation: cashier/finance-manager/anonymous dashboard denial; owner/admin retained; direct DAL authorization; old POS redirect; independent login/POS/management gates; disclosure/collapsed/mobile hooks; native-history/current section; canonical POS links');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
