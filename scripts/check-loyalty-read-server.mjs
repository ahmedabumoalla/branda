import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, "..");
const cafeId = "10000000-0000-4000-8000-000000000001", cashierId = "20000000-0000-4000-8000-000000000001", profileId = "30000000-0000-4000-8000-000000000001", requestId = "40000000-0000-4000-8000-000000000001";
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", "process", "Buffer", output)(name => {
    if (name === "server-only") return {};
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`, mocks);
    return require(name);
  }, exports, process, Buffer);
  return exports;
}
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const op = { requestId, status: "pending", identifierHint: "***4567", attempts: 0, createdAt: new Date().toISOString(), completedAt: null };
let session = { cafeId, cashierId, token: "test-session" }, owner = { id: cafeId, role: "owner" }, calls = [], entitlement = true;
let rpcResult = { data: { ok: true, operation: op }, error: null };
const rpc = async (name, input) => { calls.push({ name, input }); return rpcResult; };
const mocks = {
  "@/lib/data/cashier": { requireCashierPermission: async permission => { assert.equal(permission, "loyalty"); return session; } },
  "@/lib/data/cafes": { requireOwnerCafeContext: async () => owner },
  "@/lib/data/rast-loyalty-access": { assertRastLoyaltyEntitlement: async () => { if (!entitlement) throw Error("Forbidden"); } },
  "@/lib/supabase/admin": { createAdminClient: () => ({ rpc }) },
  "@/lib/supabase/server": { createClient: async () => ({ rpc }) },
};
const dal = load("lib/data/loyalty-read-operations.ts", mocks);
const input = { cafeId, cashierId, requestId, method: "phone", value: "٠٥٠١٢٣٤٥٦٧", clientCreatedAt: new Date().toISOString() };
await check("completed read retains exact zero stamp and earned reward balances", async () => {
  rpcResult = { data: { ok: true, operation: { ...op, status: "succeeded", customerName: "Customer", stampsInCycle: 0, purchasesRequired: 6, availableRewards: 2 } }, error: null };
  const completed = await dal.enqueueLoyaltyRead(input);
  assert.equal(completed.stampsInCycle, 0); assert.equal(completed.purchasesRequired, 6); assert.equal(completed.availableRewards, 2);
  rpcResult = { data: { ok: true, operation: op }, error: null };
  const legacy = await dal.enqueueLoyaltyRead(input);
  assert.equal(legacy.stampsInCycle, null); assert.equal(legacy.purchasesRequired, null); assert.equal(legacy.availableRewards, null);
  calls = [];
});
await check("tenant and cashier mismatch reject before service RPC", async () => {
  for (const scope of [{ cafeId: profileId, cashierId }, { cafeId, cashierId: profileId }]) {
    await assert.rejects(dal.enqueueLoyaltyRead({ ...input, ...scope }), { code: "session_scope_changed" });
    await assert.rejects(dal.getCashierLoyaltyReads([requestId], scope), { code: "session_scope_changed" });
  }
  assert.equal(calls.length, 0);
});
await check("normalize phone and bind queue to authenticated session", async () => {
  assert.equal((await dal.enqueueLoyaltyRead(input)).requestId, requestId);
  assert.equal(calls.at(-1).input.p_value, "966501234567");
  assert.equal(calls.at(-1).input.p_session_token, session.token);
  await assert.rejects(dal.enqueueLoyaltyRead({ ...input, value: "not-a-phone" }), { code: "invalid_phone" });
});
await check("only loyalty-card QR and bounded valid identifiers accepted", async () => {
  const { createBarndaksaQrPayload } = load("lib/loyalty/secure-qr-payload.ts");
  await dal.enqueueLoyaltyRead({ ...input, method: "code", value: createBarndaksaQrPayload("loyalty-card", "CARD123") });
  assert.equal(calls.at(-1).input.p_value, "CARD123");
  await assert.rejects(dal.enqueueLoyaltyRead({ ...input, method: "code", value: createBarndaksaQrPayload("customer-reward", "CARD123") }), { code: "invalid_code" });
});
await check("phone entered in card field uses phone enrollment and card identifiers remain codes", async () => {
  for (const value of ["0501234567", "501234567", "+966 50 123 4567", "00966501234567", "٠٥٠١٢٣٤٥٦٧", "۰۵۰۱۲۳۴۵۶۷"]) {
    await dal.enqueueLoyaltyRead({ ...input, method: "code", value });
    assert.equal(calls.at(-1).input.p_method, "phone"); assert.equal(calls.at(-1).input.p_value, "966501234567");
  }
  for (const value of ["14401", "0123456789123456", "ABCDEF1234567890"]) {
    await dal.enqueueLoyaltyRead({ ...input, method: "phone", value });
    assert.equal(calls.at(-1).input.p_method, "code"); assert.equal(calls.at(-1).input.p_value, value);
  }
  await assert.rejects(dal.enqueueLoyaltyRead({ ...input, method: "code", value: "not a phone 0501234567" }), { code: "invalid_code" });
});
await check("sequential brand numbers accept one to five digits in either input tab", async () => {
  for (const method of ["code", "phone"]) for (const [value, expected] of [["1", "1"], ["٢", "2"], ["۳", "3"], ["42", "42"], ["99999", "99999"]]) {
    await dal.enqueueLoyaltyRead({ ...input, method, value });
    assert.equal(calls.at(-1).input.p_method, "code");
    assert.equal(calls.at(-1).input.p_value, expected);
    assert.equal(calls.at(-1).input.p_expected_cafe_id, cafeId);
  }
  for (const value of ["0", "01", "ABC", "-1", "1.5", "1 OR 1=1"]) {
    const before = calls.length;
    await assert.rejects(dal.enqueueLoyaltyRead({ ...input, method: "code", value }), { code: "invalid_code" });
    assert.equal(calls.length, before);
  }
});
await check("service failure retryable and request conflict permanent", async () => {
  rpcResult = { error: Error("private database details") };
  await assert.rejects(dal.enqueueLoyaltyRead(input), { code: "unavailable", retryable: true });
  rpcResult = { data: { ok: false, errorCode: "request_conflict" } };
  await assert.rejects(dal.enqueueLoyaltyRead(input), { code: "request_conflict", retryable: false });
});
await check("owner role and entitlement checked before authenticated retry", async () => {
  const count = calls.length; owner = { id: cafeId, role: "customer" };
  await assert.rejects(dal.retryOwnerLoyaltyReads(), { code: "permission_denied" });
  owner = { id: cafeId, role: "owner" }; entitlement = false;
  await assert.rejects(dal.retryOwnerLoyaltyReads(), /Forbidden/); assert.equal(calls.length, count);
  entitlement = true; rpcResult = { data: { retried: 3 } };
  assert.deepEqual(await dal.retryOwnerLoyaltyReads(), { retried: 3, cafeId });
});
const deferred = [], processed = [], walletCalls = []; let dispatches = 0;
const actions = load("app/actions/loyalty-read-operations.ts", {
  "next/server": { after: fn => deferred.push(fn) },
  "@/lib/data/loyalty-read-operations": { ...dal, enqueueLoyaltyRead: async () => op, getCashierLoyaltyReads: async () => [op], processLoyaltyReads: async args => { processed.push(args); return { processed: 1, cardIds: [profileId] }; }, retryOwnerLoyaltyReads: async () => ({ retried: 2, cafeId }) },
  "@/lib/wallet": { retryWalletNotificationJobs: async (...args) => { walletCalls.push(args); return { processed: 1 }; } },
  "@/lib/loyalty/read-card-links": { dispatchStampCardLinks: async () => dispatches++ },
});
await check("accept returns before background processing and worker is tenant-scoped", async () => {
  assert.equal((await actions.enqueueLoyaltyReadAction(input)).ok, true); assert.equal(processed.length, 0);
  await deferred.shift()(); assert.equal(processed[0].cafeId, cafeId); assert.deepEqual(processed[0].requestIds, [requestId]);
  await actions.loadCashierLoyaltyReadsAction([profileId, requestId], { cafeId, cashierId });
  await deferred.shift()(); assert.deepEqual(processed[1].requestIds, [requestId]); assert.equal(processed[1].cafeId, cafeId);
  assert.equal(dispatches, 2);
  assert.deepEqual(walletCalls, [[5, [profileId]], [5, [profileId]]]);
});
const tokenMocks = { "@/lib/barndaksa/env": { getSupabaseServiceRoleKey: () => "isolated-test-key-not-a-real-secret" } };
const tokens = load("lib/auth/loyalty-session-token.ts", tokenMocks);
const message = load("lib/loyalty/read-card-links.ts", { ...tokenMocks, "@/lib/wallet/google": {}, "@/lib/supabase/admin": {}, "@/lib/whatsapp/green-api": {}, "@/lib/whatsapp/customer-routing": {}, "@/lib/whatsapp/brand-connection-types": {} }).stampCardLinkMessage;
await check("branded card link signed, tenant bound, expires and distinguishes first stamp", () => {
  const text = message({ brandName: "Test Brand", brandSlug: "test-brand", cafeId, profileId, phone: "966501234567", cardCreated: true });
  assert.ok(text.includes("Test Brand")); assert.ok(text.includes("أول ختم"));
  const url = new URL(text.split("\n\n").find(x => x.startsWith("https://")));
  assert.equal(url.origin, "https://barndaksa.com");
  const token = url.searchParams.get("token"), session = tokens.readLoyaltySessionToken(token, "test-brand");
  assert.equal(session.cafeId, cafeId); assert.equal(session.profileId, profileId);
  assert.equal(tokens.readLoyaltySessionToken(token, "other-brand"), null);
  assert.equal(tokens.readLoyaltySessionToken(`${token}x`, "test-brand"), null);
  assert.equal(tokens.readLoyaltySessionToken(token, "test-brand", Date.now() + 31 * 86400000), null);
  assert.ok(!message({ brandName: "Test", brandSlug: "test-brand", cafeId, profileId, phone: "966501234567", cardCreated: false }).includes("أول ختم"));
});
let profile = { status: "active", phone_normalized: "966501234567", blocked_at: null, phone_auth_conflict: false }, cookie = null;
const route = load("app/loyalty/[slug]/access/route.ts", {
  ...tokenMocks,
  "next/server": { NextResponse: { redirect: url => ({ url, headers: new Headers(), cookies: { set: (...args) => { cookie = args; } } }) } },
  "@/lib/data/cafes": { getPublicCafeBySlugAdmin: async () => ({ id: cafeId }) },
  "@/lib/data/rast-loyalty-access": { assertRastLoyaltyEntitlement: async () => {} },
  "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: profile }) }) }) },
});
await check("card-link route strips token and refuses changed phone or blocked member", async () => {
  const token = tokens.createLoyaltySessionToken({ slug: "test-brand", cafeId, profileId, phoneHash: tokens.loyaltyIdentityHash(profile.phone_normalized) });
  const req = new Request(`https://barndaksa.com/loyalty/test-brand/access?token=${token}`), context = { params: Promise.resolve({ slug: "test-brand" }) };
  const response = await route.GET(req, context); assert.equal(response.url.search, ""); assert.equal(cookie[2].httpOnly, true); assert.equal(cookie[2].sameSite, "lax");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  cookie = null; profile = { ...profile, phone_normalized: "966501234568" }; await route.GET(req, context); assert.equal(cookie, null);
  profile = { ...profile, phone_normalized: "966501234567", blocked_at: "now" }; await route.GET(req, context); assert.equal(cookie, null);
});
await check("cron rejects missing and wrong authorization without processing", async () => {
  let runs = 0; const previous = process.env.CRON_SECRET; process.env.CRON_SECRET = "test-only-secret".repeat(4);
  const route = load("app/api/loyalty/read-jobs/route.ts", { "@/lib/data/loyalty-read-operations": { processLoyaltyReads: async () => { runs++; return { processed: 0, cardIds: [] }; } }, "@/lib/wallet": { retryWalletNotificationJobs: async () => ({ processed: 0 }) }, "@/lib/loyalty/read-card-links": { dispatchStampCardLinks: async () => ({ processed: 0 }) } });
  try {
    assert.equal((await route.GET(new Request("https://example.test"))).status, 401);
    assert.equal((await route.GET(new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }))).status, 401); assert.equal(runs, 0);
    assert.equal((await route.GET(new Request("https://example.test", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))).status, 200); assert.equal(runs, 1);
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});
await check("WhatsApp unavailable defers claim and ambiguous send is recorded separately", async () => {
  let ready = false, sends = 0, claimed = false; const recorded = [];
  const dispatcher = load("lib/loyalty/read-card-links.ts", {
    ...tokenMocks,
    "@/lib/wallet/google": {},
    "@/lib/whatsapp/brand-connection-types": { LOCO_CAFE_ID: profileId },
    "@/lib/whatsapp/customer-routing": { selectLocoLoyaltySender: async () => null },
    "@/lib/whatsapp/green-api": { isGreenApiLoyaltyWelcomeReady: async () => ready, sendGreenApiLoyaltyWelcome: async () => { sends++; throw Error("response lost"); } },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, args) => {
      recorded.push({ name, args });
      if (name === "finish_stamp_card_link_v2") return { data: true };
      if (claimed) return { data: null }; claimed = true;
      return { data: { id: requestId, claimToken: profileId, cafeId, profileId, brandName: "Test", brandSlug: "test-brand", phone: "966501234567", cardCreated: true } };
    } }) },
  });
  await dispatcher.dispatchStampCardLinks(2); assert.equal(recorded.length, 0);
  ready = true; const result = await dispatcher.dispatchStampCardLinks(2);
  assert.equal(sends, 1); assert.equal(result.unknown, 1);
  assert.equal(recorded.find(x => x.name === "finish_stamp_card_link_v2").args.p_status, "unknown");
  assert.equal(recorded.some(x => /stamp|process_loyalty/.test(x.name) && !/card_link/.test(x.name)), false);
});
await check("card invitation checks actual Google save state and defers unknown before sending", async () => {
  for (const state of [true, false, "unavailable"]) {
    let claimed = false, sent = 0; const finished = [];
    const dispatcher = load("lib/loyalty/read-card-links.ts", {
      ...tokenMocks,
      "@/lib/wallet/google": { getGoogleWalletSaveState: async identity => { assert.deepEqual(identity, { cafeId, cardId: requestId }); if (state === "unavailable") throw Error("provider unavailable"); return state; } },
      "@/lib/whatsapp/brand-connection-types": { LOCO_CAFE_ID: profileId },
      "@/lib/whatsapp/customer-routing": { selectLocoLoyaltySender: async () => null },
      "@/lib/whatsapp/green-api": { isGreenApiLoyaltyWelcomeReady: async () => true, sendGreenApiLoyaltyWelcome: async () => { sent++; return { status: "queued", providerMessageId: "test-message" }; } },
      "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, args) => {
        if (name === "finish_stamp_card_link_v2") { finished.push(args.p_status); return { data: true }; }
        if (claimed) return { data: null }; claimed = true;
        return { data: { id: requestId, claimToken: profileId, cafeId, profileId, cardId: requestId, brandName: "Test", brandSlug: "test-brand", phone: "966501234567", cardCreated: false, googleIssued: true } };
      } }) },
    });
    await dispatcher.dispatchStampCardLinks(1);
    assert.equal(sent, state === false ? 1 : 0);
    assert.deepEqual(finished, [state === true ? "skipped" : state === false ? "queued" : "deferred"]);
  }
});
await check("LOCO invitations stay pending offline and resume only on the verified brand sender", async () => {
  let brandSender = null, pending = true;
  const sent = [], flags = [];
  const dispatcher = load("lib/loyalty/read-card-links.ts", {
    ...tokenMocks,
    "@/lib/wallet/google": {},
    "@/lib/whatsapp/brand-connection-types": { LOCO_CAFE_ID: cafeId },
    "@/lib/whatsapp/customer-routing": { selectLocoLoyaltySender: async () => brandSender },
    "@/lib/whatsapp/green-api": {
      isGreenApiLoyaltyWelcomeReady: async () => true,
      sendGreenApiLoyaltyWelcome: async () => { throw Error("Must never use platform for LOCO"); },
      sendGreenApiCustomerMessage: async sender => { sent.push(sender); return { status: "queued", providerMessageId: "brand-ack" }; },
    },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, args) => {
      if (name === "finish_stamp_card_link_v2") return { data: true };
      flags.push(args);
      if (!args.p_loco_ready || !pending) return { data: null };
      pending = false;
      return { data: { id: requestId, claimToken: profileId, cafeId, profileId, cardId: requestId, brandName: "LOCO", brandSlug: "test-brand", phone: "966501234567", cardCreated: true, googleIssued: false } };
    } }) },
  });
  assert.equal((await dispatcher.dispatchStampCardLinks()).processed, 0);
  assert.equal(pending, true); assert.equal(sent.length, 0);
  assert.equal(flags[0].p_primary_ready, true); assert.equal(flags[0].p_loco_ready, false);
  brandSender = { idInstance: "brand" };
  assert.equal((await dispatcher.dispatchStampCardLinks()).queued, 1);
  assert.deepEqual(sent, [brandSender]);
  assert.equal((await dispatcher.dispatchStampCardLinks()).processed, 0);
});
console.log(`Loyalty read server: ${checks} checks passed`);
