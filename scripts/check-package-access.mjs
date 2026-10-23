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
      then: resolve => resolve(table === "subscriptions" ? { data: subscription == null ? [] : Array.isArray(subscription) ? subscription : [subscription], error } : { data: overrides, error: null }) };
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
  const result = await module.getCafeServiceAccess("brand");
  assert.equal(result.planId, "");
  assert.deepEqual(result.features, []);
  assert.equal(result.subscription?.expiresAt ?? null, subscription?.expires_at ?? null); checks++;
}
for (const features of [[], ["menu"], ["menu", "offers"], ["loyalty"], ["pager"], ["settings"], ["all"], ["orders", "branches", "standalone_menu"]]) {
  const { module, calls } = serviceFixture({ ...current, platform_plans: { active: true, features } });
  const expected = features.includes("all") ? ["menu", "offers", "loyalty", "marketing_campaigns", "pager", "settings"] : features.filter(f => ["menu", "offers", "loyalty", "pager", "settings"].includes(f));
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

const loyalty = { ...current, plan_id: "loyalty", expires_at: new Date(now + 120_000).toISOString(), platform_plans: { active: true, features: ["loyalty"] } };
const campaigns = { ...current, plan_id: "campaigns", platform_plans: { active: true, features: ["marketing_campaigns"] } };
const multiple = serviceFixture([campaigns, loyalty, current]);
const combined = await multiple.module.getCafeServiceAccess("brand");
assert.deepEqual(new Set(combined.features), new Set(["menu", "loyalty", "marketing_campaigns"]));
assert.equal(combined.subscriptions.length, 3);
const expiredNewest = await serviceFixture([{ ...campaigns, expires_at: new Date(now - 1).toISOString() }, loyalty, current]).module.getCafeServiceAccess("brand");
assert.deepEqual(new Set(expiredNewest.features), new Set(["menu", "loyalty"]));
assert.equal(expiredNewest.planId, "loyalty");
const futureNewest = await serviceFixture([{ ...campaigns, started_at: new Date(now + 60_000).toISOString() }, loyalty, current]).module.getCafeServiceAccess("brand");
assert.deepEqual(new Set(futureNewest.features), new Set(["menu", "loyalty"]));
const disabled = await serviceFixture([campaigns, loyalty, current], [{ feature_id: "loyalty", enabled: false }]).module.getCafeServiceAccess("brand");
assert.deepEqual(new Set(disabled.features), new Set(["menu", "marketing_campaigns"]));
const trialAndPaid = await serviceFixture([{ ...current, status: "trialing" }, loyalty]).module.getCafeServiceAccess("brand");
assert.equal(trialAndPaid.planId, "loyalty");
assert.equal(trialAndPaid.subscription.status, "active");
assert.deepEqual(new Set(trialAndPaid.features), new Set(["menu", "loyalty"]));
const { getServiceSubscriptionAccess } = load("lib/platform/service-subscriptions.ts");
const beforeExpiry = getServiceSubscriptionAccess(combined.serviceSubscriptions, now);
assert.equal(beforeExpiry.nextChangeAt, current.expires_at);
const afterExpiry = getServiceSubscriptionAccess(combined.serviceSubscriptions, now + 60_000);
assert.equal(afterExpiry.planId, "loyalty");
assert.deepEqual(afterExpiry.features, ["loyalty"]);
assert.equal(afterExpiry.nextChangeAt, loyalty.expires_at);
assert.equal(getServiceSubscriptionAccess(combined.serviceSubscriptions, now + 120_000).planId, "");
const scheduledRenewal = await serviceFixture([
  { ...current, started_at: current.expires_at, expires_at: loyalty.expires_at }, loyalty, current,
]).module.getCafeServiceAccess("brand");
assert.deepEqual(new Set(scheduledRenewal.features), new Set(["menu", "loyalty"]));
assert.deepEqual(new Set(getServiceSubscriptionAccess(scheduledRenewal.serviceSubscriptions, now + 60_000).features), new Set(["menu", "loyalty"]), "queued renewal starts exactly when its previous term expires");
console.log("PASS concurrent packages: union, expired/future newest row, overrides, trial precedence and independent expiry");

const access = load("lib/platform/feature-access.ts");
assert.ok(!access.getEffectiveBrandFeatureCodes(["all"]).includes("finance"), "legacy wildcard packages do not grant finance");
assert.ok(!access.normalizeAdminPlanFeatures(["all"]).includes("finance"), "saving a legacy wildcard plan does not add paid finance");
assert.ok(access.normalizeAdminPlanFeatures(["all", "finance"]).includes("finance"), "finance is explicitly assignable");
assert.ok(!access.getPlanIncludedFeatures("legacy", [{ id: "legacy", features: ["all"] }]).includes("finance"));
assert.ok(access.getPlanIncludedFeatures("finance", [{ id: "finance", features: ["finance"] }]).includes("finance"));
assert.deepEqual(access.getEffectiveBrandFeatureCodes(["finance"], [{ featureId: "finance", enabled: false }]), []);
assert.ok(!access.getEffectiveBrandFeatureCodes(["all"], [{ featureId: "finance", enabled: true }]).includes("finance"), "override cannot bypass purchase");
assert.equal(featureCodesAllow(["finance"], "finance_pos"), true);
assert.equal(featureCodesAllow(["finance"], "cashier"), false, "financial cashier does not grant loyalty cashier");
assert.equal(featureCodesAllow(["loyalty", "pager"], "finance_pos"), false, "loyalty and pager do not grant financial cashier");
const finance = { ...current, plan_id: "finance", platform_plans: { active: true, features: ["finance", "settings"] } };
assert.deepEqual(new Set((await serviceFixture([finance, loyalty]).module.getCafeServiceAccess("brand")).features), new Set(["finance", "settings", "loyalty"]));
assert.deepEqual((await serviceFixture({ ...finance, expires_at: new Date(now - 1).toISOString() }).module.getCafeServiceAccess("brand")).features, []);
assert.deepEqual((await serviceFixture(finance, [{ feature_id: "finance", enabled: false }]).module.getCafeServiceAccess("brand")).features, ["settings"]);
console.log("PASS finance package isolation: explicit purchase, administrator configuration, independent expiry, disabling and separate POS access");
