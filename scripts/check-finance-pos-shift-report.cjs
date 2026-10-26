const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
async function main(){
 const id='00000000-0000-4000-8000-000000000001',calls=[];
 let error=null,denied=false,data={shift:{id,status:'closed'},invoiceCount:501};
 const source=fs.readFileSync('lib/data/finance-pos-shift-report.ts','utf8');
 assert(!source.includes('createAdminClient'));
 const exports={};new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='server-only'?{}:name==='./brand-finance'?{getBrandFinanceContext:async slug=>{if(denied)throw Error('session');return{cafe:{id:'authorized-cafe'},client:{rpc:async(name,args)=>{calls.push({name,args,slug});return{data,error}}}}}}:require(name),exports);
 const get=exports.getPosShiftReport;
 assert.equal((await get(id,'requested-slug')).invoiceCount,501);
 assert.deepEqual(calls[0],{name:'brand_finance_pos_shift_report',args:{p_cafe_id:'authorized-cafe',p_shift_id:id},slug:'requested-slug'});
 await assert.rejects(get('invalid'));assert.equal(calls.length,1);
 denied=true;await assert.rejects(get(id));assert.equal(calls.length,1);denied=false;
 error={code:'42501'};await assert.rejects(get(id),/غير متاح لهذا الحساب/);
 error={code:'PGRST202'};await assert.rejects(get(id),/حاول مرة أخرى/);error=null;
 data=null;await assert.rejects(get(id));data={shift:{id:'another',status:'closed'}};await assert.rejects(get(id));
 data={shift:{id,status:'open'}};await assert.rejects(get(id));
 console.log('PASS POS report reader: UUID, authorized tenant RPC, session, access versus service errors, missing/wrong/open shift rejection');
}
main().catch(e=>{console.error(e);process.exitCode=1});
