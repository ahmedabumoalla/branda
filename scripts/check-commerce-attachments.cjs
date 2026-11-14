'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),sharp=require('sharp');
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function rejects(fn){await assert.rejects(fn);checks++;}
function load(file,overrides={}){const filename=path.resolve(file),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const original=m.require.bind(m);m.require=id=>Object.hasOwn(overrides,id)?overrides[id]:original(id);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);return m.exports;}
(async()=>{
const files=load('lib/commerce/attachment-file.ts');
const png=await sharp({create:{width:12,height:12,channels:4,background:'#ff8800'}}).png().withMetadata({orientation:3}).toBuffer();
const clean=await files.prepareCommerceAttachment(png,'image/png');eq(clean.mime,'image/png');eq((await sharp(clean.bytes).metadata()).orientation,undefined);eq(clean.name,'design.png');
await rejects(()=>files.prepareCommerceAttachment(png,'image/jpeg'));
await rejects(()=>files.prepareCommerceAttachment(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),'image/png'));
await rejects(()=>files.prepareCommerceAttachment(Buffer.alloc(3*1024*1024+1),'image/png'));
await rejects(()=>files.prepareCommerceAttachment(Buffer.from('not an image'),'image/png'));
const events=[];let rateDenied=false,readyFailure=false,duplicate=false,tampered=false,saved=null;
const client={rpc:async(name,args)=>{events.push({name,args});if(name==='gift_attachment_admit')return {error:rateDenied?{}:null};if(name==='gift_attachment_reserve')return {data:{token:'11111111-1111-4111-a111-111111111111',path:'22222222-2222-4222-a222-222222222222/33333333-3333-4333-a333-333333333333',ready:false,name:'design.png'}};return {error:readyFailure?{}:null};},storage:{from:bucket=>({upload:async(p,bytes,options)=>{events.push({bucket,p,bytes:bytes.length,options});if(duplicate)return {error:{statusCode:'400'}};saved=Buffer.from(bytes);return {error:null};},download:async()=>({data:new Blob([tampered?Buffer.alloc(saved.length):saved]),error:null})})}};
const route=load('app/api/commerce/[slug]/attachments/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>client},'@/lib/data/erp-store-public':{publicStoreFingerprint:()=> 'a'.repeat(64)},'@/lib/commerce/attachment-file':files});
const context={params:Promise.resolve({slug:'fawasel'})};
function request(origin='https://shop.test',mime='image/png',bytes=png){const form=new FormData();form.set('productId','44444444-4444-4444-a444-444444444444');form.set('groupId','logo');form.set('optionId','shirt');form.set('requestId','55555555-5555-4555-a555-555555555555');form.set('file',new File([bytes],'logo.png',{type:mime}));return new Request('https://shop.test/api/commerce/fawasel/attachments',{method:'POST',headers:{origin},body:form});}
let r=await route.POST(request('https://evil.test'),context);eq(r.status,403);eq(events.length,0);
rateDenied=true;r=await route.POST(request(),context);eq(r.status,429);rateDenied=false;
r=await route.POST(request(),context);eq(r.status,200);eq((await r.json()).token,'11111111-1111-4111-a111-111111111111');eq(events.find(e=>e.bucket)?.bucket,'commerce-attachments');eq(events.find(e=>e.bucket)?.options.upsert,false);eq(events.at(-1).name,'gift_attachment_ready');
r=await route.POST(request('https://shop.test','text/html'),context);eq(r.status,400);
readyFailure=true;r=await route.POST(request(),context);eq(r.status,503);
readyFailure=false;duplicate=true;r=await route.POST(request(),context);eq(r.status,200);eq((await r.json()).token,'11111111-1111-4111-a111-111111111111');
tampered=true;r=await route.POST(request(),context);eq(r.status,503);tampered=false;duplicate=false;
r=await route.POST(new Request('https://shop.test/api/commerce/fawasel/attachments',{method:'POST',headers:{origin:'https://shop.test','Content-Type':'multipart/form-data; boundary=test','Content-Length':String(4*1024*1024)},body:'x'}),context);eq(r.status,413);
const {mapCatalog,validate}=require('./import-fawasel-catalog.cjs'),catalog=JSON.parse(fs.readFileSync('output/fawasel-import-20261114/catalog.json','utf8')),plan=mapCatalog(catalog);eq(validate(plan),true);eq(plan.blocked.length,0);
const first=plan.products.find(p=>p.commerce_details.sourceImport.sourceId==='1751135973'),second=plan.products.find(p=>p.commerce_details.sourceImport.sourceId==='239364880');
eq(first.available,true);eq(second.available,true);eq(first.commerce_details.optionGroups.find(g=>g.type==='image').showWhen.optionIds.length,3);eq(second.commerce_details.optionGroups.find(g=>g.type==='file').accept,['image/png']);eq(second.commerce_details.optionGroups.find(g=>g.type==='date').required,true);
const cart=load('lib/commerce/storefront-cart.ts');const p={...first,available:true,commerceDetails:first.commerce_details};const logo=p.commerceDetails.options.find(o=>o.label.includes('شعار')),name=p.commerceDetails.options.find(o=>o.label.includes('اسم'));
const image=p.commerceDetails.optionGroups.find(g=>g.type==='image');eq(cart.commerceGroupVisible(image,logo.id),true);eq(cart.commerceGroupVisible(image,name.id),false);
eq(cart.selectionError({...p,commerceDetails:{options:[],optionGroups:[{id:'d',label:'Date',type:'date',required:true}]}},[{groupId:'d',text:'2026-02-30'}]),'اختر Date');
console.log(`Commerce attachments runtime/mapping: ${checks} checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
