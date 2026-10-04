import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Run production validation/actions and component code with isolated I/O.
// No browser, live database, customer data, or provider requests are used.
const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
function load(relative, stubs = {}, cache = new Map()) {
  relative = relative.replaceAll("\\", "/");
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => String(key) });
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(fs.existsSync(path.join(root, `${next}.tsx`)) ? `${next}.tsx` : `${next}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}

const cafeId = "10000000-0000-4000-8000-000000000001";
const cashierId = "20000000-0000-4000-8000-000000000001";
const cardId = "30000000-0000-4000-8000-000000000001";
const eventId = "40000000-0000-4000-8000-000000000001";
const requestId = "50000000-0000-4000-8000-000000000001";
const timestamp = "2026-10-04T12:00:00.000Z";
const filters = { from: "2026-10-04", to: "2026-10-04", cashierId: "", kind: "", outcome: "", search: "", page: 1 };
function fixture() {
  return {
    events: [{ id: eventId, occurredAt: timestamp, recordedAt: timestamp, kind: "stamp", outcome: "success", origin: "live",
      cashierId, actorName: "Test employee", actorType: "cashier", cardId, cardSuffix: "1234", customerName: "Test customer",
      stampsDelta: 1, rewardsDelta: 0, stampsBefore: 2, stampsAfter: 3, rewardsBefore: 0, rewardsAfter: 0,
      rewardName: null, rewardSuffix: null, rewardKind: null, rewardDiscountPercent: null, rewardExpiresAt: null,
      rewardTerms: null, reasonCode: null }],
    total: 1, page: 1, pageSize: 25, recordingStartedAt: timestamp,
    summary: { total: 1, scans: 0, stamps: 1, rewardsIssued: 0, redemptions: 0, denied: 0, failed: 0, duplicates: 0, uniqueCards: 1, activeCashiers: 1 },
    employees: [{ id: cashierId, name: "Test employee", active: true, scans: 0, stamps: 1, redemptions: 0, denied: 0, failed: 0, duplicates: 0, lastActivityAt: timestamp }],
  };
}
let passed = 0;
const failures = [];
async function test(name, run) {
  try { await run(); passed++; } catch (error) { failures.push({ name, error }); }
}

const { parseLoyaltyActivityFilters, loyaltyActivityPageSchema } = load("lib/loyalty/activity-validation.ts");
const { defaultLoyaltyActivityFilters } = load("lib/loyalty/activity-types.ts");
await test("Saudi calendar day starts at previous UTC 21:00 and upper bound is exclusive", () => {
  const parsed = parseLoyaltyActivityFilters(filters);
  assert.equal(parsed.from, "2026-10-03T21:00:00.000Z");
  assert.equal(parsed.to, "2026-10-04T21:00:00.000Z");
});
await test("default period changes at Riyadh midnight, not host midnight", () => {
  assert.deepEqual(defaultLoyaltyActivityFilters(new Date("2026-01-01T20:59:59Z")), { ...filters, from: "2025-12-03", to: "2026-01-01" });
  assert.deepEqual(defaultLoyaltyActivityFilters(new Date("2026-01-01T21:00:00Z")), { ...filters, from: "2025-12-04", to: "2026-01-02" });
});
await test("valid leap day keeps entire selected final day", () => {
  const parsed = parseLoyaltyActivityFilters({ ...filters, from: "2028-02-29", to: "2028-03-01" });
  assert.equal(parsed.from, "2028-02-28T21:00:00.000Z");
  assert.equal(parsed.to, "2028-03-01T21:00:00.000Z");
});
for (const [name, input] of [
  ["impossible date", { from: "2026-02-30" }], ["non-leap day", { to: "2026-02-29" }],
  ["reversed interval", { from: "2026-10-05" }], ["unbounded interval", { from: "2020-01-01" }],
  ["zero page", { page: 0 }], ["fractional page", { page: 1.5 }], ["unbounded page", { page: 10001 }],
  ["string page", { page: "2" }], ["forged tenant", { cafeId }], ["malformed cashier", { cashierId: "other" }],
  ["invalid kind", { kind: "delete" }], ["invalid outcome", { outcome: "ok" }], ["unbounded search", { search: "x".repeat(81) }],
]) await test(`reject ${name}`, () => assert.throws(() => parseLoyaltyActivityFilters({ ...filters, ...input })));
await test("trim search while preserving literal SQL wildcard input", () => {
  const parsed = parseLoyaltyActivityFilters({ ...filters, cashierId, kind: "redeem", outcome: "denied", search: "  %_\\'  ", page: 4 });
  assert.equal(parsed.filters.search, "%_\\'"); assert.equal(parsed.filters.page, 4);
});

function readerFixture() {
  const state = { role: "owner", ownerError: null, featureError: null, features: ["loyalty"], rpcError: null, data: fixture(), calls: [], featureReads: 0, clientReads: 0 };
  const stubs = {
    "server-only": {},
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => { if (state.ownerError) throw state.ownerError; return { id: cafeId, role: state.role }; } },
    "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => { state.featureReads++; if (state.featureError) throw state.featureError; return state.features; } },
    "@/lib/supabase/admin": { createAdminClient: () => assert.fail("Owner reader must retain authenticated RLS context") },
    "@/lib/supabase/server": { createClient: async () => { state.clientReads++; return { rpc: async (name, args) => { state.calls.push({ name, args }); return { data: state.data, error: state.rpcError }; } }; } },
  };
  const cache = new Map();
  return { state, ...load("lib/data/loyalty-activity.ts", stubs, cache), ...load("app/actions/loyalty-activity.ts", stubs, cache) };
}
for (const role of ["owner", "manager", "platform_admin"]) await test(`authorized ${role} keeps session tenant and RPC filters`, async () => {
  const ctx = readerFixture(); ctx.state.role = role;
  assert.deepEqual(await ctx.getOwnerLoyaltyActivity({ ...filters, cashierId, search: "  Test  ", kind: "stamp", outcome: "success", page: 2 }), fixture());
  assert.deepEqual(ctx.state.calls, [{ name: "get_owner_loyalty_activity", args: {
    p_cafe_id: cafeId, p_from: "2026-10-03T21:00:00.000Z", p_to: "2026-10-04T21:00:00.000Z", p_cashier_id: cashierId,
    p_kind: "stamp", p_outcome: "success", p_search: "Test", p_page: 2, p_page_size: 25,
  } }]);
});
for (const [name, mutate] of [
  ["staff role", (s) => { s.role = "staff"; }], ["missing owner", (s) => { s.ownerError = new Error("No user"); }],
  ["missing entitlement", (s) => { s.features = []; }], ["entitlement lookup failure", (s) => { s.featureError = new Error("Service unavailable"); }],
]) await test(`${name} fails before database read`, async () => {
  const ctx = readerFixture(); mutate(ctx.state);
  await assert.rejects(() => ctx.getOwnerLoyaltyActivity(filters));
  assert.equal(ctx.state.clientReads, 0); assert.equal(ctx.state.calls.length, 0);
});
await test("invalid filter cannot reach activity RPC", async () => {
  const ctx = readerFixture(); await assert.rejects(() => ctx.getOwnerLoyaltyActivity({ ...filters, cafeId: "forged" }));
  assert.equal(ctx.state.clientReads, 0); assert.equal(ctx.state.calls.length, 0);
});
await test("DTO strips future privileged metadata at every level", async () => {
  const ctx = readerFixture();
  ctx.state.data.secret = "root-secret"; ctx.state.data.events[0].cardCode = "BEARER-CARD";
  ctx.state.data.events[0].rewardCode = "BEARER-REWARD"; ctx.state.data.events[0].sessionToken = "SESSION";
  ctx.state.data.events[0].metadata = { customerPhone: "private" };
  ctx.state.data.employees[0].passwordHash = "hash"; ctx.state.data.summary.private = "summary-secret";
  assert.deepEqual(await ctx.getOwnerLoyaltyActivity(filters), fixture());
});
for (const [name, mutate] of [
  ["missing page", (v) => { delete v.page; }], ["negative summary", (v) => { v.summary.stamps = -1; }],
  ["invalid event timestamp", (v) => { v.events[0].occurredAt = "yesterday"; }],
  ["invalid event outcome", (v) => { v.events[0].outcome = "unknown"; }],
  ["full bearer code in suffix", (v) => { v.events[0].cardSuffix = "SECRET-CARD-CODE"; }],
  ["oversized page", (v) => { v.events = Array.from({ length: 51 }, () => v.events[0]); }],
]) await test(`malformed RPC response ${name} is rejected`, async () => {
  const ctx = readerFixture(); mutate(ctx.state.data);
  await assert.rejects(() => ctx.getOwnerLoyaltyActivity(filters));
});
await test("database errors and malformed payloads return safe action message", async () => {
  for (const data of [null, { wrong: true }, fixture()]) {
    const ctx = readerFixture(); ctx.state.data = data;
    if (data?.events) ctx.state.rpcError = { message: "private-schema-and-query" };
    const result = await ctx.loadLoyaltyActivityAction(filters);
    assert.equal(result.ok, false); assert.equal(typeof result.message, "string");
    assert(!JSON.stringify(result).includes("private-schema-and-query")); assert(!Object.hasOwn(result, "data"));
  }
});
await test("empty result is valid and does not fabricate events", () => {
  const empty = fixture(); empty.events = []; empty.employees = []; empty.total = 0; empty.recordingStartedAt = null;
  empty.summary = Object.fromEntries(Object.keys(empty.summary).map((key) => [key, 0]));
  assert.deepEqual(loyaltyActivityPageSchema.parse(empty), empty);
});

function scannerFixture() {
  const preview = { ok: true, customerName: "Test customer", stampsInCycle: 2, purchasesRequired: 7, availableRewards: 1, rewardName: "Test reward" };
  const state = { token: "session-token", active: true, slug: "rast", session: true, features: ["loyalty"],
    featureError: null, sessionError: null, rpcError: null, preview, operation: { ok: true, status: "stamped", cardCode: "CARD123" },
    revokedAt: null, ownerUserId: null, authUser: null, cafeOwnerId: null, profileStatus: "active", cafeStatus: "active", deletedAt: null,
    calls: [], reads: [], wallet: [], walletError: null };
  const db = {
    rpc: async (name, args) => { state.calls.push({ name, args }); return { data: name === "preview_loyalty_card" ? state.preview : state.operation, error: state.rpcError }; },
    from: (table) => {
      assert(["cafe_cashier_sessions", "cafe_cashiers", "cafes", "profiles"].includes(table), "Preview must not bypass audited RPC with a privileged customer read");
      const calls = []; state.reads.push({ table, calls });
      const query = {
        select: (...args) => { calls.push(["select", ...args]); return query; },
        eq: (...args) => { calls.push(["eq", ...args]); return query; },
        is: (...args) => { calls.push(["is", ...args]); return query; },
        gt: (...args) => { calls.push(["gt", ...args]); return query; },
        maybeSingle: async () => ({ error: table === "cafe_cashier_sessions" ? state.sessionError : null, data:
          table === "cafe_cashier_sessions" ? state.session ? { cafe_id: cafeId, cashier_id: cashierId, revoked_at: state.revokedAt } : null
            : table === "cafe_cashiers" ? { id: cashierId, active: state.active, owner_user_id: state.ownerUserId }
              : table === "cafes" ? { id: cafeId, slug: state.slug, owner_user_id: state.cafeOwnerId, status: state.cafeStatus, deleted_at: state.deletedAt }
                : { status: state.profileStatus } }),
      };
      return query;
    },
  };
  const getFeatures = async () => { if (state.featureError) throw state.featureError; return state.features; };
  const stubs = {
    "server-only": {}, "next/cache": { revalidatePath: () => {} },
    "next/headers": { cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }) },
    "@/app/actions/auth": {}, "@/lib/auth/phone-otp": {}, "@/lib/data/cafes": {},
    "@/lib/data/feature-entitlements": { getPublicCafeFeatureCodesBySlug: getFeatures, getCafeFeatureCodes: getFeatures },
    "@/lib/data/settings": {}, "@/lib/data/loyalty-cards": {}, "@/lib/auth/rast-loyalty-session": {}, "@/lib/data/customer-rewards": {},
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.authUser }, error: null }) } }) },
    "@/lib/data/operation-events": {}, "@/lib/data/notifications": {}, "@/lib/notifications/whatsapp": {},
    "@/lib/wallet": { syncWalletCardByCode: async (code) => { state.wallet.push(code); if (state.walletError) throw state.walletError; } },
  };
  const cache = new Map();
  stubs["@/lib/data/cashier"] = load("lib/data/cashier.ts", stubs, cache);
  return { state, ...load("lib/data/loyalty-experience.ts", stubs, cache), ...load("app/actions/loyalty-experience.ts", stubs, cache) };
}
const { createBarndaksaQrPayload } = load("lib/loyalty/secure-qr-payload.ts");
await test("preview audits normalized signed card and strips extra RPC fields", async () => {
  const ctx = scannerFixture(); ctx.state.preview.cardCode = "SECRET"; ctx.state.preview.sessionToken = "SECRET";
  assert.deepEqual(await ctx.lookupRastCashierCard(createBarndaksaQrPayload("loyalty-card", "CARD123")), {
    customerName: "Test customer", stampsInCycle: 2, purchasesRequired: 7, availableRewards: 1, rewardName: "Test reward",
  });
  assert.deepEqual(ctx.state.calls, [{ name: "preview_loyalty_card", args: { p_session_token: "session-token", p_card_code: "CARD123" } }]);
  const predicates = ctx.state.reads[0].calls;
  assert(predicates.some(([op, key, value]) => op === "eq" && key === "token" && value === "session-token"));
  assert(predicates.some(([op, fields]) => op === "select" && fields.includes("revoked_at")), "central guard loads revocation state");
  assert(predicates.some(([op, key]) => op === "gt" && key === "expires_at"));
  assert(ctx.state.reads.find((read) => read.table === "cafe_cashiers").calls.some(([op, key, value]) => op === "eq" && key === "cafe_id" && value === cafeId), "central guard scopes cashier to session tenant");
  assert.equal(ctx.state.wallet.length, 0);
});
for (const [name, mutate] of [
  ["no session token", (s) => { s.token = null; }], ["expired session", (s) => { s.session = false; }],
  ["inactive cashier", (s) => { s.active = false; }], ["other brand", (s) => { s.slug = "other"; }],
  ["session query error", (s) => { s.sessionError = { message: "private" }; }],
  ["revoked session", (s) => { s.revokedAt = timestamp; }],
  ["disabled entitlement", (s) => { s.features = []; }], ["entitlement query error", (s) => { s.featureError = new Error("private"); }],
]) await test(`preview ${name} stops before audited customer RPC`, async () => {
  const ctx = scannerFixture(); mutate(ctx.state);
  await assert.rejects(() => ctx.lookupRastCashierCard("CARD123")); assert.equal(ctx.state.calls.length, 0);
});
for (const [name, mutate] of [
  ["audit write error", (s) => { s.rpcError = { message: "private" }; }],
  ["denied result", (s) => { s.preview = { ok: false, errorCode: "blocked_customer" }; }],
  ["missing ok marker", (s) => { delete s.preview.ok; }],
  ["incomplete response", (s) => { s.preview = { ok: true }; }],
]) await test(`preview ${name} fails closed without customer fallback`, async () => {
  const ctx = scannerFixture(); mutate(ctx.state); await assert.rejects(() => ctx.lookupRastCashierCard("CARD123"));
  assert.equal(ctx.state.calls.length, 1); assert.equal(ctx.state.reads.length, 3);
});
for (const kind of ["stamp", "redeem"]) await test(`${kind} invokes audit wrapper with same request id and syncs only committed card`, async () => {
  const ctx = scannerFixture(); const code = kind === "stamp" ? "CARD123" : "REWARD123";
  ctx.state.operation.status = kind === "stamp" ? "stamped" : "redeemed";
  await ctx.scanLoyaltyExperienceAction({ value: `  ${code.toLowerCase()}  `, requestId, kind });
  assert.deepEqual(ctx.state.calls, [{ name: "execute_loyalty_audited_operation", args: { p_session_token: "session-token", p_code: code, p_request_id: requestId, p_operation: kind } }]);
  assert.deepEqual(ctx.state.wallet, ["CARD123"]);
});
for (const [name, mutate] of [
  ["no session token", (s) => { s.token = null; }], ["disabled entitlement", (s) => { s.features = []; }],
  ["entitlement query failure", (s) => { s.featureError = new Error("private"); }],
]) await test(`mutation ${name} performs no RPC or wallet sync`, async () => {
  const ctx = scannerFixture(); mutate(ctx.state);
  await assert.rejects(() => ctx.scanLoyaltyExperienceAction({ value: "CARD123", requestId, kind: "stamp" }));
  assert.equal(ctx.state.calls.length, 0); assert.equal(ctx.state.wallet.length, 0);
});
for (const [name, mutate] of [
  ["logged out owner", (s) => { s.authUser = null; }],
  ["different authenticated user", (s) => { s.authUser = { id: "someone-else" }; }],
  ["transferred brand", (s) => { s.cafeOwnerId = "new-owner"; }],
  ["suspended profile", (s) => { s.profileStatus = "suspended"; }],
  ["suspended brand", (s) => { s.cafeStatus = "suspended"; }],
  ["deleted brand", (s) => { s.deletedAt = timestamp; }],
]) for (const operation of ["preview", "stamp", "redeem"]) await test(`${operation} rejects ${name} before privileged RPC`, async () => {
  const ctx = scannerFixture();
  Object.assign(ctx.state, { ownerUserId: "owner-id", authUser: { id: "owner-id" }, cafeOwnerId: "owner-id" });
  mutate(ctx.state);
  await assert.rejects(() => operation === "preview" ? ctx.lookupRastCashierCard("CARD123")
    : ctx.scanLoyaltyExperienceAction({ value: operation === "stamp" ? "CARD123" : "REWARD123", requestId, kind: operation }));
  assert.equal(ctx.state.calls.length, 0); assert.equal(ctx.state.wallet.length, 0);
});
await test("authenticated linked owner retains audited preview and stamp", async () => {
  const ctx = scannerFixture();
  Object.assign(ctx.state, { ownerUserId: "owner-id", authUser: { id: "owner-id" }, cafeOwnerId: "owner-id" });
  await ctx.lookupRastCashierCard("CARD123");
  await ctx.scanLoyaltyExperienceAction({ value: "CARD123", requestId, kind: "stamp" });
  assert.deepEqual(ctx.state.calls.map((call) => call.name), ["preview_loyalty_card", "execute_loyalty_audited_operation"]);
});
for (const [name, input] of [
  ["bad request id", { requestId: "forged" }], ["wrong QR kind", { value: createBarndaksaQrPayload("customer-reward", "REWARD123") }],
  ["bad code", { value: "CARD'123" }], ["bad operation", { kind: "void" }],
]) await test(`mutation rejects ${name} before RPC`, async () => {
  const ctx = scannerFixture(); await assert.rejects(() => ctx.scanLoyaltyExperienceAction({ value: "CARD123", requestId, kind: "stamp", ...input }));
  assert.equal(ctx.state.calls.length, 0); assert.equal(ctx.state.wallet.length, 0);
});
for (const [name, mutate] of [
  ["audit RPC error", (s) => { s.rpcError = { message: "private" }; }],
  ["denied outcome", (s) => { s.operation = { ok: false, status: "stamped", cardCode: "CARD123" }; }],
  ["missing audited marker", (s) => { delete s.operation.ok; }],
  ["missing result", (s) => { s.operation = null; }],
]) await test(`${name} rejects without wallet synchronization`, async () => {
  const ctx = scannerFixture(); mutate(ctx.state);
  await assert.rejects(() => ctx.scanLoyaltyExperienceAction({ value: "CARD123", requestId, kind: "stamp" }));
  assert.equal(ctx.state.calls.length, 1); assert.equal(ctx.state.wallet.length, 0);
});
await test("cooldown response cannot synchronize or pretend to be a new committed stamp", async () => {
  const ctx = scannerFixture(); ctx.state.operation.status = "recent_scan";
  assert.equal((await ctx.scanLoyaltyExperienceAction({ value: "CARD123", requestId, kind: "stamp" })).status, "recent_scan");
  assert.equal(ctx.state.wallet.length, 0);
});
await test("wallet outage preserves successful committed mutation response", async () => {
  const ctx = scannerFixture(); ctx.state.walletError = new Error("Provider unavailable");
  const originalWarn = console.warn; const warnings = []; console.warn = (message) => warnings.push(message);
  try {
    assert.equal((await ctx.scanLoyaltyExperienceAction({ value: "CARD123", requestId, kind: "stamp" })).status, "stamped");
  } finally { console.warn = originalWarn; }
  assert.deepEqual(warnings, ["[loyalty-wallet-sync] deferred"]);
});

const uiPath = "components/loyalty/loyalty-activity-log.tsx";
const { LoyaltyActivityLog } = load(uiPath, { "@/app/actions/loyalty-activity": { loadLoyaltyActivityAction: () => assert.fail("SSR must not load another page") } });
function render(result, initialFilters = filters) {
  return renderToStaticMarkup(React.createElement(LoyaltyActivityLog, { initialResult: result, initialFilters }));
}
await test("real React SSR exposes RTL named filters, employee, semantic table and masked card", () => {
  const html = render({ ok: true, data: fixture() });
  assert(html.includes('dir="rtl"')); assert(html.includes('aria-labelledby="loyalty-activity-title"'));
  assert(html.includes('<table')); assert(html.includes('<caption')); assert(html.includes('scope="col"'));
  assert(html.includes('type="date"')); assert(html.includes('type="search"')); assert(html.includes('aria-live="polite"'));
  assert(html.includes("Test employee")); assert(html.includes("Test customer")); assert(html.includes("<bdi>1234</bdi>"));
  assert(!html.includes('name="sessionToken"')); assert(!html.includes('cardCode')); assert(!html.includes('rewardCode'));
  assert(html.includes('aria-busy="false"'));
});
await test("SSR distinguishes empty filtered result and initial load failure", () => {
  const empty = fixture(); empty.total = 0; empty.events = []; empty.employees = [];
  const emptyHtml = render({ ok: true, data: empty }, { ...filters, search: "Nobody" });
  assert(!emptyHtml.includes('<table')); assert(!emptyHtml.includes('role="alert"'));
  assert(emptyHtml.includes("لا توجد عمليات تطابق بحثك"));
  const failedHtml = render({ ok: false, message: "Load unavailable" });
  assert(failedHtml.includes('role="alert"')); assert(failedHtml.includes("Load unavailable"));
  assert(failedHtml.includes("إعادة المحاولة")); assert(!failedHtml.includes("لا توجد عمليات تطابق بحثك"));
});
function textContent(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return textContent(node.props?.children);
}
function findAll(node, predicate, matches = []) {
  if (Array.isArray(node)) { for (const child of node) findAll(child, predicate, matches); return matches; }
  if (!node || typeof node !== "object") return matches;
  if (predicate(node)) matches.push(node);
  findAll(node.props?.children, predicate, matches);
  return matches;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const settle = () => new Promise(setImmediate);
function uiFixture(initialData = fixture()) {
  const state = [], refs = [], effects = [], requests = [];
  let stateCursor = 0, refCursor = 0, tree;
  const react = { ...React,
    useState(initial) { const id = stateCursor++; if (!(id in state)) state[id] = typeof initial === "function" ? initial() : initial;
      return [state[id], (next) => { state[id] = typeof next === "function" ? next(state[id]) : next; }]; },
    useRef(initial) { const id = refCursor++; if (!(id in refs)) refs[id] = { current: initial }; return refs[id]; },
    useEffect(effect) { if (!tree) effects.push(effect); },
  };
  const { LoyaltyActivityLog: Component } = load(uiPath, {
    react,
    "@/app/actions/loyalty-activity": { loadLoyaltyActivityAction: (input) => { const response = deferred(); requests.push({ input, ...response }); return response.promise; } },
  });
  const ctx = {
    requests, effects,
    render() { stateCursor = 0; refCursor = 0; tree = Component({ initialResult: { ok: true, data: initialData }, initialFilters: filters }); return tree; },
    text: () => textContent(tree),
    find: (predicate) => { const found = findAll(tree, predicate); assert(found.length, "Expected component element"); return found[0]; },
    button(label) { return ctx.find((node) => node.type === "button" && textContent(node).includes(label)); },
    editSearch(value) { ctx.find((node) => node.type === "input" && node.props.type === "search").props.onChange({ target: { value } }); ctx.render(); },
    submit() { ctx.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); },
    detail(event) { ctx.find((node) => typeof node.type === "function" && node.props.event?.id === event.id); },
  };
  ctx.render(); return ctx;
}
const originalAnimationFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => { callback(); return 0; };
try {
  await test("filter submit trims draft, starts page one and preserves prior rows until success", async () => {
    const ctx = uiFixture(); ctx.editSearch("  New customer  "); ctx.submit(); ctx.render();
    assert.equal(ctx.requests.length, 1); assert.equal(ctx.requests[0].input.search, "New customer"); assert.equal(ctx.requests[0].input.page, 1);
    assert.equal(ctx.button("عرض النتائج").props.disabled, true); assert(ctx.text().includes("Test customer"));
    const next = fixture(); next.events[0].customerName = "New customer";
    ctx.requests[0].resolve({ ok: true, data: next }); await settle(); ctx.render();
    assert(ctx.text().includes("New customer")); assert(!ctx.text().includes("Test customer"));
    assert.equal(ctx.button("عرض النتائج").props.disabled, false);
  });
  await test("failed response retains applied filters and visible records; refresh retries applied range", async () => {
    const ctx = uiFixture(); ctx.editSearch("Unapplied filter"); ctx.submit();
    ctx.requests[0].resolve({ ok: false, message: "Retry later" }); await settle(); ctx.render();
    assert(ctx.text().includes("Test customer")); assert(ctx.text().includes("Retry later"));
    assert(ctx.find((node) => node.props?.role === "alert"));
    ctx.button("تحديث السجل").props.onClick(); assert.equal(ctx.requests[1].input.search, "");
    ctx.requests[1].resolve({ ok: true, data: fixture() }); await settle(); ctx.render();
    assert(!ctx.text().includes("Retry later"));
  });
  await test("thrown action failure leaves previous results and clears pending state", async () => {
    const ctx = uiFixture(); ctx.button("تحديث السجل").props.onClick();
    ctx.requests[0].reject(new Error("Network failed")); await settle(); ctx.render();
    assert(ctx.text().includes("Test customer")); assert(ctx.find((node) => node.props?.role === "alert"));
    assert.equal(ctx.button("تحديث السجل").props.disabled, false);
  });
  await test("newer request wins over delayed old response", async () => {
    const ctx = uiFixture(); ctx.editSearch("Old query"); ctx.submit(); ctx.editSearch("New query"); ctx.submit();
    const newer = fixture(); newer.events[0].customerName = "Newest customer";
    ctx.requests[1].resolve({ ok: true, data: newer }); await settle();
    const older = fixture(); older.events[0].customerName = "Stale customer";
    ctx.requests[0].resolve({ ok: true, data: older }); await settle(); ctx.render();
    assert(ctx.text().includes("Newest customer")); assert(!ctx.text().includes("Stale customer"));
  });
  await test("pagination uses applied search even when draft changes", async () => {
    const data = fixture(); data.total = 26;
    const ctx = uiFixture(data); ctx.editSearch("Not yet applied"); ctx.button("التالي").props.onClick();
    assert.equal(ctx.requests[0].input.search, ""); assert.equal(ctx.requests[0].input.page, 2);
    const next = fixture(); next.page = 2; next.total = 26;
    ctx.requests[0].resolve({ ok: true, data: next }); await settle(); ctx.render();
    assert.equal(ctx.button("التالي").props.disabled, true); assert.equal(ctx.button("السابق").props.disabled, false);
  });
  await test("selected detail preserves zero and historical unknown balances with earned reward terms", () => {
    const data = fixture(); Object.assign(data.events[0], { kind: "redeem", origin: "historical", stampsBefore: null, stampsAfter: null,
      rewardsBefore: 1, rewardsAfter: 0, rewardName: "Original reward", rewardKind: "discount", rewardDiscountPercent: 25,
      rewardTerms: "Original earned terms", rewardSuffix: "9876" });
    const ctx = uiFixture(data); ctx.button("التفاصيل").props.onClick(); const tree = ctx.render();
    const detail = findAll(tree, (node) => typeof node.type === "function" && node.props.event?.id === eventId)[0];
    assert(detail, "Selected event opens detail component");
    const html = renderToStaticMarkup(detail);
    assert(html.includes('<dialog')); assert(html.includes('aria-labelledby="loyalty-event-title"'));
    assert(html.includes("Original reward")); assert(html.includes("Original earned terms")); assert(html.includes("25٪"));
    assert(html.includes("غير مسجل لهذه العملية")); assert(html.includes("المكافآت بعد العملية</dt><dd>0</dd>"));
    assert(html.includes("هذه عملية سابقة")); assert(!html.includes("SECRET"));
  });
  await test("reward scan details name the actual scanned object and never display raw failure codes", () => {
    const data = fixture(); Object.assign(data.events[0], { kind: "scan", outcome: "denied", rewardSuffix: "9876", rewardName: "Earned reward", reasonCode: "unrecognized_internal_reason" });
    const ctx = uiFixture(data); ctx.button("التفاصيل").props.onClick(); const tree = ctx.render();
    const detail = findAll(tree, (node) => typeof node.type === "function" && node.props.event?.id === eventId)[0];
    const html = renderToStaticMarkup(detail);
    assert(html.includes("قراءة مكافأة")); assert(html.includes("Earned reward"));
    assert(!html.includes("unrecognized_internal_reason"));
  });
} finally {
  if (originalAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = originalAnimationFrame;
}
await test("activity stylesheet parses and includes focused small-screen and reduced-motion rules", () => {
  const css = dependency("postcss").parse(fs.readFileSync(path.join(root, "components/loyalty/loyalty-activity-log.module.css"), "utf8"));
  const media = []; css.walkAtRules("media", (rule) => media.push(rule.params));
  assert(media.some((value) => value.includes("820px"))); assert(media.some((value) => value.includes("540px")));
  assert(media.some((value) => value.includes("prefers-reduced-motion")));
});

for (const failure of failures) console.error(`FAIL: ${failure.name}`, failure.error);
console.log(`Loyalty activity checks: ${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
