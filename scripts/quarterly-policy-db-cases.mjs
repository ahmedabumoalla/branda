import fs from "node:fs/promises";

export const quarterlyMigrations = [
  "supabase/migrations/20261031201754_monthly_quarterly_plan_policy.sql",
  "supabase/migrations/20261031201802_monthly_quarterly_catalog.sql",
];

export async function checkQuarterlyPolicy({ db, query, value, id, check, denied, owner, admin, reset, seed, quote, create, approve }) {
  await reset();
  const historical = await seed("menu", 1200, 10, 12);
  await db.exec("RESET ROLE; ALTER TABLE platform_plans ADD COLUMN max_products_monthly integer; UPDATE platform_plans SET max_products_monthly=20 WHERE id='menu'");
  const historyBefore = await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscriptions s");
  const requestBefore = await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscription_payment_requests s");
  const pricingBefore = await value("SELECT md5(jsonb_agg(jsonb_build_array(id,price_sar,annual_discount_percent,trial_days) ORDER BY id)::text) FROM platform_plans");
  for (const file of quarterlyMigrations) await db.exec(await fs.readFile(file, "utf8"));
  check(await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscriptions s") === historyBefore, "migration preserves every historical subscription field");
  check(await value("SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM subscription_payment_requests s") === requestBefore, "migration preserves request/payment snapshots");
  check(await value("SELECT md5(jsonb_agg(jsonb_build_array(id,price_sar,annual_discount_percent,trial_days) ORDER BY id)::text) FROM platform_plans") === pricingBefore, "monthly prices, configured discounts and trial days unchanged");
  check(await value("SELECT bool_and(duration_options=ARRAY[1,3] AND max_products_monthly IS NULL) FROM platform_plans"), "all plans have two terms and unlimited products");
  await db.exec("UPDATE platform_plans SET price_sar=100,annual_discount_percent=15.59,trial_days=7,max_products_monthly=1,duration_options='{1,3,6,12}' WHERE id='menu'");
  check(await value("SELECT duration_options=ARRAY[1,3] AND max_products_monthly IS NULL AND trial_days=7 FROM platform_plans WHERE id='menu'"), "stale admin writes cannot restore limits or annual options; trial remains configurable");
  await query("UPDATE subscriptions SET status='cancelled' WHERE id=$1", [historical]);
  check(await value("SELECT duration_count=12 FROM subscriptions WHERE id=$1", [historical]), "historical status changes remain possible");
  await denied(() => query("UPDATE subscriptions SET duration_count=6 WHERE id=$1", [historical]));
  await denied(() => db.exec("INSERT INTO subscriptions(plan_id,duration_unit,duration_count,amount_sar) VALUES('menu','year',1,1200)"));
  await denied(() => db.exec("INSERT INTO subscriptions(plan_id,duration_unit,duration_count,amount_sar) VALUES('menu','day',365,1200)"));
  await db.exec("INSERT INTO subscriptions(plan_id,duration_unit,duration_count,amount_sar,status) VALUES('menu','day',7,0,'trialing')");
  check(await value("SELECT count(*)>0 FROM subscriptions WHERE duration_unit='day' AND duration_count=7 AND amount_sar=0"), "configured free day trial still works");
  await owner();
  check(Number((await quote("menu", 1)).totalAmount) === 100, "one month has no duration discount");
  const quarterly = await quote("menu", 3);
  check(Number(quarterly.baseAmount) === 300 && Number(quarterly.annualDiscountAmount) === 46.77 && Number(quarterly.totalAmount) === 253.23, "old discount now applies to exactly three months with cent rounding");
  for (const months of [0, 2, 6, 12, 24]) { await denied(() => quote("menu", months)); await denied(() => create("menu", months)); }
  await db.exec("RESET ROLE; INSERT INTO platform_discount_coupons(code,discount_percent,eligible_duration_months) VALUES('QUARTER10',10,'{3}');");
  await owner();
  check(Number((await quote("menu", 3, "QUARTER10")).totalAmount) === 227.91, "coupon applies after quarterly discount");
  await denied(() => quote("menu", 1, "QUARTER10"));
  const request = await create("menu", 3, null, 253.23, 0, 0);
  await query("SELECT public.submit_subscription_whatsapp_receipt($1)", [request]);
  const subscription = await approve(request);
  await db.exec("RESET ROLE");
  check(await value("SELECT duration_count=3 AND amount_sar=253.23 FROM subscriptions WHERE id=$1", [subscription]), "approval persists the quarter and its exact quote");
  await reset();
  await admin();
  const entry = id(990), receipt = `${entry}/${"b".repeat(64)}.pdf`;
  await query("INSERT INTO storage.objects(bucket_id,name) VALUES('platform-finance-receipts',$1)", [receipt]);
  const input = { kind: "collection", category: "subscription", party: "", description: "Quarterly collection", date: "2026-01-01", currency: "SAR", amount: 253.23, exchangeRate: 1, reference: "", notes: "", cafeId: id(1), requestId: "", planId: "menu", months: 3, receiptPath: receipt };
  await denied(() => value("SELECT public.admin_post_finance_entry($1,$2)", [entry, { ...input, months: 12 }]));
  check(await value("SELECT public.admin_post_finance_entry($1,$2)", [entry, input]) === entry, "manual collection uses same quarterly amount and activation");
  check(await value("SELECT public.admin_post_finance_entry($1,$2)", [entry, input]) === entry, "manual collection retry remains idempotent");
  await db.exec("RESET ROLE");
  check(!await value("SELECT has_function_privilege('anon','public.quote_bank_subscription(text,integer,text)','EXECUTE')"), "anonymous quote remains forbidden");
  check(!await value("SELECT has_function_privilege('authenticated','public.normalize_platform_plan_terms()','EXECUTE')"), "normalization trigger is not exposed as RPC");
}
