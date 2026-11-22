import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { checkLinkedPhoneStamp } from "./check-linked-phone-stamp.mjs";

// Extends the isolated invoice-points ledger with the production phone, branch,
// enrollment and points functions. No external DB calls, stamps or messages.
export async function checkPhonePoints({db, scalar, migration, demo, otherBrand, actor, cashier}) {
  const phoneSql = await migration("073_customer_phone_auth.sql");
  await db.exec(phoneSql.slice(phoneSql.indexOf("CREATE OR REPLACE FUNCTION public.normalize_customer_phone"),phoneSql.indexOf("$$;",phoneSql.indexOf("CREATE OR REPLACE FUNCTION public.normalize_customer_phone"))+3));
  await db.exec(`
    reset role;
    alter table cafes add column status text default 'active', add column owner_user_id uuid;
    alter table cafe_cashiers add column owner_user_id uuid, add column loyalty_branch_id uuid;
    create table profiles(id uuid,status text,role text);
    create table branches(id uuid,cafe_id uuid,active boolean default true,loyalty_enabled boolean default true,deleted_at timestamptz);
    create table loyalty_read_private.settings(singleton boolean,secret text);
    insert into loyalty_read_private.settings values(true,'fixture-secret');
    create schema extensions;
    create function extensions.hmac(text,text,text) returns bytea language sql as $$select decode(md5($1||$2)||md5($3||$1),'hex')$$;
    create table loyalty_read_private.card_link_jobs(card_id uuid,cafe_id uuid,profile_id uuid,card_created boolean);
    alter table customer_profiles alter id set default gen_random_uuid(),alter status set default 'active',
      add column phone text,add column phone_normalized text generated always as (public.normalize_customer_phone(phone)) stored,
      add column full_name text,add column phone_auth_conflict boolean default false,add column user_id uuid,
      add column phone_verified_at timestamptz,add column email text,add column password_hash text,
      add column session_token_hash text,add column password_reset_token_hash text,add column phone_verification_required boolean;
    alter table loyalty_cards add column customer_name text,add column customer_phone text,add column customer_email text,
      add column loyalty_branch_id uuid,add unique(cafe_id,customer_profile_id),alter id set default gen_random_uuid(),
      alter card_code set default upper(gen_random_uuid()::text),alter status set default 'active',
      alter available_rewards set default 0,alter stamps_in_cycle set default 0,alter total_purchases set default 0;
    create function public.record_customer_registration_source(uuid,text) returns void language sql as $$select$$;
    create table public.test_approval_calls(permission text,request_id uuid,payload jsonb,consumed boolean);
    create or replace function employee_access_private.loyalty_request(uuid,text,text,jsonb,uuid) returns jsonb language plpgsql as $$
    begin
      if exists(select 1 from public.test_approval_calls a where a.permission=$2 and a.request_id=$5 and a.payload<>$4) then raise exception 'Approval payload changed'; end if;
      insert into public.test_approval_calls values($2,$5,$4,false);
      return jsonb_build_object('status',current_setting(case when $2='loyalty.issue' then 'test.issue' else 'test.approval' end,true),'requestId',$5);
    end $$;
    create or replace function employee_access_private.assert_and_consume(uuid,text,text,jsonb,uuid) returns void language sql as $$
      insert into public.test_approval_calls values($2,$5,$4,true)$$;
    update cafe_cashier_sessions set finance_user_id=null;
    update cafe_cashiers set active=true;
  `);
  await db.exec(await migration("20261014121634_loyalty_direct_enrollment.sql"));
  await db.exec(await migration("20261111134314_loyalty_placeholder_name_completion.sql"));
  const branchSql=await migration("20261118012510_loyalty_branches_for_loyalty_accounts.sql");
  await db.exec(branchSql.slice(branchSql.indexOf("CREATE OR REPLACE FUNCTION public.issue_branch_loyalty_card"),branchSql.indexOf("NOTIFY pgrst")));
  await db.exec(await migration("20261122110000_cashier_phone_card_issuance.sql"));
  const branch=randomUUID();
  await db.query("insert into branches(id,cafe_id) values($1,$2)",[branch,demo]);
  await db.query("update cafe_cashiers set loyalty_branch_id=$1 where id=$2",[branch,cashier]);
  const earn=(phone,id=randomUUID(),amount=20,rate=2,token='session')=>scalar("select scan_loyalty_invoice_points_by_phone($1,$2,$3,$4,$5,1)",[token,phone,id,amount,rate]);
  const count=(phone)=>scalar("select count(*)::int from customer_profiles where phone_normalized=normalize_customer_phone($1) and cafe_id=$2",[phone,demo]);
  const first="0500000001", unused="0500000002", employeePhone="0500000003", conflict="0500000004";
  await db.exec("set role authenticated");
  await assert.rejects(()=>earn(first), {code:"42501"});
  await db.exec("reset role;set role service_role");
  await assert.rejects(()=>earn(first,randomUUID(),20,2,'invalid'),{code:"42501"});
  await assert.rejects(()=>earn(first,randomUUID(),0),{code:"22023"});
  await assert.rejects(()=>earn('111'),{code:"22023"});
  assert.equal((await earn(unused,randomUUID(),0.5)).errorCode,"zero_points");
  assert.equal((await earn(unused,randomUUID(),20,9)).errorCode,"points_rate_changed");
  await db.exec("reset role");
  assert.equal(await count(first),0);
  assert.equal(await count(unused),0);
  await db.query("update cafe_loyalty_programs set points_rate_sar=0.01,points_rate_quantity=1000000 where cafe_id=$1",[demo]);
  assert.equal((await earn(unused,randomUUID(),1000000,0.01)).errorCode,"points_rate_changed");
  assert.equal((await scalar("select scan_loyalty_invoice_points_by_phone('session',$1,$2,1000000,0.01,1000000)",[unused,randomUUID()])).errorCode,"points_limit");
  assert.equal(await count(unused),0);
  await db.query("update cafe_loyalty_programs set points_rate_sar=2,points_rate_quantity=1 where cafe_id=$1",[demo]);
  await db.query("insert into customer_profiles(cafe_id,phone,full_name) values($1,$2,'Foreign')",[otherBrand,first]);
  await db.exec("set role service_role");
  const id=randomUUID();
  const credited=await earn(first,id);
  assert.equal(credited.pointsAdded,10);
  assert.equal(credited.pointsBalance,10);
  assert.equal((await earn('+966500000001',id)).replayed,true);
  await assert.rejects(()=>earn(unused,id),/Scan request conflict/);
  await db.exec("reset role");
  assert.equal(await count(first),1); assert.equal(await count(unused),0);
  assert.equal(await scalar("select loyalty_branch_id from loyalty_cards where card_code=$1",[credited.cardCode]),branch);
  assert.equal(await scalar("select stamps_in_cycle from loyalty_cards where card_code=$1",[credited.cardCode]),0);
  assert.equal(await scalar("select count(*)::int from loyalty_read_private.card_link_jobs"),0);
  await db.query("update loyalty_cards set status='suspended' where card_code=$1",[credited.cardCode]);
  assert.equal((await earn(first)).errorCode,"card_unavailable");
  await db.query("update loyalty_cards set status='active' where card_code=$1",[credited.cardCode]);
  assert.equal((await scalar("select enroll_branch_loyalty_customer($1,'Real Name',$2,repeat('a',64),$3)",[demo,first,branch])).ok,true);
  assert.equal(await scalar("select full_name from customer_profiles where cafe_id=$1 and phone=$2",[demo,'966500000001']),'Real Name');
  await db.query("update cafe_loyalty_programs set points_mode='stamps' where cafe_id=$1",[demo]);
  assert.equal((await earn(first,id)).replayed,true);
  assert.equal((await earn(unused)).errorCode,"points_mode_changed"); assert.equal(await count(unused),0);
  await db.query("update cafe_loyalty_programs set points_mode='points' where cafe_id=$1",[demo]);
  await db.query("insert into customer_profiles(cafe_id,phone,full_name) values($1,$2,'First'),($1,$2,'Second')",[demo,conflict]);
  assert.equal((await earn(conflict)).errorCode,"card_unavailable");
  const closedBranchPhone='0500000006';
  await db.query("insert into customer_profiles(cafe_id,phone,full_name) values($1,$2,'Known profile')",[demo,closedBranchPhone]);
  await db.query("update branches set active=false where id=$1",[branch]);
  assert.equal((await earn(closedBranchPhone)).errorCode,"card_unavailable");
  assert.equal(await scalar("select count(*)::int from loyalty_cards where cafe_id=$1 and customer_phone=$2",[demo,closedBranchPhone]),0);
  await db.query("update branches set active=true where id=$1",[branch]);
  await db.query("insert into customer_profiles(cafe_id,phone,full_name,blocked_at) values($1,$2,'Blocked',now())",[demo,unused]);
  assert.equal((await earn(unused)).errorCode,"card_unavailable");
  await db.query("update customer_profiles set blocked_at=null,phone_auth_conflict=true where phone=$1",[unused]);
  assert.equal((await earn(unused)).errorCode,"card_unavailable");
  await db.query("update cafe_cashier_sessions set finance_user_id=$1 where token='session'",[actor]);
  await db.exec("set test.denied='loyalty.stamp'");
  await assert.rejects(()=>earn(employeePhone),{code:"42501"});
  await db.exec("set test.denied='loyalty.issue'");
  await assert.rejects(()=>earn(employeePhone),{code:"42501"});
  assert.equal(await count(employeePhone),0);
  await db.exec("set test.denied=''; set test.issue='pending';set test.approval='pending';set role service_role");
  const employeeRequest=randomUUID();
  const pendingIssue=await earn(employeePhone,employeeRequest);
  assert.equal(pendingIssue.status,'approval_pending'); assert.notEqual(pendingIssue.requestId,employeeRequest);
  await db.exec("reset role"); assert.equal(await count(employeePhone),0);
  await db.exec("set test.issue='approved'; set role service_role");
  const pendingAward=await earn(employeePhone,employeeRequest);
  assert.equal(pendingAward.status,'approval_pending'); assert.equal(pendingAward.requestId,employeeRequest);
  await db.exec("reset role"); assert.equal(await count(employeePhone),1);
  assert.equal(await scalar("select available_loyalty_points from loyalty_cards where customer_phone=normalize_customer_phone($1)",[employeePhone]),0);
  await db.exec("set test.approval='approved';set role service_role");
  const posted=await earn(employeePhone,employeeRequest);
  assert.equal(posted.pointsAdded,10); assert.equal(posted.pointsBalance,10);
  assert.equal((await earn(employeePhone,employeeRequest)).replayed,true);
  await db.exec("reset role");
  assert.equal(await scalar("select count(*)::int from public.test_approval_calls where consumed and permission='loyalty.issue'"),1);
  assert.equal(await scalar("select count(*)::int from public.test_approval_calls where consumed and permission='loyalty.stamp'"),1);
  assert.equal(await scalar("select count(*)::int from loyalty_scan_requests where request_id=$1",[employeeRequest]),1);
  await db.exec("set test.approval='rejected'");
  const rejectedPhone='0500000007';
  assert.equal((await earn(rejectedPhone)).status,'approval_rejected');
  assert.equal(await count(rejectedPhone),0);
  await db.exec("set test.approval='approved'");
  await db.exec("update cafe_cashier_sessions set finance_user_id=null;update cafe_cashiers set loyalty_branch_id=null");
  const existing='0500000005';
  await db.query("insert into customer_profiles(cafe_id,phone,full_name) values($1,$2,'Original name')",[demo,existing]);
  assert.equal((await earn(existing)).pointsAdded,10); assert.equal(await count(existing),1);
  assert.equal(await scalar("select customer_name from loyalty_cards where customer_phone=$1",[existing]),'Original name');
  console.log("Phone invoice points: branch issuance, claimable placeholder, named customer, authorization, request replay, no stamp/messages, two-stage approval passed");
  await checkLinkedPhoneStamp({db,scalar,migration,demo,actor,cashier});
}
