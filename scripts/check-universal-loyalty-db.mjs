import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Standalone PostgreSQL/WASM integration harness. Install the test-only engine outside
// the repository: npm install --prefix "$env:TEMP/branda-loyalty-sql-tests" --no-package-lock --ignore-scripts @electric-sql/pglite
const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const sql = (query, params = []) => db.query(query, params);
const one = async (query, params = []) => (await sql(query, params)).rows[0];
const scalar = async (query, params = []) => Object.values(await one(query, params))[0];
const cafe = "10000000-0000-4000-8000-000000000001";
const otherCafe = "10000000-0000-4000-8000-000000000002";
const owner = "20000000-0000-4000-8000-000000000001";
const customer = "20000000-0000-4000-8000-000000000002";
const profile = "30000000-0000-4000-8000-000000000001";
const cashier = "40000000-0000-4000-8000-000000000001";
const otherCashier = "40000000-0000-4000-8000-000000000002";
let sequence = 0;
const request = () => `50000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const rejects = async (operation, message) => { await assert.rejects(operation, message); checks++; };

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, phone text, phone_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, full_name text, status text DEFAULT 'active', role text DEFAULT 'customer'); CREATE TABLE public.cafe_members(cafe_id uuid, user_id uuid, role text);
    CREATE TABLE public.cafes(id uuid PRIMARY KEY,slug text,name text,owner_id uuid,owner_user_id uuid,status text DEFAULT 'active',is_public boolean DEFAULT true,deleted_at timestamptz);
    CREATE TABLE public.menu_products(id uuid PRIMARY KEY,cafe_id uuid REFERENCES public.cafes(id),name text);
    CREATE TABLE public.customer_profiles(id uuid PRIMARY KEY,cafe_id uuid REFERENCES public.cafes(id),user_id uuid REFERENCES auth.users(id),
      full_name text,phone text,email text,phone_normalized text,phone_auth_conflict boolean DEFAULT false,status text DEFAULT 'active',blocked_at timestamptz,UNIQUE(id,cafe_id));
    CREATE TABLE public.customer_phone_otp_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid REFERENCES public.cafes(id),phone_normalized text,provider_instance text,status text DEFAULT 'pending',created_at timestamptz DEFAULT now());
    CREATE FUNCTION public.has_cafe_permission(cafe_id uuid,permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
      $$ SELECT EXISTS(SELECT 1 FROM public.cafes c WHERE c.id=cafe_id AND c.owner_id=auth.uid()) $$;
    CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin') $$;
    CREATE FUNCTION public.get_customer_profile_id(cafe_id uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    CREATE FUNCTION public.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat('ab',n),'hex') $$;
    CREATE FUNCTION extensions.crypt(plaintext text,salt text) RETURNS text LANGUAGE sql STRICT AS $$ SELECT CASE WHEN plaintext='valid-fixture' THEN salt ELSE 'bad' END $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  `);
  // Use the real historical table and reward-trigger definitions, with only unsupported
  // extension installation omitted. Token entropy itself is outside this SQL harness.
  const base = await readFile("supabase/migrations/013_barndaksa_loyapro_wallet_loyalty_system.sql","utf8");
  await db.exec(base.slice(base.indexOf("CREATE TABLE IF NOT EXISTS public.cafe_loyalty_programs"),base.indexOf("CREATE INDEX IF NOT EXISTS idx_loyalty_cards_cafe_updated")));
  await db.exec(`
    ALTER TABLE public.cafe_loyalty_programs ADD COLUMN card_design jsonb NOT NULL DEFAULT '{}';
    ALTER TABLE public.cafe_cashier_sessions ADD COLUMN revoked_at timestamptz;
    CREATE UNIQUE INDEX loyalty_cards_id_cafe_id_unique ON public.loyalty_cards(id,cafe_id);
    CREATE TABLE public.cafe_cashier_activity_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,cashier_id uuid,action_type text,target_type text,target_id uuid,invoice_barcode text,details jsonb,created_at timestamptz DEFAULT now());
    CREATE FUNCTION public.record_loyalty_card_operation(p_cafe_id uuid,p_card_code text,p_invoice_barcode text,p_invoice_amount numeric,p_operation text,p_cashier_session_token text DEFAULT NULL)
      RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"legacy":true}'::jsonb $$;
    CREATE FUNCTION public.issue_loyalty_card_for_customer(p_cafe_slug text) RETURNS text LANGUAGE sql AS $$ SELECT 'legacy-card' $$;
  `);
  const rewards = (await readFile("supabase/migrations/064_customer_reward_instances.sql","utf8")).replace(/\r\n/g,"\n");
  await db.exec(rewards.slice(rewards.indexOf("CREATE TABLE IF NOT EXISTS public.customer_reward_instances"),rewards.indexOf("INSERT INTO public.customer_reward_instances (\n  cafe_id")));
  await sql("INSERT INTO auth.users(id,phone,phone_confirmed_at) VALUES($1,'966500000001',now()),($2,'966500000002',now())",[owner,customer]);
  await sql("INSERT INTO cafes(id,slug,name,owner_id) VALUES($1,'rast','Rast',$3),($2,'other','Other',$3)",[cafe,otherCafe,owner]);
  await sql("INSERT INTO cafe_loyalty_programs(cafe_id,purchases_required,reward_name) VALUES($1,2,'Other')",[otherCafe]);
  await db.exec(await readFile("supabase/migrations/20261002234900_loyalty_experience_atomic_scanner.sql","utf8"));
  await db.exec(await readFile("supabase/migrations/20261003003340_rast_wallet_device_limit.sql","utf8"));
  await db.exec(await readFile("supabase/migrations/20261003005624_rast_cashier_only_stamps.sql","utf8"));
  await db.exec(await readFile("supabase/migrations/20261004112815_loyalty_activity_audit.sql","utf8"));
  await db.exec(`
    CREATE SCHEMA platform_access_private;
    GRANT USAGE ON SCHEMA platform_access_private TO anon,authenticated,service_role;
    CREATE TABLE platform_plans(id text PRIMARY KEY,features jsonb,active boolean DEFAULT true);
    CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid,plan_id text,status text DEFAULT 'active',started_at timestamptz DEFAULT now(),expires_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE brand_feature_overrides(cafe_id uuid,feature_id text,enabled boolean);
    ALTER TABLE cafe_cashiers ADD COLUMN can_use_loyalty boolean DEFAULT true;
    CREATE SCHEMA brand_analytics_private;
    CREATE TABLE brand_analytics_private.events(id uuid PRIMARY KEY,cafe_id uuid,visitor_key text,kind text,occurred_at timestamptz DEFAULT now());
  `);
  const boundaries=await readFile("supabase/migrations/20261009193000_package_service_boundaries.sql","utf8");
  await db.exec(boundaries.slice(boundaries.indexOf('CREATE FUNCTION platform_access_private.service_enabled'),boundaries.indexOf('-- Preserve underlying')));
  const engagementStart=boundaries.indexOf('CREATE OR REPLACE FUNCTION public.record_brand_engagement');
  await db.exec(boundaries.slice(engagementStart,boundaries.indexOf('END $$;',engagementStart)+7));
  const staffMigration=await readFile('supabase/migrations/20261011013346_pager_staff_permissions.sql','utf8');
  const staffGuardStart=staffMigration.indexOf('CREATE FUNCTION platform_access_private.assert_cashier_loyalty');
  const staffPatchEnd=staffMigration.indexOf(' -- The owner still authenticates');
  await db.exec(staffMigration.slice(staffGuardStart,staffPatchEnd)+'END $$;');
  await sql("INSERT INTO platform_plans(id,features) VALUES('full','[\"menu\",\"loyalty\"]'),('menu','[\"menu\"]')");
  await sql("INSERT INTO subscriptions(cafe_id,plan_id,expires_at) VALUES($1,'full',now()+interval '1 month'),($2,'full',now()+interval '1 month')",[cafe,otherCafe]);
  const before=await scalar("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY cafe_id)::text) FROM cafe_loyalty_programs t");
  await db.exec(await readFile('supabase/migrations/20261011134719_universal_package_loyalty.sql','utf8'));
  check(before===await scalar("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY cafe_id)::text) FROM cafe_loyalty_programs t"),'migration does not rewrite brand programs');
  for(const name of ['scan_loyalty_stamp(text,text,uuid)','redeem_loyalty_reward(text,text,uuid)','preview_loyalty_card(text,text)','preview_loyalty_reward(text,text)','execute_loyalty_audited_operation(text,text,uuid,text)']) {
    const body=await scalar('SELECT pg_get_functiondef($1::regprocedure)',[name]);
    check(body.includes('assert_cashier_loyalty'),'existing staff guard preserved '+name);
    check(!/slug\s*=\s*'rast'/.test(body),'no hardcoded brand '+name);
  }
  await sql("INSERT INTO profiles(id,full_name) VALUES($1,'Owner'),($2,'Customer')",[owner,customer]);
  await sql("UPDATE cafes SET owner_user_id=$1",[owner]);
  await sql("UPDATE cafe_loyalty_programs SET enabled=true,purchases_required=2,reward_name='Own brand coffee'");
  await sql("INSERT INTO customer_profiles(id,cafe_id,user_id,full_name,phone,phone_normalized) VALUES($1,$2,$3,'Other member','966500000002','966500000002')",[profile,otherCafe,customer]);
  await sql("INSERT INTO cafe_cashiers(id,cafe_id,full_name,email,password_hash,temporary_password) VALUES($1,$2,'Rast cashier','a@example.test','fixture',''),($3,$4,'Other cashier','b@example.test','fixture','')",[cashier,cafe,otherCashier,otherCafe]);
  await sql("INSERT INTO cafe_cashier_sessions(cashier_id,cafe_id,token) VALUES($1,$2,'rast-token'),($3,$4,'other-token')",[cashier,cafe,otherCashier,otherCafe]);
  await db.exec('GRANT SELECT ON cafes TO service_role; GRANT SELECT,UPDATE ON loyalty_cards TO service_role');
  await db.exec('SET ROLE service_role');
  const cardCode=await scalar('SELECT issue_rast_loyalty_card($1)',[profile]);
  check(typeof cardCode==='string','verified non-Rast customer receives a card');
  check(cardCode===await scalar('SELECT issue_rast_loyalty_card($1)',[profile]),'repeated enrollment keeps the same card');
  check((await scalar('SELECT preview_loyalty_card($1,$2)',['other-token',cardCode])).ok,'non-Rast cashier can preview own card');
  check(!(await scalar('SELECT preview_loyalty_card($1,$2)',['rast-token',cardCode])).ok,'cross-brand cashier cannot preview card');
  const first=request();
  check((await scalar('SELECT execute_loyalty_audited_operation($1,$2,$3,$4)',['other-token',cardCode,first,'stamp'])).status==='stamped','non-Rast stamp runs approved audited engine');
  check((await scalar('SELECT execute_loyalty_audited_operation($1,$2,$3,$4)',['other-token',cardCode,first,'stamp'])).replayed,'same request is idempotent');
  await db.exec('RESET ROLE');
  await sql("UPDATE loyalty_card_events SET created_at=now()-interval '1 minute' WHERE cafe_id=$1",[otherCafe]);
  await db.exec('SET ROLE service_role');
  const reward=await scalar('SELECT execute_loyalty_audited_operation($1,$2,$3,$4)',['other-token',cardCode,request(),'stamp']);
  check(reward.status==='reward_issued','cycle completion issues a reward');
  await db.exec('RESET ROLE');
  const issued=await one('SELECT * FROM customer_reward_instances WHERE cafe_id=$1',[otherCafe]);
  check(issued.metadata.termsSnapshot.rewardName==='Own brand coffee','reward stores this brand own terms');
  check(issued.expires_at!==null,'reward validity date set for non-Rast');
  await rejects(()=>sql("UPDATE customer_reward_instances SET reward_title='changed' WHERE id=$1",[issued.id]),/immutable|terms|cannot/i);
  await db.exec('SET ROLE service_role');
  check((await scalar('SELECT preview_loyalty_reward($1,$2)',['other-token',issued.reward_code])).ok,'reward preview succeeds');
  const redeem=request();
  check((await scalar('SELECT execute_loyalty_audited_operation($1,$2,$3,$4)',['other-token',issued.reward_code,redeem,'redeem'])).status==='redeemed','reward redeems atomically');
  check((await scalar('SELECT execute_loyalty_audited_operation($1,$2,$3,$4)',['other-token',issued.reward_code,redeem,'redeem'])).replayed,'redemption idempotent');
  await rejects(()=>sql('SELECT issue_loyalty_card_for_customer($1)',['other']),/permission denied/);
  await rejects(()=>sql("SELECT record_loyalty_card_operation($1,$2,'x',0,'stamp',NULL)",[otherCafe,cardCode]),/permission denied/);
  await db.exec('RESET ROLE');
  await sql('UPDATE cafe_cashiers SET can_use_loyalty=false WHERE id=$1',[otherCashier]);
  await db.exec('SET ROLE service_role');
  await rejects(()=>sql('SELECT preview_loyalty_card($1,$2)',['other-token',cardCode]),/permission denied/i);
  await db.exec('RESET ROLE');
  await sql('UPDATE cafe_cashiers SET can_use_loyalty=true WHERE id=$1',[otherCashier]);
  await sql("UPDATE subscriptions SET plan_id='menu' WHERE cafe_id=$1",[otherCafe]);
  await db.exec('SET ROLE service_role');
  await rejects(()=>sql('SELECT issue_rast_loyalty_card($1)',[profile]),/enrollment unavailable/);
  await rejects(()=>sql('SELECT preview_loyalty_card($1,$2)',['other-token',cardCode]),/permission denied/i);
  await db.exec('RESET ROLE');
  await sql("UPDATE subscriptions SET plan_id='full',expires_at=now()-interval '1 second' WHERE cafe_id=$1",[otherCafe]);
  await db.exec('SET ROLE service_role');
  await rejects(()=>sql('SELECT issue_rast_loyalty_card($1)',[profile]),/enrollment unavailable/);
  await db.exec('RESET ROLE');
  await sql("UPDATE subscriptions SET expires_at=now()+interval '1 month' WHERE cafe_id=$1",[otherCafe]);
  await sql("INSERT INTO customer_phone_otp_requests(cafe_id,phone_normalized,provider_instance) VALUES($1,'966500000002','test-provider')",[otherCafe]);
  await db.exec('SET ROLE service_role');
  check(await scalar("SELECT claim_customer_phone_otp_dispatch('966500000002','test-provider')")==='other','OTP dispatch admits entitled non-Rast brand');
  check(await scalar("SELECT claim_customer_phone_otp_dispatch('966500000002','test-provider')")===null,'OTP admitted request cannot replay');
  await db.exec('RESET ROLE');
  check(await scalar("SELECT record_brand_engagement('other','loyalty_direct_visit',$1,$2)",[request(),'a'.repeat(64)]),'non-Rast engagement records successfully');
  await sql("SELECT set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec('SET ROLE authenticated');
  const program={enabled:true,cardTitle:'Own card',cardSubtitle:'Own rewards',purchasesRequired:3,rewardProductId:null,rewardName:'Own drink',stampLabel:'Stamp',terms:'Own terms',cardBackground:'#112233',cardForeground:'#ffffff',cardAccent:'#ffaa00'};
  const experience={rewardValidityDays:14,nearbyMessage:'Own nearby message',latitude:null,longitude:null,rewardKind:'custom',rewardDiscountPercent:null};
  await sql('SELECT set_rast_loyalty_settings($1,$2,$3)',[otherCafe,program,experience]);
  checks++;
  await rejects(()=>sql("UPDATE loyalty_cards SET stamps_in_cycle=99 WHERE cafe_id=$1",[otherCafe]),/permission denied|authorized/);
  await db.exec('RESET ROLE');
  check(await scalar('SELECT card_background FROM cafe_loyalty_programs WHERE cafe_id=$1',[otherCafe])==='#112233','brand own card style stored');
  check(await scalar('SELECT reward_validity_days FROM cafe_loyalty_experience WHERE cafe_id=$1',[otherCafe])===14,'brand own validity stored');
  await sql("SELECT set_config('request.jwt.claim.sub',$1,false)",[customer]);
  await db.exec('SET ROLE authenticated');
  await rejects(()=>sql('SELECT set_rast_loyalty_settings($1,$2,$3)',[otherCafe,program,experience]),/Forbidden/);
  console.log(`PASS ${checks} universal loyalty PostgreSQL checks using synthetic fixtures and no real sends`);
} catch(error) {
  console.error(error.message, error.where ?? '');
  process.exitCode=1;
} finally { await db.close(); }
