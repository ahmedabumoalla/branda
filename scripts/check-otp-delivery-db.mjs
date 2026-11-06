import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? path.join(tmpdir(), 'branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
let checks = 0;
const tenant = '00000000-0000-4000-8000-000000000001';
const employee = '00000000-0000-4000-8000-000000000002';
const absent = '00000000-0000-4000-8000-000000000099';
const phone = '966500000000';
const provider = 'isolated-provider';
const payload = 'v1.encrypted-test-fixture';
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const reject = async (fn, label) => { await assert.rejects(fn, label); checks++; };
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const enqueue = (webhook, p = phone, instance = provider, body = payload) => scalar('select public.enqueue_customer_phone_otp_delivery($1,$2,$3,$4)', [p, instance, webhook, body]);
const claim = async (id = null, instance = provider) => (await db.query('select * from public.claim_customer_phone_otp_delivery($1,$2)', [instance, id])).rows;
const finish = (id, lease, status = 'sent') => scalar('select public.finish_customer_phone_otp_delivery($1,$2,$3)', [id, lease, status]);
const seed = async ({ purpose = 'finance_cashier_login', age = '1 second', instance = provider } = {}) => scalar(`insert into customer_phone_otp_requests(cafe_id,phone_normalized,provider_instance,purpose,finance_ip_hash,created_at)
 values($1,$2,$3,$4,$5,now()-$6::interval) returning id`, [tenant, phone, instance, purpose, purpose === 'finance_cashier_login' ? 'a'.repeat(64) : null, age]);
const service = async (fn) => {
  await db.exec('set role service_role');
  try { return await fn(); } finally { await db.exec('reset role'); }
};
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role unrelated;
    create schema auth;create schema platform_access_private;
    create table cafes(id uuid primary key,slug text,deleted_at timestamptz,status text,is_public boolean,finance boolean,loyalty boolean);
    create table auth.users(id uuid primary key,phone text,enabled boolean default true);
    create table bf_staff(cafe_id uuid,user_id uuid,role text,active boolean);
    create table cafe_loyalty_programs(cafe_id uuid,enabled boolean);
    create function platform_access_private.service_enabled(p_id uuid,p_kind text) returns boolean language sql as $$select case p_kind when 'finance' then finance when 'loyalty' then loyalty else false end from public.cafes where id=p_id$$;
    create function public.brand_finance_sales_cashier_phone_enabled(p_phone text) returns boolean language sql as $$select coalesce(bool_or(enabled),false) from auth.users where phone in(p_phone,'+'||p_phone)$$;
    create table customer_phone_otp_requests(id uuid primary key default gen_random_uuid(),cafe_id uuid,phone_normalized text,provider_instance text,purpose text,finance_ip_hash text,status text default 'pending',created_at timestamptz default now(),provider_dispatched_at timestamptz);
    insert into cafes values('${tenant}','isolated-brand',null,'active',true,true,true);
    insert into auth.users(id,phone) values('${employee}','${phone}');
    insert into bf_staff values('${tenant}','${employee}','cashier',true);
    insert into cafe_loyalty_programs values('${tenant}',true);`);
  // Exercise the real existing admission consumer; narrow fixtures replace unrelated finance tables.
  const admission = await readFile('scripts/fixtures/otp-dispatch-admission.sql', 'utf8');
  await db.exec(admission);
  const originalDefinition = await scalar("select pg_get_functiondef('public.claim_customer_phone_otp_dispatch(text,text)'::regprocedure)");
  const migration = await readFile('supabase/migrations/20261025154156_customer_phone_otp_delivery_queue.sql', 'utf8');
  await db.exec(migration);
  equal(await scalar("select pg_get_functiondef('public.claim_customer_phone_otp_dispatch(text,text)'::regprocedure)"), originalDefinition, 'existing admission consumer is unchanged');
  equal(await scalar("select relrowsecurity from pg_class where oid='phone_otp_delivery_private.deliveries'::regclass"), true, 'private queue has RLS');
  for (const role of ['anon', 'authenticated', 'unrelated', 'service_role']) {
    await db.exec(`set role ${role}`);
    await reject(() => db.query('select * from phone_otp_delivery_private.deliveries'), `${role} cannot read queue directly`);
    await reject(() => db.query('delete from phone_otp_delivery_private.deliveries'), `${role} cannot mutate queue directly`);
    if (role !== 'service_role') {
      await reject(() => enqueue('unauthorized'), `${role} cannot enqueue`);
      await reject(() => claim(), `${role} cannot claim ciphertext`);
      await reject(() => finish(absent, absent), `${role} cannot finish`);
    }
    await db.exec('reset role');
  }
  for (const [p, instance, webhook, body] of [[null,provider,'a',payload],['+966500000000',provider,'a',payload],[phone,'','a',payload],[phone,provider,'',payload],[phone,provider,'a',null],[phone,provider,'a','x'.repeat(4097)]]) {
    await reject(() => service(() => enqueue(webhook,p,instance,body)), 'invalid queue input rejected');
  }
  await reject(() => service(() => enqueue('no-admission')), 'no admission cannot queue');
  equal(await scalar('select count(*)::int from phone_otp_delivery_private.deliveries'), 0, 'failed enqueue persists no payload');
  const requestId = await seed();
  await reject(() => service(() => enqueue('wrong-provider',phone,'different')), 'different provider cannot consume admission');
  equal(await scalar('select provider_dispatched_at is null from customer_phone_otp_requests where id=$1',[requestId]),true,'rejection preserves admission');
  const id = await service(() => enqueue('first'));
  equal(await scalar('select provider_dispatched_at is not null from customer_phone_otp_requests where id=$1',[requestId]),true,'enqueue atomically consumes admission');
  const nextAdmission = await seed();
  equal(await service(() => enqueue('first',phone,provider,'different-encryption-nonce')),id,'same webhook retry deduplicates');
  equal(await scalar('select provider_dispatched_at is null from customer_phone_otp_requests where id=$1',[nextAdmission]),true,'dedup does not consume a second admission');
  await reject(() => service(() => enqueue('first','966500000001')), 'webhook collision with other phone rejected');
  await reject(() => service(() => enqueue('first',phone,'other')), 'webhook collision with other provider rejected');
  equal((await service(() => claim(absent))).length,0,'unknown ID does not claim another job');
  equal((await service(() => claim(id,'different-provider'))).length,0,'explicit ID cannot cross provider boundary');
  equal((await service(() => claim(null,'different-provider'))).length,0,'cron cannot claim another provider job');
  for (const invalidProvider of [null,'','x'.repeat(201)]) {
    await reject(() => service(() => claim(id,invalidProvider)), 'claim requires valid provider identity');
  }
  const [leased] = await service(() => claim(id));
  equal(leased.id,id,'worker receives requested ID');
  equal(leased.payload,payload,'worker receives only encrypted payload');
  equal(Object.keys(leased).sort(),['id','lease_token','payload'],'claim exposes no phone or provider columns');
  equal((await service(() => claim(id))).length,0,'claimed job cannot be claimed again');
  equal(await service(() => finish(id,absent)),false,'wrong lease cannot finish');
  await reject(() => service(() => finish(id,leased.lease_token,'pending')), 'cannot requeue ambiguous dispatch');
  equal(await service(() => finish(id,leased.lease_token)),true,'matching lease finishes');
  equal(await scalar('select encrypted_payload is null from phone_otp_delivery_private.deliveries where id=$1',[id]),true,'successful delivery erases ciphertext');
  equal(await service(() => finish(id,leased.lease_token,'failed')),false,'terminal job immutable through finish');
  equal(await service(() => enqueue('first')),id,'terminal retry does not send again');
  const expired = await service(() => enqueue('expired'));
  await db.query("update phone_otp_delivery_private.deliveries set expires_at=now()-interval '1 second' where id=$1",[expired]);
  equal((await service(() => claim(expired))).length,0,'expired pending never sent');
  equal(await scalar('select row(status,encrypted_payload is null)::text from phone_otp_delivery_private.deliveries where id=$1',[expired]),'(expired,t)','expired ciphertext erased');
  await seed();const stale = await service(() => enqueue('stale'));
  const [staleLease] = await service(() => claim(stale));
  await db.query("update phone_otp_delivery_private.deliveries set claimed_at=now()-interval '3 minutes' where id=$1",[stale]);
  equal((await service(() => claim(stale))).length,0,'stale in-flight job is never resent');
  equal(await scalar('select row(status,encrypted_payload is null)::text from phone_otp_delivery_private.deliveries where id=$1',[stale]),'(unknown,t)','stale delivery marked unknown and erased');
  equal(await service(() => finish(stale,staleLease.lease_token)),false,'stale worker cannot overwrite uncertainty');
  for (const status of ['failed','unknown']) {
    await seed();const job = await service(() => enqueue(status));const [lease] = await service(() => claim(job));
    equal(await service(() => finish(job,lease.lease_token,status)),true,`${status} terminal outcome accepted`);
    equal(await scalar('select encrypted_payload is null from phone_otp_delivery_private.deliveries where id=$1',[job]),true,`${status} clears ciphertext`);
  }
  await seed();const dedup = await service(async () => Promise.all(Array.from({length:8},()=>enqueue('simultaneous'))));
  equal(new Set(dedup).size,1,'simultaneously scheduled enqueue requests deduplicate');
  const claims = await service(async () => Promise.all(Array.from({length:8},()=>claim())));
  equal(claims.flat().length,1,'simultaneously scheduled workers claim once');
  // PGlite serializes connections: this covers interleaved callers, not native PostgreSQL lock contention.
  assert.match(migration,/LIMIT 1 FOR UPDATE SKIP LOCKED/);checks++;
  await db.query("delete from customer_phone_otp_requests where provider_dispatched_at is null");
  await seed({age:'3 minutes'});await reject(()=>service(()=>enqueue('old-admission')),'expired original admission still denied');
  await seed();await db.query('update bf_staff set active=false');
  await reject(()=>service(()=>enqueue('revoked-staff')),'revoked membership denied by original consumer');await db.query('update bf_staff set active=true');
  await db.query('update cafes set finance=false');await reject(()=>service(()=>enqueue('expired-brand')),'expired finance denied');await db.query('update cafes set finance=true');
  await db.query('update auth.users set enabled=false');await reject(()=>service(()=>enqueue('revoked-auth')),'revoked identity denied');await db.query('update auth.users set enabled=true');
  await db.query('delete from customer_phone_otp_requests where provider_dispatched_at is null');
  await seed({purpose:'customer_login'});await db.query('update cafe_loyalty_programs set enabled=false');
  await reject(()=>service(()=>enqueue('loyalty-disabled')),'loyalty still requires enabled program');await db.query('update cafe_loyalty_programs set enabled=true');
  const loyalty = await service(()=>enqueue('loyalty-enabled'));equal(typeof loyalty,'string','legacy customer admission works');
  await seed({purpose:'customer_signup'});
  equal(await service(()=>scalar('select public.claim_customer_phone_otp_dispatch($1,$2)',[phone,provider])),'isolated-brand','legacy direct consumer still works');
  equal(await service(()=>scalar('select public.claim_customer_phone_otp_dispatch($1,$2)',[phone,provider])),null,'legacy consumer remains single-use');
  equal(await scalar('select count(*)::int from auth.users'),1,'queue creates no Auth identity');
  // Apply the routing extension after all original queue/admission regressions.
  const loco = '321fd305-1883-48df-ab69-829cf7d1bc48';
  await db.exec(`create schema loyalty_audit_private;
    alter table cafes add column name text default 'Fixture';
    alter table cafe_loyalty_programs add column purchases_required integer default 6;
    alter table cafe_loyalty_programs add column reward_name text default 'Existing reward';
    create table customer_profiles(id uuid primary key,cafe_id uuid,status text default 'active',blocked_at timestamptz,phone_auth_conflict boolean default false,phone_normalized text);
    create table loyalty_cards(id uuid primary key,cafe_id uuid,customer_profile_id uuid,status text default 'active');
    create table loyalty_audit_private.wallet_customer_events(card_id uuid,cafe_id uuid,origin text,kind text);`);
  await db.exec(await readFile('supabase/migrations/20261103090344_wallet_download_welcome.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261106075709_loco_customer_delivery_routing.sql','utf8'));
  const contextClaim = async id => (await db.query('select * from public.claim_customer_phone_otp_delivery_context($1,$2)',[provider,id])).rows;
  const welcome = (card = null,primary = true,brand = true) => scalar('select public.claim_routed_wallet_welcome($1,$2,$3)',[card,primary,brand]);
  for(const role of ['anon','authenticated','unrelated']) {
    await db.exec(`set role ${role}`);
    await reject(()=>contextClaim(absent),'untrusted role cannot claim tenant context');
    await reject(()=>welcome(),'untrusted role cannot forge readiness flags');
    await db.exec('reset role');
  }
  const [legacy] = await service(()=>contextClaim(loyalty));
  equal(legacy.cafe_id,null,'pre-migration job never inferred from phone');
  equal(legacy.purpose,null,'pre-migration job retains legacy routing');
  await db.query(`insert into cafes(id,slug,status,is_public,finance,loyalty) values($1,'brand-9a8c97305195','active',true,true,true)`,[loco]);
  await db.query('insert into cafe_loyalty_programs(cafe_id,enabled) values($1,true)',[loco]);
  await db.query('delete from customer_phone_otp_requests where provider_dispatched_at is null');
  const originalRequest = await seed({purpose:'customer_login'});
  const newer = await scalar(`insert into customer_phone_otp_requests(cafe_id,phone_normalized,provider_instance,purpose,created_at) values($1,$2,$3,'customer_signup',now()) returning id`,[loco,phone,provider]);
  const routedId = await service(()=>enqueue('loco-context'));
  equal(await scalar('select provider_dispatched_at is not null from customer_phone_otp_requests where id=$1',[newer]),true,'exact selected admission consumed');
  equal(await scalar('select provider_dispatched_at is null from customer_phone_otp_requests where id=$1',[originalRequest]),true,'other tenant admission not consumed by same hook');
  const otherId = await service(()=>enqueue('other-context'));
  equal(await service(()=>enqueue('loco-context')),routedId,'retry keeps original context after newer admissions');
  const [routed] = await service(()=>contextClaim(routedId));
  equal([routed.cafe_id,routed.purpose],[null,null],'competing latest LOCO admission cannot guess webhook tenant');
  const [other] = await service(()=>contextClaim(otherId));
  equal([other.cafe_id,other.purpose],[null,null],'last competing admission remains ambiguous after first is consumed');
  equal((await service(()=>contextClaim(routedId))).length,0,'routed job still claims once');
  await seed({purpose:'finance_cashier_login'});
  const financeId = await service(()=>enqueue('finance-context'));
  const [finance] = await service(()=>contextClaim(financeId));
  equal(finance.purpose,'finance_cashier_login','cashier purpose preserved for exclusion');
  // Reverse order and customer/staff overlap cannot route through a brand sender.
  for(const newestPurpose of ['customer_login','finance_cashier_login']) {
    await db.query(`insert into customer_phone_otp_requests(cafe_id,phone_normalized,provider_instance,purpose,created_at) values($1,$2,$3,'customer_signup',now()-interval '1 second')`,[loco,phone,provider]);
    await seed({purpose:newestPurpose,age:'0 seconds'});
    for(const suffix of ['first','remaining']) {
      const ambiguousId = await service(()=>enqueue(`mixed-${newestPurpose}-${suffix}`));
      const [context] = await service(()=>contextClaim(ambiguousId));
      equal([context.cafe_id,context.purpose],[null,null],`${newestPurpose} overlap ${suffix} stays on platform`);
    }
  }
  await db.query(`insert into customer_phone_otp_requests(cafe_id,phone_normalized,provider_instance,purpose) values($1,$2,$3,'customer_login')`,[loco,phone,provider]);
  const uniqueLoco = await service(()=>enqueue('unique-loco'));
  const [uniqueContext] = await service(()=>contextClaim(uniqueLoco));
  equal([uniqueContext.cafe_id,uniqueContext.purpose],[loco,'customer_login'],'unambiguous LOCO admission retains exact trusted context');
  const cards = {};
  for(const cafe of [tenant,loco]) {
    const profile = await scalar('insert into customer_profiles(id,cafe_id,phone_normalized) values(gen_random_uuid(),$1,$2) returning id',[cafe,phone]);
    cards[cafe] = await scalar('insert into loyalty_cards(id,cafe_id,customer_profile_id) values(gen_random_uuid(),$1,$2) returning id',[cafe,profile]);
    await db.query('insert into loyalty_audit_private.wallet_welcomes(cafe_id,customer_profile_id,card_id) values($1,$2,$3)',[cafe,profile,cards[cafe]]);
  }
  equal(await service(()=>welcome(null,false,false)),null,'all offline consumes no welcome');
  equal(await scalar("select count(*)::int from loyalty_audit_private.wallet_welcomes where status='pending'"),2,'all offline leaves both tenants pending');
  equal(await service(()=>welcome(cards[tenant],false,true)),null,'LOCO route cannot claim another tenant card');
  const locoWelcome = await service(()=>welcome(null,false,true));
  equal(locoWelcome.cafeId,loco,'brand ready primary offline claims LOCO only');
  equal(locoWelcome.reward,'Existing reward','welcome preserves actual reward');
  equal(await scalar("select status from loyalty_audit_private.wallet_welcomes where cafe_id=$1",[tenant]),'pending','other brand stays pending');
  equal(await service(()=>welcome(null,false,true)),null,'dispatching welcome never claimed again');
  const ordinaryWelcome = await service(()=>welcome(null,true,false));
  equal(ordinaryWelcome.cafeId,tenant,'primary recovers remaining non-LOCO');
  equal(await scalar('select public.finish_wallet_welcome($1,$2,$3,$4)',[locoWelcome.id,locoWelcome.claimToken,'unknown',null]),true,'ambiguous welcome terminal');
  equal(await service(()=>welcome(null,true,true)),null,'unknown welcome not retried');
  console.log(`PASS encrypted OTP delivery SQL: ${checks} assertions (isolated PGlite; no live DB or provider calls)`);
} finally { await db.close(); }
