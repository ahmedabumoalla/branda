const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{if(name in mocks)return mocks[name];if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(base+'.ts',mocks);}return require(name);},exports);return exports;}
(async()=>{
 let role='owner',slug='mind-hospital',saved=false,calls=0,invalidated=0;
 const actions=load('app/actions/finance-pos-settings.ts',{'@/lib/data/brand-finance':{getBrandFinanceContext:async()=>({cafe:{id:'mind',slug,role},client:{rpc:async(name,args)=>{calls++;assert.equal(args.p_cafe,'mind');if(name.endsWith('_save'))saved=args.p_enabled;return{data:{whatsappInvoiceEnabled:saved}};}}})},'@/lib/performance/finance-route-invalidation':{invalidateFinanceViews(){invalidated++;}}});
 assert.equal((await actions.readFinancePosSettings(slug)).data.whatsappInvoiceEnabled,false);
 assert.equal((await actions.saveFinancePosSettings(slug,{whatsappInvoiceEnabled:true})).data.whatsappInvoiceEnabled,true);assert.equal(invalidated,1);
 assert.equal((await actions.saveFinancePosSettings(slug,{whatsappInvoiceEnabled:false})).data.whatsappInvoiceEnabled,false);
 let before=calls;assert.equal((await actions.saveFinancePosSettings(slug,{whatsappInvoiceEnabled:'true'})).ok,false);assert.equal(calls,before);
 for(role of ['manager','cashier','accountant']){before=calls;assert.equal((await actions.readFinancePosSettings(slug)).ok,false);assert.equal((await actions.saveFinancePosSettings(slug,{whatsappInvoiceEnabled:true})).ok,false);assert.equal(calls,before);}
 role='owner';slug='unrelated';before=calls;assert.equal((await actions.saveFinancePosSettings(slug,{whatsappInvoiceEnabled:true})).ok,false);assert.equal(calls,before);
 const nav=load('components/finance/finance-navigation.ts');assert.equal(nav.financeSectionAllowed('pos-settings','owner'),true);assert.equal(nav.financeSectionAllowed('pos-settings','cashier'),false);assert.equal(nav.resolveFinanceSection('pos-settings',false),'overview');
 const menu=load('components/dashboard/integrated-system-navigation.ts');assert(menu.integratedSystemGroupsForBrand('mind-hospital').find(g=>g.id==='pos').items.some(i=>i.section==='pos-settings'));assert(!menu.integratedSystemGroupsForBrand('unrelated').flatMap(g=>g.items).some(i=>i.section==='pos-settings'));
 console.log('PASS POS settings: owner-only read/save, boolean validation, disabled/enabled persistence, tenant isolation and scoped navigation');
})().catch(error=>{console.error(error);process.exitCode=1;});
