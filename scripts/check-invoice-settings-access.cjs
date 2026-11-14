const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react');
function load(file,mocks={},expose=''){
 const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8')+expose,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','exports',code)(n=>{if(n in mocks)return mocks[n];if(n==='server-only'||n.endsWith('.css'))return{};if(n.startsWith('@/')||n.startsWith('./')){const base=n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n);return load(fs.existsSync(base+'.ts')?base+'.ts':base+'.tsx',mocks);}return require(n);},exports);return exports;
}
const model=load('lib/finance/invoice-settings.ts'),state={settings:structuredClone(model.defaultInvoiceSettings),revision:1,nextNumber:1};
let count=0;const check=(v,m)=>{assert.ok(v,m);count++;};
function nodes(t){if(!t||typeof t!=='object')return[];if(Array.isArray(t))return t.flatMap(nodes);return[t,...nodes(t.props?.children)];}
(async()=>{
 let role='manager',maintenance=false,writes=0,invalidations=0;
 const actions=load('app/actions/finance-invoice-settings.ts',{
  '@/lib/data/brand-finance':{getBrandFinanceContext:async()=>({cafe:{id:'cafe',role},client:{rpc:async(_name,args)=>{if(args.p_action==='save')writes++;return{data:state};}}})},
  '@/lib/data/finance-cashier-maintenance':{getFinanceCashierMaintenance:async()=>maintenance?{}:null},
  '@/lib/performance/finance-route-invalidation':{invalidateFinanceViews(){invalidations++;}},
 });
 check(!(await actions.getFinanceInvoiceSettings('brand')).data.canEdit,'Ordinary manager must remain read-only');
 check(!(await actions.saveFinanceInvoiceSettings('brand',state.settings,1)).ok&&writes===0,'Deny before write');
 maintenance=true;check((await actions.getFinanceInvoiceSettings('brand')).data.canEdit,'Signed active maintenance can edit');
 check((await actions.saveFinanceInvoiceSettings('brand',state.settings,1)).ok&&writes===1&&invalidations===1,'Maintenance save and invalidation');
 maintenance=false;check(!(await actions.saveFinanceInvoiceSettings('brand',state.settings,1)).ok&&writes===1,'Revalidate permission on every save');
 role='owner';check((await actions.saveFinanceInvoiceSettings('brand',state.settings,1)).ok,'Owner retains access');
 role='auditor';check(!(await actions.getFinanceInvoiceSettings('brand')).data.canEdit,'Auditor read-only');
 const {invoiceSettingsCache}=load('lib/finance/invoice-settings-cache.ts');const snapshot={products:[]},cache=invoiceSettingsCache(snapshot);let reads=0;
 const read=()=>cache.load('brand',300000,async()=>{reads++;return state;});await Promise.all([read(),read()]);await read();check(reads===1,'Deduplicate reads and reuse revisits');
 check(invoiceSettingsCache({products:[]}).read('brand')===null,'New authentication/snapshot isolates cache');
 cache.clear();await read();check(reads===2,'Explicit refresh reloads');
 let release;const old=cache.load('other',300000,()=>new Promise(r=>release=r));await Promise.resolve();cache.write('other',{revision:4},300000);release({revision:1});await old;check(cache.read('other').revision===4,'Late response cannot replace saved data');
 let slots=[],cursor=0,saved;
 const hooks={...React,useState(v){const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(v){const i=cursor++;return slots[i]??=( {current:v} );},useEffect(){}};
 const {InvoiceSettingsForm}=load('components/finance/finance-invoice-settings.tsx',{
  react:hooks,'./finance-invoice-settings-management':{FinanceInvoiceSettingsManagement:()=>null},
  '@/app/actions/finance-invoice-settings':{saveFinanceInvoiceSettings:async(_slug,s,rev)=>{saved={settings:s,revision:rev+1,nextNumber:1};model.invoiceSettingsStateSchema.parse(saved);return{ok:true,data:saved};}},
 },'\nexport { InvoiceSettingsForm };');
 const props={slug:'brand',snapshot,settings:{tax_inclusive:true},canEdit:true,disabled:false,onBack(){},initial:state,onReload(){}};
 const render=()=>{cursor=0;return InvoiceSettingsForm(props);};
 let tree=render();const toggles=nodes(tree).filter(n=>n.type?.name==='Toggle');
 for(const toggle of toggles){const current=nodes(render()).find(n=>n.props?.id===toggle.props.id);check(!current.props.disabled,'Editable '+toggle.props.id);current.props.onChange(!current.props.checked);}
 const select=nodes(render()).find(n=>n.type==='select'&&n.props.id==='invoice-billing-method');check(!!select&&!select.props.disabled,'Billing method enabled');select.props.onChange({target:{value:'both'}});
 tree=render();check(!tree.props['aria-busy'],'Form responsive');await tree.props.onSubmit({preventDefault(){}});
 check(saved.settings.advanced.numbering.manual===true,'Manual number saved');check(saved.settings.allowLineEditing===false,'Free editing disabled');check(saved.settings.advanced.billingMethod==='both','Billing method saved');
 props.canEdit=false;check(nodes(render()).filter(n=>n.type?.name==='Toggle').every(n=>n.props.disabled),'Read-only controls blocked');
 console.log(JSON.stringify({at:new Date().toISOString(),checks:count,status:'PASS'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
