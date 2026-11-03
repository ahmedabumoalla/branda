// Import only reviewed five-restaurant assets and prices. No customer messages or subscription writes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict'), sharp = require('sharp');
require('@next/env').loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const file = 'data/imports/five-restaurants-source-20261103.json';
const sourceBytes = fs.readFileSync(file), source = JSON.parse(sourceBytes);
const dir = 'output/five-restaurants', upload = process.argv.includes('--upload');
const migrationArg = process.argv.find(v => v.startsWith('--migration='));
const migration = migrationArg?.slice('--migration='.length);
if (migration) assert(/^\d{14}_five_restaurants_catalog_loyalty$/.test(migration), 'Use a CLI-created migration name');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: require('next/dist/compiled/ws') } });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const q = value => value == null ? 'NULL' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const literal = value => value != null && typeof value === 'object' ? `${q(JSON.stringify(value))}::jsonb` : q(value);
const insert = (table, row) => `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});`;
const uuid = (brand, value) => { const h = sha(`${brand.importKey}:${value}`); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
async function read(query) { const {data,error} = await query; if(error) throw Error(error.message); return data; }
const assets = {};
async function asset(brand, entry, key, logo = false) {
  assert(entry?.localPath && /^[a-f0-9]{64}$/.test(entry.sha256), `Reviewed asset/hash required: ${brand.key}/${key}`);
  const absolute = path.resolve(entry.localPath), root = path.resolve(process.cwd());
  assert(absolute.startsWith(root + path.sep), 'Asset outside workspace');
  const original = fs.readFileSync(absolute); assert.equal(sha(original),entry.sha256,`Asset changed: ${brand.key}/${key}`);
  const bytes = await sharp(original).rotate().resize({width:logo?900:1400,height:logo?900:1400,fit:'inside',withoutEnlargement:true}).webp(logo?{lossless:true}:{quality:86}).toBuffer();
  const hash = sha(bytes), bucket = logo?'cafe-logos':'menu-products';
  const target = `${brand.cafeId}/${logo?'identity':uuid(brand,`product/${key}`)}/${brand.importKey}-${hash.slice(0,16)}.webp`;
  const optimizedPath = `${dir}/optimized/${brand.key}/${key}.webp`;
  fs.mkdirSync(path.dirname(optimizedPath),{recursive:true}); fs.writeFileSync(optimizedPath,bytes);
  if(upload) {
    for (let attempt=0; attempt<3; attempt++) {
      try {
        const existing = await db.storage.from(bucket).download(target);
        if(!existing.error) assert(Buffer.from(await existing.data.arrayBuffer()).equals(bytes),'Immutable asset differs');
        else { assert(['400','404'].includes(String(existing.error.statusCode)),'Cannot inspect stored object'); const {error} = await db.storage.from(bucket).upload(target,bytes,{contentType:'image/webp',upsert:false,cacheControl:'31536000'}); if(error)throw Error(error.message); }
        break;
      } catch(error) {
        if(attempt===2 || error.message==='Immutable asset differs')throw error;
        await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
      }
    }
  }
  assets[`${brand.key}/${key}`]={bucket,path:target,optimizedPath,sha256:hash,sourceSha256:entry.sha256,provenance:entry.provenance||entry.sourceUrl||null,bytes:bytes.length};
  return target;
}
const ids = source.brands.map(b=>b.cafeId), outside = `WHERE cafe_id NOT IN(${ids.map(q).join(',')})`;
const protectedTables = [['subscriptions','id',''],['loyalty_cards','id',''],['offers','id',''],['cafes','id',''],['brand_feature_overrides','id',''],...['menu_products','menu_categories'].map(t=>[t,'id',outside]),...['cafe_settings','cafe_custom_identity','cafe_loyalty_programs','cafe_loyalty_experience'].map(t=>[t,'cafe_id',outside])];
const snapshot = `SELECT jsonb_build_object(${protectedTables.map(([t,k,w])=>`${q(t)},(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY ${k})::text,'')) FROM public.${t} t ${w})`).join(',')})`;
function exactRows(table, key, rows) {
  const temp=`five_expected_${key}`, cols=Object.keys(rows[0]).join(',');
  let sql=`CREATE TEMP TABLE ${temp} ON COMMIT DROP AS SELECT * FROM public.${table} WITH NO DATA;\n${rows.map(r=>insert(temp,r)).join('\n')}\n`;
  for(const id of ids) sql+=`DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM public.${table} WHERE cafe_id=${q(id)}) AND (EXISTS(SELECT ${cols} FROM public.${table} WHERE cafe_id=${q(id)} EXCEPT SELECT ${cols} FROM ${temp} WHERE cafe_id=${q(id)}) OR EXISTS(SELECT ${cols} FROM ${temp} WHERE cafe_id=${q(id)} EXCEPT SELECT ${cols} FROM public.${table} WHERE cafe_id=${q(id)})) THEN RAISE EXCEPTION 'Existing ${key} differ; preserve owner changes'; END IF; END $guard$;\n`;
  return sql+`INSERT INTO public.${table}(${cols}) SELECT ${cols} FROM ${temp} ON CONFLICT DO NOTHING;\n`;
}
(async()=>{
  assert.equal(source.brands.length,5); assert.equal(new Set(ids).size,5);
  // Validate everything before making the first immutable Storage upload.
  for(const b of source.brands) {
    assert(b.identity?.logo&&b.identity?.palette,`Identity missing: ${b.key}`);
    for(const color of ['primary','secondary','accent','background','text'])assert(/^#[a-fA-F0-9]{6}$/.test(b.identity.palette[color]),`Palette missing: ${b.key}/${color}`);
    assert(b.products.every(p=>p.image&&(!p.available||Number.isFinite(p.price)&&p.price>0)),`Reviewed images or prices missing: ${b.key}`);
    for(const entry of [b.identity.logo,...b.products.map(p=>p.image)])assert.equal(sha(fs.readFileSync(entry.localPath)),entry.sha256,'Source asset changed');
    assert.equal(b.loyalty.stamps,6);assert.equal(b.loyalty.discountPercent,10);assert.equal(b.loyalty.rewardKind,'discount');
  }
  for(const bucket of ['menu-products','cafe-logos'])assert.equal((await read(db.storage.getBucket(bucket))).public,false,'Private bucket required');
  const rows={categories:[],products:[],programs:[],experiences:[]}, brands=[];
  for(const b of source.brands) {
    const cafe=await read(db.from('cafes').select('id,slug,status,is_public').eq('id',b.cafeId).is('deleted_at',null).single());
    assert.equal(cafe.slug,b.slug);assert.equal(cafe.status,'active');assert(cafe.is_public);
    const logoPath=await asset(b,b.identity.logo,'logo',true), palette=b.identity.palette;
    brands.push({key:b.key,cafeId:b.cafeId,slug:b.slug,logoPath,palette});
    const cats=b.categories.map((name,index)=>({id:uuid(b,`category/${index}`),cafe_id:b.cafeId,branch_id:null,name,description:null,sort_order:index,visible:true}));rows.categories.push(...cats);
    for(const [index,p] of b.products.entries()) {
      const category=cats.find(c=>c.name===p.category);assert(category);
      const variants=p.variants||[];assert(variants.every(v=>Number.isFinite(v.price)&&v.price>0));
      const media=await asset(b,p.image,p.sourceId);
      rows.products.push({id:uuid(b,`product/${p.sourceId}`),cafe_id:b.cafeId,branch_id:null,category_id:category.id,name:p.name,description:p.description||'',price:p.price??0,price_options:`{${[...new Set(variants.map(v=>v.price))].sort((a,b)=>a-b).join(',')}}`,calories:Number.isFinite(p.calories)?p.calories:null,sort_order:index,available:p.available,catalog_kind:'product',image_storage_path:media,gallery_storage_paths:'{}',commerce_details:variants.length?{options:variants.map((v,i)=>({id:`variant-${i+1}`,label:v.name,price:v.price,available:true}))}:{}});
    }
    rows.programs.push({cafe_id:b.cafeId,enabled:true,purchases_required:6,reward_product_id:null,reward_name:'خصم 10%',card_title:`بطاقة ولاء ${b.brandName}`,card_subtitle:'زياراتك تجمع المكافآت',stamp_label:'الأختام',terms:'اجمع 6 أختام واحصل على خصم 10%',card_background:palette.background,card_foreground:palette.text,card_accent:palette.accent,wallet_enabled:true,apple_wallet_enabled:true,google_wallet_enabled:true,card_design:{layoutVersion:'brand-stamps-v1',stampStyle:'brand'}});
    rows.experiences.push({cafe_id:b.cafeId,reward_kind:'discount',reward_discount_percent:10,nearby_message:`قريب منّا؟ يسعدنا نشوفك في ${b.brandName}`});
  }
  assert.equal(rows.products.length,143);assert.equal(rows.categories.length,19);assert.equal(rows.products.filter(p=>p.available).length,142);
  const plan={at:new Date().toISOString(),sourceSha256:sha(sourceBytes),migration:migration||null,brands,assets,rows,subscriptionsChanged:false,messagesSent:0};
  fs.writeFileSync(`${dir}/import-plan.json`,JSON.stringify(plan,null,2));
  let sql=`-- Reviewed catalogs, original identities and explicitly approved 6-stamp/10-percent loyalty\nBEGIN;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='60s';\nCREATE TEMP TABLE five_before ON COMMIT DROP AS ${snapshot} snapshot;\nCREATE TEMP TABLE five_settings_before ON COMMIT DROP AS SELECT cafe_id,to_jsonb(s)-'logo_storage_path'-'updated_at' payload FROM public.cafe_settings s WHERE cafe_id IN(${ids.map(q).join(',')});\n`;
  for(const b of brands)sql+=`DO $brand$ BEGIN PERFORM 1 FROM public.cafes WHERE id=${q(b.cafeId)} AND slug=${q(b.slug)} AND status='active' AND is_public AND deleted_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Brand identity changed';END IF; IF NOT platform_access_private.service_enabled(${q(b.cafeId)},'menu') OR NOT platform_access_private.service_enabled(${q(b.cafeId)},'loyalty') THEN RAISE EXCEPTION 'Existing subscription does not permit menu and loyalty';END IF; END $brand$;\n`;
  sql+=exactRows('menu_categories','categories',rows.categories)+exactRows('menu_products','products',rows.products)+exactRows('cafe_loyalty_programs','programs',rows.programs)+exactRows('cafe_loyalty_experience','experiences',rows.experiences);
  for(const b of brands) {
    sql+=`DO $logo$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.cafe_settings WHERE cafe_id=${q(b.cafeId)}) THEN RAISE EXCEPTION 'Brand settings missing';END IF; IF EXISTS(SELECT 1 FROM public.cafe_settings WHERE cafe_id=${q(b.cafeId)} AND ((logo_storage_path IS NOT NULL AND logo_storage_path IS DISTINCT FROM ${q(b.logoPath)}) OR logo_url IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.cafe_custom_identity WHERE cafe_id=${q(b.cafeId)} AND (logo_storage_path IS DISTINCT FROM ${q(b.logoPath)} OR logo_url IS NOT NULL OR palette IS DISTINCT FROM ${literal(b.palette)})) THEN RAISE EXCEPTION 'Existing identity differs; preserve owner changes';END IF; END $logo$;\n`;
    sql+=`UPDATE public.cafe_settings SET logo_storage_path=${q(b.logoPath)},updated_at=now() WHERE cafe_id=${q(b.cafeId)} AND logo_storage_path IS DISTINCT FROM ${q(b.logoPath)};\n`+insert('public.cafe_custom_identity',{cafe_id:b.cafeId,logo_storage_path:b.logoPath,logo_url:null,palette:b.palette}).replace(/;$/,' ON CONFLICT(cafe_id) DO NOTHING;')+'\n';
  }
  sql+=`DO $verify$ DECLARE actual jsonb;BEGIN ${snapshot} INTO actual; IF actual IS DISTINCT FROM(SELECT snapshot FROM five_before) THEN RAISE EXCEPTION 'Protected data changed';END IF; IF EXISTS(SELECT cafe_id,to_jsonb(s)-'logo_storage_path'-'updated_at' FROM public.cafe_settings s WHERE cafe_id IN(${ids.map(q).join(',')}) EXCEPT SELECT cafe_id,payload FROM five_settings_before) THEN RAISE EXCEPTION 'Non-logo settings changed';END IF; IF(SELECT count(*) FROM public.menu_products WHERE cafe_id IN(${ids.map(q).join(',')}) AND available AND price>0 AND image_storage_path IS NOT NULL)<>142 THEN RAISE EXCEPTION 'Public catalog count or images differ';END IF;END $verify$;\nCOMMIT;\n`;
  fs.writeFileSync(`${dir}/import.sql`,sql);fs.writeFileSync(`${dir}/import-rollback.sql`,sql.replace(/COMMIT;\s*$/,'ROLLBACK;'));
  const body=sql.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''),md5=crypto.createHash('md5').update(sql).digest('hex');
  const twice=`${body}\nDROP TABLE five_before,five_settings_before,five_expected_categories,five_expected_products,five_expected_programs,five_expected_experiences;\n${body}`;
  fs.writeFileSync(`${dir}/full-rollback.sql`,`BEGIN;${twice}\nSET LOCAL ROLE anon;DO $anon$ BEGIN IF(SELECT count(*) FROM public.menu_products WHERE cafe_id IN(${ids.map(q).join(',')}))<>142 THEN RAISE EXCEPTION 'Anonymous menu visibility failed';END IF;IF(SELECT count(*) FROM public.cafe_loyalty_programs WHERE cafe_id IN(${ids.map(q).join(',')}))<>5 THEN RAISE EXCEPTION 'Anonymous loyalty visibility failed';END IF;END $anon$;RESET ROLE;ROLLBACK;SELECT 'PASS repeat import, public catalog, loyalty and preserved data; rolled back' result;`);
  if(migration) {
    const migrationPath=`supabase/migrations/${migration}.sql`;assert(fs.existsSync(migrationPath),'Create migration through Supabase CLI first');
    if(fs.existsSync(`${dir}/applied.json`))assert.equal(fs.readFileSync(migrationPath,'utf8'),sql,'Applied migration is immutable');
    fs.writeFileSync(migrationPath,sql);
    const version=migration.split('_')[0];fs.writeFileSync(`${dir}/apply.sql`,`BEGIN;DO $history$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=${q(version)} AND md5(array_to_string(statements,E'\\n')) IS DISTINCT FROM ${q(md5)}) THEN RAISE EXCEPTION 'Migration history differs';END IF;END $history$;\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES(${q(version)},'five_restaurants_catalog_loyalty',ARRAY[${q(sql)}]) ON CONFLICT(version) DO NOTHING;COMMIT;`);
  }
  console.log(JSON.stringify({mode:upload?'Immutable media uploaded; database NOT applied':'Prepared; database NOT applied',products:rows.products.length,active:142,categories:19,assets:Object.keys(assets).length,migration:migration||null,md5}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
