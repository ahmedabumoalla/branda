// Replace only Dabab's current catalog, using the reviewed PDF and complete new media.
// Keeps all loyalty, customer, order, financial, subscription and wallet records intact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import WebSocket from 'next/dist/compiled/ws/index.js';
const sourceFile='data/imports/dabab-pdf-20261105.json',dir='output/dabab-refresh';
const sourceBytes=fs.readFileSync(sourceFile),source=JSON.parse(sourceBytes),brand=source.brands[0];
const schema=JSON.parse(fs.readFileSync(`${dir}/schema.json`,'utf8').replace(/^\uFEFF/,'' )).rows[0].inspection;
const before=JSON.parse(fs.readFileSync(`${dir}/before-private.json`,'utf8').replace(/^\uFEFF/,'' )).rows[0].backup;
const assetFile=`${dir}/assets-manifest.json`,manifest=JSON.parse(fs.readFileSync(assetFile,'utf8'));
const migrationName='20261105122133_dabab_pdf_catalog_replacement',migrationFile=`supabase/migrations/${migrationName}.sql`;
const upload=process.argv.includes('--upload'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const q=v=>v==null?'NULL':typeof v==='boolean'||typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const lit=v=>v!=null&&typeof v==='object'?`${q(JSON.stringify(v))}::jsonb`:q(v);
const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(lit).join(',')});`;
const uuid=value=>{const h=sha(`${brand.importKey}:${value}`);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const cafe='3813425d-db13-4d30-8b82-9d41aad12e36',scope=`cafe_id=${q(cafe)}`;
const assets={};let db;
async function read(query){const {data,error}=await query;if(error)throw Error(error.message);return data;}
async function media(entry,key,logo=false){
 assert(entry&&entry.localPath&&/^[0-9a-f]{64}$/.test(entry.sha256),`Reviewed file/hash missing: ${key}`);
 const absolute=path.resolve(entry.localPath);assert(absolute.startsWith(path.resolve(process.cwd())+path.sep),'Asset outside workspace');
 const original=fs.readFileSync(absolute);assert.equal(sha(original),entry.sha256,`Changed source asset: ${key}`);
 const metadata=await sharp(original).metadata();assert(metadata.width>=256&&metadata.height>=256,`Image too small: ${key}`);
 const bytes=await sharp(original).rotate().resize({width:logo?1000:1400,height:logo?1000:1400,fit:'inside',withoutEnlargement:true}).webp(logo?{lossless:true}:{quality:88}).toBuffer();
 const hash=sha(bytes),bucket=logo?'cafe-logos':'menu-products',target=`${cafe}/${logo?'identity':uuid(`product/${key}`)}/${brand.importKey}-${hash.slice(0,16)}.webp`;
 const optimizedPath=`${dir}/optimized/${key}.webp`;fs.mkdirSync(path.dirname(optimizedPath),{recursive:true});fs.writeFileSync(optimizedPath,bytes);
 if(upload){
   const current=await db.storage.from(bucket).download(target);
   if(!current.error)assert(Buffer.from(await current.data.arrayBuffer()).equals(bytes),'Immutable asset differs');
   else {assert(['400','404'].includes(String(current.error.statusCode)),'Cannot inspect private object');const {error}=await db.storage.from(bucket).upload(target,bytes,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});if(error)throw Error(error.message);}
 }
 assets[key]={bucket,path:target,optimizedPath,sha256:hash,sourceSha256:entry.sha256,provenance:entry.provenance??null,bytes:bytes.length};return target;
}
const protectedTables=[...new Set(['cafes','subscriptions','brand_feature_overrides','customer_profiles','loyalty_cards','loyalty_activity_events','loyalty_card_events','customer_reward_instances','customer_reward_redemptions','cafe_loyalty_programs','cafe_loyalty_experience','wallet_passes','wallet_notification_jobs','orders',...schema.foreignKeys.map(f=>f.table)])].filter(t=>t!=='menu_products');
const outsideTables=['menu_products','menu_categories','cafe_settings','cafe_custom_identity'];
const snapshot=`SELECT jsonb_build_object(${[...protectedTables.map(t=>`${q(t)},(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public.${t} t)`),...outsideTables.map(t=>`${q('other_'+t)},(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public.${t} t WHERE cafe_id<>${q(cafe)})`)].join(',')})`;
const foreignSql=`SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'target',c.confrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid),'deleteAction',c.confdeltype) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_constraint c WHERE c.contype='f' AND c.confrelid IN('public.menu_products'::regclass,'public.menu_categories'::regclass)`;
(async()=>{
 assert.equal(source.brands.length,1);assert.equal(brand.cafeId,cafe);assert.equal(brand.slug,'brand-8ad185ee82e3');assert.equal(brand.importKey,'dabab-pdf-20261105');
 assert.equal(sha(fs.readFileSync(source.sourceFile)),source.sourceSha256,'PDF changed since review');
 assert.equal(brand.products.length,28);assert.equal(brand.categories.length,1);assert.equal(new Set(brand.products.map(p=>p.sourceId)).size,28);
 assert(brand.products.every(p=>/^[a-z0-9-]+$/.test(p.sourceId)),'Invalid source identifier');
 assert(brand.products.every(p=>p.available===true&&p.priceStatus==='visually-verified'&&Number.isFinite(p.price)&&p.price>0&&p.calories===null&&p.sourceSha256===source.sourceSha256),'PDF review incomplete');
 assert.equal(Object.keys(manifest.products).length,28,'Exactly one reviewed generated image per product required');
 assert(brand.products.every(p=>manifest.products[p.sourceId]),'Missing generated product photo');
 assert.equal(new Set(Object.values(manifest.products).map(a=>a.sha256)).size,28,'Distinct product photos required');
 for(const e of [manifest.logo,...Object.values(manifest.products)])assert.equal(sha(fs.readFileSync(e.localPath)),e.sha256,'Asset changed before preparation');
 const palette={...manifest.palette,button:manifest.palette.button??manifest.palette.primary};
 for(const key of ['primary','secondary','accent','background','text','button'])assert(/^#[a-fA-F0-9]{6}$/.test(palette[key]),`Invalid palette ${key}`);
 assert.deepEqual(before.products.length,104);assert.deepEqual(before.categories.length,17);
 for(const [name,count] of Object.entries(before.foreignReferences))assert.equal(count,name==='menu_products_category_id_fkey'?104:0,'Historical references require a separately reviewed preservation plan');
 assert(fs.existsSync(migrationFile),'CLI-created migration required');
 if(upload){
   nextEnv.loadEnvConfig(process.cwd());
   db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:WebSocket}});
   for(const bucket of ['cafe-logos','menu-products'])assert.equal((await read(db.storage.getBucket(bucket))).public,false,'Private bucket required');
 }
 const logoPath=await media(manifest.logo,'logo',true);
 const categories=brand.categories.map((name,index)=>({id:uuid(`category/${index}`),cafe_id:cafe,branch_id:null,name,description:null,sort_order:index,visible:true})),products=[];
 for(const [index,p] of brand.products.entries()){
   const category=categories.find(c=>c.name===p.category);assert(category);assert(Array.isArray(p.variants));
   for(const v of p.variants)assert(v.name&&Number.isFinite(v.price)&&v.price>0,'Invalid source price choice');
   products.push({id:uuid(`product/${p.sourceId}`),cafe_id:cafe,branch_id:null,category_id:category.id,name:p.name,description:[p.description?.trim(),'صورة توضيحية'].filter(Boolean).join('\n'),price:p.price,
     price_options:`{${[...new Set(p.variants.map(v=>v.price))].sort((a,b)=>a-b).join(',')}}`,calories:null,sort_order:index,available:true,catalog_kind:'product',
     image_storage_path:await media(manifest.products[p.sourceId],p.sourceId),image_url:null,gallery_storage_paths:'{}',
     commerce_details:p.variants.length?{options:p.variants.map((v,i)=>({id:`variant-${i+1}`,label:v.name,price:v.price,available:true}))}:{}});
 }
 assert(products.every(p=>!before.products.some(old=>old.id===p.id)),'Replacement must use new product IDs');
 let sql=`-- User-authorized full Dabab catalog replacement exclusively from the reviewed PDF\n-- Source SHA256: ${source.sourceSha256}\n-- Loyalty rules, customers, cards, orders, finance and wallet queues are preserved\nBEGIN ISOLATION LEVEL REPEATABLE READ;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='90s';\nLOCK TABLE public.menu_categories,public.menu_products IN SHARE ROW EXCLUSIVE MODE;\n`;
 sql+=`DO $scope$ BEGIN PERFORM 1 FROM public.cafes WHERE id=${q(cafe)} AND slug=${q(brand.slug)} AND status='active' AND is_public AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Dabab identity changed';END IF;PERFORM 1 FROM public.menu_products WHERE ${scope} FOR UPDATE;PERFORM 1 FROM public.menu_categories WHERE ${scope} FOR UPDATE;PERFORM 1 FROM public.cafe_settings WHERE ${scope} FOR UPDATE;PERFORM 1 FROM public.cafe_custom_identity WHERE ${scope} FOR UPDATE;IF NOT platform_access_private.service_enabled(${q(cafe)},'menu') THEN RAISE EXCEPTION 'Menu service unavailable';END IF;END $scope$;\n`;
 sql+=`DO $guards$ BEGIN IF(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'')) FROM public.menu_products p WHERE ${scope}) IS DISTINCT FROM ${q(before.hashes.products)} OR(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id)::text,'')) FROM public.menu_categories c WHERE ${scope}) IS DISTINCT FROM ${q(before.hashes.categories)} THEN RAISE EXCEPTION 'Catalog changed since reviewed backup';END IF;IF(${foreignSql}) IS DISTINCT FROM ${lit(schema.foreignKeys)} THEN RAISE EXCEPTION 'Catalog foreign keys changed';END IF;`;
 for(const f of schema.foreignKeys.filter(f=>f.table!=='menu_products')){
   const match=f.definition.match(/^FOREIGN KEY \((\w+)\) REFERENCES (\w+)\(id\)/);assert(match&&/^\w+$/.test(f.table));
   sql+=`IF EXISTS(SELECT 1 FROM public.${f.table} r JOIN public.${match[2]} p ON r.${match[1]}=p.id WHERE p.cafe_id=${q(cafe)}) THEN RAISE EXCEPTION ${q(`Historical reference appeared: ${f.table}`)};END IF;`;
 }
 sql+=`IF NOT EXISTS(SELECT 1 FROM public.cafe_settings WHERE ${scope} AND logo_storage_path IS NOT DISTINCT FROM ${q(before.settings.logo_storage_path)} AND logo_url IS NOT DISTINCT FROM ${q(before.settings.logo_url)}) OR NOT EXISTS(SELECT 1 FROM public.cafe_custom_identity WHERE ${scope} AND logo_storage_path IS NOT DISTINCT FROM ${q(before.identity.logo_storage_path)} AND logo_url IS NOT DISTINCT FROM ${q(before.identity.logo_url)} AND palette IS NOT DISTINCT FROM ${lit(before.identity.palette)} AND featured_category_id IS NULL) THEN RAISE EXCEPTION 'Dabab identity edited since review';END IF;END $guards$;\n`;
 sql+=`CREATE TEMP TABLE dabab_refresh_before ON COMMIT DROP AS ${snapshot} AS snapshot;\nCREATE TEMP TABLE dabab_refresh_settings ON COMMIT DROP AS SELECT to_jsonb(s)-'logo_storage_path'-'logo_url'-'updated_at' AS data FROM public.cafe_settings s WHERE ${scope};\nCREATE TEMP TABLE dabab_refresh_identity ON COMMIT DROP AS SELECT to_jsonb(i)-'logo_storage_path'-'logo_url'-'palette'-'updated_at' AS data FROM public.cafe_custom_identity i WHERE ${scope};\n`;
 for(const a of Object.values(assets))sql+=`DO $asset$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=${q(a.bucket)} AND name=${q(a.path)}) THEN RAISE EXCEPTION 'Reviewed private asset missing';END IF;END $asset$;\n`;
 for(const [table,rows,key] of [['menu_categories',categories,'categories'],['menu_products',products,'products']]){
   sql+=`CREATE TEMP TABLE dabab_refresh_expected_${key} ON COMMIT DROP AS SELECT * FROM public.${table} WITH NO DATA;\n${rows.map(row=>insert(`dabab_refresh_expected_${key}`,row)).join('\n')}\n`;
 }
 sql+=`DELETE FROM public.menu_products WHERE ${scope};\nDELETE FROM public.menu_categories WHERE ${scope};\n`;
 for(const [table,rows,key] of [['menu_categories',categories,'categories'],['menu_products',products,'products']]){const columns=Object.keys(rows[0]).join(',');sql+=`INSERT INTO public.${table}(${columns}) SELECT ${columns} FROM dabab_refresh_expected_${key};\n`;}
 sql+=`UPDATE public.cafe_settings SET logo_storage_path=${q(logoPath)},logo_url=NULL WHERE ${scope};\nUPDATE public.cafe_custom_identity SET logo_storage_path=${q(logoPath)},logo_url=NULL,palette=${lit(palette)} WHERE ${scope};\n`;
 sql+=`DO $verify$ DECLARE actual jsonb;BEGIN ${snapshot} INTO actual;IF actual IS DISTINCT FROM(SELECT snapshot FROM dabab_refresh_before) THEN RAISE EXCEPTION 'Protected records changed';END IF;IF(SELECT to_jsonb(s)-'logo_storage_path'-'logo_url'-'updated_at' FROM public.cafe_settings s WHERE ${scope}) IS DISTINCT FROM(SELECT data FROM dabab_refresh_settings) OR(SELECT to_jsonb(i)-'logo_storage_path'-'logo_url'-'palette'-'updated_at' FROM public.cafe_custom_identity i WHERE ${scope}) IS DISTINCT FROM(SELECT data FROM dabab_refresh_identity) THEN RAISE EXCEPTION 'Unrelated identity settings changed';END IF;`;
 for(const [table,rows,key] of [['menu_categories',categories,'categories'],['menu_products',products,'products']]){const columns=Object.keys(rows[0]).join(',');sql+=`IF(SELECT count(*) FROM public.${table} WHERE ${scope})<>${rows.length} OR EXISTS(SELECT ${columns} FROM public.${table} WHERE ${scope} EXCEPT SELECT ${columns} FROM dabab_refresh_expected_${key}) OR EXISTS(SELECT ${columns} FROM dabab_refresh_expected_${key} EXCEPT SELECT ${columns} FROM public.${table} WHERE ${scope}) THEN RAISE EXCEPTION 'Replacement ${key} differs from PDF';END IF;`;}
 sql+=`IF EXISTS(SELECT 1 FROM public.menu_products WHERE ${scope} AND id IN(${before.products.map(p=>q(p.id)).join(',')})) THEN RAISE EXCEPTION 'Old catalog residue';END IF;END $verify$;\nCOMMIT;\n`;
 if(fs.existsSync(`${dir}/applied.json`))assert.equal(fs.readFileSync(migrationFile,'utf8'),sql,'Applied migration is immutable');
 fs.writeFileSync(migrationFile,sql);
 const body=sql.replace(/^BEGIN ISOLATION LEVEL REPEATABLE READ;$/m,'').replace(/^COMMIT;$/m,''),sourceMd5=crypto.createHash('md5').update(sql).digest('hex');
 fs.writeFileSync(`${dir}/rollback.sql`,sql.replace(/COMMIT;\s*$/,"SELECT 'PASS exact PDF catalog, private assets, protected rows and current loyalty; rolled back' AS result;ROLLBACK;"));
 fs.writeFileSync(`${dir}/apply.sql`,`BEGIN ISOLATION LEVEL REPEATABLE READ;\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261105122133','dabab_pdf_catalog_replacement',ARRAY[${q(sql)}]);COMMIT;\n`);
 const plan={at:new Date().toISOString(),sourceFile,sourceSha256:sha(sourceBytes),pdfSha256:source.sourceSha256,assetManifestSha256:sha(fs.readFileSync(assetFile)),migration:migrationName,migrationMd5:sourceMd5,brand:{cafeId:cafe,slug:brand.slug,logoPath,palette},assets,rows:{categories,products},beforeHashes:before.hashes,protectedTables,loyaltyUnchanged:true,messagesSent:0,passesIssued:0,mediaUploaded:upload};
 fs.writeFileSync(`${dir}/import-plan.json`,JSON.stringify(plan,null,2));
 console.log(JSON.stringify({prepared:true,mediaUploaded:upload,products:products.length,categories:categories.length,assets:Object.keys(assets).length,oldProducts:before.products.length,migrationMd5:sourceMd5,databaseApplied:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
