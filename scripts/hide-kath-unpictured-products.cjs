// Exact user-approved products only; reversible hide, never delete
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {createClient} = require('@supabase/supabase-js');
const cafeId = 'fbd92cd0-c4b6-41b5-81dd-1d45a01d01e8';
const ids = ['cbfaebe9-b782-48b9-808d-4aa90c301ffc','be549ce3-50f2-4136-840b-ccb4d6ad4ead',
  '9cb79807-933d-4c52-a249-934cf9672725','7acf6331-4fd0-428c-8493-2b88b9310c6f',
  '8d504001-4a86-482a-95f7-363723db7ca0','8290c6a7-e8e2-4776-a101-7387a4fd2ad7'];
const options = {auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:require('next/dist/compiled/ws')}};
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,options);
async function checked(query) { const {data,error}=await query; if(error)throw new Error(error.message); return data; }
async function run() {
  await checked(client.auth.signInWithPassword({email:process.env.KATH_ADMIN_EMAIL,password:process.env.KATH_ADMIN_PASSWORD}));
  const products = await checked(client.from('menu_products').select('*').eq('cafe_id',cafeId).in('id',ids).is('deleted_at',null));
  assert.equal(products.length,6);
  assert.deepEqual(products.map(p=>p.name).sort(),['تورتيلا','كلوب ساندوتش','سنيكرز','وافل مع الفواكه','كوكيز ايس كريم','جلاكسي'].sort());
  assert.ok(products.every(p=>!p.image_storage_path));
  for(const product of products) {
    assert.equal((product.image_gallery ?? []).length,0);
    assert.equal((product.gallery_storage_paths ?? []).length,0);
    assert.equal((product.media ?? []).length,0);
    const url = new URL(product.image_url);
    assert.equal(url.origin,'https://kath.great-site.net');
    const response = await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,404,'Source image recovered; review before hiding');
  }
  const directory='.codex-tmp/kath-image-preservation';
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(`${directory}/before-hide-${Date.now()}.json`,JSON.stringify(products,null,2),{flag:'wx'});
  const categoryName='مخفية مؤقتًا لعدم توفر الصور';
  let category=await checked(client.from('menu_categories').select('id,visible').eq('cafe_id',cafeId).eq('name',categoryName).is('deleted_at',null).maybeSingle());
  if(!category) category=await checked(client.from('menu_categories').insert({cafe_id:cafeId,name:categoryName,description:'كلوب ساندوتش والتورتيلا من قسم ساندوتش لإعادتهما انقلهما للقسم الأصلي وفعّل الإتاحة',visible:false,featured:false,sort_order:9999}).select('id,visible').single());
  assert.equal(category.visible,false);
  await checked(client.from('menu_categories').update({description:'أصناف مخفية لعدم توفر صورها لإعادتها أضف الصور وأعد كل صنف لقسمه الأصلي وفعّل الإتاحة'}).eq('id',category.id).eq('cafe_id',cafeId));
  for(const p of products) {
    if(!p.available && p.category_id === category.id) continue;
    const updated=await checked(client.from('menu_products').update({available:false,category_id:category.id}).eq('id',p.id).eq('cafe_id',cafeId).eq('updated_at',p.updated_at).is('deleted_at',null).select('*'));
    assert.equal(updated.length,1);
    for(const key of Object.keys(p).filter(k=>!['available','category_id','updated_at'].includes(k))) assert.deepEqual(updated[0][key],p[key]);
  }
  console.log('PASS all six products without working images hidden without deleting records');
  await client.auth.signOut({scope:'local'});
}
run().catch(e=>{console.error(e.message);process.exitCode=1});
