// Validate reviewed source/assets, then compile. Upload is explicit; no database apply here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {buildDababBranches,CAFE_ID,MIGRATION,q,sha} from './dabab-branches-sql.mjs';
const dir='output/dabab-branches',read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const sourceFile='data/imports/dabab-branches-20261106.json',manifestFile=`${dir}/assets-manifest.json`,migrationFile=`supabase/migrations/${MIGRATION}.sql`;
const source=read(sourceFile),backup=read(`${dir}/backup-result.json`).data.rows[0].backup,manifest=read(manifestFile),upload=process.argv.includes('--upload');
assert.equal(sha(fs.readFileSync(sourceFile)),sha(fs.readFileSync(`${dir}/catalog.json`)),'Versioned source differs from reviewed source');
assert(fs.existsSync(migrationFile),'CLI-created migration required');
assert.equal(Object.keys(manifest.products).length,79,'Complete reviewed media required');
let admin;if(upload){nextEnv.loadEnvConfig(process.cwd());assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,'kpguwjfkkylrdlvzeezz.supabase.co','Unexpected project');admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const result=await admin.storage.getBucket('menu-products');assert.ifError(result.error);assert.equal(result.data.public,false);const tenant=await admin.from('cafes').select('id,slug,status').eq('id',CAFE_ID).is('deleted_at',null).single();assert.ifError(tenant.error);assert.deepEqual(tenant.data,{id:CAFE_ID,slug:'brand-8ad185ee82e3',status:'active'});}
const assets={};
for(const p of source.products){
 const entry=manifest.products[p.sourceId];assert(entry&&typeof entry.generated==='boolean'&&entry.provenance,'Reviewed image metadata required');
 const absolute=path.resolve(entry.localPath);assert(absolute.startsWith(path.resolve(process.cwd())+path.sep),'Media must be inside workspace');
 const bytes=fs.readFileSync(absolute);assert.equal(sha(bytes),entry.sha256,'Reviewed image changed');
 const info=await sharp(bytes).metadata();assert.equal(info.format,'webp');assert(info.width>=256&&info.height>=256);
 const target=`${CAFE_ID}/dabab-branches/${p.sourceId}.webp`;
 if(upload){const previous=await admin.storage.from('menu-products').download(target);if(!previous.error)assert.equal(sha(Buffer.from(await previous.data.arrayBuffer())),entry.sha256,'Immutable image differs');else{assert(['400','404'].includes(String(previous.error.statusCode)));const result=await admin.storage.from('menu-products').upload(target,bytes,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});assert.ifError(result.error);const persisted=await admin.storage.from('menu-products').download(target);assert.ifError(persisted.error);assert.equal(sha(Buffer.from(await persisted.data.arrayBuffer())),entry.sha256,'Uploaded image readback differs');}}
 assets[p.sourceId]={bucket:'menu-products',path:target,localPath:entry.localPath,sha256:entry.sha256,bytes:bytes.length,generated:entry.generated,provenance:entry.provenance};
}
const compiled=buildDababBranches({source,backup,assets});
if(fs.existsSync(`${dir}/applied.json`))assert.equal(fs.readFileSync(migrationFile,'utf8'),compiled.sql,'Applied migration is immutable');
fs.writeFileSync(migrationFile,compiled.sql);
const migrationMd5=crypto.createHash('md5').update(compiled.sql).digest('hex'),body=compiled.sql.replace(/^BEGIN ISOLATION LEVEL REPEATABLE READ;$/m,'').replace(/^COMMIT;$/m,'');
const proof=`SELECT jsonb_build_object('result','PASS','elapsedMs',round(extract(epoch FROM clock_timestamp()-transaction_timestamp())*1000),'branches',3,'barProducts',28,'coffeeProducts',79,'hospitalProducts',79,'protectedSnapshot',(SELECT snapshot FROM dabab_branches_before),'programCount',(SELECT count(*) FROM public.cafe_loyalty_programs WHERE cafe_id=${q(CAFE_ID)}),'cards',(SELECT count(*) FROM public.loyalty_cards WHERE cafe_id=${q(CAFE_ID)}),'customers',(SELECT count(*) FROM public.customer_profiles WHERE cafe_id=${q(CAFE_ID)})) AS verification;`;
const ownerPreview=`DO $owner$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT owner_user_id::text FROM public.cafes WHERE id=${q(CAFE_ID)}),true);END $owner$;
SET LOCAL ROLE authenticated;
DO $owner$ DECLARE changed integer;BEGIN
 IF(SELECT count(*) FROM public.branches WHERE cafe_id=${q(CAFE_ID)})<>3 OR(SELECT count(*) FROM public.menu_products WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(compiled.branches[1].id)})<>79 THEN RAISE EXCEPTION 'Owner branch menu not accessible';END IF;
 UPDATE public.menu_products SET price=price WHERE id=${q(compiled.products[0].id)} AND cafe_id=${q(CAFE_ID)};GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Owner branch product edit denied';END IF;
END $owner$;
RESET ROLE;
DO $anonymous$ BEGIN PERFORM set_config('request.jwt.claim.sub','',true);END $anonymous$;
SET LOCAL ROLE anon;
DO $anonymous$ BEGIN
 IF(SELECT count(*) FROM public.menu_products WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(compiled.branches[1].id)})<>77 OR(SELECT count(*) FROM public.menu_products WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(compiled.branches[2].id)})<>77 THEN RAISE EXCEPTION 'Public branch scope or unpriced exclusion failed';END IF;
END $anonymous$;
RESET ROLE;`;
fs.writeFileSync(`${dir}/rollback.sql`,compiled.sql.replace(/COMMIT;\s*$/,`${ownerPreview}\n${proof}\nROLLBACK;\n`));
fs.writeFileSync(`${dir}/apply.sql`,`BEGIN ISOLATION LEVEL REPEATABLE READ;\n${body}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261106090916','dabab_three_branch_catalog',ARRAY[${q(compiled.sql)}]);\n${proof}\nCOMMIT;\n`);
fs.writeFileSync(`${dir}/verify.sql`,`BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object('at',clock_timestamp(),'history',(SELECT jsonb_build_object('version',version,'name',name,'md5',md5(statements[1])) FROM supabase_migrations.schema_migrations WHERE version='20261106090916'),
 'brand',(SELECT jsonb_build_object('name',name,'slug',slug,'status',status) FROM public.cafes WHERE id=${q(CAFE_ID)}),
 'branches',(SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'slug',b.menu_slug,'primary',b.is_primary,'products',(SELECT count(*) FROM public.menu_products p WHERE p.cafe_id=b.cafe_id AND p.branch_id=b.id),'publicProducts',(SELECT count(*) FROM public.menu_products p WHERE p.cafe_id=b.cafe_id AND p.branch_id=b.id AND p.available AND p.deleted_at IS NULL),'categories',(SELECT count(*) FROM public.menu_categories c WHERE c.cafe_id=b.cafe_id AND c.branch_id=b.id)) ORDER BY b.sort_order) FROM public.branches b WHERE b.cafe_id=${q(CAFE_ID)}),
 'protectedSnapshot',(${compiled.snapshot}),
 'programCount',(SELECT count(*) FROM public.cafe_loyalty_programs WHERE cafe_id=${q(CAFE_ID)}),'cards',(SELECT count(*) FROM public.loyalty_cards WHERE cafe_id=${q(CAFE_ID)}),'customers',(SELECT count(*) FROM public.customer_profiles WHERE cafe_id=${q(CAFE_ID)}),
 'guardTriggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'functionMd5',md5(pg_get_functiondef(tgfoid))) ORDER BY tgname) FROM pg_trigger WHERE tgname IN('menu_product_branch_category','menu_category_branch_move')),
 'rls',(SELECT jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity) ORDER BY relname) FROM pg_class WHERE oid IN('public.branches'::regclass,'public.menu_categories'::regclass,'public.menu_products'::regclass))) AS verification;
ROLLBACK;\n`);
const plan={at:new Date().toISOString(),migration:MIGRATION,migrationMd5,sourceFile,sourceSha256:sha(fs.readFileSync(sourceFile)),assetManifestSha256:sha(fs.readFileSync(manifestFile)),cafeId:CAFE_ID,assets,branches:compiled.branches,rows:{categories:compiled.categories,products:compiled.products},bar:{products:backup.products,categories:backup.categories},beforeHashes:backup.hashes,protectedTables:compiled.protectedTables,extraReferences:compiled.extraReferences,mediaUploaded:upload};
fs.writeFileSync(`${dir}/import-plan.json`,JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({prepared:true,mediaUploaded:upload,migrationMd5,branches:3,newProducts:158,barProductsPreserved:28,newCategories:34,assets:79,databaseApplied:false}));
