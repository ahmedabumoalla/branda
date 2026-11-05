import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";
const dependency = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function("require", "exports", source)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`, stubs, cache);
    if (name.startsWith(".")) return load(`${path.join(path.dirname(file), name)}.ts`, stubs, cache);
    return dependency(name);
  }, exports);
  return exports;
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const code = `BC-${"A".repeat(32)}`, phone = "966500000001", key = id(8);
const input = { code, phone, subtotal: 100 };
const preview = { couponId: id(1), title: "Synthetic offer", customerName: "Synthetic customer", discountType: "percentage",
  discountValue: 10, minimumOrderAmount: 20, subtotal: 100, discountAmount: 10, totalAfterDiscount: 90,
  expiresAt: "2026-11-20T12:00:00Z", terms: "Synthetic terms", status: "available", redeemedAt: null };
function fixture(options = {}) {
  const calls = [], state = { authError: false, entitlementError: false, error: null, throws: false, data: null, ...options };
  const db = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (state.throws) throw new Error("PRIVATE_RPC_DETAIL");
    const data = state.data ?? (name === "analytics_coupon_redeem" ? { ...preview, status: "redeemed", redeemedAt: "2026-11-05T10:00:00Z" } : preview);
    return { data, error: state.error };
  } };
  const stubs = {
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/data/cashier": { requireCashierPermission: async (permission, client) => {
      assert.equal(permission, "loyalty"); assert.equal(client, db); calls.push({ name: "authorize" });
      if (state.authError) throw new Error("PRIVATE_AUTH_DETAIL");
      return { cafeId: id(2), token: "synthetic-private-session", cashierId: id(3) };
    } },
    "@/lib/data/rast-loyalty-access": { assertRastLoyaltyEntitlement: async cafeId => {
      assert.equal(cafeId, id(2)); calls.push({ name: "entitlement" });
      if (state.entitlementError) throw new Error("PRIVATE_ENTITLEMENT_DETAIL");
    } },
  };
  return { calls, state, actions: load("app/actions/analytics-coupons.ts", stubs) };
}
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
const schema = load("lib/analytics/analytics-coupons.ts");
for (const phoneInput of [phone, "+966500000001", "00966500000001", "0500000001", "500000001", "٠٥٠٠٠٠٠٠٠١"]) {
  check(schema.analyticsCouponLookupSchema.parse({ ...input, phone: phoneInput }).phone === phone, "Saudi phone forms canonicalized");
}
for (const bad of [{ cafeId: id(2) }, { customerId: id(2) }, { token: "injected" }, { phone: "text0500000001" },
  { phone: "966400000001" }, { code: "COMMON10" }, { subtotal: -1 }, { subtotal: 0 }, { subtotal: 0.001 },
  { subtotal: 1000001 }, { subtotal: NaN }, { subtotal: Infinity }]) {
  const c = fixture(); const result = await c.actions.loadAnalyticsCouponAction({ ...input, ...bad });
  check(!result.ok && result.code === "invalid" && !c.calls.some(row => row.name.startsWith("analytics_coupon_")), "invalid or client-forged identity rejected before lookup");
}
for (const options of [{ authError: true }, { entitlementError: true }]) {
  const c = fixture(options);
  const result = await c.actions.loadAnalyticsCouponAction(input);
  const mutation = await c.actions.redeemAnalyticsCouponAction({ ...input, idempotencyKey: key });
  check(!result.ok && !mutation.ok && result.code === "unauthorized" && mutation.code === "unauthorized", "cashier session and entitlement required for both actions");
  check(!c.calls.some(row => row.name.startsWith("analytics_coupon_")), "unauthorized never reads coupons or redeems");
}
{
  const c = fixture(); const result = await c.actions.loadAnalyticsCouponAction({ ...input, code: code.toLowerCase(), phone: "0500000001" });
  const rpc = c.calls.find(row => row.name === "analytics_coupon_preview");
  check(result.ok && result.data.totalAfterDiscount === 90, "validated preview exposes final discount total");
  check(rpc.args.p_session_token === "synthetic-private-session" && rpc.args.p_code === code && rpc.args.p_phone === phone && rpc.args.p_subtotal === 100, "session from server and canonical inputs sent to scoped RPC");
  check(!JSON.stringify(result).includes("private-session") && !c.calls.some(row => row.name === "analytics_coupon_redeem"), "preview exposes no session and never consumes coupon");
}
{
  const c = fixture(); const result = await c.actions.redeemAnalyticsCouponAction({ ...input, idempotencyKey: key });
  const rpc = c.calls.find(row => row.name === "analytics_coupon_redeem");
  check(result.ok && result.data.status === "redeemed" && Boolean(result.data.redeemedAt), "redemption validates saved receipt");
  check(rpc.args.p_key === key && rpc.args.p_subtotal === 100 && rpc.args.p_session_token === "synthetic-private-session", "redemption preserves request key and reviewed amount");
  const again = await c.actions.redeemAnalyticsCouponAction({ ...input, idempotencyKey: key });
  check(again.ok && c.calls.filter(row => row.name === "analytics_coupon_redeem").every(row => row.args.p_key === key), "same-key retry reaches atomic reconciliation RPC");
}
for (const [error, expected] of [
  [{ code: "42501", message: "PRIVATE_SCOPE" }, "unauthorized"],
  [{ code: "22023", message: "COUPON_NOT_AVAILABLE" }, "not_available"],
  [{ code: "22023", message: "ALREADY_REDEEMED" }, "already_redeemed"],
  [{ code: "22023", message: "Coupon already redeemed" }, "already_redeemed"],
  [{ code: "22023", message: "IDEMPOTENCY_CONFLICT" }, "uncertain"],
  [{ code: "XX000", message: "PRIVATE_DATABASE" }, "uncertain"],
]) {
  const c = fixture({ error }); const result = await c.actions.redeemAnalyticsCouponAction({ ...input, idempotencyKey: key });
  check(!result.ok && result.code === expected && !JSON.stringify(result).includes("PRIVATE"), "redemption failure sanitized and classified");
}
for (const patch of [{ status: "redeemed", redeemedAt: "2026-11-05T10:00:00Z" }, { subtotal: 101, totalAfterDiscount: 91 },
  { totalAfterDiscount: 99 }, { discountAmount: 101 }, { redeemedAt: "2026-11-05T10:00:00Z" }, { couponId: "bad" }]) {
  const c = fixture({ data: { ...preview, ...patch } }); const result = await c.actions.loadAnalyticsCouponAction(input);
  check(!result.ok && result.code === "unavailable", "malformed or stale preview cannot reach confirmation");
}
for (const options of [{ throws: true }, { data: preview }, { data: { ...preview, status: "redeemed", redeemedAt: "bad" } }]) {
  const c = fixture(options); const result = await c.actions.redeemAnalyticsCouponAction({ ...input, idempotencyKey: key });
  check(!result.ok && result.code === "uncertain" && !JSON.stringify(result).includes("PRIVATE"), "lost or malformed redemption response preserves retry semantics");
}
const coupon = { discountType: "percentage", discountValue: 12.5, minimumOrderAmount: 50, validityDays: 7, terms: "Terms" };
const message = schema.buildAnalyticsCouponMessage("  Hello  ", coupon, code, "2026-11-05T21:30:00Z");
check(message.includes("2026-11-13 00:30") && message.includes("12.5%") && message.includes(code), "recipient message includes correct Riyadh expiry and discount");
check(!message.includes("  Hello") && message.endsWith("Terms"), "message preserves trimmed exact body and terms");
check(schema.buildAnalyticsCouponMessage("x".repeat(2000), { ...coupon, terms: "x".repeat(400) }, code, Date.now()).length <= 3000, "generated coupon message fits provider limit at max inputs");
const files = ["scripts/check-analytics-coupon-server.mjs", "lib/analytics/analytics-coupons.ts", "lib/data/analytics-coupons.ts", "app/actions/analytics-coupons.ts", "lib/data/cashier.ts", "lib/data/rast-loyalty-access.ts", "package-lock.json"];
fs.mkdirSync("output/analytics-coupons", { recursive: true });
fs.writeFileSync("output/analytics-coupons/server-checks.json", JSON.stringify({ at: new Date().toISOString(), runtime: process.version, checks, result: "PASS", mockedOnly: true,
  inputs: Object.fromEntries(files.map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")])) }, null, 2));
console.log(`PASS ${checks} coupon input/auth/preview/redemption/retry/message checks; no live mutations`);
