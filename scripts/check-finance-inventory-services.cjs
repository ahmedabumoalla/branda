const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),sharp=require('sharp');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','exports',code)(name=>name in mocks?mocks[name]:name==='server-only'?{}:require(name),exports);return exports;}
const cafeId='11111111-1111-4111-8111-111111111111',itemId='22222222-2222-4222-8222-222222222222',requestId='33333333-3333-4333-8333-333333333333';
(async()=>{
  const shared=load('lib/finance/inventory-catalog.ts');
  const payload={name:'Cup',sku:'',unitId:itemId,barcode:'000001',minQuantity:0,costMode:'equal_split',productLinks:[{productId:itemId,quantity:0.125}],imagePath:null};
  assert.equal(shared.inventoryItemInputSchema.parse({requestId,payload}).payload.barcode,'000001');
  const projected=shared.inventoryProductsAfterSave([{id:itemId}],[{id:'a',active:true,product_links:[{product_id:itemId,quantity:2}]},{id:'b',active:true,product_links:[{product_id:itemId,quantity:0.5}]}],[{item_id:'a',quantity:12},{item_id:'b',quantity:2}]);assert.equal(projected[0].quantity,4);assert.equal(projected[0].stock_components.length,2);assert.equal(shared.inventoryProductsAfterSave(projected,[],[])[0].stockTracked,false);
  assert.equal(shared.inventoryItemInputSchema.parse({requestId,payload:{...payload,barcode:'CUP-12/A'}}).payload.barcode,'CUP-12/A');
  for(const change of [{costMode:'invalid'},{barcode:'<script>'},{productLinks:[{productId:itemId,quantity:0}]},{productLinks:[{productId:itemId,quantity:0.1234}]},{productLinks:[payload.productLinks[0],payload.productLinks[0]]},{minQuantity:NaN},{unitId:''}])assert.throws(()=>shared.inventoryItemInputSchema.parse({requestId,payload:{...payload,...change}}));
  assert(shared.isInventoryImagePath(`${cafeId}/${itemId}.webp`,cafeId));
  for(const path of [`${itemId}/${cafeId}.webp`,`${cafeId}/../${itemId}.webp`,`https://host/${cafeId}/${itemId}.webp`,`${cafeId}/${itemId}.svg`])assert(!shared.isInventoryImagePath(path,cafeId));
  let role='owner',calls=[],data={id:itemId},error=null;
  const context=async()=>({cafe:{id:cafeId,slug:'brand',role},client:{rpc:async(name,args)=>{calls.push({name,args});return {error,data:name==='brand_finance_inventory_catalog'?{items:[{id:itemId,image_path:`${cafeId}/${itemId}.webp`}],units:[]}:data};}}});
  const dal=load('lib/data/finance-inventory-catalog.ts',{'./brand-finance':{getBrandFinanceContext:context},'@/lib/finance/permissions':load('lib/finance/permissions.ts'),'@/lib/finance/inventory-catalog':shared});
  const saved=await dal.saveFinanceInventoryItem({requestId,payload},'brand');assert.equal(saved.item.id,itemId);assert(saved.item.imageUrl.startsWith('/api/finance/brand/inventory-image?'));
  assert.deepEqual(calls[0],{name:'brand_finance_execute',args:{p_cafe_id:cafeId,p_operation:'item',p_payload:payload,p_request_id:requestId}});
  for(const deniedRole of ['cashier','auditor','accountant']){role=deniedRole;const before=calls.length;await assert.rejects(()=>dal.saveFinanceInventoryItem({requestId,payload}));await assert.rejects(()=>dal.saveFinanceInventoryUnit({requestId,name:'Unit'}));assert.equal(calls.length,before);}
  role='owner';await assert.rejects(()=>dal.saveFinanceInventoryItem({requestId,payload:{...payload,imagePath:`${itemId}/${itemId}.webp`}}));
  data={id:itemId,name:'Unit'};assert.equal((await dal.saveFinanceInventoryUnit({requestId,name:'Unit'})).unit.name,'Unit');
  error={message:'private database detail'};await assert.rejects(()=>dal.saveFinanceInventoryUnit({requestId,name:'Unit'}),e=>!e.message.includes('private database'));error=null;
  const image=load('lib/finance/inventory-image.ts',{'./inventory-catalog':shared});
  const input=await sharp({create:{width:1600,height:800,channels:3,background:'#ffcc00'}}).png().toBuffer();
  const output=await image.sanitizeInventoryImage(input);const metadata=await sharp(output).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,1200);assert.equal(metadata.height,600);assert.equal(metadata.exif,undefined);
  for(const bytes of [Buffer.from('not an image'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>'),Buffer.alloc(shared.INVENTORY_IMAGE_MAX_BYTES+1)])await assert.rejects(()=>image.sanitizeInventoryImage(bytes));
  const form=new FormData();form.set('file',new File([input],'image.png',{type:'image/png'}));assert((await image.readInventoryUpload(new Request('https://brand.test',{method:'POST',body:form}))).length>0);
  await assert.rejects(()=>image.readInventoryUpload(new Request('https://brand.test',{method:'POST',body:'x',headers:{'content-length':String(shared.INVENTORY_IMAGE_MAX_BYTES+100000)}})));
  let uploads=0,adminReads=0;
  const route=load('app/api/finance/[slug]/inventory-image/route.ts',{'next/server':{NextResponse:{redirect:(url,init)=>new Response(null,{...init,headers:{...init.headers,Location:url}})}},'@/lib/data/brand-finance':{getBrandFinanceContext:context},'@/lib/supabase/admin':{createAdminClient:()=>{adminReads++;return {storage:{getBucket:async()=>({data:{public:false}}),from:()=>({upload:async()=>{uploads++;return{};},createSignedUrl:async()=>({data:{signedUrl:'https://trusted.test/image'}})})}}}},'@/lib/finance/permissions':load('lib/finance/permissions.ts'),'@/lib/finance/inventory-catalog':shared,'@/lib/finance/inventory-image':image});
  const ctx={params:Promise.resolve({slug:'brand'})};
  assert.equal((await route.POST(new Request('https://brand.test/api',{method:'POST',headers:{origin:'https://evil.test'},body:form}),ctx)).status,403);assert.equal(adminReads,0);
  role='cashier';assert.equal((await route.POST(new Request('https://brand.test/api',{method:'POST',headers:{origin:'https://brand.test'},body:form}),ctx)).status,403);assert.equal(adminReads,0);
  role='owner';const response=await route.POST(new Request('https://brand.test/api',{method:'POST',headers:{origin:'https://brand.test'},body:form}),ctx);assert.equal(response.status,200);assert(shared.isInventoryImagePath((await response.json()).path,cafeId));assert.equal(uploads,1);
  const before=adminReads;assert.equal((await route.GET(new Request(`https://brand.test/api?path=${itemId}/${itemId}.webp`),ctx)).status,403);assert.equal(adminReads,before);
  assert.equal((await route.GET(new Request(`https://brand.test/api?path=${cafeId}/${itemId}.webp`),ctx)).status,307);
  console.log('PASS inventory services: validation, tenant paths, role gates, idempotent command, private images, real image sanitization, size bounds, CSRF and route authorization');
})().catch(e=>{console.error(e);process.exitCode=1;});
