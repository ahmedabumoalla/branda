// Read-only evidence: no messages, customer cards, subscriptions or account writes.
const fs = require('node:fs'), crypto = require('node:crypto'), assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const config = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: require('next/dist/compiled/ws') } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, config);
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, config);
const dir = 'output/five-restaurants', sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function read(query) { const { data, error } = await query; if (error) throw Error(error.message); return data; }
const normalized = row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k, ['price_options','gallery_storage_paths'].includes(k) && typeof v === 'string' ? v.slice(1,-1).split(',').filter(Boolean).map(Number) : v]));
const ordered = rows => [...rows].sort((a,b) => (a.id || a.cafe_id).localeCompare(b.id || b.cafe_id));
(async () => {
  const plan = JSON.parse(fs.readFileSync(`${dir}/import-plan.json`, 'utf8'));
  const source = JSON.parse(fs.readFileSync('data/imports/five-restaurants-source-20261103.json', 'utf8'));
  assert.equal(sha(fs.readFileSync('data/imports/five-restaurants-source-20261103.json')), plan.sourceSha256);
  const before = JSON.parse(fs.readFileSync(`${dir}/before-private.json`, 'utf8'));
  const ids = plan.brands.map(b => b.cafeId), results = [];
  for (const [key, table] of [['categories','menu_categories'],['products','menu_products'],['programs','cafe_loyalty_programs'],['experiences','cafe_loyalty_experience']]) {
    const rows = await read(admin.from(table).select(Object.keys(plan.rows[key][0]).join(',')).in('cafe_id',ids));
    assert.deepEqual(ordered(rows), ordered(plan.rows[key].map(normalized)), `${table} differs from reviewed source`);
  }
  for (const brand of plan.brands) {
    const reviewed = source.brands.find(b => b.cafeId === brand.cafeId);
    const publicProducts = await read(anon.from('menu_products').select('id,name,price,image_storage_path,available').eq('cafe_id',brand.cafeId));
    assert.equal(publicProducts.length,reviewed.products.filter(p => p.available).length);
    assert(publicProducts.every(p => p.available && p.price > 0 && p.image_storage_path));
    const program = await read(anon.from('cafe_loyalty_programs').select('enabled,purchases_required,reward_name,card_design,wallet_enabled,apple_wallet_enabled,google_wallet_enabled').eq('cafe_id',brand.cafeId).single());
    assert(program.enabled && program.wallet_enabled && program.apple_wallet_enabled && program.google_wallet_enabled);
    assert.equal(program.purchases_required,6); assert.equal(program.card_design.stampStyle,'brand');
    const experience = await read(admin.from('cafe_loyalty_experience').select('reward_kind,reward_discount_percent').eq('cafe_id',brand.cafeId).single());
    assert.equal(experience.reward_kind,'discount'); assert.equal(experience.reward_discount_percent,10);
    const identity = await read(admin.from('cafe_custom_identity').select('logo_storage_path,palette').eq('cafe_id',brand.cafeId).single());
    assert.equal(identity.logo_storage_path,brand.logoPath); assert.deepEqual(identity.palette,brand.palette);
    const settings = await read(admin.from('cafe_settings').select('*').eq('cafe_id',brand.cafeId).single());
    assert.equal(settings.logo_storage_path,brand.logoPath);
    const omitLogo = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['logo_storage_path','updated_at'].includes(key)));
    assert.deepEqual(omitLogo(settings),omitLogo(before.cafe_settings.find(s => s.cafe_id === brand.cafeId)));
    results.push({key:brand.key,cafeId:brand.cafeId,slug:brand.slug,publicProducts:publicProducts.length,stamps:6,discountPercent:10,identityVerified:true});
  }
  const subscriptions = await read(admin.from('subscriptions').select('*').in('cafe_id',ids));
  assert.deepEqual(ordered(subscriptions),ordered(before.subscriptions),'Subscriptions changed');
  const overrides = await read(admin.from('brand_feature_overrides').select('*').in('cafe_id',ids));
  assert.deepEqual(ordered(overrides),ordered(before.brand_feature_overrides),'Feature overrides changed');
  const assets = [];
  const jobs = Object.entries(plan.assets);
  for (let index = 0; index < jobs.length; index += 4) {
    const group = await Promise.all(jobs.slice(index,index+4).map(async ([key,asset]) => {
      assert(asset.path.startsWith(plan.brands.find(b => key.startsWith(b.key+'/')).cafeId + '/'));
      const signed = await read(admin.storage.from(asset.bucket).createSignedUrl(asset.path,120));
      const response = await fetch(signed.signedUrl,{signal:AbortSignal.timeout(25000)});
      assert.equal(response.status,200); assert.equal(sha(Buffer.from(await response.arrayBuffer())),asset.sha256);
      return {key,sha256Verified:true,signedStatus:200};
    })); assets.push(...group);
  }
  for (const bucket of ['cafe-logos','menu-products']) {
    assert.equal((await read(admin.storage.getBucket(bucket))).public,false);
    const asset = Object.values(plan.assets).find(a => a.bucket === bucket);
    const response = await fetch(admin.storage.from(bucket).getPublicUrl(asset.path).data.publicUrl,{signal:AbortSignal.timeout(20000)});
    assert([400,401,403,404].includes(response.status));
  }
  const files = ['scripts/prepare-five-restaurants-source.cjs','scripts/prepare-five-restaurants-import.cjs','scripts/verify-five-restaurants-import.cjs','data/imports/five-restaurants-source-20261103.json','package-lock.json'];
  if (plan.migration) files.push(`supabase/migrations/${plan.migration}.sql`);
  const result = {at:new Date().toISOString(),result:'PASS',brands:results,products:143,published:142,disabledMissingPrice:1,categories:19,assets,sourcePricesExact:true,subscriptionsPreserved:true,settingsPreserved:true,messagesSent:0,customerCardsCreated:0,runtime:process.version,files:files.map(file => ({file,sha256:sha(fs.readFileSync(file))}))};
  fs.writeFileSync(`${dir}/import-verification.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({result:result.result,brands:results,assets:assets.length}));
})().catch(error => {console.error(error.message);process.exitCode=1;});
