const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const output={},code=ts.transpileModule(fs.readFileSync('lib/whatsapp/green-api.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let calls=[],result={ok:true,json:async()=>({idMessage:'accepted'})};
new Function('require','exports','fetch',code)(n=>n==='server-only'?{}:require(n),output,async(url,options)=>{calls.push({url,options});if(result instanceof Error)throw result;return result;});
process.env.GREEN_API_API_URL='https://api.green-api.com';process.env.GREEN_API_ID_INSTANCE='test-instance';process.env.GREEN_API_API_TOKEN_INSTANCE='test-secret';delete process.env.GREEN_API_MEDIA_URL;
const input={phone:'966500000001',message:'Loyalty caption',invoiceNumber:19,pdf:new TextEncoder().encode('%PDF-1.7\nexample')};
(async()=>{
 assert.equal(output.isGreenApiFinanceReceiptConfigured(),false);
 await assert.rejects(()=>output.sendGreenApiFinanceReceipt(input),/MEDIA_CONFIGURATION_MISSING/);assert.equal(calls.length,0);
 process.env.GREEN_API_MEDIA_URL='https://7107.api.greenapi.com/';assert.equal(output.isGreenApiFinanceReceiptConfigured(),true);
 assert.deepEqual(await output.sendGreenApiFinanceReceipt(input),{status:'queued',providerMessageId:'accepted'});assert.equal(calls.length,1);
 const {url,options}=calls[0];assert(url.startsWith('https://7107.api.greenapi.com/'));assert(url.includes('/sendFileByUpload/'));assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert(!options.headers,'Fetch sets the multipart boundary');
 assert.equal(options.body.get('chatId'),'966500000001@c.us');assert.equal(options.body.get('caption'),input.message);assert.equal(options.body.get('fileName'),'invoice-19.pdf');assert.equal(options.body.get('file').type,'application/pdf');assert.equal(await options.body.get('file').text(),'%PDF-1.7\nexample');
 for(const change of [{phone:'bad'},{invoiceNumber:0},{invoiceNumber:1.5},{message:'x'.repeat(1025)},{pdf:new Uint8Array()},{pdf:new TextEncoder().encode('notpdf')},{pdf:new Uint8Array(9*1024*1024)}]){await assert.rejects(()=>output.sendGreenApiFinanceReceipt({...input,...change}));}assert.equal(calls.length,1,'Invalid inputs never send');
 for(const media of ['http://media.green-api.com','https://green-api.com.evil.test','https://user:pass@media.green-api.com','https://media.green-api.com:444','https://media.green-api.com/path','https://media.green-api.com?q=1','https://media.green-api.com#x']){process.env.GREEN_API_MEDIA_URL=media;assert.equal(output.isGreenApiFinanceReceiptConfigured(),false);await assert.rejects(()=>output.sendGreenApiFinanceReceipt(input));}assert.equal(calls.length,1);process.env.GREEN_API_MEDIA_URL='https://7107.api.greenapi.com/';
 for(const status of [400,401,413,429]){result={ok:false,status};assert.equal((await output.sendGreenApiFinanceReceipt(input)).status,'rejected');}
 for(const response of [{ok:false,status:500},{ok:true,json:async()=>({})},{ok:true,json:async()=>({idMessage:'x'.repeat(201)})},new Error('timeout')]){result=response;const before=calls.length;assert.equal((await output.sendGreenApiFinanceReceipt(input)).status,'unknown');assert.equal(calls.length,before+1,'Ambiguous send is never retried');}
 console.log('PASS receipt transport: one multipart PDF+caption message, validated recipient/PDF, trusted media host, accepted/rejected/unknown outcomes and no retries');
})().catch(e=>{console.error(e);process.exitCode=1;});
