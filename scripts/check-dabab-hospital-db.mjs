// Execute the hospital migration against real PostgreSQL constraints/triggers/RLS in PGlite.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildHospital,CAFE_ID,HOSPITAL_ID,MIGRATION,DIR,SOURCE,read,sha,relationState} from './prepare-dabab-hospital.mjs';
const backup=read(`${DIR}/inspection.json`).data.rows[0].inspection,source=read(SOURCE);
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(),query=(sql,args=[])=>db.query(sql,args),value=async(sql,args=[])=>Object.values((await query(sql,args)).rows[0])[0];
let checks=0;const check=(test,message)=>{assert(test,message);checks++;};const rejects=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const uid=n=>`99999999-9999-4999-8999-${String(n).padStart(12,'0')}`;
const fixtureAssets=Object.fromEntries(source.products.map(p=>[p.imageKey,{bucket:'menu-products',path:`${CAFE_ID}/dabab-hospital/test-${p.imageKey}.webp`,sha256:sha(p.imageKey)}]));
const realAssets=fs.existsSync(`${DIR}/assets-manifest.json`)?read(`${DIR}/assets-manifest.json`).products:null;
const assets=realAssets&&source.products.every(p=>realAssets[p.imageKey])?realAssets:fixtureAssets;
const initial=buildHospital({source,backup,assets});
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA platform_access_private;CREATE SCHEMA brand_finance_private;CREATE SCHEMA storage;
 CREATE TABLE cafes(id uuid PRIMARY KEY,name text,slug text,status text,is_public boolean,deleted_at timestamptz,business_category text);
 CREATE TABLE profiles(id uuid PRIMARY KEY);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);CREATE TABLE storage.objects(bucket_id text,name text);
 CREATE FUNCTION platform_access_private.service_enabled(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('test.menu_enabled',true),''),'true')='true'$$;
 CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('test.admin',true),'false')='true'$$;
 CREATE FUNCTION public.is_cafe_owner(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1::text=current_setting('test.cafe_id',true)$$;
 CREATE FUNCTION public.has_cafe_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.is_cafe_owner($1)$$;
 CREATE FUNCTION public.has_cafe_access(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.is_cafe_owner($1)$$;`);
 for(const table of ['branches','menu_categories','menu_products']){
  const columns=backup.columns.filter(c=>c.table===table).map(c=>`${c.column} ${c.type==='ARRAY'?(c.udt==='_numeric'?'numeric[]':'text[]'):c.type}${c.default?` DEFAULT ${c.default}`:''}${c.nullable==='NO'?' NOT NULL':''}`);
  await db.exec(`CREATE TABLE ${table}(${columns.join(',')})`);
 }
 for(const c of backup.constraints)await db.exec(`ALTER TABLE ${c.table} ADD CONSTRAINT ${c.name} ${c.definition}`);
 for(const table of [...new Set([...initial.protectedTables,...initial.referenceSnapshots.map(r=>r.table)])].filter(t=>t!=='branches')){
  const refs=backup.references.filter(r=>r.table===table).flatMap(r=>r.definition.match(/^FOREIGN KEY \(([^)]+)\)/)[1].split(', ')).filter(k=>k!=='cafe_id');
  await db.exec(`CREATE TABLE ${table}(id uuid PRIMARY KEY,cafe_id uuid,${[...new Set(refs)].map(k=>`${k} uuid,`).join('')}data jsonb DEFAULT '{}')`);
 }
 for(const r of backup.references.filter(r=>!['branches','menu_categories','menu_products'].includes(r.table)))await db.exec(`ALTER TABLE ${r.table} ADD CONSTRAINT ${r.name} ${r.definition}`);
 for(const t of backup.triggers.filter(t=>!t.name.startsWith('admin_audit'))){await db.exec(t.functionSource);await db.exec(t.definition);}
 await query("INSERT INTO cafes VALUES($1,'ضباب','brand-8ad185ee82e3','active',true,NULL,'cafes'),($2,'Other','other','active',true,NULL,'cafes')",[CAFE_ID,uid(1)]);
 for(const [table,rows] of [['branches',backup.branches],['menu_categories',backup.categories],['menu_products',backup.products]])await query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},$1)`,[JSON.stringify(rows)]);
 await query("INSERT INTO menu_products(id,cafe_id,name,price) VALUES($1,$2,'Other original',42)",[uid(2),uid(1)]);
 for(const [i,table] of initial.protectedTables.filter(t=>t!=='branches').entries())await query(`INSERT INTO ${table}(id,cafe_id,data) VALUES($1,$2,$3)`,[uid(i+100),CAFE_ID,JSON.stringify({preserve:table})]);
 const oldHospital=backup.products.find(p=>p.branch_id===HOSPITAL_ID),coffee=backup.branches.find(b=>b.menu_slug==='coffee'),bar=backup.branches.find(b=>b.menu_slug==='bar');
 await query('INSERT INTO order_items(id,cafe_id,product_id) VALUES($1,$2,$3)',[uid(400),CAFE_ID,oldHospital.id]);
 await query('UPDATE bf_item_product_links SET product_id=$1',[oldHospital.id]);
 await query('UPDATE bf_document_lines SET product_id=$1',[oldHospital.id]);
 await query('UPDATE cafe_loyalty_programs SET reward_product_id=$1',[oldHospital.id]);
 const fixture=structuredClone(backup);
 fixture.constraints=await value(relationState);
 for(const key of ['products','categories'])fixture.hashes[key]=await value(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM menu_${key} t WHERE cafe_id=$1`,[CAFE_ID]);
 for(const t of fixture.triggers.filter(t=>!t.name.startsWith('admin_audit')))t.functionMd5=await value('SELECT md5(pg_get_functiondef($1::regprocedure))',[t.function]);
 await query("INSERT INTO storage.buckets VALUES('menu-products',false)");
 for(const a of new Map(Object.values(assets).map(a=>[a.path,a])).values())await query("INSERT INTO storage.objects VALUES('menu-products',$1)",[a.path]);
 const compiled=buildHospital({source,backup:fixture,assets}),body=compiled.sql.replace(/^BEGIN ISOLATION LEVEL REPEATABLE READ;$/m,'').replace(/^COMMIT;$/m,'');
 const migrationFile=`supabase/migrations/${MIGRATION}.sql`;
 if(assets===realAssets&&fs.readFileSync(migrationFile,'utf8').trim()){assert.equal(fs.readFileSync(migrationFile,'utf8'),initial.sql,'Final migration differs from compiler');checks++;}
 const run=async({before=async()=>{},after=async()=>{},sql=body}={})=>{await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');try{await before();await db.exec(sql);await after();}finally{await db.exec('ROLLBACK');}};
 await run({after:async()=>{
  check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1 AND deleted_at IS NULL',[HOSPITAL_ID])===111,'111 exact PDF entries');
  check(await value('SELECT count(*) FROM menu_categories WHERE branch_id=$1 AND deleted_at IS NULL',[HOSPITAL_ID])===9,'9 PDF categories');
  check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1 AND deleted_at IS NOT NULL AND NOT available',[HOSPITAL_ID])===79,'old79 retained as hidden history');
  check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1',[coffee.id])===79&&await value('SELECT count(*) FROM menu_products WHERE branch_id=$1',[bar.id])===28,'other branches preserve all rows');
  const data=(await query('SELECT name,description,price,price_options,commerce_details,image_storage_path FROM menu_products WHERE branch_id=$1 AND deleted_at IS NULL ORDER BY sort_order',[HOSPITAL_ID])).rows;
  assert.deepEqual(data.map(p=>[p.name,p.description,Number(p.price),p.price_options,p.commerce_details]),source.products.map(p=>[p.name,p.portion,p.priceMin,[],{menuPriceRange:{min:p.priceMin,max:p.priceMax}}]));checks++;
  check(data.every(p=>p.image_storage_path.startsWith(`${CAFE_ID}/`)),'all images same tenant');
  check(await value('SELECT product_id FROM order_items WHERE id=$1',[uid(400)])===oldHospital.id,'historical order relation retained');
  check(await value('SELECT product_id FROM bf_item_product_links')===oldHospital.id,'inventory link retained');
  check(await value('SELECT reward_product_id FROM cafe_loyalty_programs')===oldHospital.id,'reward relation retained');
  check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1 AND deleted_at IS NULL AND cardinality(price_options)>0',[HOSPITAL_ID])===0,'no fictitious purchase options');
  const counts=(await query('SELECT c.name,count(p.id)::int n FROM menu_categories c JOIN menu_products p ON p.category_id=c.id WHERE c.branch_id=$1 AND c.deleted_at IS NULL GROUP BY c.name,c.sort_order ORDER BY c.sort_order',[HOSPITAL_ID])).rows;
  assert.deepEqual(counts.map(x=>x.n),[24,10,11,11,11,11,11,11,11]);checks++;
 }});
 check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1 AND deleted_at IS NULL',[HOSPITAL_ID])===79,'rehearsal fully rolls back');
 await rejects(()=>run({before:()=>query('UPDATE menu_products SET price=price+1 WHERE id=$1',[oldHospital.id])}),/Reviewed Dabab catalog changed/);
 await rejects(()=>run({before:()=>query("UPDATE branches SET menu_slug='changed' WHERE id=$1",[HOSPITAL_ID])}),/Hospital branch changed/);
 await rejects(()=>run({before:()=>db.exec("SET LOCAL test.menu_enabled='false'")}),/Menu service unavailable/);
 await rejects(()=>run({before:()=>db.exec('ALTER TABLE menu_products DISABLE TRIGGER menu_product_branch_category')}),/Catalog guard changed/);
 await rejects(()=>run({before:()=>db.exec('ALTER TABLE menu_products ADD CONSTRAINT test_extra CHECK(price<10000)')}),/Catalog constraints changed/);
 await rejects(()=>run({before:()=>query('DELETE FROM storage.objects WHERE name=$1',[assets[source.products[0].imageKey].path])}),/Reviewed private image missing/);
 await rejects(()=>run({before:()=>db.exec('UPDATE storage.buckets SET public=true')}),/Private menu bucket required/);
 await rejects(()=>run({sql:body.replace('DO $verify$',"UPDATE cafe_loyalty_programs SET data='{}';DO $verify$")}),/Protected records changed/);
 await rejects(()=>run({sql:body.replace('DO $verify$',`UPDATE menu_products SET price=99 WHERE id='${uid(2)}';DO $verify$`)}),/Protected records changed/);
 await rejects(()=>run({sql:body.replace('DO $verify$',`UPDATE menu_products SET name='changed' WHERE id='${oldHospital.id}';DO $verify$`)}),/Historical hospital product altered/);
 await rejects(()=>run({sql:body.replace('DO $verify$',`UPDATE menu_products SET price=99 WHERE id='${compiled.products[0].id}';DO $verify$`)}),/differs from reviewed PDF/);
 for(const table of ['branches','menu_categories','menu_products'])await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;GRANT ALL ON ${table} TO anon,authenticated;`);
 await db.exec('GRANT SELECT ON cafes TO anon,authenticated;GRANT USAGE ON SCHEMA platform_access_private TO anon,authenticated');
 for(const p of backup.policies)await db.exec(`CREATE POLICY ${p.name} ON ${p.table} AS ${p.permissive} FOR ${p.command} TO ${p.roles.join(',')}${p.using?` USING(${p.using})`:''}${p.check?` WITH CHECK(${p.check})`:''}`);
 await run({after:async()=>{
  await db.exec('SET LOCAL ROLE anon');
  check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1',[HOSPITAL_ID])===111,'anonymous sees only new catalog');
  check(await value('SELECT count(*) FROM menu_categories WHERE branch_id=$1',[HOSPITAL_ID])===9,'anonymous sees only new categories');
  check(await value('SELECT count(*) FROM menu_products WHERE cafe_id=$1 AND branch_id=$2',[uid(1),HOSPITAL_ID])===0,'cross-tenant branch empty');
  await db.exec(`SET LOCAL ROLE authenticated;SET LOCAL test.cafe_id='${CAFE_ID}'`);
  check((await query('UPDATE menu_products SET price=price WHERE id=$1 RETURNING id',[compiled.products[0].id])).rows.length===1,'owner can edit scoped product');
  check((await query('UPDATE menu_products SET price=99 WHERE id=$1 RETURNING id',[uid(2)])).rows.length===0,'owner cannot edit other brand');
  await db.exec("SET LOCAL test.menu_enabled='false'");
  check((await query('UPDATE menu_products SET price=99 WHERE id=$1 RETURNING id',[compiled.products[0].id])).rows.length===0,'inactive entitlement fails closed');
  await db.exec('RESET ROLE');
 }});
 await rejects(()=>run({after:()=>query('UPDATE menu_products SET category_id=$1 WHERE id=$2',[backup.categories.find(c=>c.branch_id===coffee.id).id,compiled.products[0].id])}),/same brand and branch/);
 assert.throws(()=>buildHospital({source:{...source,products:[...source.products.slice(1),{...source.products[0],priceMin:-1}]},backup,assets}),/price range/);checks++;
 const files=['scripts/prepare-dabab-hospital.mjs','scripts/check-dabab-hospital-db.mjs',SOURCE,`${DIR}/inspection.json`];
 if(assets===realAssets)files.push(`${DIR}/assets-manifest.json`,migrationFile);
 fs.writeFileSync(`${DIR}/db-checks.json`,JSON.stringify({at:new Date().toISOString(),runtime:process.version,result:'PASS',checks,engine:'PGlite',actualCatalogTriggers:true,actualRlsPolicies:true,actorHelpersMocked:true,mediaMocked:true,assetPathsFixture:assets!==realAssets,inputs:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))},null,2)+'\n');
 console.log(JSON.stringify({result:'PASS',checks,actualCatalogTriggers:true,actualRlsPolicies:true,assetPathsFixture:assets!==realAssets}));
}catch(error){console.error(JSON.stringify({message:error.message,where:error.where,stack:error instanceof assert.AssertionError?error.stack:undefined}));process.exitCode=1;}finally{await db.close();}
