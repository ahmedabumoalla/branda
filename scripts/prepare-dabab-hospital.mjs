// Compile the reviewed hospital-only catalog. No uploads or database writes occur here.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export const CAFE_ID='3813425d-db13-4d30-8b82-9d41aad12e36';
export const HOSPITAL_ID='5924245c-a143-4170-8699-79fd3c279d92';
export const MIGRATION='20261108201352_dabab_hospital_pdf_catalog';
export const DIR='output/dabab-hospital';
export const SOURCE='data/imports/dabab-hospital-20261108.json';
export const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
export const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
export const q=value=>value==null?'NULL':typeof value==='number'||typeof value==='boolean'?String(value):`'${String(value).replaceAll("'","''")}'`;
const lit=value=>value!==null&&typeof value==='object'?`${q(JSON.stringify(value))}::jsonb`:q(value);
export const hospitalId=key=>{const h=sha(`dabab-hospital-20261108/${key}`);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(lit).join(',')});`;
const hashQuery=(table,where='')=>`(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public.${table} t ${where})`;
export const relationState=`SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE conrelid IN('public.branches'::regclass,'public.menu_categories'::regclass,'public.menu_products'::regclass)`;
const protectedNames=['branches','cafe_settings','cafe_custom_identity','cafe_loyalty_experience','cafe_loyalty_programs','customer_profiles','loyalty_accounts','loyalty_cards','loyalty_transactions','customer_reward_instances','customer_reward_redemptions','subscriptions','wallet_passes','wallet_notification_jobs','bf_documents','bf_document_lines','bf_movements','bf_journal','bf_stock','bf_items','bf_item_product_links','bf_shifts','orders','offers'];

export function buildHospital({source,backup,assets}){
 assert.equal(source.reviewComplete,true,'Source review incomplete');
 assert.equal(source.products.length,111,'Expected PDF 24 drinks,10 croissants,77 daily entries');
 assert.equal(source.categories.length,9,'Expected two permanent and seven day categories');
 assert.equal(new Set(source.products.map(p=>p.sourceId)).size,source.products.length);
 assert.equal(new Set(source.categories.map(c=>c.key)).size,source.categories.length);
 assert(backup.branches.some(b=>b.id===HOSPITAL_ID&&b.menu_slug==='hospital'&&b.cafe_id===CAFE_ID&&b.active&&!b.deleted_at));
 assert(backup.rls.every(x=>x.enabled));assert.equal(backup.bucket.public,false);
 const categories=source.categories.map((c,i)=>({id:hospitalId(`category/${c.key}`),cafe_id:CAFE_ID,branch_id:HOSPITAL_ID,name:c.name,description:null,sort_order:c.sortOrder??i,visible:true}));
 const assetList=new Map();
 const products=source.products.map((p,i)=>{
  assert(/^[a-z0-9-]+$/.test(p.sourceId),'Stable safe source ID required');
  assert(typeof p.name==='string'&&p.name.trim()&&typeof p.portion==='string','Reviewed source name and portion required');
  assert(Number.isFinite(p.priceMin)&&Number.isFinite(p.priceMax)&&p.priceMin>0&&p.priceMax>=p.priceMin,'Invalid PDF price range');
  const c=categories[source.categories.findIndex(c=>c.key===p.categoryKey)],a=assets[p.imageKey];
  assert(c,'Unknown source category');assert(a,'Missing reviewed image');
  assert.equal(a.bucket,'menu-products');assert(a.path.startsWith(`${CAFE_ID}/`)&&!a.path.includes('..'),'Cross-tenant image');assert(/^[a-f0-9]{64}$/.test(a.sha256));
  assetList.set(a.path,a);
  return {id:hospitalId(`product/${p.sourceId}`),cafe_id:CAFE_ID,branch_id:HOSPITAL_ID,category_id:c.id,name:p.name,description:p.portion,price:p.priceMin,
   price_options:'{}',commerce_details:{menuPriceRange:{min:p.priceMin,max:p.priceMax}},calories:null,sort_order:i,available:true,catalog_kind:'product',image_storage_path:a.path,image_url:null,gallery_storage_paths:'{}'};
 });
 const oldProducts=backup.products.filter(p=>p.branch_id===HOSPITAL_ID),oldCategories=backup.categories.filter(c=>c.branch_id===HOSPITAL_ID);
 assert.equal(oldProducts.filter(p=>!p.deleted_at).length,79,'Hospital baseline changed');assert.equal(oldCategories.filter(c=>!c.deleted_at).length,17);
 const protectedTables=protectedNames.filter(t=>backup.protectedTables.includes(t));
 const extraReferences=backup.references.filter(r=>!['menu_products','menu_categories'].includes(r.table)&&!protectedTables.includes(r.table));
 const referenceSnapshots=extraReferences.map(r=>{assert(/^\w+$/.test(r.table));const match=r.definition.match(/^FOREIGN KEY \((\w+)\) REFERENCES (\w+)\(id\)/);assert(match);return {key:r.name,table:r.table,column:match[1],target:match[2]};});
 const snapshot=`SELECT jsonb_object_agg(k,v) FROM(VALUES ${[
  ...protectedTables.map(t=>`(${q(t)},${hashQuery(t,`WHERE cafe_id=${q(CAFE_ID)}`)})`),
  `('brand',${hashQuery('cafes',`WHERE id=${q(CAFE_ID)}`)})`,
  ...['menu_products','menu_categories'].map(t=>`(${q(`untouched_${t}`)},${hashQuery(t,`WHERE branch_id IS DISTINCT FROM ${q(HOSPITAL_ID)}::uuid`)})`),
  ...referenceSnapshots.map(r=>`(${q(r.key)},${hashQuery(r.table,`WHERE ${r.column} IN(SELECT id FROM public.${r.target} WHERE cafe_id=${q(CAFE_ID)})`)})`)
 ].join(',')}) AS h(k,v)`;
 const expectedProjection=(rows,alias)=>`jsonb_build_object(${Object.keys(rows[0]).flatMap(k=>[q(k),`${alias}.${k}`]).join(',')})`;
 let sql=`-- PDF-approved hospital branch catalog only; no schema, identity or loyalty changes
