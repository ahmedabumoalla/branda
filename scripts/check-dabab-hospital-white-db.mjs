import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {DIR,MIGRATION,hash,strip,protectedTables} from './prepare-dabab-hospital-white.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),baseline=read(`${DIR}/db-baseline.json`),rows=read(`${DIR}/db-plan.json`).rows,schema=read('output/dabab-hospital/inspection.json').data.rows[0].inspection,sql=fs.readFileSync(`supabase/migrations/${MIGRATION}.sql`,'utf8');
const {PGlite}=await import(pathToFileURL(path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href),db=new PGlite();let checks=0;
try{
 await db.exec("SET TIME ZONE 'UTC'");
 await db.exec(`CREATE SCHEMA storage;CREATE TABLE storage.objects(bucket_id text,name text);CREATE TABLE public.menu_products(${schema.columns.filter(c=>c.table==='menu_products').map(c=>`${c.column} ${c.type==='ARRAY'?(c.udt==='_numeric'?'numeric[]':'text[]'):c.type}`).join(',')});`);
 await db.query('INSERT INTO menu_products SELECT * FROM jsonb_populate_recordset(NULL::menu_products,$1)',[JSON.stringify(baseline.products)]);
 for(const table of protectedTables){await db.exec(`CREATE TABLE ${table}(id uuid,cafe_id uuid,data jsonb)`);await db.query(`INSERT INTO ${table} VALUES($1,$2,$3)`,[rows[0].before.id,rows[0].before.cafe_id,JSON.stringify({preserve:table})]);}
 for(const r of rows)await db.query("INSERT INTO storage.objects VALUES('menu-products',$1)",[r.asset.path]);
 const original=(await db.query('SELECT to_jsonb(p) AS row FROM menu_products p ORDER BY id')).rows.map(x=>x.row);
 const body=sql.replace('BEGIN ISOLATION LEVEL REPEATABLE READ;','').replace(/COMMIT;\s*$/,'');
 const run=async(before=async()=>{},after=async()=>{})=>{await db.exec('BEGIN');try{await before();await db.exec(body);await after();}finally{await db.exec('ROLLBACK');}};
 await run(undefined,async()=>{const result=(await db.query('SELECT to_jsonb(p) AS row FROM menu_products p ORDER BY id')).rows.map(x=>x.row);assert.equal(result.length,original.length);for(let i=0;i<result.length;i++){const expected=rows.find(r=>r.before.id===result[i].id);if(expected){assert.deepEqual(strip(result[i]),strip(original[i]));assert.equal(result[i].image_storage_path,expected.asset.path);}else assert.deepEqual(result[i],original[i]);}checks+=3;});
 await assert.rejects(()=>run(()=>db.query('UPDATE menu_products SET price=99 WHERE id=$1',[rows[0].before.id])),/Hospital product changed/);checks++;
 await assert.rejects(()=>run(()=>db.query("UPDATE menu_products SET image_storage_path='owner-change' WHERE id=$1",[rows[0].before.id])),/Mixed or unexpected/);checks++;
 await assert.rejects(()=>run(()=>db.query('DELETE FROM storage.objects WHERE name=$1',[rows[3].asset.path])),/White image missing/);checks++;
 await run(async()=>{for(const r of rows)await db.query('UPDATE menu_products SET image_storage_path=$1,price=91 WHERE id=$2',[r.asset.path,r.before.id]);},async()=>assert.equal(Number((await db.query('SELECT price FROM menu_products WHERE id=$1',[rows[0].before.id])).rows[0].price),91));checks++;
 await assert.rejects(()=>run(()=>db.query('UPDATE menu_products SET image_storage_path=$1 WHERE id=$2',[rows[0].asset.path,rows[0].before.id])),/Mixed or unexpected/);checks++;
 await assert.rejects(()=>run(()=>db.exec("CREATE FUNCTION bad_update() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE menu_products SET price=88 WHERE id<>NEW.id;RETURN NEW;END$$; CREATE TRIGGER unexpected_effect AFTER UPDATE OF image_storage_path ON menu_products FOR EACH ROW EXECUTE FUNCTION bad_update();")),/Hospital product changed|Unexpected catalog mutation/);checks++;
 await assert.rejects(()=>run(()=>db.exec("CREATE FUNCTION bad_customer_update() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE customer_profiles SET data='{}';RETURN NEW;END$$; CREATE TRIGGER unexpected_customer_effect AFTER UPDATE OF image_storage_path ON menu_products FOR EACH ROW EXECUTE FUNCTION bad_customer_update();")),/Unexpected business or identity mutation/);checks++;
 assert.deepEqual((await db.query('SELECT to_jsonb(p) AS row FROM menu_products p ORDER BY id')).rows.map(x=>x.row),original);checks++;
 fs.writeFileSync(`${DIR}/db-sql-checks.json`,JSON.stringify({at:new Date().toISOString(),passed:true,checks,runtime:process.version,migrationSha256:hash(sql),schemaEvidence:'output/dabab-hospital/inspection.json',limitation:'Local PostgreSQL emulator tests image data preservation, not current production schema or live SQL authorization'},null,2)+'\n');console.log(`${checks} SQL preservation, rollback, conflict and idempotence checks passed`);
}finally{await db.close();}
