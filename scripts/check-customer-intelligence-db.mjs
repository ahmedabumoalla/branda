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
    CREATE TABLE public.cafes(id uuid PRIMARY KEY,name text,slug text,deleted_at timestamptz,owner_user_id uuid);
    CREATE TABLE public.cafe_members(cafe_id uuid,user_id uuid,role text);
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

  await db.exec(await readFile("supabase/migrations/20261010010926_customer_intelligence.sql","utf8"));
  const asUser=async number=>{await db.exec("RESET ROLE");await query("SELECT set_config('request.jwt.claim.sub',$1,false)",[number?id(number):""]);await db.exec("SET ROLE authenticated");};
  const listing=(search="",brand=null,segment="all",sort="recent",page=1)=>value("SELECT public.get_customer_intelligence($1,$2,$3,$4,$5)",[search,brand,segment,sort,page]);
  const detail=(customer=20,page=1,kind="all")=>value("SELECT public.get_customer_intelligence_detail($1,$2,$3)",[id(customer),page,kind]);
  for(const user of [0,2,3,4,5]){await asUser(user);await rejects(()=>listing());await rejects(()=>detail());}
  await asUser(1);
  let page=await listing();
  check(page.total===4,"shared phone memberships aggregate into one customer with conflicts separate");
  const shared=page.customers.find(x=>x.id===id(20));
  check(shared.brandCount===2&&shared.brands.length===2,"all associated brands visible");
  check(shared.stamps===15&&shared.scans===1,"actual stamp balance and successful scans");
  check(shared.activeSeconds===null&&shared.device===null&&shared.lastSeenAt===null,"historical duration and device never invented");
  check((await listing("",null,"shared")).total===1,"unique shared customers segment");
  check((await listing("",id(11))).customers.find(x=>x.id===id(20)).brandCount===2,"brand filter preserves other memberships");
  check((await listing("BETA@")).total===1,"search matches any associated profile");
  check((await listing("%")).total===0,"literal wildcard search");
  check((await listing("",null,"all","recent",2)).customers.length===0,"bounded pagination");
  for(const args of [["",null,"bad"],["",null,"all","bad"],["",null,"all","recent",0],["x".repeat(101)]])await rejects(()=>listing(...args));
  await rejects(()=>detail(999));await rejects(()=>detail(20,0));await rejects(()=>detail(20,1,"bad"));
  check((await detail()).events.some(e=>e.kind==="scan"&&e.source==="loyalty"),"actual QR preview timeline");
  check((await detail(20,1,"browser")).events.length===0,"source filter excludes loyalty/wallet");
  await rejects(()=>query("SELECT * FROM customer_analytics_private.sessions"));
  const device={type:"mobile",name:"iPhone",os:"iOS",browser:"Safari"};
  const record=(session=70,seconds=0,user=50,slug="alpha",kind="menu_view")=>query("SELECT public.record_customer_activity($1,$2,$3,$4,$5,$6)",[id(user),slug,id(session),kind,seconds,device]);
  await rejects(()=>record());
  await db.exec("RESET ROLE; SET ROLE anon");await rejects(()=>listing());await rejects(()=>record());
  await db.exec("RESET ROLE; SET ROLE service_role");await rejects(()=>listing());await rejects(()=>query("SELECT * FROM customer_analytics_private.sessions"));
  await record();await record();
  await db.exec("RESET ROLE");
  check(await value("SELECT count(*)::int FROM customer_analytics_private.sessions")===1,"idempotent start");
  await query("UPDATE customer_analytics_private.sessions SET reported_at=clock_timestamp()-interval '25 seconds'");
  await query("UPDATE customer_analytics_private.meters SET credited_at=clock_timestamp()-interval '25 seconds'");
  await db.exec("SET ROLE service_role");await record(70,20);await record(70,20);await record(70,10);
  await asUser(1);page=await listing();
  const measured=page.customers.find(x=>x.id===id(20));
  check(measured.activeSeconds===20&&measured.sessions===1&&measured.menuSessions===1,"cumulative retry dedup and cross-brand association no double counting");
  check(measured.device.name==="iPhone"&&measured.lastSeenAt!==null,"actual measured device and usage date");
  check(page.summary.measured===1&&page.summary.activeSeconds===20,"summary totals unique identities");
  check((await listing("",null,"unmeasured")).total===3,"historical segment excludes measured");
  await db.exec("RESET ROLE; SET ROLE service_role");
  await record(71,200);await record(72,0,50,"beta","loyalty_qr_visit");
  await record(70,21600);
  await record(73,0,999);
  await rejects(()=>record(70,30,50,"beta"));
  await rejects(()=>record(70,30,50,"alpha","loyalty_direct_visit"));
  await rejects(()=>record(74,-1));
  await asUser(1);
  const after=(await listing()).customers.find(x=>x.id===id(20));
  check(after.activeSeconds===20,"first authenticated report does not credit anonymous time and forged jumps wallclock capped");
  check(after.sessions===3&&after.loyaltySessions===1,"menu and loyalty distinct usage");
  const timeline=await detail(20,1,"browser");
  check(timeline.total===3&&timeline.events.some(e=>e.kind==="loyalty_qr_visit"&&e.brandName==="Beta"),"QR URL visits distinctly labeled and brand-scoped");
  for(const secret of ["private-card","secret-device","secret-push","secret-reward","identity_key","user_id"])check(!JSON.stringify({page,timeline}).includes(secret),"no private identifiers or bearer credentials");
  await db.exec("RESET ROLE");
  check(await value("SELECT count(*)::int FROM customer_analytics_private.sessions")===3,"unregistered actor cannot generate customer activity");
  await query("UPDATE public.customer_profiles SET user_id=$1 WHERE id=$2",[id(99),id(22)]);
  await db.exec("SET ROLE service_role");await rejects(()=>record(70,30,99));
  await db.exec("RESET ROLE");
  await query("UPDATE customer_analytics_private.sessions SET reported_at=clock_timestamp()-interval '25 seconds' WHERE id IN($1,$2)",[id(71),id(72)]);
  await query("UPDATE customer_analytics_private.meters SET credited_at=clock_timestamp()-interval '25 seconds'");
  await db.exec("SET ROLE service_role");await record(71,220);await record(72,20,50,"beta","loyalty_qr_visit");
  await asUser(1);check((await listing()).customers.find(x=>x.id===id(20)).activeSeconds===40,"overlapping tabs cannot double-credit the same elapsed interval");
  await db.exec("RESET ROLE");
  await query("UPDATE public.customer_profiles SET status='blocked' WHERE user_id=$1",[id(50)]);
  await db.exec("SET ROLE service_role");await record(75);
  await db.exec("RESET ROLE");check(await value("SELECT count(*)::int FROM customer_analytics_private.sessions")===3,"blocked customer cannot append activity");
  console.log(`Customer intelligence PostgreSQL: ${checks} checks passed in ${Math.round(performance.now()-started)}ms`);
} finally { await db.close(); }
