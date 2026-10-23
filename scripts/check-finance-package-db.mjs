import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
let checks = 0;
const cafe = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const enabled = async (feature, brand = cafe) => (await db.query("SELECT platform_access_private.service_enabled($1,$2) AS enabled", [brand, feature])).rows[0].enabled;
const check = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA platform_access_private;
    GRANT USAGE ON SCHEMA platform_access_private TO anon,authenticated,service_role;
    CREATE TABLE public.platform_plans(id text PRIMARY KEY,name text,description text,price_sar numeric DEFAULT 0,
      features jsonb,sort_order integer,active boolean DEFAULT true,is_default boolean,duration_unit text,
      duration_count integer,category_id text,trial_days integer,free_after_trial boolean,is_upgrade_bundle boolean);
    CREATE TABLE public.subscriptions(cafe_id uuid,plan_id text,status text,started_at timestamptz,expires_at timestamptz);
    CREATE TABLE public.brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean);
    INSERT INTO public.platform_plans(id,features) VALUES('legacy','["all"]'),('loyalty','["loyalty"]');
  `);
  await db.exec(await readFile("supabase/migrations/20261023195320_brand_finance_package.sql", "utf8"));
  const plan = (await db.query("SELECT * FROM public.platform_plans WHERE id='finance'")).rows[0];
  check(plan.name, "برندة المالية", "named independent package");
  check(plan.active, false, "unpriced package cannot be purchased");
  assert.deepEqual(plan.features, ["finance", "settings"]); checks++;
  await assert.rejects(db.exec("UPDATE public.platform_plans SET active=true WHERE id='finance'"), (error) => error.code === "23514"); checks++;
  await db.query("INSERT INTO public.subscriptions VALUES($1,'legacy','active',now()-interval '1 day',now()+interval '1 day')", [cafe]);
  check(await enabled("finance"), false, "legacy wildcard cannot unlock finance");
  for (const feature of ["menu", "offers", "loyalty", "pager", "settings"]) check(await enabled(feature), true, `legacy ${feature} remains available`);
  await db.query("INSERT INTO public.brand_feature_overrides VALUES($1,'finance',true)", [cafe]);
  check(await enabled("finance"), false, "override cannot grant unpurchased finance");
  await db.exec("UPDATE public.platform_plans SET price_sar=100,active=true WHERE id='finance'");
  await db.query("INSERT INTO public.subscriptions VALUES($1,'finance','active',now()-interval '1 day',now()+interval '1 day')", [cafe]);
  check(await enabled("finance"), true, "explicit paid finance entitlement");
  check(await enabled("finance", other), false, "unsubscribed tenant isolated");
  check(await enabled("finance_pos"), false, "derived UI alias is not a DB permission");
  await db.exec("SET ROLE anon");
  check(await enabled("finance"), true, "read-only entitlement predicate remains callable under existing grant");
  await db.exec("RESET ROLE; UPDATE public.brand_feature_overrides SET enabled=false WHERE feature_id='finance'");
  check(await enabled("finance"), false, "administrative disable wins");
  await db.exec("DELETE FROM public.brand_feature_overrides; UPDATE public.subscriptions SET expires_at=now() WHERE plan_id='finance'");
  check(await enabled("finance"), false, "finance expires independently");
  check(await enabled("loyalty"), true, "finance expiry preserves other packages");
  await db.exec("UPDATE public.subscriptions SET expires_at=now()+interval '1 day',started_at=now()+interval '1 hour' WHERE plan_id='finance'");
  check(await enabled("finance"), false, "future subscription is not current");
  await db.exec("UPDATE public.subscriptions SET started_at=now()-interval '1 day',status='cancelled' WHERE plan_id='finance'");
  check(await enabled("finance"), false, "cancelled subscription cannot access ledger");
  await db.exec("UPDATE public.subscriptions SET status='trialing' WHERE plan_id='finance'");
  check(await enabled("finance"), true, "explicit administrator trial works");
  await db.exec("UPDATE public.platform_plans SET active=false WHERE id='finance'");
  check(await enabled("finance"), false, "inactive plan disables service");
  console.log(`PASS finance package SQL: ${checks} actual migration, pricing guard, tenant, wildcard, independent expiry and override checks`);
} finally { await db.close(); }
