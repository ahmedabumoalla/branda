import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

// Execute actual migration SQL in isolated PostgreSQL/WASM; never touches production.
const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const query = (text, values = []) => db.query(text, values);
const value = async (text, values = []) => Object.values((await query(text, values)).rows[0])[0];
const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const rejects = async (operation) => { await assert.rejects(operation); checks++; };
const started = performance.now();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);
    CREATE TABLE public.cafes(id uuid PRIMARY KEY,name text,slug text,deleted_at timestamptz);
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
  await db.exec(audit.slice(audit.indexOf("CREATE SCHEMA IF NOT EXISTS loyalty_audit_private"), audit.indexOf("CREATE FUNCTION loyalty_audit_private.can_read")));
  await query("INSERT INTO public.profiles(id,role,status) VALUES($1,'platform_admin','active'),($2,'platform_admin','suspended'),($3,'owner','active'),($4,'manager','active'),($5,'customer','active')", [1, 2, 3, 4, 5].map(id));
  await query("INSERT INTO public.cafes(id,name,slug) VALUES($1,'Alpha','alpha'),($2,'Beta','beta'),($3,'Empty','empty')", [id(10), id(11), id(12)]);
  await query(`INSERT INTO public.customer_profiles(id,cafe_id,full_name,phone,email,phone_normalized,user_id) VALUES
    ($1,$6,'Shared Alpha','0500000001','alpha@example.test','966500000001',$8),
    ($2,$7,'Shared Beta','+966500000001','beta@example.test','966500000001',$8),
    ($3,$6,'Independent','0500000002','one@example.test','966500000002',NULL),
    ($4,$7,'Without card','0500000003','','966500000003',NULL),
    ($5,$6,'Conflicted','0500000001','','966500000001',NULL)`, [id(20), id(21), id(22), id(23), id(24), id(10), id(11), id(50)]);
  await query("UPDATE public.customer_profiles SET phone_auth_conflict=true WHERE id=$1", [id(24)]);
  await query(`INSERT INTO public.loyalty_cards(id,cafe_id,customer_profile_id,customer_name,card_code,total_purchases,stamps_in_cycle) VALUES
    ($1,$4,$6,'Shared Alpha','private-card-alpha',12,5),($2,$5,$7,'Shared Beta','private-card-beta',3,3),($3,$4,$8,'Independent','private-card-single',0,0)`, [id(30), id(31), id(32), id(10), id(11), id(20), id(21), id(22)]);
  await query("INSERT INTO public.wallet_passes(card_id,cafe_id,provider) VALUES($1,$2,'apple')", [id(30), id(10)]);
  await query("INSERT INTO public.wallet_apple_registrations(cafe_id,device_library_id,pass_type_id,card_id,push_token,created_at) VALUES($1,'secret-device','secret-pass',$2,'secret-push','2026-01-01T10:00:00Z')", [id(10), id(30)]);
  await query(`INSERT INTO public.customer_reward_instances(cafe_id,customer_id,loyalty_card_id,source_type,reward_title,reward_code,qr_payload,status,expires_at,redeemed_at) VALUES
    ($1,$2,$3,'loyalty','Fresh reward','secret-reward-1','secret-qr-1','available',now()+interval '1 day',NULL),
    ($1,$2,$3,'loyalty','Expired reward','secret-reward-2','secret-qr-2','available',now()-interval '1 day',NULL),
    ($1,$2,$3,'loyalty','Redeemed reward','secret-reward-3','secret-qr-3','redeemed',now()-interval '1 day',now()-interval '2 days'),
    ($1,$2,$3,'loyalty','Cancelled reward','secret-reward-4','secret-qr-4','cancelled',now()-interval '1 day',NULL),
    ($1,NULL,$3,'loyalty','Legacy link reward','secret-reward-5','secret-qr-5','expired',now()-interval '1 day',NULL)`, [id(10), id(20), id(30)]);
  await query(`INSERT INTO public.loyalty_activity_events(cafe_id,card_id,kind,outcome,actor_type,actor_name,stamps_delta,stamps_after) VALUES
    ($1,$2,'scan','success','cashier','Employee',0,0),($1,$2,'scan','denied','cashier','Employee',0,0),
    ($1,$2,'stamp','success','cashier','Employee',1,1),($1,$2,'stamp','duplicate','cashier','Employee',0,1)`, [id(10), id(30)]);
  await db.exec(await readFile("supabase/migrations/20261004121343_admin_brand_customers.sql", "utf8"));
  const asUser = async (number) => { await db.exec("RESET ROLE"); await query("SELECT set_config('request.jwt.claim.sub',$1,false)", [number ? id(number) : ""]); await db.exec("SET ROLE authenticated"); };
  const listing = (options = {}) => value("SELECT public.get_admin_brand_customers($1,$2,$3,$4,$5,$6)", [options.search ?? "", options.brand ?? null, options.segment ?? "all", options.sort ?? "recent", options.page ?? 1, options.size ?? 25]);
  const detail = (number = 20, page = 1, size = 25) => value("SELECT public.get_admin_brand_customer_detail($1,$2,$3)", [id(number), page, size]);
  for (const user of [0, 2, 3, 4, 5]) { await asUser(user); await rejects(() => listing()); await rejects(() => detail()); }
  await asUser(1);
  const page = await listing();
  check(page.total === 5 && page.summary.memberships === 5, "include enrolled profiles without cards");
  check(page.summary.uniqueCustomers === 4 && page.summary.sharedCustomers === 1, "normalized phone groups across brands, conflicts stay separate");
  check(page.summary.stamps === 15 && page.summary.scans === 1, "stamp balance separate from actual successful previews");
  check(page.summary.rewardsEarned === 5 && page.summary.rewardsRedeemed === 1 && page.summary.rewardsExpired === 2, "expired unclaimed only, not cancelled or redeemed");
  const member = page.customers.find((item) => item.id === id(20));
  check(member.rewardsAvailable === 1 && member.stampTransactions === 1 && member.scans === 1, "separate real events and spendable rewards");
  check(member.sharedBrands.length === 2 && member.identityMatch === "phone" && member.isFrequent, "shared identity and honest frequent rule");
  check(member.firstDownloadAt === null && member.downloadCount === 0, "legacy download time not invented");
  check(Date.parse(member.firstInstalledAt) === Date.parse("2026-01-01T10:00:00Z") && member.installedDeviceCount === 1, "historical device registration retained");
  check(member.walletProviders.length === 1 && member.walletProviders[0] === "apple", "known wallet providers only");
  check((await listing({ segment: "shared" })).total === 2, "shared membership filter");
  check((await listing({ segment: "frequent" })).total === 1, "frequent at ten lifetime stamps");
  check((await listing({ segment: "expired" })).total === 1 && (await listing({ segment: "rewarded" })).total === 1, "reward segments");
  const beta = await listing({ brand: id(11) });
  check(beta.total === 2 && beta.summary.stamps === 3 && beta.brands.length === 2, "brand summary keeps switcher and scoped totals");
  check(beta.customers.find((item) => item.id === id(21)).sharedBrands.length === 2, "selected brand retains cross-brand visibility for admin");
  check((await listing({ search: "BETA@" })).total === 1, "case-insensitive email search");
  check((await listing({ search: "%" })).total === 0 && (await listing({ search: "' OR true --" })).total === 0, "search treats SQL and wildcard input literally");
  check((await listing({ page: 2, size: 2 })).customers.length === 2 && (await listing({ page: 4, size: 2 })).customers.length === 0, "bounded deterministic pagination");
  check((await listing({ sort: "stamps" })).customers[0].id === id(20), "stamps ranking");
  check((await listing({ sort: "rewards" })).customers[0].id === id(20), "redemption ranking");
  for (const options of [{ page: 0 }, { size: 51 }, { segment: "invalid" }, { search: "a".repeat(101) }, { sort: "invalid" }]) await rejects(() => listing(options));
  await rejects(() => detail(999));
  await rejects(() => detail(20, 0));
  const full = await detail();
  check(full.memberships.length === 2 && full.customer.id === id(20), "detail memberships scoped to same identity");
  check(full.events.filter((e) => e.kind === "reward_expired").length === 2, "expiry timeline excludes redeemed/cancelled");
  check(full.events.some((e) => e.kind === "stamp" && e.actorName === "Employee"), "employee and stamp event details");
  check(full.events.some((e) => e.kind === "installed" && e.origin === "historical"), "historical installation provenance");
  check(full.events.length === full.total && (await detail(20, 2, 3)).events.length === 3, "timeline pagination");
  check((await detail(23)).events.length === 1 && (await detail(23)).customer.cardId === null, "profile before card has honest enrollment timeline");
  const serialized = JSON.stringify({ page, full });
  for (const sensitive of ["private-card", "secret-device", "secret-push", "secret-pass", "secret-reward", "secret-qr", "identity_key"]) check(!serialized.includes(sensitive), "no bearer token or private identity machinery in admin DTO");
  await rejects(() => query("SELECT * FROM loyalty_audit_private.brand_customer_rows"));
  await rejects(() => query("SELECT * FROM loyalty_audit_private.wallet_customer_events"));
  await rejects(() => query("SELECT public.record_wallet_download($1,'apple')", [id(30)]));
  await db.exec("RESET ROLE; SET ROLE anon");
  await rejects(() => listing()); await rejects(() => detail());
  await db.exec("RESET ROLE; SET ROLE service_role");
  await rejects(() => listing()); await rejects(() => detail());
  await rejects(() => query("SELECT * FROM loyalty_audit_private.wallet_customer_events"));
  await query("SELECT public.record_wallet_download($1,'apple')", [id(30)]);
  await query("SELECT public.record_wallet_download($1,'apple')", [id(30)]);
  await rejects(() => query("SELECT public.record_wallet_download($1,'google')", [id(30)]));
  await rejects(() => query("SELECT public.record_wallet_download($1,'invalid')", [id(30)]));
  await query("INSERT INTO public.wallet_passes(card_id,cafe_id,provider) VALUES($1,$2,'google')", [id(30), id(10)]);
  await query("SELECT public.record_wallet_download($1,'google')", [id(30)]);
  await query("UPDATE public.wallet_passes SET apple_last_served_update=updated_at WHERE card_id=$1 AND provider='apple'", [id(30)]);
  const initialVersion = await value("SELECT updated_at::text FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(30)]);
  await query("INSERT INTO public.wallet_apple_registrations(cafe_id,device_library_id,pass_type_id,card_id,push_token) VALUES($1,'second-device','pass',$2,'second-token')", [id(10), id(30)]);
  check(await value("SELECT apple_last_served_update IS NULL AND updated_at>$2::timestamptz FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(30), initialVersion]), "new device atomically advances version and invalidates old-device acknowledgement");
  check(await value("SELECT count(*)::int FROM public.wallet_notification_jobs WHERE card_id=$1 AND status='pending'", [id(30)]) === 1, "registration atomically queues durable sync");
  await query("UPDATE public.wallet_passes SET apple_last_served_update=updated_at WHERE card_id=$1 AND provider='apple'", [id(30)]);
  const beforeToken = await value("SELECT updated_at::text FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(30)]);
  await query("UPDATE public.wallet_notification_jobs SET attempts=4,delivery_state='{\"apple\":{\"status\":\"accepted\"}}',available_at=now()+interval '1 hour',last_error='old-attempt' WHERE card_id=$1 AND status='pending'", [id(30)]);
  await query("UPDATE public.wallet_apple_registrations SET push_token='renewed-token' WHERE device_library_id='second-device'");
  check(await value("SELECT apple_last_served_update IS NULL AND updated_at>$2::timestamptz FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(30), beforeToken]), "token replacement invalidates acknowledgement and advances version");
  check(await value("SELECT attempts=0 AND delivery_state='{}'::jsonb AND available_at<=clock_timestamp() AND last_error IS NULL FROM public.wallet_notification_jobs WHERE card_id=$1 AND status='pending'", [id(30)]), "new device/token gets a fresh retry budget without stale provider state");
  const afterToken = await value("SELECT updated_at::text FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(30)]);
  await query("UPDATE public.wallet_passes SET apple_last_served_update=updated_at WHERE card_id=$1 AND provider='apple'", [id(30)]);
  await query("UPDATE public.wallet_apple_registrations SET push_token='renewed-token' WHERE device_library_id='second-device'");
  check(await value("SELECT apple_last_served_update=updated_at AND updated_at=$2::timestamptz FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(30), afterToken]), "unchanged token does not invalidate fetched version");
  await query("DELETE FROM public.wallet_apple_registrations WHERE device_library_id='second-device'");
  check(await value("SELECT apple_last_served_update IS NULL AND updated_at>$2::timestamptz FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(30), afterToken]), "device removal invalidates the old device set watermark");
  check(await value("SELECT count(*)::int FROM public.wallet_notification_jobs WHERE card_id=$1 AND status='pending'", [id(30)]) === 1, "registration changes coalesce duplicate pending jobs");
  await query("INSERT INTO public.wallet_apple_registrations(cafe_id,device_library_id,pass_type_id,card_id,push_token) VALUES($1,'first-device-no-pass','pass',$2,'new-token')", [id(11), id(31)]);
  check(await value("SELECT count(*)::int FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(31)]) === 1, "first registration atomically creates missing pass state");
  check(await value("SELECT count(*)::int FROM public.wallet_notification_jobs WHERE card_id=$1 AND status='pending'", [id(31)]) === 1, "first registration with no previous pass still queues sync");
  await query("DELETE FROM public.wallet_apple_registrations WHERE device_library_id='first-device-no-pass'");
  check(await value("SELECT count(*)::int FROM public.wallet_apple_registrations WHERE card_id=$1", [id(31)]) === 0, "last-device unregister succeeds");
  check(await value("SELECT apple_last_served_update IS NULL FROM public.wallet_passes WHERE card_id=$1 AND provider='apple'", [id(31)]), "last-device unregister never preserves old acknowledgement");
  await query("INSERT INTO public.wallet_apple_registrations(cafe_id,device_library_id,pass_type_id,card_id,push_token) VALUES($1,'cascade-device','pass',$2,'cascade-token')", [id(10), id(32)]);
  await db.exec("RESET ROLE");
  await query("DELETE FROM public.loyalty_cards WHERE id=$1", [id(32)]);
  check(await value("SELECT count(*)::int FROM public.wallet_notification_jobs WHERE card_id=$1", [id(32)]) === 0, "cascading card deletion is not blocked by reconciliation insertion");
  check(await value("SELECT count(*)::int FROM loyalty_audit_private.wallet_customer_events WHERE card_id=$1 AND kind='unregistered'", [id(32)]) === 1, "cascade keeps unregistration history after card removal");
  await query("INSERT INTO public.customer_profiles(id,cafe_id,full_name,phone) VALUES($1,$2,'Cascade customer','')", [id(90), id(12)]);
  await query("INSERT INTO public.loyalty_cards(id,cafe_id,customer_profile_id,customer_name) VALUES($1,$2,$3,'Cascade customer')", [id(91), id(12), id(90)]);
  await query("INSERT INTO public.wallet_apple_registrations(cafe_id,device_library_id,pass_type_id,card_id,push_token) VALUES($1,'brand-cascade-device','pass',$2,'brand-cascade-token')", [id(12), id(91)]);
  // The production customer FK cascades; this minimal profile fixture has a
  // restrictive FK, so remove that unrelated restriction for the brand delete.
  await db.exec("ALTER TABLE public.customer_profiles DROP CONSTRAINT customer_profiles_cafe_id_fkey; ALTER TABLE public.customer_profiles ADD FOREIGN KEY(cafe_id) REFERENCES public.cafes(id) ON DELETE CASCADE");
  await query("DELETE FROM public.cafes WHERE id=$1", [id(12)]);
  check(await value("SELECT count(*)::int FROM public.wallet_passes WHERE card_id=$1", [id(91)]) === 0, "brand cascade does not recreate vanished passes");
  check(await value("SELECT count(*)::int FROM loyalty_audit_private.wallet_customer_events WHERE card_id=$1 AND kind='unregistered'", [id(91)]) === 1, "brand cascade preserves factual history");
  await asUser(1);
  const current = await detail();
  check(current.customer.downloadCount === 2 && current.customer.firstDownloadAt !== null, "every generated Apple initial issuance tracked");
  check(current.customer.installedDeviceCount === 1, "current installation count after unregister");
  check(current.events.filter((e) => e.kind === "installed").length === 2 && current.events.filter((e) => e.kind === "unregistered").length === 1, "registration history persists without token-refresh duplication");
  check(current.events.filter((e) => e.kind === "save_link").length === 1 && current.customer.walletProviders.length === 2, "Google save link never claims installation");
  const exports = {};
  const validationSource = ts.transpileModule(await readFile("lib/admin/brand-customer-validation.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "exports", validationSource)(createRequire(import.meta.url), exports);
  check(exports.brandCustomersPageSchema.safeParse(await listing()).success, "real PostgreSQL list matches runtime DTO schema");
  check(exports.brandCustomerDetailSchema.safeParse(current).success, "real PostgreSQL timeline matches runtime DTO schema");
  await db.exec("RESET ROLE");
  await query("INSERT INTO public.customer_reward_instances(id,cafe_id,customer_id,source_type,reward_title,reward_code,qr_payload,status,redeemed_at) VALUES($1,$2,$3,'experience','Customer-only reward','secret-experience','secret-experience-qr','redeemed',now())", [id(70), id(11), id(23)]);
  await asUser(1);
  const oldExperience = await detail(23);
  check(oldExperience.events.filter((e) => e.kind === "redeem").length === 1 && oldExperience.customer.rewardsRedeemed === 1, "old experience redemption without card remains visible");
  await db.exec("RESET ROLE");
  await query("INSERT INTO public.customer_reward_redemptions(id,cafe_id,reward_instance_id,customer_id,scanned_code) VALUES($1,$2,$3,$4,'secret-experience')", [id(71), id(11), id(70), id(23)]);
  await query("INSERT INTO public.loyalty_activity_events(cafe_id,kind,outcome,actor_type,actor_name,source_redemption_id) VALUES($1,'redeem','success','cashier','Experience employee',$2)", [id(11), id(71)]);
  await asUser(1);
  const capturedExperience = await detail(23);
  check(capturedExperience.events.filter((e) => e.kind === "redeem").length === 1 && capturedExperience.events.find((e) => e.kind === "redeem").actorName === "Experience employee", "captured customer-only redemption preserves actor without duplicate");
  await db.exec("RESET ROLE");
  await query("INSERT INTO public.customer_profiles(id,cafe_id,user_id,full_name,phone) VALUES($1,$3,$5,'Account A',''),($2,$4,$5,'Account B','')", [id(80), id(81), id(10), id(11), id(82)]);
  await asUser(1);
  const accountMember = (await listing({ search: "Account A" })).customers[0];
  check(accountMember.identityMatch === "account" && accountMember.sharedBrands.length === 2, "linked auth account groups when no reliable phone exists");
  await db.exec("RESET ROLE");
  check(await value("SELECT relrowsecurity FROM pg_class WHERE oid='loyalty_audit_private.wallet_customer_events'::regclass"), "private history has RLS");
  check(await value("SELECT apple_last_served_update IS NULL FROM public.wallet_passes LIMIT 1"), "legacy Apple delivery is not acknowledged by migration");
  const plan = await query("EXPLAIN SELECT * FROM loyalty_audit_private.brand_customer_rows WHERE id=$1", [id(20)]);
  check(plan.rows.length > 0, "planner accepts membership query with production indexes");
  await db.exec(await readFile("supabase/tests/brand_customers_postflight.sql", "utf8")); checks++;
  console.log(`PASS brand customers PostgreSQL: ${checks} checks (${((performance.now() - started) / 1000).toFixed(2)}s)`);
} finally { await db.close(); }
