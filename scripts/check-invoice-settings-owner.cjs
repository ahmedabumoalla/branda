const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',code)(n=>{if(n in mocks)return mocks[n];if(n==='server-only'||n.endsWith('.css'))return{};if(n.startsWith('@/')||n.startsWith('./')){const p=n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'.tsx',mocks);}return require(n);},exports);return exports;}
function nodes(t){if(!t||typeof t!=='object')return[];if(Array.isArray(t))return t.flatMap(nodes);return[t,...nodes(t.props?.children)];}
(async()=>{
 const actor='00000000-0000-4000-8000-000000000001',ownerId='00000000-0000-4000-8000-000000000002';let ownerReads=0,fail=false;
 const snapshot={userId:actor,role:'owner',canAdminister:true,products:[],items:[],parties:[],accounts:[],staff:[]};
 const mocks={react:{cache:f=>f}};for(const m of fs.readFileSync('lib/data/brand-finance.ts','utf8').matchAll(/from "([^\"]+)"/g)){if(m[1].startsWith('@/')||m[1].startsWith('./')||m[1]==='next/server')mocks[m[1]]={};}
 Object.assign(mocks,{'@/lib/data/finance-cashier-maintenance':{getFinanceCashierMaintenance:async()=>null},'./finance-shifts':{getFinanceMaintenanceActor:async()=>null},'@/lib/finance/product-media-server':{financeProductMedia:async(_c,p)=>p}});
 const client={rpc:async()=>({data:structuredClone(snapshot)}),from:table=>{assert.equal(table,'cafes');return{select:column=>{assert.equal(column,'owner_user_id');return{eq:(column,id)=>{assert.equal(column,'id');assert.equal(id,'brand');return{single:async()=>{ownerReads++;return fail?{error:{}}:{data:{owner_user_id:ownerId}};}};}};}};}};
 const {readBrandFinanceSnapshot}=load('lib/data/brand-finance.ts',mocks);
 const maintenance=await readBrandFinanceSnapshot({client,cafe:{id:'brand',maintenance:true}});assert.equal(maintenance.ownerUserId,ownerId);assert.equal(maintenance.userId,actor);assert.equal(maintenance.role,'owner');assert.equal(ownerReads,1);
 const owner=await readBrandFinanceSnapshot({client,cafe:{id:'brand'}});assert.equal(owner.ownerUserId,actor);assert.equal(ownerReads,1,'Actual owner needs no extra query');
 fail=true;await assert.rejects(readBrandFinanceSnapshot({client,cafe:{id:'brand',maintenance:true}}));fail=false;
 const {defaultAdvancedInvoiceSettings}=load('lib/finance/invoice-settings.ts');
 const {FinanceInvoiceSettingsManagement}=load('components/finance/finance-invoice-settings-management.tsx');let changed;
 const props={mode:'discountCaps',title:'limits',value:structuredClone(defaultAdvancedInvoiceSettings),snapshot:maintenance,disabled:false,onChange:v=>changed=v};
 let tree=FinanceInvoiceSettingsManagement(props);const add=nodes(tree).find(n=>n.type==='button'&&n.props.className===undefined&&!n.props['aria-label']);assert.ok(add&&!add.props.disabled);add.props.onClick();assert.equal(changed.discountCaps[0].userId,ownerId);
 tree=FinanceInvoiceSettingsManagement({...props,value:changed});const options=nodes(tree).filter(n=>n.type==='option');assert(options.some(n=>n.props.value===ownerId));assert(!options.some(n=>n.props.value===actor),'Maintenance administrator must never be mislabeled as the owner');
 const actions=load('app/actions/finance-invoice-settings.ts',{'@/lib/data/brand-finance':{getBrandFinanceContext:async()=>({cafe:{id:'brand',role:'owner'},client:{rpc:async()=>({error:{code:'22023',message:'Invalid user discount cap'}})}})},'@/lib/data/finance-cashier-maintenance':{},'@/lib/performance/finance-route-invalidation':{invalidateFinanceViews(){throw Error('Failed writes cannot invalidate');}}});
 const {defaultInvoiceSettings}=load('lib/finance/invoice-settings.ts');const result=await actions.saveFinanceInvoiceSettings('brand',defaultInvoiceSettings,1);assert.equal(result.ok,false);assert(result.message.includes('حدود الخصم'));assert(!result.message.includes('Invalid user'));
 console.log('PASS owner identity, maintenance identity preservation, exact tenant read, no extra owner read, failure guard, dropdown/add binding and actionable save error');
})().catch(e=>{console.error(e);process.exitCode=1});
