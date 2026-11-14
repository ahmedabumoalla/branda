const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const cache=new Map();
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(n=>{if(n in mocks)return mocks[n];if(n==='server-only')return{};if(n.startsWith('@/')||n.startsWith('./')){const f=(n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n))+'.ts';if(!cache.has(f))cache.set(f,load(f,mocks));return cache.get(f);}return require(n);},exports);return exports;}
let count=0;const check=(v,m)=>{assert.ok(v,m);count++;};
(async()=>{
 const {invoiceFromRows,importedInvoiceDraft}=load('lib/finance/invoice-import.ts');
 const invoice=invoiceFromRows([['اسم الصنف','الكمية','سعر الوحدة','نسبة الضريبة','خصم البند'],['قميص','٢','١٠٠٫٥','١٥','١٠']]);
 check(invoice.lines[0].quantity===2&&invoice.lines[0].price===100.5&&invoice.lines[0].discount===10,'Arabic numeric source preserved');
 const draft=importedInvoiceDraft(invoice);check(draft.invoice.paymentKind==='credit'&&!draft.deposit.paid&&draft.deliveryMethod==='print','import cannot create payment or send');check(draft.invoice.partyId===''&&draft.invoice.lines[0].productId==='','no guessed customer or stock identity');
 for(const rows of [[['item'],['x']],[['name','qty','price'],['x','-1','20']],[['name','qty','price'],['x','1','NaN']],[['name','qty','price'],['x','1','1,000']],[['name','qty','price','discount'],['x','1','10','11']],[['name','qty','price']],[['name','qty','price'],...Array(101).fill(['x','1','1'])]]){assert.throws(()=>invoiceFromRows(rows));count++;}
 const {readAssetSpreadsheet}=load('lib/data/erp-assets-import.ts');
 const csv=new File(['name,qty,price\n"Shirt, cotton",2,100'], 'sample.csv');const rows=await readAssetSpreadsheet(csv,',');check(invoiceFromRows(rows).lines[0].name==='Shirt, cotton','quoted CSV');
 const Excel=require('exceljs');const book=new Excel.Workbook();const sheet=book.addWorksheet('Invoice');sheet.addRow(['name','qty','price']);sheet.addRow(['Shirt',2,100]);const bytes=await book.xlsx.writeBuffer();check(invoiceFromRows(await readAssetSpreadsheet(new File([bytes],'sample.xlsx'),',')).lines[0].price===100,'real XLSX');sheet.getCell('C2').value={formula:'1+1',result:2};await assert.rejects(()=>book.xlsx.writeBuffer().then(b=>readAssetSpreadsheet(new File([b],'formula.xlsx'),',')));count++;
 const oldFetch=global.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';
 try{
  const {extractInvoiceFile}=load('lib/finance/invoice-import-ai.ts');let calls=0;
  global.fetch=async(url,options)=>{calls++;const body=JSON.parse(options.body);check(url==='https://api.openai.com/v1/responses'&&body.store===false&&!body.tools,'fixed private extraction endpoint');check(body.text.format.strict===true,'strict schema');return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(invoice)}]}]});};
  check((await extractInvoiceFile(new File(['%PDF-fixture'],'invoice.pdf'))).lines.length===1,'PDF extraction');
  await assert.rejects(()=>extractInvoiceFile(new File(['<script>'],'fake.pdf')));check(calls===1,'magic-byte validation before provider');
  global.fetch=async()=>Response.json({status:'incomplete',output:[]});await assert.rejects(()=>extractInvoiceFile(new File(['%PDF-fixture'],'i.pdf')));count++;
  global.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"lines":[]}'}]}]});await assert.rejects(()=>extractInvoiceFile(new File(['%PDF-fixture'],'i.pdf')));count++;
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
 let external=0,permitted=false;
 const action=load('app/actions/finance-invoice-import.ts',{'@/lib/data/brand-finance':{getBrandFinanceContext:async()=>({cafe:{id:'fixture',role:'viewer'}})},'@/lib/finance/permissions':{canFinance:()=>permitted},'@/lib/data/erp-assets-import':{readAssetSpreadsheet:async()=>[['name','qty','price'],['Item','1','5']]},'@/lib/finance/invoice-import-ai':{extractInvoiceFile:async()=>{external++;return invoice;}}});
 const form=new FormData();form.set('mode','ai');form.set('file',new File(['%PDF-fixture'],'invoice.pdf'));
 check(!(await action.previewInvoiceImportAction(form,'other-brand')).ok&&external===0,'authorization before file/provider');permitted=true;
 check((await action.previewInvoiceImportAction(form,'brand')).ok&&external===1,'authorized extraction');form.set('file',new File([new Uint8Array(3*1024*1024+1)],'large.pdf'));check(!(await action.previewInvoiceImportAction(form,'brand')).ok&&external===1,'upload bound before provider');
 console.log(`PASS ${count} invoice import parsing, XLSX, permission, provider and no-posting checks`);
})().catch(e=>{console.error(e);process.exitCode=1});