-- Restore by a reviewed forward migration from ignored inspection.json; never delete historical rows
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
LOCK TABLE public.menu_products,public.menu_categories IN SHARE ROW EXCLUSIVE MODE;
DO $scope$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=${q(CAFE_ID)} AND slug='brand-8ad185ee82e3' AND status='active' AND is_public AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Dabab identity changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=${q(HOSPITAL_ID)} AND cafe_id=${q(CAFE_ID)} AND menu_slug='hospital' AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Hospital branch changed';END IF;
 IF NOT COALESCE(platform_access_private.service_enabled(${q(CAFE_ID)},'menu'),false) THEN RAISE EXCEPTION 'Menu service unavailable';END IF;
 IF(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM public.menu_products p WHERE cafe_id=${q(CAFE_ID)}) IS DISTINCT FROM ${q(backup.hashes.products)} OR(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id)::text,'')) FROM public.menu_categories c WHERE cafe_id=${q(CAFE_ID)}) IS DISTINCT FROM ${q(backup.hashes.categories)} THEN RAISE EXCEPTION 'Reviewed Dabab catalog changed';END IF;
 IF(${relationState}) IS DISTINCT FROM ${lit(backup.constraints)} THEN RAISE EXCEPTION 'Catalog constraints changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='menu-products' AND public=false) THEN RAISE EXCEPTION 'Private menu bucket required';END IF;
