const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{if(name in mocks)return mocks[name];if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name);return load(base+'.ts',mocks);}return require(name);},exports);return exports;}
(async()=>{
 let role='owner',financeRole='owner',features=['finance','loyalty'],financeId='own-cafe',calls=0,invalidated=0,failure=false,maintenance=false,contextFailure=false;
 let saved={creditEarnsStamp:true,minimumInvoiceAmount:0};
 const actions=load('app/actions/finance-loyalty-settings.ts',{
  '@/lib/data/cafes':{requireOwnerCafeContext:async()=>({id:'own-cafe',slug:'own-brand',role})},
  '@/lib/data/feature-entitlements':{getCafeFeatureCodes:async id=>{assert.equal(id,'own-cafe');return features;}},
  '@/lib/data/brand-finance':{getBrandFinanceContext:async slug=>{assert.equal(slug,'own-brand');if(contextFailure)throw Error('Maintenance session rejected');return {cafe:{id:financeId,role:financeRole,maintenance},client:{rpc:async(name,args)=>{calls++;assert.equal(args.p_cafe,'own-cafe');if(failure)return {error:{message:'private DB message'}};if(name==='finance_loyalty_settings_save')saved={creditEarnsStamp:args.p_credit_earns_stamp,minimumInvoiceAmount:args.p_minimum_invoice_amount};else assert.equal(name,'finance_loyalty_settings_read');return {data:saved};}}};}},
  'next/cache':{revalidatePath(route){assert.equal(route,'/dashboard/loyalty/settings');invalidated++;}}
 });
 assert.deepEqual((await actions.readFinanceLoyaltySettings()).data,{creditEarnsStamp:true,minimumInvoiceAmount:0});
 assert.deepEqual((await actions.saveFinanceLoyaltySettings({creditEarnsStamp:false,minimumInvoiceAmount:25.75})).data,{creditEarnsStamp:false,minimumInvoiceAmount:25.75});assert.equal(invalidated,1);
 for(const minimumInvoiceAmount of [-1,NaN,Infinity,0.001,100000001,'10','']){const before=calls;assert.equal((await actions.saveFinanceLoyaltySettings({creditEarnsStamp:true,minimumInvoiceAmount})).ok,false);assert.equal(calls,before);}
 let before=calls;assert.equal((await actions.saveFinanceLoyaltySettings({creditEarnsStamp:'true',minimumInvoiceAmount:0})).ok,false);assert.equal(calls,before);
 assert.equal((await actions.saveFinanceLoyaltySettings({creditEarnsStamp:true,minimumInvoiceAmount:0,cafeId:'other'})).ok,false);assert.equal(calls,before);
 for(role of ['manager','cashier','accountant']){before=calls;assert.equal((await actions.readFinanceLoyaltySettings()).ok,false);assert.equal((await actions.saveFinanceLoyaltySettings({creditEarnsStamp:true,minimumInvoiceAmount:0})).ok,false);assert.equal(calls,before);}
 role='owner';for(features of [['finance'],['loyalty'],[]]){before=calls;assert.equal((await actions.readFinanceLoyaltySettings()).ok,false);assert.equal(calls,before);}
 features=['finance','loyalty'];financeId='other-cafe';before=calls;assert.equal((await actions.readFinanceLoyaltySettings()).ok,false);assert.equal(calls,before);
 financeId='own-cafe';financeRole='cashier';assert.equal((await actions.readFinanceLoyaltySettings()).ok,false);assert.equal(calls,before);
 financeRole='owner';failure=true;const failed=await actions.saveFinanceLoyaltySettings({creditEarnsStamp:true,minimumInvoiceAmount:0});assert.equal(failed.ok,false);assert(!failed.message.includes('private'));assert.equal(invalidated,1);
 failure=false;role='platform_admin';
 const denyBoth=async()=>{const before=calls;assert.equal((await actions.readFinanceLoyaltySettings()).ok,false);assert.equal((await actions.saveFinanceLoyaltySettings({creditEarnsStamp:true,minimumInvoiceAmount:0})).ok,false);assert.equal(calls,before);};
 for(maintenance of [false,undefined])await denyBoth();
 maintenance=true;assert.deepEqual((await actions.readFinanceLoyaltySettings()).data,saved);
 assert.deepEqual((await actions.saveFinanceLoyaltySettings({creditEarnsStamp:true,minimumInvoiceAmount:12.5})).data,{creditEarnsStamp:true,minimumInvoiceAmount:12.5});assert.equal(invalidated,2);
 financeId='other-cafe';await denyBoth();financeId='own-cafe';
 financeRole='cashier';await denyBoth();financeRole='owner';
 contextFailure=true;await denyBoth();contextFailure=false;
 for(features of [['finance'],['loyalty'],[]])await denyBoth();features=['finance','loyalty'];
 const nav=load('components/dashboard/integrated-system-navigation.ts');
 for(const route of ['/dashboard/loyalty','/dashboard/loyalty/customers','/dashboard/loyalty/messages','/dashboard/loyalty/settings','/dashboard/cashier','/dashboard/read-operations']){assert.equal(nav.isIntegratedLoyaltyRoute(route,true),true);assert.equal(nav.isIntegratedLoyaltyRoute(route,false),false);}
 for(const route of ['/dashboard/loyalty-other','/dashboard/menu','/dashboard/cashier-other'])assert.equal(nav.isIntegratedLoyaltyRoute(route,true),false);
 for(const cafeSlug of ['mind-hospital','unrelated']){
  const group=nav.integratedSystemGroupsForBrand(cafeSlug).find(group=>group.id==='loyalty');assert.equal(group.label,'الولاء');
  assert.deepEqual(group.items.map(item=>item.href),['/dashboard/loyalty','/dashboard/cashier','/dashboard/loyalty/customers','/dashboard/read-operations','/dashboard/loyalty/messages','/dashboard/loyalty/settings']);
  for(const item of group.items){const ctx={cafeSlug,enabledFeatures:['finance'],isSalon:false,isGifts:false};assert.equal(nav.systemItemHref(item,ctx),null);assert.equal(nav.systemItemHref(item,{...ctx,enabledFeatures:['finance','loyalty','cashier']}),item.href);}
 }
 console.log('PASS loyalty settings: defaults, persistence, numeric validation, owner/tenant/entitlement isolation, safe failures and six gated navigation destinations');
})().catch(error=>{console.error(error);process.exitCode=1;});
