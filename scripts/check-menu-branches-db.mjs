import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;let checks=0;
const q=(s,p=[])=>db.query(s,p),ok=(x,label)=>{assert(x,label);checks++},deny=async(s)=>{await assert.rejects(q(s));checks++};
try{
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE FUNCTION has_cafe_access(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.owner',true),'')=$1::text$$;CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE SCHEMA platform_access_private;GRANT USAGE ON SCHEMA platform_access_private TO anon,authenticated;
CREATE FUNCTION platform_access_private.service_enabled(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT $1='${id(1)}'::uuid AND $2='menu'$$;
CREATE TABLE branches(id uuid PRIMARY KEY,cafe_id uuid,name text,active boolean,deleted_at timestamptz);
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY branches_read ON branches FOR SELECT USING(active OR has_cafe_access(cafe_id));
CREATE POLICY branches_write ON branches FOR ALL USING(has_cafe_access(cafe_id));
CREATE POLICY archived_storefront_access ON branches AS RESTRICTIVE FOR ALL TO anon,authenticated USING(is_platform_admin()) WITH CHECK(is_platform_admin());
CREATE TABLE menu_categories(id uuid PRIMARY KEY,cafe_id uuid,name text,sort_order int DEFAULT 0,deleted_at timestamptz,CONSTRAINT menu_categories_cafe_id_name_key UNIQUE(cafe_id,name));
CREATE TABLE menu_products(id uuid PRIMARY KEY,cafe_id uuid,category_id uuid REFERENCES menu_categories(id),name text,price numeric,sort_order int DEFAULT 0,deleted_at timestamptz);
CREATE TABLE offers(id uuid PRIMARY KEY,cafe_id uuid,deleted_at timestamptz);
INSERT INTO branches VALUES('${id(11)}','${id(1)}','main',true,null),('${id(12)}','${id(1)}','drive',true,null),('${id(13)}','${id(2)}','foreign',true,null),('${id(14)}','${id(1)}','inactive',false,null);
INSERT INTO menu_categories(id,cafe_id,name) VALUES('${id(21)}','${id(1)}','Legacy');INSERT INTO menu_products(id,cafe_id,category_id,name,price) VALUES('${id(31)}','${id(1)}','${id(21)}','Legacy',11);
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;ALTER TABLE menu_products ENABLE ROW LEVEL SECURITY;ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_categories ON menu_categories FOR SELECT USING(true);CREATE POLICY public_products ON menu_products FOR SELECT USING(true);CREATE POLICY public_offers ON offers FOR SELECT USING(true);
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon,authenticated;`);
await db.exec(await readFile('supabase/migrations/20261031231100_branch_specific_menus.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20261031233257_menu_branch_read_access.sql','utf8'));
ok((await q('SELECT price,branch_id,price_options FROM menu_products')).rows[0].price==='11','legacy prices preserved');
await db.exec(`UPDATE branches SET menu_slug=name;
INSERT INTO menu_categories(id,cafe_id,branch_id,name) VALUES('${id(22)}','${id(1)}','${id(11)}','Coffee'),('${id(23)}','${id(1)}','${id(12)}','Coffee'),('${id(24)}','${id(1)}','${id(14)}','Coffee');
INSERT INTO menu_products(id,cafe_id,branch_id,category_id,name,price,price_options) VALUES('${id(32)}','${id(1)}','${id(11)}','${id(22)}','Americano',13,'{}'),('${id(33)}','${id(1)}','${id(12)}','${id(23)}','Americano',12,'{12,13}'),('${id(34)}','${id(1)}','${id(14)}','${id(24)}','Hidden',9,'{}');
INSERT INTO offers(id,cafe_id,branch_id) VALUES('${id(41)}','${id(1)}','${id(11)}'),('${id(42)}','${id(1)}','${id(14)}');`);
for(const sql of [
`UPDATE menu_products SET branch_id='${id(13)}' WHERE id='${id(33)}'`,
`UPDATE menu_products SET category_id='${id(22)}' WHERE id='${id(33)}'`,
`UPDATE menu_products SET branch_id=null WHERE id='${id(33)}'`,
`UPDATE menu_categories SET branch_id='${id(12)}' WHERE id='${id(22)}'`,
`UPDATE menu_categories SET branch_id='${id(13)}' WHERE id='${id(24)}'`,
`UPDATE offers SET branch_id='${id(13)}' WHERE id='${id(41)}'`,
`UPDATE menu_products SET price_options='{-1,13}' WHERE id='${id(33)}'`,
`UPDATE menu_products SET price_options='{null}' WHERE id='${id(33)}'`,
`INSERT INTO menu_categories(id,cafe_id,name) VALUES('${id(25)}','${id(1)}','Legacy')`,
`UPDATE branches SET menu_slug='Bad Slug' WHERE id='${id(11)}'`,
`UPDATE branches SET menu_slug='main' WHERE id='${id(12)}'`
])await deny(sql);
await q(`UPDATE menu_products SET price=14 WHERE id='${id(33)}'`);checks++;
await db.exec('SET ROLE anon');
ok((await q('SELECT id FROM menu_products')).rows.length===3,'anonymous hidden branch product excluded');
ok((await q('SELECT id FROM menu_categories')).rows.length===3,'anonymous hidden branch category excluded');
ok((await q('SELECT id FROM offers')).rows.length===1,'anonymous hidden branch offer excluded');
await db.exec(`RESET ROLE;SET test.owner='${id(1)}';SET ROLE authenticated;`);
ok((await q('SELECT id FROM menu_products')).rows.length===4,'owner can edit inactive branch');
ok((await q('SELECT id FROM branches')).rows.length===3,'menu owner can read own branches including inactive');
await db.exec('RESET ROLE;GRANT UPDATE,INSERT,DELETE ON branches TO authenticated;SET ROLE authenticated;');
ok((await q(`UPDATE branches SET name='forbidden' WHERE id='${id(11)}' RETURNING id`)).rows.length===0,'archived branch writes stay blocked');
await db.exec(`RESET ROLE;SET test.owner='${id(2)}';SET ROLE authenticated;`);
ok((await q('SELECT id FROM menu_products')).rows.length===3,'foreign owner cannot bypass hidden branch');
console.log(`PASS menu branch SQL: ${checks} isolation, compatibility and price checks`);
}finally{await db.close()}
