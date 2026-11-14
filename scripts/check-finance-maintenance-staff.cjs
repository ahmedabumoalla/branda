const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}){const exports={};const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',compiled)(name=>{if(name in mocks)return mocks[name];if(name==='server-only')return{};if(name.startsWith('@/')){const p=name.slice(2);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'.tsx',mocks);}return require(name);},exports);return exports;}

(async()=>{
 let role='manager',maintenance=false,enabled=true,canAdminister=true,tenant='brand',creates=0,grants=0;
 const mocks={};for(const match of fs.readFileSync('lib/data/finance-access.ts','utf8').matchAll(/from "([^"]+)"/g)){if(match[1].startsWith('@/')||match[1]==='next/headers')mocks[match[1]]={};}
 Object.assign(mocks,{
 '@/lib/finance/permissions':{financeStaffRoles:['manager','accountant','warehouse','auditor','cashier']},
 '@/lib/data/finance-cashier-maintenance':{getFinanceCashierMaintenance:async id=>{assert.equal(id,'brand');return maintenance?{}:null;}},
 '@/lib/data/cafes':{requireOwnerCafeContext:async()=>({id:'brand',slug:'brand',role})},
 '@/lib/data/feature-entitlements':{getOwnerFeatureCodes:async()=>enabled?['finance']:[]},
 '@/lib/platform/feature-gates':{featureCodesAllow:codes=>codes.includes('finance')},
 '@/lib/data/brand-finance':{getBrandFinanceSnapshot:async()=>({cafe:{id:tenant},canAdminister})},
 '@/lib/supabase/server':{createClient:async()=>({rpc:async(name,args)=>{assert.equal(name,'brand_finance_execute');assert.equal(args.p_cafe_id,'brand');assert.equal(args.p_operation,'staff');assert.equal(args.p_payload.role,'manager');grants++;return{data:{id:'fixture'}};}})},
 '@/lib/supabase/admin':{createAdminClient:()=>({auth:{admin:{createUser:async()=>{creates++;return{data:{user:{id:'fixture'}}};},deleteUser:async()=>({})}}})}
 });
 const {provisionFinanceStaff}=load('lib/data/finance-access.ts',mocks),input={email:'staff@example.test',name:'Test Staff',password:'test-password-123',role:'manager'};
 await assert.rejects(provisionFinanceStaff(input));role='platform_admin';await assert.rejects(provisionFinanceStaff(input));assert.equal(creates,0);
 maintenance=true;assert((await provisionFinanceStaff(input)).ok);assert.equal(creates,1);assert.equal(grants,1);
 maintenance=false;await assert.rejects(provisionFinanceStaff(input));assert.equal(creates,1);
 role='owner';assert((await provisionFinanceStaff(input)).ok);assert.equal(creates,2);
 role='platform_admin';maintenance=true;canAdminister=false;await assert.rejects(provisionFinanceStaff(input));canAdminister=true;tenant='other';await assert.rejects(provisionFinanceStaff(input));tenant='brand';enabled=false;await assert.rejects(provisionFinanceStaff(input));assert.equal(creates,2);
 console.log('PASS 13 maintenance staff checks; mocks only, no identities or messages created');
})().catch(e=>{console.error(e);process.exitCode=1});
