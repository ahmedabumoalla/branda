const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:id=>id==='server-only'?{}:require(id)});return module.exports;}
async function main(){let checks=0;const eq=(a,b)=>{assert.equal(a,b);checks++;};const{erpHref}=load('lib/erp/navigation.ts');
 eq(erpHref('/dashboard/system/payroll/payslips?id=1','brand-a'),'/finance/brand-a/system/payroll/payslips?id=1');
 eq(erpHref('/dashboard/system','brand-a'),'/finance/brand-a/system');
 eq(erpHref('/dashboard/systematic','brand-a'),'/dashboard/systematic');
 eq(erpHref('/dashboard/menu','brand-a'),'/dashboard/menu');
 eq(erpHref('/dashboard/finance?section=reports','brand-a'),'/finance/brand-a?section=reports');
 eq(erpHref('/dashboard/system/tasks'),'/dashboard/system/tasks');
 eq(erpHref('https://outside.test/dashboard/system','brand-a'),'https://outside.test/dashboard/system');
 eq(erpHref('/dashboard/system','../other'),'/dashboard/system');
 const {erpRequestSlug,withErpRequest}=load('lib/erp/request-context.ts');eq(erpRequestSlug(),undefined);
 const gate={};gate.promise=new Promise(resolve=>gate.resolve=resolve);
 const a=withErpRequest('brand-a',async()=>{await gate.promise;eq(erpRequestSlug(),'brand-a');await withErpRequest('nested',async()=>eq(erpRequestSlug(),'nested'));eq(erpRequestSlug(),'brand-a');});
 const b=withErpRequest('brand-b',async()=>{eq(erpRequestSlug(),'brand-b');gate.resolve();await Promise.resolve();eq(erpRequestSlug(),'brand-b');});await Promise.all([a,b]);eq(erpRequestSlug(),undefined);
 await assert.rejects(()=>withErpRequest('failed',async()=>{throw new Error('fail');}));checks++;eq(erpRequestSlug(),undefined);
 const owner=fs.readFileSync('app/dashboard/layout.tsx','utf8');eq(owner.includes('if (!await getOwnerCafeContext()) redirect("/login")'),true);
 const route=fs.readFileSync('app/finance/[slug]/system/[[...parts]]/page.tsx','utf8');eq(route.includes('if(module&&!domain)notFound()'),true);eq(route.includes('await withErpRequest(slug,async()=>'),true);
 console.log(JSON.stringify({passed:true,checks}));}
main().catch(e=>{console.error(e);process.exitCode=1;});
