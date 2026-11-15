const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),crypto=require('node:crypto');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>name in mocks?mocks[name]:require(name),exports);return exports;}
const model=load('lib/erp/inventory.ts'),branches=load('lib/erp/branches.ts');
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const valid=()=>({catalogs:[{id:id(1),kind:'unit_template',active:true,payload:{units:[{name:'Piece',factor:1},{name:'Box',factor:12},{name:'Carton',factor:120},{name:'Pallet',factor:6000}]}}],units:[{id:id(2),name:'Piece'},{id:id(3),name:'Box'}]});
const item=()=>({requestId:id(8),action:'item',id:'',revision:0,branchScope:{branchId:id(9),revision:4},payload:{name:'Item',unitId:id(2),unitTemplateId:id(1),payload:{buyUnitName:'Carton',saleUnitName:'Box'}}});
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
function harness(options={}){
 const reads=[],writes=[],paths=[],authorization=[];
 const client={rpc:async(name,args)=>{reads.push({name,args});return{data:options.snapshot===undefined?valid():options.snapshot,error:options.readError??null};}};
 const action=load('app/actions/erp-inventory.ts',{'@/lib/data/erp-branches':{branchRpc:async(...args)=>{writes.push(args);return{data:{id:id(7)},error:options.writeError??null};}},'@/lib/erp/branches':branches,'@/lib/data/erp-inventory':{inventoryContext:async(...args)=>{authorization.push(args);if(options.denied)throw new Error('Denied');return{client,cafe:{id:'tenant-a',slug:'brand-a'}};}},'@/lib/erp/inventory':model,'@/lib/data/erp-assets':{assetError:error=>{if(error)throw new Error(error.message||error.code);}},'next/cache':{revalidatePath:(...args)=>paths.push(args)}}).executeInventory;
 return{action,reads,writes,paths,authorization,client};
}
async function rejected(label,change,options={}){const command=item();change?.(command);const h=harness(options),result=await h.action(command,'brand-a');eq(result.ok,false,label);eq(h.writes.length,0,label+' stops write');eq(h.paths.length,0,label+' does not invalidate');}
(async()=>{
 const h=harness(),command=item(),result=await h.action(command,'brand-a');
 eq(result.ok,true,'matching hierarchical template accepted');
 eq(h.authorization,[[true,'brand-a']],'write authorization requested first');
 eq(h.reads,[{name:'erp_inventory_read',args:{p_cafe:'tenant-a',p_query:{id:null}}}],'template read uses authorized tenant');
 eq(h.writes[0][0],h.client,'original authorized client retained');
 eq(h.writes[0][1],'tenant-a','write keeps tenant');
 eq(h.writes[0][2],'erp_inventory_write','original write RPC retained');
 eq(h.writes[0][4],command,'original input and branch revision retained for final branch guard');
 eq(h.writes[0][3].p_command.payload,command.payload,'prices and selected units remain unchanged');
 eq(h.paths,[['/dashboard/system/inventory','layout'],['/finance/brand-a/system/inventory','layout']],'both layout invalidations retained');
 await rejected('base unit mismatch',c=>{c.payload.unitId=id(3);});
 await rejected('missing base unit',c=>{c.payload.unitId='';});
 await rejected('unknown template',c=>{c.payload.unitTemplateId=id(4);});
 const inactive=valid();inactive.catalogs[0].active=false;await rejected('inactive template',null,{snapshot:inactive});
 const wrongKind=valid();wrongKind.catalogs[0].kind='category';await rejected('wrong catalog kind',null,{snapshot:wrongKind});
 const multiple=valid();multiple.catalogs[0].payload.units[1].factor=1;await rejected('multiple base units',null,{snapshot:multiple});
 const none=valid();none.catalogs[0].payload.units[0].factor=2;await rejected('no base unit',null,{snapshot:none});
 await rejected('purchase unit outside template',c=>{c.payload.payload.buyUnitName='Crate';});
 await rejected('sales unit outside template',c=>{c.payload.payload.saleUnitName='Crate';});
 await rejected('missing authorized snapshot',null,{snapshot:null});
 await rejected('snapshot read error',null,{readError:{code:'42501'}});
 const denied=harness({denied:true});eq((await denied.action(item(),'brand-a')).ok,false,'authorization failure returned');eq(denied.reads.length+denied.writes.length,0,'no data calls before authorization');
 const optional=harness(),blank=item();blank.payload.payload={buyUnitName:'',saleUnitName:''};eq((await optional.action(blank,'brand-a')).ok,true,'blank optional purchase and sales units accepted');
 const without=harness(),noTemplate=item();noTemplate.payload.unitTemplateId='';eq((await without.action(noTemplate,'brand-a')).ok,true,'items without template unchanged');eq(without.reads.length,0,'items without template avoid extra read');
 const catalog=harness();eq((await catalog.action({requestId:id(8),action:'catalog',payload:{kind:'unit_template',name:'Units',unitTemplateId:id(1)}},'brand-a')).ok,true,'catalog writes remain delegated');eq(catalog.reads.length,0,'non-item writes avoid new read');
 const stale=harness({writeError:{code:'40001'}});eq((await stale.action(item(),'brand-a')).ok,false,'final stale branch check still fails closed');eq(stale.paths.length,0,'stale branch response does not invalidate');
 const report={at:new Date().toISOString(),runtime:process.version,checks,status:'passed',limits:'Actual action and schemas with isolated authorized-client/RPC responses; no database calls or writes',inputs:Object.fromEntries(['app/actions/erp-inventory.ts','lib/erp/inventory.ts','lib/erp/branches.ts','scripts/check-inventory-unit-template-action.cjs','package-lock.json'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
 fs.mkdirSync('output/inventory-unit-templates-20261115',{recursive:true});fs.writeFileSync('output/inventory-unit-templates-20261115/server-action-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
