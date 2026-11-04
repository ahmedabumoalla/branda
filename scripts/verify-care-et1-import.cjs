// Read-only verification: no customer passes, notifications or subscription changes.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const {createClient}=require('@supabase/supabase-js');
const config={auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:require('next/dist/compiled/ws')}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,config);
const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,config);
const dir='output/care-et1',hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function read(query){const {data,error}=await query;if(error)throw Error(error.message);return data;}
const order=rows=>[...rows].sort((a,b)=>(a.id||a.cafe_id).localeCompare(b.id||b.cafe_id));
const normalize=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,['price_options','gallery_storage_paths'].includes(k)&&typeof v==='string'?v.slice(1,-1).split(',').filter(Boolean).map(Number):v]));
(async()=>{
 const plan=JSON.parse(fs.readFileSync(dir+'/import-plan.json','utf8'));
 const sourceBytes=fs.readFileSync('data/imports/care-et1-source-20261104.json'),source=JSON.parse(sourceBytes);
 assert.equal(hash(sourceBytes),plan.sourceSha256);
 const ids=plan.brands.map(b=>b.cafeId),results=[];
 for(const [key,table] of [['categories','menu_categories'],['products','menu_products'],['programs','cafe_loyalty_programs'],['experiences','cafe_loyalty_experience']]){
  const expected=plan.rows[key];assert(expected.length>0);
  const affected=[...new Set(expected.map(row=>row.cafe_id))];
  const actual=await read(admin.from(table).select(Object.keys(expected[0]).join(',')).in('cafe_id',affected));
  assert.deepEqual(order(actual),order(expected.map(normalize)),table+' differs from reviewed source');
 }
 for(const brand of plan.brands){
  const reviewed=source.brands.find(b=>b.cafeId===brand.cafeId);
  const cafe=await read(admin.from('cafes').select('slug,status,business_category').eq('id',brand.cafeId).single());
  assert.deepEqual(cafe,{slug:brand.slug,status:'active',business_category:brand.key==='care'?'hair_salons':'cafes_coffee'});
  const publicProducts=await read(anon.from('menu_products').select('id,price,image_storage_path,available').eq('cafe_id',brand.cafeId));
  if(brand.key==='et1') {assert.equal(publicProducts.length,reviewed.products.filter(p=>p.available).length);assert(publicProducts.every(p=>p.available&&p.price>0&&p.image_storage_path));}
  const program=await read(anon.from('cafe_loyalty_programs').select('enabled,purchases_required,reward_name,card_design,wallet_enabled,apple_wallet_enabled,google_wallet_enabled').eq('cafe_id',brand.cafeId).single());
  assert(program.enabled&&program.wallet_enabled&&program.apple_wallet_enabled&&program.google_wallet_enabled);
  assert.equal(program.purchases_required,6);assert.equal(program.reward_name,'خصم 10%');assert.equal(program.card_design.stampStyle,brand.key==='care'?'scissors':'brand');
  const experience=await read(admin.from('cafe_loyalty_experience').select('reward_kind,reward_discount_percent').eq('cafe_id',brand.cafeId).single());
  assert.deepEqual(experience,{reward_kind:'discount',reward_discount_percent:10});
  const identity=await read(admin.from('cafe_custom_identity').select('logo_storage_path,palette').eq('cafe_id',brand.cafeId).single());
  assert.equal(identity.logo_storage_path,brand.logoPath);assert.deepEqual(identity.palette,brand.palette);
  const settings=await read(admin.from('cafe_settings').select('logo_storage_path').eq('cafe_id',brand.cafeId).single());assert.equal(settings.logo_storage_path,brand.logoPath);
  results.push({key:brand.key,cafeId:brand.cafeId,slug:brand.slug,publicProducts:publicProducts.length,stamps:6,discountPercent:10,identityVerified:true});
 }
 const assets=[],jobs=Object.entries(plan.assets);let cursor=0;
 await Promise.all(Array.from({length:6},async()=>{while(cursor<jobs.length){
  const [key,a]=jobs[cursor++],brand=plan.brands.find(b=>key.startsWith(b.key+'/'));assert(a.path.startsWith(brand.cafeId+'/'));
  const signed=await read(admin.storage.from(a.bucket).createSignedUrl(a.path,180));
  const response=await fetch(signed.signedUrl,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),a.sha256);
  const pub=await fetch(admin.storage.from(a.bucket).getPublicUrl(a.path).data.publicUrl,{signal:AbortSignal.timeout(30000)});assert([400,401,403,404].includes(pub.status));
  assets.push({key,sha256Verified:true,signedStatus:200,publicStatus:pub.status});
 }}));
 for(const bucket of ['cafe-logos','menu-products'])assert.equal((await read(admin.storage.getBucket(bucket))).public,false);
 assets.sort((a,b)=>a.key.localeCompare(b.key));
 const files=['scripts/prepare-care-et1-import.cjs','scripts/verify-care-et1-import.cjs','data/imports/care-et1-source-20261104.json','package-lock.json'];if(plan.migration)files.push('supabase/migrations/'+plan.migration+'.sql');
 const result={at:new Date().toISOString(),result:'PASS',brands:results,products:plan.rows.products.length,published:plan.rows.products.filter(p=>p.available).length,categories:plan.rows.categories.length,assets,sourcePricesExact:true,messagesSent:0,customerCardsCreated:0,runtime:process.version,files:files.map(file=>({file,sha256:hash(fs.readFileSync(file))}))};
 fs.writeFileSync(dir+'/import-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',brands:results,assets:assets.length}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
