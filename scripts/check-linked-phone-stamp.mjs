import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkLinkedPhoneStamp({ db, scalar, migration, demo, actor, cashier }) {
  // Exercise the real employee approval wrapper and shared membership issuer.
  // Only the inner, previously tested stamp ledger is represented by a receipt.
  await db.exec(`
    reset role;
    create or replace function employee_access_private.execute_loyalty_before_policy(
      p_session_token text,p_code text,p_request_id uuid,p_operation text
    ) returns jsonb language plpgsql as $$
    declare receipt jsonb;
    begin
      select result into receipt from public.loyalty_scan_requests where cafe_id='${demo}' and request_id=p_request_id;
      if found then return receipt||'{"replayed":true}'::jsonb; end if;
      if current_setting('test.stamp_fails',true)='yes' then return '{"ok":false,"errorCode":"operation_failed"}'::jsonb; end if;
      receipt:=jsonb_build_object('ok',true,'status','stamped','cardCode',p_code);
      insert into public.loyalty_scan_requests(cafe_id,request_id,operation,target_code,cashier_id,result)
        values('${demo}',p_request_id,p_operation,p_code,'${cashier}',receipt);
      update public.loyalty_cards set stamps_in_cycle=stamps_in_cycle+1 where card_code=p_code and cafe_id='${demo}';
      return receipt;
    end $$;
    update public.cafe_loyalty_programs set points_mode='stamps' where cafe_id='${demo}';
  `);
  const guards = await migration("20261115212000_employee_loyalty_guards.sql");
  const start = guards.indexOf("CREATE FUNCTION public.execute_loyalty_audited_operation(");
  const end = guards.indexOf("END $$;",start);
  assert(start >= 0 && end > start);
  await db.exec(guards.slice(start,end+7));
  await db.exec(await migration("20261122110100_linked_cashier_phone_stamp.sql"));
  const request = randomUUID(), phone = "0500000009";
  const stamp = (number=phone, id=request, token="session") =>
    scalar("select public.stamp_linked_cashier_by_phone($1,$2,$3)",[token,number,id]);
  const count = number => scalar("select count(*)::int from public.customer_profiles where cafe_id=$1 and phone_normalized=public.normalize_customer_phone($2)", [demo,number]);
  await db.exec("set role authenticated");
  await assert.rejects(stamp, {code:"42501"});
  await db.exec("reset role;set role service_role");
  await assert.rejects(stamp, {code:"42501"});
  await db.exec(`reset role;update public.cafe_cashier_sessions set finance_user_id='${actor}' where token='session'; set test.issue='pending'; set role service_role`);
  assert.equal((await stamp()).status, "approval_pending");
  await db.exec("reset role"); assert.equal(await count(phone),0);
  await db.exec("set test.issue='approved'; set test.approval='pending'; set role service_role");
  assert.equal((await stamp()).status, "approval_pending");
  await db.exec("reset role"); assert.equal(await count(phone),1);
  await db.exec("set test.approval='approved'; set role service_role");
  assert.equal((await stamp()).status,"stamped");
  assert.equal((await stamp()).replayed,true);
  await db.exec("reset role");
  assert.equal(await scalar("select count(*)::int from public.loyalty_scan_requests where request_id=$1 and operation='stamp'",[request]),1);
  assert.equal(await scalar("select stamps_in_cycle from public.loyalty_cards where cafe_id=$1 and customer_phone=public.normalize_customer_phone($2)",[demo,phone]),1);
  await db.exec("set test.stamp_fails='yes';set role service_role");
  assert.equal((await stamp("0500000008",randomUUID())).errorCode,"operation_failed");
  await db.exec("reset role"); assert.equal(await count("0500000008"),0);
  console.log("Linked cashier stamps: issuance and stamp approvals, scoped grant, replay and failed first-stamp rollback passed");
}
