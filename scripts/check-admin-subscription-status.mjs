import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "exports", code)(name => load(name.replace("@/", "") + ".ts"), exports);
  return exports;
}
const { adminSubscriptionSummary: summarize } = load("lib/platform/admin-subscription-status.ts");
const now = Date.parse("2026-10-09T12:00:00Z");
const active = { plan_id: "current", status: "active", started_at: "2026-10-01T00:00:00Z", expires_at: "2026-11-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z", platform_plans: { active: true } };
let checks = 0;
for (const [patch, label, enabled] of [
  [{}, "فعال", true], [{ status: "trialing" }, "فعال", true],
  [{ expires_at: "2026-10-09T11:59:59Z" }, "منتهي", false],
  [{ expires_at: "2026-10-09T12:00:00Z" }, "منتهي", false],
  [{ expires_at: null }, "فعال", true], [{ status: "cancelled" }, "ملغي", false],
  [{ status: "expired", expires_at: null }, "منتهي", false],
  [{ status: "past_due" }, "بانتظار التفعيل", false],
  [{ started_at: "2026-10-10T00:00:00Z" }, "لم يبدأ بعد", false],
  [{ platform_plans: { active: false } }, "غير فعال", false],
  [{ platform_plans: null }, "غير فعال", false],
  [{ expires_at: "invalid" }, "غير فعال", false],
]) {
  const result = summarize([{ ...active, ...patch }], now);
  assert.equal(result.subscriptionStatus, label);
  assert.equal(result.hasActivePlan, enabled);
  checks++;
}
assert.equal(summarize([], now).subscriptionStatus, "بدون اشتراك"); checks++;
const expiredNewest = { ...active, plan_id: "latest-expired", expires_at: "2026-10-08T00:00:00Z", created_at: "2026-10-05T00:00:00Z" };
for (const rows of [[active, expiredNewest], [expiredNewest, active]]) {
  assert.equal(summarize(rows, now).planId, "latest-expired");
  assert.equal(summarize(rows, now).subscriptionStatus, "منتهي"); checks++;
}
assert.equal(summarize([active, { ...active, status: "past_due", plan_id: "pending", created_at: "2026-10-09T00:00:00Z" }], now).planId, "current"); checks++;
assert.equal(summarize([{ ...active, expires_at: "2026-10-09T22:30:00Z" }], now).planExpiresAt, "2026-10-10"); checks++;
console.log(`PASS admin subscription status: ${checks} actual expiry, trial, inactive plan, missing subscription, order, pending renewal and Saudi-date checks.`);
