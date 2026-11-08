import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {CAFE,DIR,MIGRATION,compile,read,sha,protectedTables,protectedQuery} from './prepare-tea-bakery.mjs';
const baseline=read(`${DIR}/db-inspect.json`).data.rows[0].result,extra=read(`${DIR}/db-schema.json`).data.rows[0].result,source=read(`${DIR}/catalog.json`),activation=read(`${DIR}/activation.json`),plan=compile({source,baseline,activation}),sql=fs.readFileSync(`supabase/migrations/${MIGRATION}.sql`,'utf8');assert.equal(sql,plan.sql);
const {PGlite}=await import(pathToFileURL(path.join(tmpdir(),'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href),db=new PGlite(),q=(s,args=[])=>db.query(s,args),value=async(s,args=[])=>Object.values((await q(s,args)).rows[0])[0];
let checks=0;const check=(ok,msg)=>{assert(ok,msg);checks++;};const reject=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try{
 await db.exec(`SET TIME ZONE 'UTC';CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA platform_access_private;CREATE SCHEMA brand_finance_private;CREATE DOMAIN citext AS text;
 CREATE TABLE cafes(id uuid PRIMARY KEY,slug text,name text,status text,is_public boolean,deleted_at timestamptz,business_category text);CREATE TABLE profiles(id uuid PRIMARY KEY);
 CREATE TABLE branches(id uuid PRIMARY KEY,cafe_id uuid,active boolean,deleted_at timestamptz,menu_slug text,UNIQUE(id,cafe_id));
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
 CREATE FUNCTION public.has_cafe_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1::text=current_setting('test.cafe',true)$$;
 CREATE FUNCTION public.is_cafe_owner(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1::text=current_setting('test.cafe',true)$$;
 CREATE FUNCTION public.has_cafe_access(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.is_cafe_owner($1)$$;
 CREATE FUNCTION platform_access_private.service_enabled(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('test.service',true),''),'true')='true'$$;`);
 const cols=[...baseline.columns,...extra.columns],tables=[...new Set(cols.map(c=>c.table))];
 for(const table of tables){await db.exec(`CREATE TABLE ${table}(${cols.filter(c=>c.table===table).map(c=>`${c.column} ${c.type==='ARRAY'?(c.udt==='_numeric'?'numeric[]':'text[]'):c.type==='USER-DEFINED'?c.udt:c.type}${c.default?` DEFAULT ${c.default}`:''}${c.nullable==='NO'?' NOT NULL':''}`).join(',')})`);}
 for(const c of [...baseline.constraints,...extra.constraints])await db.exec(`ALTER TABLE ${c.table} ADD ${c.definition}`);
 for(const table of protectedTables.filter(t=>!['cafes','branches'].includes(t))){const wallet=table==='wallet_passes'?",card_id uuid,updated_at timestamptz":table==='wallet_notification_jobs'?",card_id uuid,kind text":'';await db.exec(`CREATE TABLE ${table}(id uuid PRIMARY KEY,cafe_id uuid,product_id uuid,data jsonb DEFAULT '{}'${wallet})`);}
 for(const t of [...baseline.triggers,...extra.triggers].filter(t=>!t.name.startsWith('admin_audit'))){await db.exec(t.function);await db.exec(t.definition);}
 await q('INSERT INTO cafes VALUES($1,$2,$3,$4,$5,NULL,$6)',[CAFE,baseline.brand.slug,baseline.brand.name,'active',true,baseline.brand.business_category]);
 await q('INSERT INTO cafes VALUES($1,$2,$3,$4,$5,NULL,$6)',[uid(1),'other','Other','active',true,'cafes_coffee']);
 await q('INSERT INTO cafe_settings SELECT * FROM jsonb_populate_record(NULL::cafe_settings,$1)',[JSON.stringify(baseline.settings)]);
 await q("INSERT INTO menu_products(id,cafe_id,name,price) VALUES($1,$2,'Other original',41)",[uid(2),uid(1)]);
 for(const [i,table] of protectedTables.filter(t=>!['cafes','branches'].includes(t)).entries())await q(`INSERT INTO ${table}(id,cafe_id,data) VALUES($1,$2,$3)`,[uid(i+20),uid(1),JSON.stringify({preserve:table})]);
 const before=await value(protectedQuery),body=sql.replace(/^BEGIN ISOLATION LEVEL REPEATABLE READ;$/m,'').replace(/COMMIT;\s*$/,'');
 const run=async(beforeFn=async()=>{},after=async()=>{})=>{await db.exec('BEGIN');try{await beforeFn();await db.exec(body);await after();}finally{await db.exec('ROLLBACK');}};
 await run(undefined,async()=>{
  const actual=(await q('SELECT * FROM menu_products WHERE cafe_id=$1 ORDER BY sort_order',[CAFE])).rows;
  check(actual.length===40,'40 exact products');check(await value('SELECT count(*) FROM menu_categories WHERE cafe_id=$1',[CAFE])===4,'four categories');
  for(const [i,p] of actual.entries()){const expected=source.products[i];assert.deepEqual([p.name,Number(p.price),p.price_options.map(Number),p.description],[expected.name,expected.price,expected.priceOptions??[],expected.description??'']);}checks++;
  check(actual.every(p=>p.calories===null&&p.image_storage_path===null),'No invented calories or product photography');
  const program=(await q('SELECT * FROM cafe_loyalty_programs WHERE cafe_id=$1',[CAFE])).rows[0];check(program.enabled&&program.purchases_required===6&&program.reward_name==='خصم 10٪'&&program.reward_product_id===null,'Explicit stamp reward');check(program.wallet_enabled&&program.apple_wallet_enabled&&program.google_wallet_enabled,'Wallet support enabled without issuance');
  const experience=(await q('SELECT * FROM cafe_loyalty_experience WHERE cafe_id=$1',[CAFE])).rows[0];check(experience.reward_kind==='discount'&&experience.reward_discount_percent===10,'Structured ten percent discount');check(experience.offer_title===''&&experience.offer_body===''&&experience.announcement_id===null&&experience.announcement_at===null,'No reviews/offers/announcement activation');
  check(await value('SELECT logo_url FROM cafe_settings WHERE cafe_id=$1',[CAFE])===activation.identity.logo_url,'Logo saved');check(await value(protectedQuery)===before||JSON.stringify(await value(protectedQuery))===JSON.stringify(before),'Other business and settings preserved');
  await db.exec(extra.rewardSnapshot);await db.exec(`CREATE TEMP TABLE stamp_reward_probe(cafe_id uuid,source_type text,reward_title text,reward_definition_id uuid,metadata jsonb DEFAULT '{}',issued_at timestamptz DEFAULT now(),expires_at timestamptz);CREATE TRIGGER terms BEFORE INSERT ON stamp_reward_probe FOR EACH ROW EXECUTE FUNCTION public.snapshot_rast_loyalty_reward();`);
  const snapshot=await value("INSERT INTO stamp_reward_probe(cafe_id,source_type,reward_title) VALUES($1,'loyalty','Discount fixture') RETURNING metadata",[CAFE]);check(snapshot.termsSnapshot.rewardKind==='discount'&&snapshot.termsSnapshot.discountPercent===10&&snapshot.termsSnapshot.purchasesRequired===6,'Actual stamp reward trigger snapshots six and ten percent');
 });
 check(await value('SELECT count(*) FROM menu_products WHERE cafe_id=$1',[CAFE])===0,'Rollback removes all imported rows');assert.deepEqual(await value(protectedQuery),before);checks++;
 await reject(()=>run(()=>q("INSERT INTO menu_products(cafe_id,name,price) VALUES($1,'Owner new product',9)",[CAFE])),/Preserve new owner/);
 await reject(()=>run(()=>q('INSERT INTO cafe_loyalty_programs(cafe_id,purchases_required) VALUES($1,8)',[CAFE])),/Preserve new owner/);
 await reject(()=>run(()=>q("UPDATE cafe_settings SET logo_url='https://example.com/owner.png' WHERE cafe_id=$1",[CAFE])),/Preserve new owner identity/);
 await reject(()=>run(()=>q("SELECT set_config('test.service','false',true)")),/service authorization changed/);
 await reject(()=>run(()=>q("INSERT INTO loyalty_cards(id,cafe_id) VALUES($1,$2)",[uid(800),CAFE])),/New customer card/);
 await reject(()=>run(()=>db.exec("CREATE FUNCTION sabotage() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE subscriptions SET data='{}';RETURN NEW;END$$;CREATE TRIGGER sabotage AFTER INSERT ON menu_products FOR EACH ROW EXECUTE FUNCTION sabotage();")),/Protected business data changed/);
 for(const table of tables){await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;GRANT SELECT ON ${table} TO anon,authenticated;GRANT INSERT,UPDATE ON ${table} TO authenticated;`);}
 await db.exec('GRANT SELECT ON cafes,branches TO anon,authenticated;GRANT USAGE ON SCHEMA public,auth,platform_access_private TO anon,authenticated');
 for(const p of [...baseline.policies,...extra.policies])await db.exec(`CREATE POLICY "${p.policyname}" ON ${p.tablename} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''}`);
 await run(undefined,async()=>{await db.exec('SET LOCAL ROLE anon');check(await value('SELECT count(*) FROM menu_products WHERE cafe_id=$1',[CAFE])===40,'Anonymous menu access');check(await value('SELECT count(*) FROM cafe_loyalty_programs WHERE cafe_id=$1',[CAFE])===1,'Anonymous loyalty access');await assert.rejects(()=>q('UPDATE menu_products SET price=1 WHERE cafe_id=$1',[CAFE]),/permission denied/);checks++;});
 await run(undefined,async()=>{await db.exec('SET LOCAL ROLE authenticated');await q("SELECT set_config('test.cafe',$1,true)",[uid(1)]);check((await q('UPDATE menu_products SET price=1 WHERE cafe_id=$1 RETURNING id',[CAFE])).rows.length===0,'Other owner cannot change imported menu');await q("SELECT set_config('test.cafe',$1,true)",[CAFE]);check((await q('UPDATE menu_products SET price=17 WHERE id=$1 RETURNING id',[plan.products[0].id])).rows.length===1,'Brand owner retains normal editing');});
 const inputs={};for(const f of [`supabase/migrations/${MIGRATION}.sql`,'scripts/prepare-tea-bakery.mjs','scripts/check-tea-bakery-db.mjs',`${DIR}/catalog.json`,`${DIR}/activation.json`,`${DIR}/db-inspect.json`,`${DIR}/db-schema.json`])inputs[f]=sha(fs.readFileSync(f));fs.writeFileSync(`${DIR}/db-checks.json`,JSON.stringify({at:new Date().toISOString(),checks,passed:true,runtime:process.version,inputs},null,2)+'\n');console.log(`Tea and Bakery: ${checks} PostgreSQL checks passed`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.close();}
