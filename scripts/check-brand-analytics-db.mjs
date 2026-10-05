import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const query = (text, values = []) => db.query(text, values);
const value = async (text, values = []) => Object.values((await query(text, values)).rows[0])[0];
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const rejects = async operation => { await assert.rejects(operation); checks++; };
const started = performance.now();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);
    CREATE TABLE public.cafes(id uuid PRIMARY KEY,name text,slug text,deleted_at timestamptz,owner_user_id uuid,status text DEFAULT 'active',is_public boolean DEFAULT true);
    CREATE TABLE public.cafe_members(cafe_id uuid,user_id uuid,role text);
    CREATE TABLE public.brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean,PRIMARY KEY(cafe_id,feature_id));
    CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active')
    $$;
    CREATE TABLE public.customer_profiles(id uuid PRIMARY KEY,cafe_id uuid REFERENCES public.cafes(id),user_id uuid,
      full_name text,phone text,email text,phone_normalized text,phone_auth_conflict boolean DEFAULT false,
      status text DEFAULT 'active',blocked_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE public.menu_products(id uuid PRIMARY KEY);
    CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    CREATE FUNCTION public.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat('ab',n),'hex') $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  const base = await readFile("supabase/migrations/013_branda_loyapro_wallet_loyalty_system.sql", "utf8");
  await db.exec(base.slice(base.indexOf("CREATE TABLE IF NOT EXISTS public.cafe_loyalty_programs"), base.indexOf("CREATE INDEX IF NOT EXISTS idx_loyalty_cards_cafe_updated")));
  const reward = await readFile("supabase/migrations/064_customer_reward_instances.sql", "utf8");
  await db.exec(reward.slice(reward.indexOf("CREATE TABLE IF NOT EXISTS public.customer_reward_instances"), reward.indexOf("CREATE INDEX IF NOT EXISTS idx_customer_reward_instances_customer")));
  await db.exec("ALTER TABLE public.loyalty_cards ADD UNIQUE(id,cafe_id)");
  const wallet = await readFile("supabase/migrations/20261002234900_loyalty_experience_atomic_scanner.sql", "utf8");
  await db.exec(wallet.slice(wallet.indexOf("CREATE TABLE public.wallet_apple_registrations"), wallet.indexOf("CREATE FUNCTION public.claim_wallet_notification_jobs")));
  const audit = await readFile("supabase/migrations/20261004112815_loyalty_activity_audit.sql", "utf8");
  await db.exec(audit.slice(audit.indexOf("CREATE SCHEMA IF NOT EXISTS loyalty_audit_private"), audit.indexOf("CREATE FUNCTION loyalty_audit_private.reject_mutation")));
  await query("INSERT INTO public.profiles(id,role,status) VALUES($1,'platform_admin','active'),($2,'platform_admin','suspended'),($3,'owner','active'),($4,'cashier','active'),($5,'customer','active')", [1,2,3,4,5].map(id));
  await query("INSERT INTO public.cafes(id,name,slug) VALUES($1,'Rast','rast'),($2,'Beta','beta'),($3,'Hidden','hidden')", [10,11,12].map(id));
  await query("INSERT INTO public.brand_feature_overrides VALUES($1,'standalone_menu',true),($2,'standalone_menu',true),($3,'standalone_menu',false)", [10,11,12].map(id));
  await query("INSERT INTO public.cafe_loyalty_programs(cafe_id) VALUES($1),($2)", [id(10),id(11)]);
  await query("INSERT INTO public.customer_profiles(id,cafe_id,full_name) VALUES($1,$4,'One'),($2,$5,'Foreign'),($3,$4,'Two')", [id(20),id(21),id(22),id(10),id(11)]);
  await query("INSERT INTO public.loyalty_cards(id,cafe_id,customer_profile_id,customer_name) VALUES($1,$4,$6,'One'),($2,$5,$7,'Foreign'),($3,$4,$8,'Two')", [id(30),id(31),id(32),id(10),id(11),id(20),id(21),id(22)]);
  await query("INSERT INTO public.wallet_passes(card_id,cafe_id,provider) VALUES($1,$3,'apple'),($1,$3,'google'),($2,$3,'apple'),($2,$3,'google')", [id(30),id(32),id(10)]);
  await query("INSERT INTO public.wallet_apple_registrations(cafe_id,device_library_id,pass_type_id,card_id,push_token,created_at) VALUES($1,'device','pass',$2,'private-token','2026-01-01T00:00:00Z')", [id(10),id(30)]);
  await db.exec(await readFile("supabase/migrations/20261004121343_admin_brand_customers.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261005104111_brand_funnel_analytics.sql", "utf8"));
  const asUser = async number => { await db.exec("RESET ROLE"); await query("SELECT set_config('request.jwt.claim.sub',$1,false)",[number ? id(number) : ""]); await db.exec("SET ROLE authenticated"); };
  const analytics = (brand = 10, from = null, to = null) => value("SELECT public.get_admin_brand_analytics($1,$2,$3)",[id(brand),from,to]);
  const record = (event, visitor = "a", kind = "menu_view", slug = "rast") => value("SELECT public.record_brand_engagement($1,$2,$3,$4)",[slug,kind,id(event),visitor.repeat(64)]);
  for (const user of [0,2,3,4,5]) { await asUser(user); await rejects(() => analytics()); }
  await asUser(1);
  const empty = await analytics();
  check(Object.keys(empty.engagement).length === 0 && empty.wallet.issuances === 0, "no invented historical visits/downloads from existing cards or registrations");
  check(Object.keys(empty.confirmed).length === 0, "empty genuine operation history");
  await rejects(() => analytics(999)); await rejects(() => analytics(10,"2026-10-06","2026-10-05"));
  await rejects(() => record(100));
  for (const role of ["anon","authenticated","service_role"]) {
    await db.exec(`RESET ROLE; SET ROLE ${role}`);
    for (const statement of ["SELECT * FROM brand_analytics_private.events", "SELECT * FROM brand_analytics_private.settings",
      "DELETE FROM brand_analytics_private.events", "UPDATE brand_analytics_private.events SET kind='menu_view'", "TRUNCATE brand_analytics_private.events"]) await rejects(() => query(statement));
    if (role !== "authenticated") await rejects(() => analytics());
    if (role !== "service_role") await rejects(() => record(100));
  }
  check(await record(100), "first visible visit accepted through server-only writer");
  check(!(await record(101)), "rapid repeat event suppressed");
  await db.exec("RESET ROLE");
  await query("UPDATE brand_analytics_private.events SET occurred_at=clock_timestamp()-interval '20 seconds' WHERE id=$1",[id(100)]);
  await db.exec("SET ROLE service_role");
  check(!(await record(100)), "same event id remains idempotent after cooldown");
  check(await record(102), "distinct later visit accepted for same visitor");
  check(await record(103,"b"), "second unique browser accepted");
  check(await record(104,"a","menu_loyalty_click"), "actual click distinct from view");
  check(await record(105,"a","loyalty_qr_visit"), "QR source counted separately");
  check(await record(106,"a","loyalty_menu_visit"), "menu arrival counted separately");
  check(await record(107,"a","loyalty_direct_visit"), "old untagged link remains unclassified");
  check(!(await record(108,"c","menu_view","hidden")), "unpublished standalone menu rejected");
  check(!(await record(109,"c","menu_view","missing")), "missing brand rejected");
  check(!(await record(110,"c","loyalty_qr_visit","beta")), "unimplemented loyalty brand rejected");
  check(!(await record(111,"c","menu_loyalty_click","beta")), "unimplemented loyalty entry rejected");
  await rejects(() => record(112,"a","stamp"));
  await rejects(() => record(113,"a","download"));
  await rejects(() => record(114,"x"));
  for (const card of [30,30,32]) await query("SELECT public.record_wallet_download($1,'apple')",[id(card)]);
  await query("SELECT public.record_wallet_download($1,'google')",[id(30)]);
  await db.exec("RESET ROLE");
  await query("UPDATE brand_analytics_private.events SET occurred_at='2026-10-05T12:00:00Z'");
  await query("UPDATE loyalty_audit_private.wallet_customer_events SET occurred_at='2026-10-05T12:00:00Z' WHERE kind IN ('download','save_link')");
  await query(`INSERT INTO public.loyalty_activity_events(cafe_id,card_id,kind,outcome,actor_type,occurred_at,origin) VALUES
    ($1,$2,'stamp','success','cashier','2026-10-04T20:59:59Z','historical'),
    ($1,$2,'stamp','success','cashier','2026-10-04T21:00:00Z','live'),
    ($1,$2,'stamp','success','cashier','2026-10-05T20:59:59Z','live'),
    ($1,$3,'stamp','success','cashier','2026-10-05T21:00:00Z','live'),
    ($1,$3,'stamp','duplicate','cashier','2026-10-05T12:00:00Z','live'),
    ($1,$3,'stamp','failed','cashier','2026-10-05T12:00:00Z','live'),
    ($1,$3,'scan','success','cashier','2026-10-05T12:00:00Z','live'),
    ($1,$3,'scan','denied','cashier','2026-10-05T12:00:00Z','live'),
    ($1,$2,'redeem','success','cashier','2026-10-05T12:00:00Z','live'),
    ($1,$2,'redeem','success','cashier','2026-10-05T12:00:01Z','live'),
    ($1,$3,'redeem','denied','cashier','2026-10-05T12:00:00Z','live'),
    ($1,$3,'redeem','duplicate','cashier','2026-10-05T12:00:00Z','live'),
    ($4,$5,'stamp','success','cashier','2026-10-05T12:00:00Z','live')`,[id(10),id(30),id(32),id(11),id(31)]);
  await asUser(1);
  const all = await analytics();
  check(all.engagement.menu_view.events === 3 && all.engagement.menu_view.visitors === 2, "visits and unique browsers differ");
  check(all.engagement.menu_loyalty_click.events === 1 && all.engagement.loyalty_qr_visit.events === 1, "funnel sources do not cross-count");
  check(all.wallet.customers === 2 && all.wallet.issuances === 4, "same customer across providers counted once");
  check(all.wallet.appleCustomers === 2 && all.wallet.appleDownloads === 3, "Apple repeat issuance separated from unique cards");
  check(all.wallet.googleCustomers === 1 && all.wallet.googleSaveLinks === 1, "Google handoff never inferred from Apple installation");
  check(all.confirmed.stamp.operations === 4 && all.confirmed.stamp.customers === 2, "successful historical and live operations counted, previews/errors excluded");
  check(all.confirmed.redeem.operations === 2 && all.confirmed.redeem.customers === 1, "confirmed redemptions only, duplicate retries excluded");
  const day = await analytics(10,"2026-10-05","2026-10-05");
  check(day.confirmed.stamp.operations === 2 && day.confirmed.stamp.customers === 1, "Saudi day lower bound inclusive and next day exclusive");
  check(day.wallet.issuances === 4 && day.engagement.menu_view.events === 3, "date range applies equally to all sections");
  check((await analytics(11)).confirmed.stamp.operations === 1 && (await analytics(11)).wallet.customers === 0, "strict brand isolation");
  const old = await analytics(10,"2026-01-01","2026-01-02");
  check(old.wallet.issuances === 0 && Object.keys(old.engagement).length === 0, "old installed pass is not an inferred download");
  const dto = {};
  new Function("require","exports",ts.transpileModule(await readFile("lib/analytics/brand-analytics.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(createRequire(import.meta.url),dto);
  check(dto.brandAnalyticsSchema.safeParse(day).success && dto.brandAnalyticsSchema.safeParse(empty).success, "actual database DTO matches runtime schema");
  await db.exec("RESET ROLE");
  await query("UPDATE public.cafe_loyalty_programs SET enabled=false WHERE cafe_id=$1",[id(10)]);
  await db.exec("SET ROLE service_role"); check(!(await record(115,"d","loyalty_qr_visit")), "disabled program rejects new landing visits");
  await db.exec("RESET ROLE");
  await query("UPDATE public.cafes SET status='suspended',is_public=false WHERE id=$1",[id(11)]);
  await db.exec("SET ROLE service_role"); check(await record(116,"d","menu_view","beta"), "menu independent publication contract preserved");
  await db.exec("RESET ROLE");
  await db.exec(await readFile("supabase/tests/brand_analytics_postflight.sql","utf8")); checks++;
  console.log(`PASS brand analytics PostgreSQL: ${checks} checks (${((performance.now()-started)/1000).toFixed(2)}s)`);
} finally { await db.close(); }
