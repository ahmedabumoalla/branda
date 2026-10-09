import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = process.cwd();
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith("@/") ? load(`${name.slice(2)}.ts`, mocks) : require(name), exports);
  return exports;
}
const { isCurrentSubscription } = load("lib/platform/active-subscription.ts");
const now = Date.now();
const current = { plan_id: "paid", status: "active", started_at: new Date(now - 60_000).toISOString(), expires_at: new Date(now + 60_000).toISOString(), platform_plans: { active: true, features: ["menu"] } };
let checks = 0;
for (const [patch, expected] of [[{}, true], [{ status: "trialing" }, true], [{ status: "cancelled" }, false], [{ status: "pending" }, false], [{ expires_at: new Date(now).toISOString() }, false], [{ expires_at: null }, true], [{ started_at: new Date(now + 1).toISOString() }, false], [{ expires_at: "invalid" }, false], [{ platform_plans: { active: false } }, false], [{ platform_plans: null }, false]]) {
  assert.equal(isCurrentSubscription({ ...current, ...patch }, now), expected); checks++;
}
assert.equal(isCurrentSubscription(null, now), false); checks++;
function serviceFixture(subscription, overrides = [], error = null) {
  const calls = [];
  const client = { from(table) {
    calls.push(table);
    const query = { select() { return query; }, eq(key, value) { if (key === "cafe_id") assert.equal(value, "brand"); return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
      maybeSingle: async () => ({ data: subscription, error }), then: resolve => resolve({ data: overrides, error: null }) };
    return query;
  } };
  const accessModule = load("lib/data/feature-entitlements.ts", {
    react: { cache: fn => fn }, "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => ({ id: "brand" }) },
  });
  return { module: accessModule, calls };
}
for (const subscription of [null, { ...current, status: "expired" }, { ...current, expires_at: new Date(now - 1).toISOString() }, { ...current, platform_plans: { active: false, features: ["all"] } }]) {
  const { module } = serviceFixture(subscription, [{ feature_id: "loyalty", enabled: true }]);
  assert.deepEqual(await module.getCafeServiceAccess("brand"), { planId: "", features: [] }); checks++;
}
for (const features of [[], ["menu"], ["menu", "offers"], ["loyalty"], ["settings"], ["all"], ["orders", "branches", "standalone_menu"]]) {
  const { module, calls } = serviceFixture({ ...current, platform_plans: { active: true, features } });
  const expected = features.includes("all") ? ["menu", "offers", "loyalty", "settings"] : features.filter(f => ["menu", "offers", "loyalty", "settings"].includes(f));
  assert.deepEqual(await module.getOwnerFeatureCodes(), expected);
  assert.deepEqual(calls, ["subscriptions", "brand_feature_overrides"]); checks++;
}
const overridden = serviceFixture(current, [{ feature_id: "menu", enabled: false }, { feature_id: "loyalty", enabled: true }]);
assert.deepEqual(await overridden.module.getCafeFeatureCodes("brand"), []); checks++;
await assert.rejects(serviceFixture(null, [], new Error("database failure")).module.getCafeFeatureCodes("brand")); checks++;
const { featureCodesAllow } = load("lib/platform/feature-gates.ts");
assert.equal(featureCodesAllow([], "settings"), false);
assert.equal(featureCodesAllow([], "menu"), false);
assert.equal(featureCodesAllow(["loyalty"], "cashier"), true);
assert.equal(featureCodesAllow(["menu"], "cashier"), false);
checks += 4;
console.log(`PASS package access: ${checks} actual subscription, expiry, package, override and error checks.`);
