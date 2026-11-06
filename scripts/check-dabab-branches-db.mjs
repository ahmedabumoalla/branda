// Real local PostgreSQL constraints, trigger movement, RLS and preservation checks.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildDababBranches,CAFE_ID,BRAND_SLUG,MIGRATION,sha} from './dabab-branches-sql.mjs';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const dir='output/dabab-branches',sourceFile='data/imports/dabab-branches-20261106.json',source=read(sourceFile),backup=read(`${dir}/backup-result.json`).data.rows[0].backup;
assert.equal(sha(fs.readFileSync(sourceFile)),sha(fs.readFileSync(`${dir}/catalog.json`)),'Source review drift');
const policies=read(`${dir}/live-inspect.json`).data.rows[0].inspection.policies;
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(),query=(sql,args=[])=>db.query(sql,args),value=async(sql,args=[])=>Object.values((await query(sql,args)).rows[0])[0];
const uid=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
let checks=0;const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const rejects=async(fn,match)=>{await assert.rejects(fn,match);checks++;};
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA platform_access_private;CREATE SCHEMA storage;
 CREATE TABLE cafes(id uuid PRIMARY KEY,name text,slug text,status text,is_public boolean,deleted_at timestamptz);
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
 for(const t of backup.triggers.filter(t=>!t.name.startsWith('admin_audit'))){await db.exec(t.functionSource);await db.exec(t.definition);}
 await db.exec(backup.indexes.find(i=>i.name==='idx_branches_one_primary_per_cafe').definition);
 const extraReferences=[...new Set(backup.references.map(f=>f.table))].filter(t=>!['branches','menu_categories','menu_products',...backup.protectedTables].includes(t));
 for(const table of [...backup.protectedTables,...extraReferences]){
  const refs=backup.references.filter(r=>r.table===table).flatMap(r=>r.definition.match(/^FOREIGN KEY \(([^)]+)\)/)[1].split(', ')).filter(k=>k!=='cafe_id');
  await db.exec(`CREATE TABLE ${table}(id uuid PRIMARY KEY,cafe_id uuid,${[...new Set(refs)].map(k=>`${k} uuid,`).join('')}data jsonb DEFAULT '{}')`);
 }
 for(const r of backup.references.filter(r=>!['branches','menu_categories','menu_products'].includes(r.table)))await db.exec(`ALTER TABLE ${r.table} ADD CONSTRAINT ${r.name} ${r.definition}`);
 await query("INSERT INTO cafes VALUES($1,'ضباب',$2,'active',true,NULL),($3,'Other','other','active',true,NULL)",[CAFE_ID,BRAND_SLUG,uid(1)]);
 for(const [table,rows] of [['menu_categories',backup.categories],['menu_products',backup.products]])await query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},$1)`,[JSON.stringify(rows)]);
 await query("INSERT INTO menu_products(id,cafe_id,name,price) VALUES($1,$2,'Other original',42)",[uid(2),uid(1)]);
 for(const [index,table] of backup.protectedTables.entries())await query(`INSERT INTO ${table}(id,cafe_id,data) VALUES($1,$2,$3)`,[uid(100+index),CAFE_ID,JSON.stringify({preserve:table})]);
 await query('INSERT INTO order_items(id,cafe_id,product_id) VALUES($1,$2,$3)',[uid(300),CAFE_ID,backup.products[0].id]);
 await query('UPDATE cafe_loyalty_programs SET reward_product_id=$1',[backup.products[1].id]);
 await query('UPDATE bf_document_lines SET product_id=$1',[backup.products[2].id]);
 await query("INSERT INTO customer_profiles(id,cafe_id,data) VALUES($1,$2,'{\"otherTenant\":true}')",[uid(350),uid(1)]);
 const fixture=structuredClone(backup);
 const localConstraints=await value("SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE conrelid IN('public.branches'::regclass,'public.menu_products'::regclass,'public.menu_categories'::regclass)");
 fs.writeFileSync(`${dir}/local-constraint-shape.json`,JSON.stringify(localConstraints,null,2));
 // PostgreSQL versions can format equivalent CHECK expressions differently.
 assert.deepEqual(localConstraints.filter(c=>!c.name.endsWith('_not_null')).map(c=>[c.table,c.name]),backup.constraints.map(c=>[c.table,c.name]));
 fixture.constraints=localConstraints;
 for(const key of ['products','categories'])fixture.hashes[key]=await value(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM menu_${key} t WHERE cafe_id=$1`,[CAFE_ID]);
 for(const t of fixture.triggers.filter(t=>t.name==='menu_product_branch_category'||t.name==='menu_category_branch_move'))t.functionMd5=await value('SELECT md5(pg_get_functiondef($1::regprocedure))',[t.function]);
 const assets=Object.fromEntries(source.products.map((p,i)=>[p.sourceId,{bucket:'menu-products',path:`${CAFE_ID}/dabab-branches/${p.sourceId}.webp`,sha256:sha(p.sourceId),generated:i%2===0}]));
 await query("INSERT INTO storage.buckets VALUES('menu-products',false)");for(const a of Object.values(assets))await query("INSERT INTO storage.objects VALUES('menu-products',$1)",[a.path]);
 const compiled=buildDababBranches({source,backup:fixture,assets}),body=compiled.sql.replace(/^BEGIN ISOLATION LEVEL REPEATABLE READ;$/m,'').replace(/^COMMIT;$/m,'');
 const migrationFile=`supabase/migrations/${MIGRATION}.sql`;
 if(fs.readFileSync(migrationFile,'utf8').trim()){assert.equal(fs.readFileSync(migrationFile,'utf8'),buildDababBranches({source,backup,assets}).sql,'Final migration differs from reviewed compiler and live guards');checks++;}
 const run=async({before=async()=>{},after=async()=>{},sql=body}={})=>{await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');try{await before();await db.exec(sql);await after();}finally{await db.exec('ROLLBACK');}};
 const bar=compiled.branches[0].id,coffee=compiled.branches[1].id,hospital=compiled.branches[2].id;
 await run({after:async()=>{
  check(await value('SELECT count(*) FROM branches WHERE cafe_id=$1',[CAFE_ID])===3,'one brand receives three branches');
  check(await value('SELECT menu_slug FROM branches WHERE cafe_id=$1 AND is_primary',[CAFE_ID])==='bar','existing URL defaults to bar');
  for(const [branch,count] of [[bar,28],[coffee,79],[hospital,79]])check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1',[branch])===count,'exact branch count');
  check(await value('SELECT count(*) FROM menu_categories WHERE branch_id=$1',[coffee])===17&&await value('SELECT count(*) FROM menu_categories WHERE branch_id=$1',[hospital])===17,'independent17category sets');
  check(await value('SELECT count(*) FROM menu_products WHERE id=ANY($1::uuid[])',[backup.products.map(p=>p.id)])===28,'original IDs preserved');
  check(await value('SELECT product_id FROM order_items WHERE id=$1',[uid(300)])===backup.products[0].id,'historical order relation preserved');
  check(await value('SELECT reward_product_id FROM cafe_loyalty_programs')===backup.products[1].id,'product-linked loyalty reward preserved');
  check(await value('SELECT count(*) FROM menu_products WHERE cafe_id=$1 AND available=false AND price=0',[CAFE_ID])===4,'two unpriced drafts per coffee branch');
  check(await value('SELECT count(DISTINCT image_storage_path) FROM menu_products WHERE branch_id IN($1,$2)',[coffee,hospital])===79,'same79images shared without cross-brand paths');
  const data=(await query('SELECT name,price,price_options,available,commerce_details FROM menu_products WHERE branch_id=$1 ORDER BY sort_order',[coffee])).rows;
  assert.deepEqual(data.map(p=>({name:p.name,price:Number(p.price),options:p.price_options.map(Number),available:p.available})),source.products.map(p=>({name:p.name,price:p.price??0,options:[...new Set(p.variants.map(v=>v.price))].sort((a,b)=>a-b),available:p.available})));checks++;
  const others=(await query('SELECT name,price,price_options,available,commerce_details FROM menu_products WHERE branch_id=$1 ORDER BY sort_order',[hospital])).rows;assert.deepEqual(data,others);checks++;
  const descriptions=(await query('SELECT description FROM menu_products WHERE branch_id=$1 ORDER BY sort_order',[coffee])).rows.map(p=>p.description);
  assert.deepEqual(descriptions,source.products.map(p=>p.variants.some(v=>v.name==='حار')&&p.variants.some(v=>v.name==='بارد')?[p.description,'متوفر حار وبارد'].filter(Boolean).join('\n'):p.description??''));checks++;
  check(descriptions.filter(d=>d.includes('متوفر حار وبارد')).length===4,'four source hot/cold choices remain visible even when prices are equal');
  const unlabelledIndex=source.products.findIndex(p=>p.sourceId==='dabab-item-96');
  check(unlabelledIndex>=0&&descriptions[unlabelledIndex]===(source.products[unlabelledIndex].description??''),'no hot/cold labels invented for unlabelled numeric variants');
  check(await value('SELECT count(*) FROM branches WHERE address IS NOT NULL OR phone IS NOT NULL OR hours IS NOT NULL OR lat IS NOT NULL')===0,'no invented location or hours');
  const selected=compiled.products.find(p=>p.branch_id===coffee),peer=compiled.products.find(p=>p.branch_id===hospital&&p.sort_order===selected.sort_order);
  await query('UPDATE menu_products SET price=price+1,available=false WHERE id=$1',[selected.id]);
  check(Number(await value('SELECT price FROM menu_products WHERE id=$1',[peer.id]))===Number(peer.price)&&await value('SELECT available FROM menu_products WHERE id=$1',[peer.id])===peer.available,'branch prices and availability independently editable');
 }});
 check(await value('SELECT count(*) FROM branches WHERE cafe_id=$1',[CAFE_ID])===0&&await value('SELECT count(*) FROM menu_products WHERE cafe_id=$1',[CAFE_ID])===28,'successful rehearsal rolls back');
 await rejects(()=>run({before:()=>query('UPDATE menu_products SET price=price+1 WHERE id=$1',[backup.products[0].id])}),/Bar catalog changed/);
 await rejects(()=>run({before:()=>query("INSERT INTO branches(cafe_id,name,menu_slug) VALUES($1,'Owner new branch','new')",[CAFE_ID])}),/branches changed/);
 await rejects(()=>run({before:()=>query("UPDATE cafes SET name='Owner changed' WHERE id=$1",[CAFE_ID])}),/identity changed/);
 await rejects(()=>run({before:()=>db.exec("SET LOCAL test.menu_enabled='false'")}),/Menu service unavailable/);
 await rejects(()=>run({before:()=>db.exec('ALTER TABLE menu_products DISABLE TRIGGER menu_product_branch_category')}),/Branch guard changed/);
 await rejects(()=>run({before:()=>db.exec('ALTER TABLE menu_products ADD CONSTRAINT test_new_guard CHECK(price<10000)')}),/constraints changed/);
 await rejects(()=>run({before:()=>query('DELETE FROM storage.objects WHERE name=$1',[assets[source.products[0].sourceId].path])}),/private image missing/);
 await rejects(()=>run({before:()=>db.exec('UPDATE storage.buckets SET public=true')}),/Private menu bucket/);
 await rejects(()=>run({sql:body.replace('DO $verify$',"UPDATE cafe_loyalty_programs SET data='{}';DO $verify$")}),/Protected records changed/);
 await rejects(()=>run({sql:body.replace('DO $verify$',`UPDATE customer_profiles SET data='{}' WHERE id='${uid(350)}';DO $verify$`)}),/Protected records changed/);
 await rejects(()=>run({sql:body.replace('DO $verify$',`UPDATE menu_products SET price=99 WHERE id='${uid(2)}';DO $verify$`)}),/Protected records changed/);
 await rejects(()=>run({sql:body.replace('DO $verify$',`UPDATE menu_products SET name='tampered' WHERE id='${backup.products[0].id}';DO $verify$`)}),/Original Bar product details changed/);
 await rejects(()=>run({sql:body.replace('DO $verify$',`UPDATE menu_products SET price=123 WHERE id='${compiled.products[0].id}';DO $verify$`)}),/differs from reviewed source/);
 // Unchanged live RLS policies, with fixture actor/entitlement helpers.
 for(const table of ['branches','menu_categories','menu_products'])await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;GRANT ALL ON ${table} TO anon,authenticated;`);
 await db.exec('GRANT SELECT ON cafes TO anon,authenticated;GRANT USAGE ON SCHEMA platform_access_private TO anon,authenticated');
 for(const p of policies)await db.exec(`CREATE POLICY ${p.name} ON ${p.table} AS ${p.permissive} FOR ${p.command} TO ${p.roles.join(',')}${p.using?` USING(${p.using})`:''}${p.check?` WITH CHECK(${p.check})`:''}`);
 await run({after:async()=>{
  await db.exec('SET LOCAL ROLE anon');
  check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1',[coffee])===77&&await value('SELECT count(*) FROM menu_products WHERE branch_id=$1',[hospital])===77,'anonymous cannot read four unpriced drafts');
  check(await value('SELECT count(*) FROM menu_products WHERE cafe_id=$1 AND branch_id=$2',[uid(1),coffee])===0,'cross-brand branch query returns no rows');
  check(await value("SELECT count(*) FROM branches WHERE cafe_id=$1 AND menu_slug='invalid'",[CAFE_ID])===0,'invalid branch has no result');
  await db.exec(`SET LOCAL ROLE authenticated;SET LOCAL test.cafe_id='${CAFE_ID}'`);
  check(await value('SELECT count(*) FROM menu_products WHERE branch_id=$1',[coffee])===79,'owner sees unpriced drafts');
  check((await query('UPDATE menu_products SET price=price+1 WHERE id=$1 RETURNING id',[compiled.products[0].id])).rows.length===1,'owner can edit branch product');
  check((await query('UPDATE menu_products SET price=price+1 WHERE id=$1 RETURNING id',[uid(2)])).rows.length===0,'owner cannot edit other brand');
  await db.exec("SET LOCAL test.menu_enabled='false'");
  check((await query('UPDATE menu_products SET price=price+1 WHERE id=$1 RETURNING id',[compiled.products[0].id])).rows.length===0,'disabled service fails closed');
  await db.exec('RESET ROLE');
 }});
 await rejects(()=>run({after:()=>query('UPDATE menu_categories SET branch_id=$1 WHERE id=$2',[hospital,backup.categories[0].id])}),/category with products cannot move/i);
 await rejects(()=>run({after:()=>query('UPDATE menu_products SET category_id=$1 WHERE id=$2',[compiled.categories.find(c=>c.branch_id===hospital).id,compiled.products[0].id])}),/same brand and branch/);
 await rejects(()=>run({after:()=>query('UPDATE menu_products SET branch_id=$1,category_id=NULL WHERE id=$2',[coffee,uid(2)])}),/foreign key/);
 const files=['scripts/dabab-branches-sql.mjs','scripts/prepare-dabab-branches.mjs','scripts/check-dabab-branches-db.mjs',sourceFile,`${dir}/backup-result.json`];
 if(fs.readFileSync(migrationFile,'utf8').trim())files.push(migrationFile);
 fs.writeFileSync(`${dir}/sql-checks.json`,JSON.stringify({at:new Date().toISOString(),runtime:process.version,result:'PASS',checks,engine:'PGlite',actualBranchTriggers:true,actualRlsPolicies:true,actorHelpersMocked:true,mediaMocked:true,inputs:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))},null,2)+'\n');
 console.log(JSON.stringify({result:'PASS',checks,actualBranchTriggers:true,actualRlsPolicies:true,mediaMocked:true}));
}catch(error){console.error(JSON.stringify({message:error.message,where:error.where,stack:error instanceof assert.AssertionError?error.stack:undefined}));process.exitCode=1;}finally{await db.close();}