END $scope$;
`;
 for(const t of backup.triggers.filter(t=>!t.name.startsWith('admin_audit')))sql+=`DO $trigger$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=${q(`public.${t.table}`)}::regclass AND tgname=${q(t.name)} AND tgenabled='O' AND md5(pg_get_functiondef(tgfoid))=${q(t.functionMd5)}) THEN RAISE EXCEPTION 'Catalog guard changed';END IF;END $trigger$;\n`;
 sql+=`CREATE TEMP TABLE hospital_before ON COMMIT DROP AS SELECT (${snapshot}) AS snapshot;
CREATE TEMP TABLE hospital_previous_products ON COMMIT DROP AS SELECT * FROM public.menu_products WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(HOSPITAL_ID)};
CREATE TEMP TABLE hospital_previous_categories ON COMMIT DROP AS SELECT * FROM public.menu_categories WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(HOSPITAL_ID)};
`;
 for(const a of assetList.values())sql+=`DO $asset$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='menu-products' AND name=${q(a.path)}) THEN RAISE EXCEPTION 'Reviewed private image missing';END IF;END $asset$;\n`;
 for(const [table,rows] of [['menu_categories',categories],['menu_products',products]])sql+=`CREATE TEMP TABLE hospital_expected_${table} ON COMMIT DROP AS SELECT * FROM public.${table} WITH NO DATA;\n${rows.map(r=>insert(`hospital_expected_${table}`,r)).join('\n')}\n`;
 sql+=`UPDATE public.menu_products SET available=false,deleted_at=transaction_timestamp() WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(HOSPITAL_ID)} AND deleted_at IS NULL;
UPDATE public.menu_categories SET visible=false,deleted_at=transaction_timestamp() WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(HOSPITAL_ID)} AND deleted_at IS NULL;
${categories.map(r=>insert('public.menu_categories',r)).join('\n')}
${products.map(r=>insert('public.menu_products',r)).join('\n')}
DO $verify$ BEGIN
 IF(${snapshot}) IS DISTINCT FROM(SELECT snapshot FROM hospital_before) THEN RAISE EXCEPTION 'Protected records changed';END IF;
 IF EXISTS(SELECT 1 FROM hospital_previous_products b FULL JOIN public.menu_products p ON p.id=b.id WHERE b.id IS NOT NULL AND (p.id IS NULL OR (to_jsonb(b)-'available'-'deleted_at'-'updated_at') IS DISTINCT FROM(to_jsonb(p)-'available'-'deleted_at'-'updated_at') OR (b.deleted_at IS NULL AND(p.available OR p.deleted_at IS NULL)) OR(b.deleted_at IS NOT NULL AND(to_jsonb(b) IS DISTINCT FROM to_jsonb(p))))) THEN RAISE EXCEPTION 'Historical hospital product altered';END IF;
 IF EXISTS(SELECT 1 FROM hospital_previous_categories b FULL JOIN public.menu_categories c ON c.id=b.id WHERE b.id IS NOT NULL AND (c.id IS NULL OR (to_jsonb(b)-'visible'-'deleted_at'-'updated_at') IS DISTINCT FROM(to_jsonb(c)-'visible'-'deleted_at'-'updated_at') OR (b.deleted_at IS NULL AND(c.visible OR c.deleted_at IS NULL)) OR(b.deleted_at IS NOT NULL AND(to_jsonb(b) IS DISTINCT FROM to_jsonb(c))))) THEN RAISE EXCEPTION 'Historical hospital category altered';END IF;
`;
 for(const [table,rows] of [['menu_categories',categories],['menu_products',products]])sql+=` IF(SELECT jsonb_agg(${expectedProjection(rows,'p')} ORDER BY id) FROM public.${table} p WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(HOSPITAL_ID)} AND deleted_at IS NULL) IS DISTINCT FROM(SELECT jsonb_agg(${expectedProjection(rows,'p')} ORDER BY id) FROM hospital_expected_${table} p) THEN RAISE EXCEPTION 'Hospital ${table} differs from reviewed PDF';END IF;\n`;
 sql+=`END $verify$;
