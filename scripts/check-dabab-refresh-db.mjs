// Local PostgreSQL behavior checks; image processing is mocked until real media is ready.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const dir='output/dabab-refresh';
const read=name=>JSON.parse(fs.readFileSync(name,'utf8').replace(/^\uFEFF/,''));
const schema=read(`${dir}/schema.json`).rows[0].inspection,backup=read(`${dir}/before-private.json`).rows[0].backup;
const source=read('data/imports/dabab-pdf-20261105.json'),brand=source.brands[0],cafe=brand.cafeId;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE??path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite(),q=(sql,args=[])=>db.query(sql,args),value=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
let checks=0;const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const rejects=async(fn,match)=>{await assert.rejects(fn,match);checks++;};
const quote=text=>`'${String(text).replaceAll("'","''")}'`;
try{
 await db.exec(`CREATE TABLE cafes(id uuid PRIMARY KEY,name text,slug text,status text,is_public boolean,deleted_at timestamptz);
 CREATE SCHEMA platform_access_private;CREATE FUNCTION platform_access_private.service_enabled(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE SCHEMA storage;CREATE TABLE storage.objects(bucket_id text,name text);`);
 for(const table of [...new Set(schema.columns.map(c=>c.table))]){
   const columns=schema.columns.filter(c=>c.table===table).map(c=>{
     const type=c.type==='ARRAY'?(c.udt==='_numeric'?'numeric[]':'text[]'):c.type==='USER-DEFINED'?'text':c.type;
     return `${c.column} ${type}${c.column==='id'||c.column==='cafe_id'&&table!=='menu_products'&&table!=='menu_categories'?' PRIMARY KEY':''}${c.default?` DEFAULT ${c.default}`:''}${c.nullable==='NO'?' NOT NULL':''}`;
   });
   await db.exec(`CREATE TABLE public.${table}(${columns.join(',')})`);
 }
 const protectedTables=[...new Set(['subscriptions','brand_feature_overrides','customer_profiles','loyalty_cards','loyalty_activity_events','loyalty_card_events','customer_reward_instances','customer_reward_redemptions','wallet_passes','wallet_notification_jobs','orders',...schema.foreignKeys.map(f=>f.table)])].filter(t=>!schema.columns.some(c=>c.table===t));
 for(const table of protectedTables){const refs=schema.foreignKeys.filter(f=>f.table===table).map(f=>f.definition.match(/^FOREIGN KEY \((\w+)\)/)[1]);await db.exec(`CREATE TABLE ${table}(id uuid PRIMARY KEY,cafe_id uuid${[...new Set(refs)].map(c=>`,${c} uuid`).join('')},data jsonb DEFAULT '{}')`);}
 for(const f of schema.foreignKeys)await db.exec(`ALTER TABLE ${f.table} ADD CONSTRAINT ${f.name} ${f.definition}`);
 await q("INSERT INTO cafes VALUES($1,'Dabab',$2,'active',true,NULL),($3,'Other','other','active',true,NULL)",[cafe,brand.slug,id(1)]);
 for(const [table,rows] of [['menu_categories',backup.categories],['menu_products',backup.products],['cafe_custom_identity',[backup.identity]],['cafe_loyalty_programs',[backup.program]],['cafe_loyalty_experience',[backup.experience]]])await q(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},$1)`,[JSON.stringify(rows)]);
 await q('INSERT INTO cafe_settings(cafe_id,logo_storage_path,logo_url) VALUES($1,$2,$3)',[cafe,backup.settings.logo_storage_path,backup.settings.logo_url]);
 await q("INSERT INTO menu_products(id,cafe_id,name,price) VALUES($1,$2,'Other brand original',42)",[id(2),id(1)]);
 for(let n=0;n<9;n++){await q('INSERT INTO customer_profiles(id,cafe_id) VALUES($1,$2)',[id(100+n),cafe]);await q('INSERT INTO loyalty_cards(id,cafe_id) VALUES($1,$2)',[id(200+n),cafe]);}
 await q('INSERT INTO wallet_passes(id,cafe_id) VALUES($1,$2)',[id(300),cafe]);
 // Match fixture-native numeric formatting while retaining the exact live guard algorithm.
 const fixtureBackup=structuredClone(backup);
 for(const table of ['products','categories'])fixtureBackup.hashes[table]=await value(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM menu_${table} t WHERE cafe_id=$1`,[cafe]);
 const fakeFiles=new Map(),fakeManifest={logo:null,products:{},palette:{primary:'#9B3F27',secondary:'#734D3A',accent:'#F1DAB7',background:'#F6EFE2',text:'#2D221D'}};
 for(const key of ['logo',...brand.products.map(p=>p.sourceId)]){const localPath=path.resolve(dir,`local-test-${key}.png`),bytes=Buffer.from(`local-test-image-${key}`);fakeFiles.set(localPath,bytes);const entry={localPath,sha256:sha(bytes)};if(key==='logo')fakeManifest.logo=entry;else fakeManifest.products[key]=entry;}
 const writes=new Map(),errors=[];
 const requested=(bytes,args)=>typeof args[0]==='string'?bytes.toString(args[0]):bytes;
 const fakeFs={...fs,readFileSync:(file,...args)=>{const name=path.resolve(file);if(name===path.resolve(dir,'assets-manifest.json'))return requested(Buffer.from(JSON.stringify(fakeManifest)),args);if(name===path.resolve(dir,'before-private.json'))return requested(Buffer.from(JSON.stringify({rows:[{backup:fixtureBackup}]})),args);return fakeFiles.has(name)?requested(fakeFiles.get(name),args):fs.readFileSync(file,...args);},existsSync:file=>path.resolve(file)===path.resolve(dir,'applied.json')?false:fs.existsSync(file),writeFileSync:(file,data)=>writes.set(path.resolve(file),data),mkdirSync:()=>{}};
 const fakeSharp=bytes=>{const chain={metadata:async()=>({width:1024,height:1024}),rotate:()=>chain,resize:()=>chain,webp:()=>chain,toBuffer:async()=>bytes};return chain;};
 const fakeProcess={argv:['node','local-test'],cwd:()=>process.cwd(),env:process.env,exitCode:0};
 const builder=fs.readFileSync('scripts/prepare-dabab-refresh.mjs','utf8').replace(/^import .*;\r?$/gm,'');
 await vm.runInNewContext(builder,{fs:fakeFs,path,crypto,assert,sharp:fakeSharp,process:fakeProcess,console:{log:()=>{},error:e=>errors.push(e)},Buffer,URL,Promise},{filename:'prepare-dabab-refresh.mjs'});
 assert.equal(fakeProcess.exitCode,0,errors.join('\n'));
 const sql=writes.get(path.resolve('supabase/migrations/20261105122133_dabab_pdf_catalog_replacement.sql'));
 const plan=JSON.parse(writes.get(path.resolve(dir,'import-plan.json')));check(Boolean(sql)&&plan.rows.products.length===28,'complete reviewed PDF plan generated before mutation');
 for(const a of Object.values(plan.assets))await q('INSERT INTO storage.objects VALUES($1,$2)',[a.bucket,a.path]);
 const body=sql.replace(/^BEGIN ISOLATION LEVEL REPEATABLE READ;$/m,'').replace(/^COMMIT;$/m,'');
 const run=async({before=async()=>{},after=async()=>{},changed=body}={})=>{await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');try{await before();await db.exec(changed);await after();}finally{await db.exec('ROLLBACK');}};
 await run({after:async()=>{
   check(await value('SELECT count(*) FROM menu_products WHERE cafe_id=$1',[cafe])===28,'all104 old rows replaced by exactly28');
   check(await value('SELECT count(*) FROM menu_categories WHERE cafe_id=$1',[cafe])===1,'17 old categories replaced by neutral PDF group');
   check(await value('SELECT count(*) FROM menu_products WHERE id=ANY($1::uuid[])',[backup.products.map(p=>p.id)])===0,'old disabled beans and all old product IDs removed');
   check(Number(await value('SELECT price FROM menu_products WHERE id=$1',[id(2)]))===42,'other brand catalog untouched');
   const actual=(await q('SELECT name,price,price_options,calories,commerce_details,image_storage_path FROM menu_products WHERE cafe_id=$1 ORDER BY sort_order',[cafe])).rows;
   assert.deepEqual(actual.map(p=>({name:p.name,price:Number(p.price),options:p.price_options.map(Number),calories:p.calories})),brand.products.map(p=>({name:p.name,price:p.price,options:[...new Set(p.variants.map(v=>v.price))].sort((a,b)=>a-b),calories:null})));checks++;
   check(actual.filter(p=>p.price_options.length===2).length===5&&actual.every(p=>p.image_storage_path),'five unlabelled price alternatives preserved and every product has new image');
   check(await value("SELECT count(*) FROM menu_products WHERE cafe_id=$1 AND description LIKE '%صورة توضيحية%'",[cafe])===28,'generated photos disclosed without changing PDF source data');
   check(await value('SELECT purchases_required FROM cafe_loyalty_programs WHERE cafe_id=$1',[cafe])===6&&await value('SELECT reward_kind FROM cafe_loyalty_experience WHERE cafe_id=$1',[cafe])==='custom','current owner reward rules untouched');
   check(await value('SELECT count(*) FROM loyalty_cards WHERE cafe_id=$1',[cafe])===9&&await value('SELECT count(*) FROM customer_profiles WHERE cafe_id=$1',[cafe])===9,'9 existing cards and customers preserved');
   check(await value('SELECT count(*) FROM wallet_notification_jobs')===0&&await value('SELECT count(*) FROM wallet_passes')===1,'no new passes or wallet sync jobs');
 }});
 check(await value('SELECT count(*) FROM menu_products WHERE cafe_id=$1',[cafe])===104,'successful rehearsal rolls all replacement changes back');
 await rejects(()=>run({before:()=>q('UPDATE menu_products SET price=price+1 WHERE id=$1',[backup.products[0].id])}),/Catalog changed/);
 await rejects(()=>run({before:()=>q('INSERT INTO order_items(id,cafe_id,product_id) VALUES($1,$2,$3)',[id(400),cafe,backup.products[0].id])}),/Historical reference appeared: order_items/);
 await rejects(()=>run({before:()=>q('INSERT INTO bf_document_lines(id,cafe_id,product_id) VALUES($1,$2,$3)',[id(401),cafe,backup.products[0].id])}),/Historical reference appeared: bf_document_lines/);
 await rejects(()=>run({before:()=>q('INSERT INTO product_media(id,cafe_id,product_id) VALUES($1,$2,$3)',[id(402),cafe,backup.products[0].id])}),/Historical reference appeared: product_media/);
 await rejects(()=>run({before:()=>db.exec('CREATE TABLE late_reference(product_id uuid REFERENCES menu_products(id))')}),/foreign keys changed/);
 await rejects(()=>run({before:()=>q("UPDATE cafe_settings SET logo_storage_path='owner-new-logo' WHERE cafe_id=$1",[cafe])}),/identity edited/);
 await rejects(()=>run({before:()=>q("UPDATE cafes SET slug='different-owner-brand' WHERE id=$1",[cafe])}),/identity changed/);
 await rejects(()=>run({before:()=>q('DELETE FROM storage.objects WHERE name=$1',[plan.assets.logo.path])}),/private asset missing/);
 await rejects(()=>run({changed:body.replace('UPDATE public.cafe_settings',`UPDATE public.cafe_loyalty_programs SET purchases_required=8 WHERE cafe_id=${quote(cafe)};\nUPDATE public.cafe_settings`)}),/Protected records changed/);
 await rejects(()=>run({changed:body.replace('UPDATE public.cafe_settings',`UPDATE public.menu_products SET price=99 WHERE id=${quote(id(2))};\nUPDATE public.cafe_settings`)}),/Protected records changed/);
 check(await value('SELECT count(*) FROM order_items')===0&&await value('SELECT count(*) FROM bf_document_lines')===0,'failed rehearsals leave no historical fixture residue');
 const files=['scripts/prepare-dabab-refresh.mjs','scripts/check-dabab-refresh-db.mjs','data/imports/dabab-pdf-20261105.json'];
 const result={at:new Date().toISOString(),runtime:process.version,result:'PASS',checks,engine:'PGlite',mediaMocked:true,liveShapeFromSchema:true,guardHashesAdaptedToLocalFixture:true,realAssetVerificationPending:true,inputs:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))};
 fs.writeFileSync(`${dir}/sql-checks.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',checks,mediaMocked:true,realAssetsPending:true}));
}catch(error){console.error(JSON.stringify({message:error.message,where:error.where,stack:error instanceof assert.AssertionError?error.stack:undefined}));process.exitCode=1;}finally{await db.close();}
