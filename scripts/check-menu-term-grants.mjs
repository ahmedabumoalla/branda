import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js")).href);
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA platform_access_private;
    CREATE TABLE cafes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text,name text,status text,is_public boolean,deleted_at timestamptz);
    CREATE TABLE platform_plans(id text PRIMARY KEY,name text,price_sar numeric,features jsonb,active boolean,duration_unit text,duration_count int,category_id text,trial_days int,free_after_trial boolean,is_default boolean,sort_order int);
    CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,plan_id text,status text,amount_sar numeric,base_amount_sar numeric,discount_amount_sar numeric,started_at timestamptz,expires_at timestamptz,plan_name_snapshot text,duration_unit text,duration_count int,activation_source text,payment_provider text,payment_method_label text,created_at timestamptz DEFAULT now(),cancelled_at timestamptz,updated_at timestamptz);
    CREATE TABLE brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean);
    INSERT INTO cafes(slug,name,status,is_public) VALUES('double-b-bistro','Double B','active',true),('basilico','Basilico','active',true);
    INSERT INTO cafes(slug,name,status,is_public) SELECT 'brand-'||n,'Brand '||n,CASE WHEN n<=5 THEN 'suspended' ELSE 'active' END,false FROM generate_series(1,21)n;
    INSERT INTO subscriptions(cafe_id,plan_id,status,started_at,expires_at,created_at) SELECT id,'old','trialing',CASE slug WHEN 'double-b-bistro' THEN timestamptz '2026-08-30 10:05:42.174535+00' WHEN 'basilico' THEN timestamptz '2026-08-24 09:38:03.147905+00' ELSE timestamptz '2026-06-01+00' END,'2026-09-30+00','2026-08-01+00' FROM cafes;
    INSERT INTO brand_feature_overrides SELECT id,'menu',false FROM cafes;
    INSERT INTO brand_feature_overrides SELECT id,'loyalty',true FROM cafes;
  `);
  const sql = await fs.readFile("supabase/operations/20261009_activate_standalone_menu_terms.sql", "utf8");
  await db.exec(sql);
  const rows = (await db.query(`SELECT c.slug,c.status AS brand_status,c.is_public,s.started_at,s.expires_at,s.amount_sar,p.features FROM cafes c JOIN subscriptions s ON s.cafe_id=c.id AND s.status='active' JOIN platform_plans p ON p.id=s.plan_id ORDER BY c.slug`)).rows;
  assert.equal(rows.length,23);
  for (const row of rows) {
    assert.deepEqual(row.features,["menu"]);
    assert.equal(row.brand_status,"active"); assert.equal(row.is_public,true); assert.equal(Number(row.amount_sar),0);
    const expected = row.slug==='basilico' ? '2027-08-24T09:38:03.147Z' : row.slug==='double-b-bistro' ? '2027-08-30T10:05:42.174Z' : '2026-10-31T20:59:59.999Z';
    assert.equal(new Date(row.expires_at).toISOString(),expected);
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM subscriptions WHERE status='cancelled'")).rows[0].n,23);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM platform_access_private.menu_term_grants_20261009")).rows[0].n,23);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM brand_feature_overrides WHERE feature_id='menu'")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM brand_feature_overrides WHERE feature_id='loyalty'")).rows[0].n,23);
  await assert.rejects(db.exec(sql));
  console.log("PASS PostgreSQL menu grants: 23 exact menu-only terms, annual anchors, Saudi month-end, activation, zero charge, preserved history/private snapshots and replay refusal.");
} finally { await db.close(); }
