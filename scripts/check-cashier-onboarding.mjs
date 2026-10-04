import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
function load(relative, stubs, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name)}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}

let passed = 0;
async function check(label, run) {
  try { await run(); passed++; }
  catch (error) { throw new Error(`FAILED: ${label}`, { cause: error }); }
}
const cafeId = "10000000-0000-4000-8000-000000000001";
const cashierId = "20000000-0000-4000-8000-000000000002";
const ownerId = "30000000-0000-4000-8000-000000000003";
const password = "  Chosen-pass9  ";
const input = { fullName: " Test employee ", email: " Employee@Example.test ", phone: "0501234567", password, employeeNumber: " E-17 " };
const baseStubs = {
  "server-only": {},
  "@/lib/auth/rast-loyalty-session": {},
  "@/lib/data/operation-events": {},
  "@/lib/data/notifications": {},
  "@/lib/notifications/whatsapp": {},
};
const originalFetch = globalThis.fetch;
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
const capturedLogs = [];
globalThis.fetch = async () => { throw new Error("Unexpected network attempt in isolated test"); };
for (const method of Object.keys(originalConsole)) console[method] = (...args) => capturedLogs.push(args);

try {
  const calls = [], sent = [];
  let rpcError = null, rpcId = cashierId, configured = true, sendError = false, ownerDenied = false;
  const { createOwnerCashier } = load("lib/data/loyalty-cards.ts", {
    ...baseStubs,
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: rpcId, error: rpcError }; } }) },
    "@/lib/supabase/admin": {},
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => { if (ownerDenied) throw new Error("Denied"); return { id: cafeId, name: "Test brand" }; } },
    "@/lib/whatsapp/green-api": {
      isGreenApiConfigured: () => configured,
      sendGreenApiCashierWelcome: async (args) => {
        assert(calls.length > 0 && !rpcError, "Send must follow a successful database call");
        sent.push(args);
        if (sendError) throw new Error(`Provider contains sensitive ${password}`);
        return { providerMessageId: "test-message" };
      },
    },
  });
  const invalidCases = [
    ["short name", { fullName: "x" }], ["newline name", { fullName: "Test\nEmployee" }],
    ["long name", { fullName: "x".repeat(81) }], ["bad email", { email: "invalid" }],
    ["bad phone", { phone: "123" }], ["international phone", { phone: "+12025550123" }],
    ["short password", { password: "short" }], ["blank password", { password: "        " }],
    ["long password", { password: "x".repeat(41) }], ["control password", { password: "ValidPass\n9" }],
    ["bcrypt byte overflow", { password: "🔐".repeat(19) }],
  ];
  for (const [label, patch] of invalidCases) await check(`reject ${label} before mutation`, async () => {
    const before = calls.length;
    await assert.rejects(() => createOwnerCashier({ ...input, ...patch }));
    assert.equal(calls.length, before); assert.equal(sent.length, 0);
  });
  await check("owner authorization rejection does not create or send", async () => {
    ownerDenied = true;
    await assert.rejects(() => createOwnerCashier(input));
    assert.equal(calls.length, 0); assert.equal(sent.length, 0);
    ownerDenied = false;
  });
  await check("chosen credentials normalize safely and result excludes password", async () => {
    const result = await createOwnerCashier(input);
    assert.deepEqual(calls[0], { name: "create_cafe_cashier_with_contact", args: {
      p_cafe_id: cafeId, p_full_name: "Test employee", p_email: "employee@example.test",
      p_password: password, p_phone: "+966501234567", p_employee_number: "E-17",
    } });
    assert.deepEqual(sent[0], { phone: "+966501234567", fullName: "Test employee", brandName: "Test brand", email: "employee@example.test", password });
    assert.equal(result.cashier.id, cashierId); assert.equal(result.whatsappStatus, "queued");
    assert(!JSON.stringify(result).includes(password));
    assert(!Object.hasOwn(result.cashier, "password")); assert(!Object.hasOwn(result.cashier, "temporaryPassword"));
  });
  await check("database failure never sends or leaks raw credentials", async () => {
    const before = sent.length;
    rpcError = { message: `SQL detail ${password}` };
    await assert.rejects(() => createOwnerCashier(input), (error) => !error.message.includes(password));
    assert.equal(sent.length, before); rpcError = null;
  });
  await check("invalid database creation response never sends", async () => {
    const before = sent.length; rpcId = null;
    await assert.rejects(() => createOwnerCashier(input));
    assert.equal(sent.length, before); rpcId = cashierId;
  });
  await check("provider failure preserves actual created account and truthful status", async () => {
    sendError = true;
    const result = await createOwnerCashier(input);
    assert.equal(result.cashier.id, cashierId); assert.equal(result.whatsappStatus, "failed");
    assert(!JSON.stringify(result).includes(password)); sendError = false;
  });
  await check("unconfigured provider preserves account without attempting send", async () => {
    configured = false; const before = sent.length;
    const result = await createOwnerCashier(input);
    assert.equal(result.cashier.id, cashierId); assert.equal(result.whatsappStatus, "unavailable");
    assert.equal(sent.length, before);
  });

  const cookieWrites = [], rpcCalls = [], filters = [];
  let role = "owner", features = ["cashier"], token = "test-session-token", authReads = 0;
  let ownerSession = { token, cafe_id: cafeId, expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() };
  let rpcFailure = null, user = { id: ownerId }, authError = null, profileError = null;
  let session = { id: "session", cafe_id: cafeId, cashier_id: cashierId, revoked_at: null };
  let cashier = { id: cashierId, full_name: "Owner name", email: "owner@example.test", active: true, owner_user_id: ownerId };
  let cafe = { id: cafeId, name: "Test brand", slug: "rast", owner_user_id: ownerId, status: "active", deleted_at: null };
  let profile = { status: "active" };
  const admin = { from(table) {
    const query = {
      select() { return query; },
      eq(column, value) { filters.push({ table, column, value }); return query; },
      gt(column, value) { filters.push({ table, column, value }); return query; },
      maybeSingle: async () => ({ data: { cafe_cashier_sessions: session, cafe_cashiers: cashier, cafes: cafe, profiles: profile }[table], error: table === "profiles" ? profileError : null }),
    };
    return query;
  } };
  const cashierData = load("lib/data/cashier.ts", {
    ...baseStubs,
    "next/headers": { cookies: async () => ({ get: () => token ? { value: token } : undefined, set: (...args) => cookieWrites.push(args) }) },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/supabase/server": { createClient: async () => ({
      rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: [ownerSession], error: rpcFailure }; },
      auth: { getUser: async () => { authReads++; return { data: { user }, error: authError }; } },
    }) },
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => ({ id: cafeId, role }) },
    "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => features },
  });
  for (const deniedRole of ["manager", "platform_admin", "employee"]) await check(`owner start denies ${deniedRole}`, async () => {
    role = deniedRole; await assert.rejects(cashierData.startOwnerCashierSession, /FORBIDDEN/);
    assert.equal(rpcCalls.length, 0); assert.equal(cookieWrites.length, 0);
  });
  role = "owner";
  await check("owner start denies missing cashier entitlement", async () => {
    features = []; await assert.rejects(cashierData.startOwnerCashierSession, /FORBIDDEN/);
    assert.equal(rpcCalls.length, 0); assert.equal(cookieWrites.length, 0); features = ["cashier"];
  });
  await check("owner start issues only secure scoped cookie with bounded lifetime", async () => {
    const previous = process.env.NODE_ENV; process.env.NODE_ENV = "production";
    try { assert.equal(await cashierData.startOwnerCashierSession(), undefined); }
    finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
    assert.deepEqual(rpcCalls[0], { name: "start_owner_cashier_session", args: { p_cafe_id: cafeId } });
    assert.deepEqual(cookieWrites[0], ["barndaksa_cashier_session", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 28800 }]);
  });
  const goodOwnerSession = { ...ownerSession };
  for (const [label, patch] of [["invalid date", { expires_at: "bad date" }], ["expired", { expires_at: "2000-01-01" }], ["tenant mismatch", { cafe_id: "other-cafe" }], ["missing token", { token: "" }]]) {
    await check(`owner start rejects ${label} without writing cookie`, async () => {
      ownerSession = { ...goodOwnerSession, ...patch }; const before = cookieWrites.length;
      await assert.rejects(cashierData.startOwnerCashierSession); assert.equal(cookieWrites.length, before);
    });
  }
  ownerSession = goodOwnerSession;
  await check("owner RPC failure does not write cookie", async () => {
    rpcFailure = { message: "Database failed" }; const before = cookieWrites.length;
    await assert.rejects(cashierData.startOwnerCashierSession); assert.equal(cookieWrites.length, before); rpcFailure = null;
  });
  await check("owner session resolves authenticated identity and filters tenant", async () => {
    const result = await cashierData.requireCashierSessionContext();
    assert.equal(result.cashierName, "Owner name"); assert.equal(result.cafeId, cafeId); assert.equal(result.cashierId, cashierId);
    assert.equal(authReads, 1);
    assert(filters.some((filter) => filter.table === "cafe_cashiers" && filter.column === "cafe_id" && filter.value === cafeId));
    assert(filters.some((filter) => filter.table === "profiles" && filter.column === "id" && filter.value === ownerId));
    assert(filters.some((filter) => filter.table === "cafe_cashier_sessions" && filter.column === "expires_at" && Number.isFinite(Date.parse(filter.value))));
  });
  for (const [label, change, restore] of [
    ["logged out owner", () => { user = null; }, () => { user = { id: ownerId }; }],
    ["other auth user", () => { user = { id: "other-owner" }; }, () => { user = { id: ownerId }; }],
    ["auth error", () => { authError = { code: "denied" }; }, () => { authError = null; }],
    ["transferred cafe", () => { cafe.owner_user_id = "other-owner"; }, () => { cafe.owner_user_id = ownerId; }],
    ["deleted cafe", () => { cafe.deleted_at = "2030-01-01"; }, () => { cafe.deleted_at = null; }],
    ["inactive cafe", () => { cafe.status = "suspended"; }, () => { cafe.status = "active"; }],
    ["inactive profile", () => { profile.status = "suspended"; }, () => { profile.status = "active"; }],
    ["missing profile", () => { profile = null; }, () => { profile = { status: "active" }; }],
    ["profile error", () => { profileError = { code: "denied" }; }, () => { profileError = null; }],
    ["revoked session", () => { session.revoked_at = "2030-01-01"; }, () => { session.revoked_at = null; }],
    ["inactive cashier", () => { cashier.active = false; }, () => { cashier.active = true; }],
  ]) await check(`session rejects ${label}`, async () => {
    change(); try { await assert.rejects(cashierData.requireCashierSessionContext); } finally { restore(); }
  });
  await check("employee session continues without owner login or profile reads", async () => {
    cashier.owner_user_id = null; user = null; const before = authReads;
    const result = await cashierData.requireCashierSessionContext();
    assert.equal(result.cashierId, cashierId); assert.equal(authReads, before);
  });

  const envNames = ["GREEN_API_API_URL", "GREEN_API_ID_INSTANCE", "GREEN_API_API_TOKEN_INSTANCE", "GREEN_API_REQUEST_TIMEOUT_MS"];
  const envBefore = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
  const originalTimeout = AbortSignal.timeout;
  const requests = [], timeoutDurations = [];
  let response = { ok: true, json: async () => ({ idMessage: "provider-test-id" }) };
  try {
    Object.assign(process.env, { GREEN_API_API_URL: "https://provider.invalid/", GREEN_API_ID_INSTANCE: "test-instance", GREEN_API_API_TOKEN_INSTANCE: "test-secret", GREEN_API_REQUEST_TIMEOUT_MS: "4321" });
    AbortSignal.timeout = (duration) => { timeoutDurations.push(duration); return new AbortController().signal; };
    globalThis.fetch = async (url, options) => { requests.push({ url, options }); return response; };
    const { sendGreenApiCashierWelcome } = load("lib/whatsapp/green-api.ts", baseStubs);
    const message = { phone: "+966501234567", fullName: "Test employee", brandName: "Test brand", email: "employee@example.test", password };
    await check("welcome uses normalized chat and exact credentials with private bounded request", async () => {
      const result = await sendGreenApiCashierWelcome(message);
      assert.deepEqual(result, { providerMessageId: "provider-test-id" });
      const { url, options } = requests[0];
      assert.equal(url, "https://provider.invalid/waInstancetest-instance/sendMessage/test-secret");
      assert.equal(options.method, "POST"); assert.equal(options.cache, "no-store"); assert(options.signal instanceof AbortSignal);
      assert.equal(timeoutDurations[0], 4321);
      const body = JSON.parse(options.body);
      assert.equal(body.chatId, "966501234567@c.us"); assert.equal(body.linkPreview, false);
      for (const value of ["https://barndaksa.com/cashier/login", message.email, password, message.fullName, message.brandName]) assert(body.message.includes(value));
      assert(!JSON.stringify(result).includes(password)); assert(!JSON.stringify(result).includes("test-secret"));
    });
    await check("welcome rejects invalid recipient before fetch", async () => {
      const before = requests.length;
      await assert.rejects(() => sendGreenApiCashierWelcome({ ...message, phone: "0501234567" }), /INVALID_CASHIER_RECIPIENT/);
      assert.equal(requests.length, before);
    });
    await check("welcome rejects provider non-success without leaking response", async () => {
      response = { ok: false, json: async () => ({ password }) };
      await assert.rejects(() => sendGreenApiCashierWelcome(message), /CASHIER_WELCOME_REJECTED/);
    });
    await check("welcome rejects absent provider acknowledgement", async () => {
      response = { ok: true, json: async () => ({}) };
      await assert.rejects(() => sendGreenApiCashierWelcome(message), /CASHIER_WELCOME_INVALID_RESPONSE/);
    });
    await check("welcome uses default timeout for invalid configuration", async () => {
      response = { ok: true, json: async () => ({ idMessage: "provider-test-id" }) };
      process.env.GREEN_API_REQUEST_TIMEOUT_MS = "invalid";
      await sendGreenApiCashierWelcome(message); assert.equal(timeoutDurations.at(-1), 10000);
    });
    await check("welcome missing configuration fails before fetch", async () => {
      delete process.env.GREEN_API_API_TOKEN_INSTANCE; const before = requests.length;
      await assert.rejects(() => sendGreenApiCashierWelcome(message), /GREEN_API_CONFIGURATION_MISSING/);
      assert.equal(requests.length, before);
    });
  } finally {
    AbortSignal.timeout = originalTimeout;
    for (const key of envNames) { if (envBefore[key] === undefined) delete process.env[key]; else process.env[key] = envBefore[key]; }
  }
  await check("logs never contain credentials or session token", async () => {
    const logs = JSON.stringify(capturedLogs);
    for (const secret of [password, "test-secret", token]) assert(!logs.includes(secret));
  });
} finally {
  globalThis.fetch = originalFetch;
  Object.assign(console, originalConsole);
}
console.log(`PASS: ${passed} cashier onboarding, owner session authorization, cookie security and isolated WhatsApp cases; no network or messages sent.`);