COMMIT;
`;
 return {sql,products,categories,snapshot,oldProducts,oldCategories,protectedTables,referenceSnapshots,assets:[...assetList.values()]};
}

export function prepare(){
 const source=read(SOURCE),backup=read(`${DIR}/inspection.json`).data.rows[0].inspection,manifest=read(`${DIR}/assets-manifest.json`),compiled=buildHospital({source,backup,assets:manifest.products});
 const migrationFile=`supabase/migrations/${MIGRATION}.sql`;
 assert(fs.existsSync(migrationFile),'CLI-created migration required');
 if(fs.existsSync(`${DIR}/db-apply-result.json`))assert.equal(fs.readFileSync(migrationFile,'utf8'),compiled.sql,'Applied migration is immutable');
 fs.writeFileSync(migrationFile,compiled.sql);
 const md5=crypto.createHash('md5').update(compiled.sql).digest('hex');
 const proof=`SELECT jsonb_build_object('result','PASS','at',clock_timestamp(),'protectedHashes',(SELECT snapshot FROM hospital_before),'activeProducts',${compiled.products.length},'categories',${compiled.categories.length},'retainedHistoricalProducts',${compiled.oldProducts.length}) AS verification;`;
 const ownerPreview=`DO $owner$ BEGIN PERFORM set_config('request.jwt.claim.sub',(SELECT owner_user_id::text FROM public.cafes WHERE id=${q(CAFE_ID)}),true);END $owner$;
SET LOCAL ROLE authenticated;
DO $owner$ DECLARE changed integer;BEGIN
 IF(SELECT count(*) FROM public.menu_products WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(HOSPITAL_ID)} AND deleted_at IS NULL)<>111 THEN RAISE EXCEPTION 'Owner hospital catalog unavailable';END IF;
 UPDATE public.menu_products SET price=price WHERE id=${q(compiled.products[0].id)} AND cafe_id=${q(CAFE_ID)};GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Owner hospital editing denied';END IF;
END $owner$;
RESET ROLE;
DO $anonymous$ BEGIN PERFORM set_config('request.jwt.claim.sub','',true);END $anonymous$;
SET LOCAL ROLE anon;
DO $anonymous$ BEGIN
 IF(SELECT count(*) FROM public.menu_products WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(HOSPITAL_ID)})<>111 THEN RAISE EXCEPTION 'Anonymous hospital visibility failed';END IF;
 IF(SELECT count(*) FROM public.menu_categories WHERE cafe_id=${q(CAFE_ID)} AND branch_id=${q(HOSPITAL_ID)})<>9 THEN RAISE EXCEPTION 'Anonymous hospital categories failed';END IF;
END $anonymous$;
RESET ROLE;`;
 fs.writeFileSync(`${DIR}/db-rollback.sql`,compiled.sql.replace(/COMMIT;\s*$/,()=>`${ownerPreview}\n${proof}\nROLLBACK;\n`));
 fs.writeFileSync(`${DIR}/db-apply.sql`,compiled.sql.replace(/COMMIT;\s*$/,()=>`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261108201352','dabab_hospital_pdf_catalog',ARRAY[${q(compiled.sql)}]);\n${proof}\nCOMMIT;\n`));
 fs.writeFileSync(`${DIR}/db-verify.sql`,`BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object('at',clock_timestamp(),'history',(SELECT jsonb_build_object('version',version,'md5',md5(statements[1])) FROM supabase_migrations.schema_migrations WHERE version='20261108201352'),'protectedHashes',(${compiled.snapshot}),'products',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.menu_products p WHERE cafe_id=${q(CAFE_ID)}),'categories',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.menu_categories c WHERE cafe_id=${q(CAFE_ID)})) AS verification;
ROLLBACK;\n`);
 fs.writeFileSync(`${DIR}/db-post-rollback.sql`,`BEGIN TRANSACTION READ ONLY;SELECT jsonb_build_object('products',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM public.menu_products p WHERE cafe_id=${q(CAFE_ID)}),'categories',(SELECT md5(coalesce(jsonb_agg(to_jsonb(c) ORDER BY id)::text,'')) FROM public.menu_categories c WHERE cafe_id=${q(CAFE_ID)})) AS hashes;ROLLBACK;\n`);
 const plan={at:new Date().toISOString(),migration:MIGRATION,migrationMd5:md5,sourceSha256:sha(fs.readFileSync(SOURCE)),manifestSha256:sha(fs.readFileSync(`${DIR}/assets-manifest.json`)),inspectionSha256:sha(fs.readFileSync(`${DIR}/inspection.json`)),products:compiled.products,categories:compiled.categories,assets:compiled.assets,protectedTables:compiled.protectedTables,referenceSnapshots:compiled.referenceSnapshots};
 fs.writeFileSync(`${DIR}/db-plan.json`,JSON.stringify(plan,null,2)+'\n');
 console.log(JSON.stringify({prepared:true,applied:false,migration:MIGRATION,md5,products:compiled.products.length,categories:compiled.categories.length,assets:compiled.assets.length,protectedTables:compiled.protectedTables.length}));
 return compiled;
}

