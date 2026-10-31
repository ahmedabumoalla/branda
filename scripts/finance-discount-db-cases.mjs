import fs from "node:fs/promises";
export const financeDiscountMigration = "supabase/migrations/20261031205340_configurable_finance_quarterly_discount.sql";
export async function checkFinanceDiscount({ db, query, value, id, check, denied, owner, admin, reset, quote, create, approve }) {
  await reset(); await db.exec("RESET ROLE");
  const history=await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscriptions s");
  const requests=await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscription_payment_requests s");
  await db.exec(await fs.readFile(financeDiscountMigration,"utf8"));
  check(await value("SELECT annual_discount_percent=20 AND price_sar=1099 FROM platform_plans WHERE id='finance'"),"finance keeps its existing effective discount and price after migration");
  check(await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscriptions s")===history,"finance change preserves historical subscriptions");
  check(await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscription_payment_requests s")===requests,"finance change preserves saved requests");
  for (const percent of [0,12.5,100]) {
    await db.exec("RESET ROLE"); await query("UPDATE platform_plans SET annual_discount_percent=$1 WHERE id='finance'",[percent]); await owner();
    const q=await quote('finance',3),discount=Math.round(3297*percent)/100;
    check(Number(q.annualDiscountAmount)===discount && Number(q.totalAmount)===Math.round((3297-discount)*100)/100,`finance quote uses configured ${percent}%`);
    check(Number((await quote('finance',1)).totalAmount)===1099,"monthly price unaffected");
  }
  await db.exec("RESET ROLE");
  for(const percent of [-1,101]) await denied(()=>query("UPDATE platform_plans SET annual_discount_percent=$1 WHERE id='finance'",[percent]));
  await query("UPDATE platform_plans SET annual_discount_percent=12.5 WHERE id='finance'"); await owner();
  const request=await create('finance',3,null,2884.87,0,0);
  await query('SELECT public.submit_subscription_whatsapp_receipt($1)',[request]);
  await db.exec("RESET ROLE; UPDATE platform_plans SET annual_discount_percent=25 WHERE id='finance'");
  const subscription=await approve(request); await db.exec('RESET ROLE');
  check(await value("SELECT amount_sar=2884.87 FROM subscriptions WHERE id=$1",[subscription]),"approval preserves saved discount snapshot after later configuration change");
  await reset(); await admin();
  const entry=id(991),receipt=`${entry}/${"c".repeat(64)}.pdf`;
  await query("INSERT INTO storage.objects(bucket_id,name) VALUES('platform-finance-receipts',$1)",[receipt]);
  const input={kind:'collection',category:'subscription',party:'',description:'Configured finance discount',date:'2026-01-01',currency:'SAR',amount:2472.75,exchangeRate:1,reference:'',notes:'',cafeId:id(1),requestId:'',planId:'finance',months:3,receiptPath:receipt};
  check(await value('SELECT public.admin_post_finance_entry($1,$2)',[entry,input])===entry,"manual collection applies configured 25% discount");
  await owner(); await denied(()=>query("UPDATE platform_plans SET annual_discount_percent=50 WHERE id='finance'"));
}
