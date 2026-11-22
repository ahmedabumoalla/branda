import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const engine = process.env.PGLITE_MODULE ?? path.join(tmpdir(), "branda-loyalty-sql-tests/node_modules/@electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(engine).href);
const db = new PGlite();
const migration = name => readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
const id = n => `00000000-0000-4000-9000-${String(n).padStart(12,"0")}`;
const [brand, foreign, cashier] = [1,2,3].map(id);
const list = async (tenant, page=1, status=null) => (await db.query(
  "select get_owner_loyalty_reads($1,$2,$3) as page", [tenant,page,status])).rows[0].page;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema loyalty_read_private; create schema loyalty_audit_private; create schema platform_access_private;
    create function loyalty_audit_private.can_read(uuid) returns boolean language sql as $$select $1='${brand}'::uuid$$;
    create function platform_access_private.service_enabled(uuid,text) returns boolean language sql as $$ select current_setting('test.entitlement',true)='on' $$;
    create table public.cafes(id uuid primary key);
    create table public.cafe_cashiers(id uuid primary key,cafe_id uuid,full_name text);
    create table public.loyalty_cards(id uuid primary key,cafe_id uuid,card_code text,customer_name text);
    create table public.loyalty_scan_requests(cafe_id uuid,request_id uuid,operation text,target_code text,created_at timestamptz,
      cashier_id uuid,result jsonb,primary key(cafe_id,request_id));
    insert into public.cafes values ('${brand}'),('${foreign}');
    insert into public.cafe_cashiers values ('${cashier}','${brand}','Cashier');
    insert into public.loyalty_cards values ('${id(4)}','${brand}','TESTCARD1234','Member'),
      ('${id(5)}','${foreign}','FOREIGN5678','Foreign');
  `);
  const original=await migration("20261108180040_loyalty_read_queue.sql");
  await db.exec(original.slice(original.indexOf("CREATE TABLE loyalty_read_private.operations"),original.indexOf("CREATE TABLE loyalty_read_private.card_link_jobs")));
  await db.exec(original.slice(original.indexOf("CREATE FUNCTION loyalty_read_private.operation_json"), original.indexOf("REVOKE ALL ON FUNCTION loyalty_read_private.operation_json")));
  await db.exec(await migration("20261122100510_cashier_read_receipts.sql"));

  const queue = (n,status,retryable=false) => db.query(`
    insert into loyalty_read_private.operations(cafe_id,request_id,cashier_id,session_id,cashier_name,method,
      identifier_hash,identifier_hint,status,retryable,created_at,result)
    values($1,$2,$3,$3,'Cashier','phone','hash','***1000',$4,$5,'2026-11-20','{"customerName":"Original"}')
  `,[brand,id(n),cashier,status,retryable]);
  const receipt = (n,tenant,operation,result,code="TESTCARD1234") => db.query(`
    insert into public.loyalty_scan_requests values($1,$2,$3,$4,'2026-11-21',$5,$6)
  `,[tenant,id(n),operation,code,cashier,JSON.stringify(result)]);
  await queue(100,"succeeded");
  await queue(101,"pending");
  await queue(102,"failed",true);
  const stamped = {status:"stamped",customerName:"Snapshot",rewardIssued:false};
  await receipt(100,brand,"stamp",stamped);
  await receipt(103,brand,"stamp",stamped);
  await receipt(104,brand,"stamp",{status:"recent_scan"});
  await receipt(106,brand,"spend_points",{status:"points_redeemed",pointsSpent:200});
  const earned={status:"points_added",amountSar:29.75,pointsAdded:2,rateSar:10,rateQuantity:1};
  for(let n=120;n<145;n++) await receipt(n,brand,"points",earned);
  await receipt(120,foreign,"points",{...earned,pointsAdded:1000},"FOREIGN5678");
  await db.exec("set role authenticated");
  await assert.rejects(()=>list(brand),{code:"42501"});
  await db.exec("set test.entitlement='on'");
  await assert.rejects(()=>list(foreign),{code:"42501"});
  await assert.rejects(()=>list(brand,0),/Invalid read filters/);
  const first=await list(brand), second=await list(brand,2);
  assert.equal(first.total,30);
  assert.deepEqual(first.summary,{failed:1,pending:1,succeeded:27,duplicate:1,processing:0,needs_review:0,retryable:1});
  assert.equal(first.operations.length,25);
  assert.equal(second.operations.length,5);
  const rows=[...first.operations,...second.operations];
  assert.equal(new Set(rows.map(row=>row.requestId)).size,30);
  assert.equal(rows.filter(row=>row.kind==="points").length,25);
  const points=rows[0];
  assert.deepEqual([points.kind,points.invoiceAmountSar,points.pointsAdded,points.identifierHint,points.customerName,points.cashierName],
    ["points",29.75,2,"***1234","Member","Cashier"]);
  assert.equal(points.attempts,null);
  assert(!JSON.stringify(first).includes("TESTCARD1234"));
  assert(!JSON.stringify(first).includes("FOREIGN"));
  assert.equal(rows.find(row=>row.requestId===id(100)).customerName,"Original");
  assert.equal(rows.find(row=>row.requestId===id(103)).customerName,"Snapshot");
  assert.equal((await list(brand,2,"succeeded")).operations.length,2);
  const duplicates=await list(brand,1,"duplicate");
  assert.equal(duplicates.total,1);
  assert.equal(duplicates.operations[0].errorCode,"recent_scan");
  assert.deepEqual(duplicates.summary,first.summary);
  await db.exec("reset role; set role anon");
  await assert.rejects(()=>list(brand), {code:"42501"});
  console.log("PASS cashier mixed earnings history, filtered totals, paging, replay deduplication, receipt privacy and tenant scope");
} finally { await db.close(); }
