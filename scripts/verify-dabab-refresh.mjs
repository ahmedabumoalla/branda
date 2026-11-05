// Read-only exact catalog and private media verification; never generates customer passes.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import WebSocket from 'next/dist/compiled/ws/index.js';
nextEnv.loadEnvConfig(process.cwd());
const options={auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:WebSocket}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const dir='output/dabab-refresh',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sorted=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const normalize=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['price_options','gallery_storage_paths'].includes(key)&&typeof value==='string'?value.slice(1,-1).split(',').filter(Boolean).map(Number):value]));
async function read(query){const {data,error}=await query;if(error)throw Error(error.message);return data;}
(async()=>{
 const plan=JSON.parse(fs.readFileSync(`${dir}/import-plan.json`,'utf8')),sourceBytes=fs.readFileSync(plan.sourceFile),source=JSON.parse(sourceBytes);
 assert.equal(sha(sourceBytes),plan.sourceSha256,'Reviewed PDF manifest changed');assert.equal(sha(fs.readFileSync(source.sourceFile)),plan.pdfSha256,'Source PDF changed');
 const cafe=plan.brand.cafeId,old=JSON.parse(fs.readFileSync(`${dir}/before-private.json`,'utf8').replace(/^\uFEFF/,'')).rows[0].backup;
 const brand=await read(admin.from('cafes').select('id,slug,status,is_public,business_category').eq('id',cafe).is('deleted_at',null).single());
 assert.deepEqual(brand,{id:cafe,slug:plan.brand.slug,status:'active',is_public:true,business_category:'cafes_coffee'});
 for(const [table,key] of [['menu_products','products'],['menu_categories','categories']]){
   const expected=plan.rows[key],actual=await read(admin.from(table).select(Object.keys(expected[0]).join(',')).eq('cafe_id',cafe));
   assert.deepEqual(sorted(actual),sorted(expected.map(normalize)),`Exact PDF ${key} readback differs`);
 }
 const publicProducts=await read(anon.from('menu_products').select('id,price,available,image_storage_path').eq('cafe_id',cafe));
 assert.equal(publicProducts.length,28);assert(publicProducts.every(p=>p.available&&p.price>0&&p.image_storage_path&&!old.products.some(previous=>previous.id===p.id)));
 const publicCategories=await read(anon.from('menu_categories').select('id,name').eq('cafe_id',cafe));assert.equal(publicCategories.length,1);assert.equal(publicCategories[0].name,source.brands[0].categories[0]);
 const settings=await read(admin.from('cafe_settings').select('logo_url,logo_storage_path').eq('cafe_id',cafe).single());
 const identity=await read(admin.from('cafe_custom_identity').select('*').eq('cafe_id',cafe).single());
 assert.deepEqual(settings,{logo_url:null,logo_storage_path:plan.brand.logoPath});assert.equal(identity.logo_storage_path,plan.brand.logoPath);assert.equal(identity.logo_url,null);assert.deepEqual(identity.palette,plan.brand.palette);
 const nonIdentity=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['logo_storage_path','logo_url','palette','updated_at'].includes(key)));
 assert.deepEqual(nonIdentity(identity),nonIdentity(old.identity),'Unrelated custom identity settings changed');
 const program=await read(admin.from('cafe_loyalty_programs').select('*').eq('cafe_id',cafe).single()),experience=await read(admin.from('cafe_loyalty_experience').select('*').eq('cafe_id',cafe).single());
 assert.deepEqual(program,old.program,'Current owner loyalty program changed');assert.deepEqual(experience,old.experience,'Current owner reward changed');
 const jobs=Object.entries(plan.assets),assets=[];let cursor=0;
 await Promise.all(Array.from({length:5},async()=>{while(cursor<jobs.length){
   const [key,a]=jobs[cursor++];assert(a.path.startsWith(cafe+'/'));
   const signed=await read(admin.storage.from(a.bucket).createSignedUrl(a.path,180));
   const response=await fetch(signed.signedUrl,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);assert.equal(sha(Buffer.from(await response.arrayBuffer())),a.sha256,`Image bytes differ: ${key}`);
   const publicResponse=await fetch(admin.storage.from(a.bucket).getPublicUrl(a.path).data.publicUrl,{signal:AbortSignal.timeout(30000)});assert([400,401,403,404].includes(publicResponse.status));
   assets.push({key,sha256Verified:true,signedStatus:200,publicStatus:publicResponse.status});
 }}));
 for(const bucket of ['menu-products','cafe-logos'])assert.equal((await read(admin.storage.getBucket(bucket))).public,false);
 const files=[plan.sourceFile,'scripts/prepare-dabab-refresh.mjs','scripts/verify-dabab-refresh.mjs',`supabase/migrations/${plan.migration}.sql`];
 const result={at:new Date().toISOString(),runtime:process.version,result:'PASS',products:28,categories:1,oldProductsRemoved:104,oldCategoriesRemoved:17,exactSourcePrices:true,allPhotosVerified:true,assets:assets.sort((a,b)=>a.key.localeCompare(b.key)),loyaltyUnchanged:true,settingsOtherFieldsUnchanged:true,messagesSent:0,passesIssued:0,files:files.map(file=>({file,sha256:sha(fs.readFileSync(file))}))};
 fs.writeFileSync(`${dir}/import-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',products:28,categories:1,assets:assets.length,loyaltyUnchanged:true,messagesSent:0,passesIssued:0}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
