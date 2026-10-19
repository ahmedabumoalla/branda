import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
function load(file, { stubs = {}, env = {}, fetcher = () => { throw new Error("Unexpected network call"); } } = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function("require", "exports", "process", "fetch", output)((name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/")) return load(path.resolve(`${name.slice(2)}.ts`), { stubs, env, fetcher }, cache);
    return dependency(name);
  }, exports, { env }, fetcher);
  return exports;
}
let checks = 0;
async function test(run) { await run(); checks++; }
const partnerFile = path.resolve("lib/whatsapp/green-api-partner.ts");
const env = { GREEN_API_PARTNER_TOKEN: "gac.mock-secret", GREEN_API_PARTNER_API_URL: "https://api.greenapi.com" };
const summary = { idInstance: 1234567890, name: "Example", tariff: "PARTNER", isPartner: true, deleted: false, isExpired: false };

await test(async () => {
  const partner = load(partnerFile);
  assert.equal(partner.isGreenApiPartnerConfigured(), false);
  await assert.rejects(partner.getGreenApiPartnerInstances, /CONFIGURATION_MISSING/);
  assert.deepEqual(Object.keys(partner).sort(), ["getGreenApiPartnerInstances", "isGreenApiPartnerConfigured"]);
});
await test(async () => {
  for (const host of ["api.greenapi.com", "api.green-api.com"]) {
    const calls = [];
    const partner = load(partnerFile, { env: { ...env, GREEN_API_PARTNER_API_URL: `https://${host}/` }, fetcher: async (url, init) => {
      calls.push({ url, init });
      return Response.json([{ ...summary, apiTokenInstance: "private-instance-secret", partnerUserUiid: "private-user-id" }]);
    } });
    assert.equal(partner.isGreenApiPartnerConfigured(), true);
    assert.equal(calls.length, 0, "configuration check never calls provider");
    assert.deepEqual(await partner.getGreenApiPartnerInstances(), [summary]);
    assert.equal(calls[0].url, `https://${host}/partner/getInstances/gac.mock-secret`);
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.redirect, "error");
    assert.equal(calls[0].init.cache, "no-store");
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  }
});
await test(async () => {
  for (const url of ["http://api.greenapi.com", "https://api.greenapi.com.attacker.test", "https://127.0.0.1", "https://api.greenapi.com:8443", "https://user:password@api.greenapi.com", "https://api.greenapi.com/path", "https://api.greenapi.com/?secret=1", "https://api.greenapi.com/#fragment", "invalid"]) {
    const partner = load(partnerFile, { env: { ...env, GREEN_API_PARTNER_API_URL: url } });
    assert.equal(partner.isGreenApiPartnerConfigured(), false);
    await assert.rejects(partner.getGreenApiPartnerInstances, /URL_INVALID/);
  }
});
await test(async () => {
  for (const payload of [{ code: 401, description: env.GREEN_API_PARTNER_TOKEN }, null, [{ ...summary, idInstance: "123" }], [{ ...summary, deleted: "false" }]]) {
    const partner = load(partnerFile, { env, fetcher: async () => Response.json(payload) });
    await assert.rejects(partner.getGreenApiPartnerInstances, { message: "GREEN_API_PARTNER_RESPONSE_INVALID" });
  }
  const invalidJson = load(partnerFile, { env, fetcher: async () => new Response("private malformed response") });
  await assert.rejects(invalidJson.getGreenApiPartnerInstances, /RESPONSE_INVALID/);
});
await test(async () => {
  for (const status of [401, 429, 503]) {
    const partner = load(partnerFile, { env, fetcher: async () => new Response(env.GREEN_API_PARTNER_TOKEN, { status }) });
    await assert.rejects(partner.getGreenApiPartnerInstances, { message: `GREEN_API_PARTNER_REQUEST_REJECTED_${status}` });
  }
  const partner = load(partnerFile, { env, fetcher: async (url) => { throw new Error(url); } });
  await assert.rejects(partner.getGreenApiPartnerInstances, (error) => {
    assert.equal(error.message, "GREEN_API_PARTNER_REQUEST_FAILED");
    assert.equal(error.cause, undefined);
    assert.ok(!error.stack.includes(env.GREEN_API_PARTNER_TOKEN));
    return true;
  });
});
await test(async () => {
  const access = load(path.resolve("lib/platform/feature-access.ts"));
  const gate = load(path.resolve("lib/platform/feature-gates.ts"));
  assert.ok(access.getAdminPackageFeatures().some(feature => feature.id === "marketing_campaigns"));
  assert.ok(!access.getBrandNavigationFeatures().some(feature => feature.id === "marketing_campaigns"));
  assert.deepEqual(access.normalizeAdminPlanFeatures(["menu", "marketing_campaigns", "unknown"]), ["menu", "marketing_campaigns"]);
  assert.ok(!access.normalizeAdminPlanFeatures(["all"]).includes("marketing_campaigns"));
  for (const features of [["marketing_campaigns"], ["all"], ["all", "marketing_campaigns"]]) {
    assert.ok(!access.getEffectiveBrandFeatureCodes(features, [{ featureId: "marketing_campaigns", enabled: true }]).includes("marketing_campaigns"));
    assert.equal(gate.featureCodesAllow(features, "marketing_campaigns"), false);
    assert.ok(!access.getSidebarFeaturesForBrand({ planId: "plan", plans: [{ id: "plan", features }] }).some(row => row.feature.id === "marketing_campaigns"));
  }
  assert.equal(gate.featureCodesAllow(["pager"], "cashier"), true);
  assert.equal(gate.featureCodesAllow([], "subscription"), true);
});
await test(async () => {
  const calls = [];
  let adminAllowed = true;
  let rpcFailure = false;
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { error: rpcFailure ? {} : null }; }, from(table) { return {
    update: () => ({ eq: async () => ({ error: null }) }),
    upsert: async (row) => { calls.push({ table, row }); return { error: null }; },
  }; } };
  const admin = load(path.resolve("lib/data/admin.ts"), { stubs: {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/lib/data/cafes": { requirePlatformAdmin: async () => { if (!adminAllowed) throw new Error("FORBIDDEN"); return {}; } },
    "@/lib/data/feature-entitlements": {},
  } });
  const plan = { id: "plan", name: "Plan", priceMonthly: 100, offerEnabled: false, durationUnit: "month", durationCount: 1, description: "", active: true, isDefault: true, trialDays: 7, features: ["menu", "marketing_campaigns", "unknown"] };
  await admin.savePlatformPlans([plan]);
  assert.deepEqual(calls.find(call => call.name === "admin_save_platform_plan").args.p_features, ["menu", "marketing_campaigns"]);
  calls.length = 0;
  rpcFailure = true;
  await admin.savePlatformPlans([plan]);
  assert.deepEqual(calls.find(call => call.table === "platform_plans").row.features, ["menu", "marketing_campaigns"]);
  calls.length = 0;
  adminAllowed = false;
  await assert.rejects(() => admin.savePlatformPlans([plan]), /FORBIDDEN/);
  assert.equal(calls.length, 0, "unauthorized caller cannot save plan preparation");
});
await test(async () => {
  const calls = [];
  const operational = load(path.resolve("lib/whatsapp/green-api.ts"), { env: { ...env,
    GREEN_API_API_URL: "https://operational.invalid", GREEN_API_ID_INSTANCE: "111", GREEN_API_API_TOKEN_INSTANCE: "operational-only",
  }, fetcher: async (url, init) => { calls.push({ url, init }); return Response.json({ idMessage: "mock-message" }); } });
  await operational.sendGreenApiSupabaseOtp({ phoneNormalized: "966500000001", code: "123456" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://operational.invalid/waInstance111/sendMessage/operational-only");
  assert.ok(!calls[0].url.includes(env.GREEN_API_PARTNER_TOKEN));
});
console.log(`PASS GREEN-API preparation: ${checks} groups, provider requests mocked, no customer activation or paid operations`);
