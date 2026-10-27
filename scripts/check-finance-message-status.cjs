const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}){const e={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name in mocks?mocks[name]:name==='server-only'?{}:name==='zod'?require(name):(()=>{throw Error(name)})(),e);return e;}
(async()=>{
 process.env.GREEN_API_API_URL='https://api.green-api.com';process.env.GREEN_API_ID_INSTANCE='test';process.env.GREEN_API_API_TOKEN_INSTANCE='private';
 const provider=load('lib/whatsapp/finance-message-status.ts'),phone='966500000010',id='provider-id';let calls=0;
 let response={type:'outgoing',idMessage:id,chatId:phone+'@c.us',statusMessage:'sent'};
 global.fetch=async(url,options)=>{calls++;assert(url.includes('/getMessage/'));assert(!url.includes('send'));assert.deepEqual(JSON.parse(options.body),{chatId:phone+'@c.us',idMessage:id});assert.equal(options.redirect,'error');return{ok:true,json:async()=>response};};
 for(const status of ['pending','sent','delivered','read','failed','yellowCard']){response.statusMessage=status;assert.equal(await provider.readFinanceProviderMessageStatus(phone,id),status);}
 for(const patch of [{type:'incoming'},{chatId:'wrong'},{idMessage:'wrong'},{statusMessage:'unknown'}]){const old=response;response={...old,...patch};assert.equal(await provider.readFinanceProviderMessageStatus(phone,id),null);response=old;}
 global.fetch=async()=>{throw Error('private error')};assert.equal(await provider.readFinanceProviderMessageStatus(phone,id),null);
 process.env.GREEN_API_API_URL='https://attacker.invalid';const before=calls;assert.equal(await provider.readFinanceProviderMessageStatus(phone,id),null);assert.equal(calls,before);
 const document='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';let authorized=true,claimed=0,reads=0,finished=0,active=0,maxActive=0;
 const cached=[{documentId:document,status:'delivered'}],background=[];
 const dal=load('lib/data/finance-message-status.ts',{'next/server':{after:fn=>background.push(fn)},'./brand-finance':{getBrandFinanceContext:async()=>({cafe:{id:document},client:{rpc:async()=>{reads++;return authorized?{data:cached}:{error:{code:'42501'}}}}})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{if(name.includes('claim')){claimed++;assert.deepEqual(args.p_document_ids,[document]);return{data:Array.from({length:8},(_,i)=>({id:`33333333-3333-4333-8333-33333333333${i}`,pollToken:document,phone,messageId:id}))};}finished++;return{};}})},'@/lib/whatsapp/finance-message-status':{readFinanceProviderMessageStatus:async()=>{active++;maxActive=Math.max(active,maxActive);await new Promise(r=>setTimeout(r,5));active--;return null;}}});
 assert.deepEqual(await dal.getFinanceInvoiceMessageStatuses({documentIds:[document,foreign,document]}),{statuses:cached});assert.equal(claimed,0,'saved statuses return before any provider request');await background[0]();assert.equal(finished,8);assert.equal(maxActive,4);assert.equal(reads,1);
 authorized=false;await assert.rejects(()=>dal.getFinanceInvoiceMessageStatuses({documentIds:[document]}));assert.equal(claimed,1,'no service elevation after denied user read');
 await assert.rejects(()=>dal.getFinanceInvoiceMessageStatuses({documentIds:Array(101).fill(document)}));
 console.log('Finance message status provider/DAL checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
