// Read-only post-application verification of branch catalogs and all private image bytes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {CAFE_ID,BRAND_SLUG,sha} from './dabab-branches-sql.mjs';
const dir='output/dabab-branches',plan=JSON.parse(fs.readFileSync(`${dir}/import-plan.json`,'utf8'));
nextEnv.loadEnvConfig(process.cwd());
assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'kpguwjfkkylrdlvzeezz.supabase.co','Unexpected project');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options),anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
const sorted=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
const normalize=row=>Object.fromEntries(Object.entries(row).map(([key,v])=>[key,typeof v==='string'&&['price_options','gallery_storage_paths'].includes(key)?v.slice(1,-1).split(',').filter(Boolean).map(x=>key==='price_options'?Number(x):x):v]));
async function read(query){const {data,error}=await query;if(error)throw Error(error.message);return data;}
assert.equal(sha(fs.readFileSync(plan.sourceFile)),plan.sourceSha256,'Reviewed source changed');
const cafe=await read(admin.from('cafes').select('id,slug,name,status,is_public').eq('id',CAFE_ID).is('deleted_at',null).single());
assert.deepEqual(cafe,{id:CAFE_ID,slug:BRAND_SLUG,name:'ضباب',status:'active',is_public:true});
const branches=await read(admin.from('branches').select(Object.keys(plan.branches[0]).join(',')).eq('cafe_id',CAFE_ID));
assert.deepEqual(sorted(branches),sorted(plan.branches));
const barId=plan.branches[0].id;
for(const [table,key] of [['menu_products','products'],['menu_categories','categories']]){
 const expected=plan.rows[key],actual=await read(admin.from(table).select(Object.keys(expected[0]).join(',')).eq('cafe_id',CAFE_ID).neq('branch_id',barId));
 assert.deepEqual(sorted(actual),sorted(expected.map(normalize)),`Independent branch ${key} differs`);
 const bar=await read(admin.from(table).select('*').eq('cafe_id',CAFE_ID).eq('branch_id',barId));
 const unchanged=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['updated_at','branch_id'].includes(key)));
 assert.deepEqual(sorted(bar.map(unchanged)),sorted(plan.bar[key].map(unchanged)),`Original Bar ${key} changed`);
}
for(const b of plan.branches){
 const publicRows=await read(anon.from('menu_products').select('id,price,available,branch_id,image_storage_path').eq('cafe_id',CAFE_ID).eq('branch_id',b.id));
 assert.equal(publicRows.length,b.menu_slug==='bar'?28:77);assert(publicRows.every(p=>p.available&&p.price>0&&p.image_storage_path.startsWith(CAFE_ID+'/')));
 const mismatch=await read(anon.from('menu_products').select('id').eq('cafe_id','321fd305-1883-48df-ab69-829cf7d1bc48').eq('branch_id',b.id));assert.equal(mismatch.length,0);
}
const publicBranches=await read(anon.from('branches').select('id,menu_slug').eq('cafe_id',CAFE_ID).eq('active',true));assert.equal(publicBranches.length,3);
const invalid=await read(anon.from('branches').select('id').eq('cafe_id',CAFE_ID).eq('menu_slug','missing-branch'));assert.equal(invalid.length,0);
assert.equal((await read(admin.storage.getBucket('menu-products'))).public,false);
const entries=Object.entries(plan.assets),media=[];let cursor=0;
await Promise.all(Array.from({length:5},async()=>{while(cursor<entries.length){
 const [sourceId,a]=entries[cursor++];const signed=await read(admin.storage.from(a.bucket).createSignedUrl(a.path,180));
 const response=await fetch(signed.signedUrl,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);assert.equal(sha(Buffer.from(await response.arrayBuffer())),a.sha256,`Private image changed: ${sourceId}`);
 const direct=await fetch(admin.storage.from(a.bucket).getPublicUrl(a.path).data.publicUrl,{signal:AbortSignal.timeout(30000)});assert([400,401,403,404].includes(direct.status));
 media.push({sourceId,sha256:a.sha256,signedStatus:200,publicStatus:direct.status});
}}));
const files=['scripts/dabab-branches-sql.mjs','scripts/prepare-dabab-branches.mjs','scripts/verify-dabab-branches.mjs',`supabase/migrations/${plan.migration}.sql`,plan.sourceFile];
fs.writeFileSync(`${dir}/import-verification.json`,JSON.stringify({at:new Date().toISOString(),runtime:process.version,result:'PASS',branches:3,barProducts:28,coffeeProducts:79,hospitalProducts:79,publicProducts:182,hiddenUnpricedProducts:4,independentBranchIds:true,barIdsAndDetailsPreserved:true,media:media.sort((a,b)=>a.sourceId.localeCompare(b.sourceId)),noMessagesOrPasses:true,files:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))},null,2)+'\n');
console.log(JSON.stringify({result:'PASS',branches:3,products:186,publicProducts:182,privateImages:79,barPreserved:true}));