export function verifyReadback(){
 const plan=read(`${DIR}/db-plan.json`),backup=read(`${DIR}/inspection.json`).data.rows[0].inspection;
 const evidence=read(`${DIR}/db-verify-result.json`),live=evidence.data.rows[0].verification;
 assert.equal(live.history?.version,'20261108201352','Migration history missing');
 assert.equal(live.history.md5,plan.migrationMd5,'Migration history differs');
 const expectedArray=value=>value==='{}'?[]:value;
 for(const [kind,rows] of [['products',plan.products],['categories',plan.categories]]){
  const active=live[kind].filter(p=>p.branch_id===HOSPITAL_ID&&!p.deleted_at);
  assert.equal(active.length,rows.length,'Live active count mismatch');
  for(const expected of rows){
   const actual=active.find(p=>p.id===expected.id);assert(actual,'Reviewed record missing');
   for(const [key,value] of Object.entries(expected))assert.deepEqual(actual[key],expectedArray(value),`Live ${kind}.${key} mismatch`);
  }
  for(const previous of backup[kind]){
   const actual=live[kind].find(p=>p.id===previous.id);assert(actual,'Historical catalog row missing');
   if(previous.branch_id!==HOSPITAL_ID)assert.deepEqual(actual,previous,'Other branch changed');
   else{
    const ignore=kind==='products'?['available','deleted_at','updated_at']:['visible','deleted_at','updated_at'];
    for(const key of Object.keys(previous).filter(k=>!ignore.includes(k)))assert.deepEqual(actual[key],previous[key],`Historical ${kind}.${key} changed`);
    assert(actual.deleted_at&&actual[kind==='products'?'available':'visible']===false,'Old hospital entry still public');
   }
  }
 }
 const apply=read(`${DIR}/db-apply-result.json`).data.rows[0].verification;
 assert.equal(apply.result,'PASS');
 const concurrentProtectedChanges=Object.keys(apply.protectedHashes).filter(k=>apply.protectedHashes[k]!==live.protectedHashes[k]);
 const result={at:new Date().toISOString(),observedAt:evidence.at,result:'PASS',migrationMd5:plan.migrationMd5,activeProducts:plan.products.length,categories:plan.categories.length,untouchedOtherBranches:true,historicalHospitalRowsRetained:true,protectedTransactionHashes:Object.keys(apply.protectedHashes).length,concurrentProtectedChanges,inputs:{plan:sha(fs.readFileSync(`${DIR}/db-plan.json`)),readback:sha(fs.readFileSync(`${DIR}/db-verify-result.json`))}};
 fs.writeFileSync(`${DIR}/db-readback-proof.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--verify-readback'))verifyReadback();else prepare();}
