import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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
  const result=summarize(rows,now);
  assert.equal(result.planId, "current");
  assert.equal(result.subscriptionStatus, "فعال");
  assert.deepEqual(result.planIds,["current","latest-expired"]);
  assert.deepEqual(result.activePlanIds,["current"]);
  assert.equal(result.subscriptionExpiryMixed,true);
  assert.equal(result.planExpiresAtExact,null);
  checks++;
}
assert.equal(summarize([active, { ...active, status: "past_due", plan_id: "pending", created_at: "2026-10-09T00:00:00Z" }], now).planId, "current"); checks++;
assert.equal(summarize([{ ...active, expires_at: "2026-10-09T22:30:00Z" }], now).planExpiresAt, "2026-10-10"); checks++;
const missingExpiry=JSON.parse(JSON.stringify(summarize([{...active,expires_at:null}],now)));
assert.equal({...{planExpiresAt:'2026-10-31'},...missingExpiry}.planExpiresAt,null,'serialized response clears previous plan expiry');checks++;
const menu={...active,id:'menu-sub',plan_id:'menu',plan_name_snapshot:'المنيو',updated_at:'2026-10-01T01:00:00Z'};
const loyalty={...active,id:'loyalty-sub',plan_id:'loyalty',plan_name_snapshot:'الولاء',created_at:'2026-10-02T00:00:00Z',updated_at:'2026-10-02T01:00:00Z'};
const trial={...active,id:'trial-sub',plan_id:'trial',status:'trialing',plan_name_snapshot:'تجربة',created_at:'2026-10-08T00:00:00Z'};
const state=summarize([trial,menu,loyalty],now);
assert.equal(state.planId,'loyalty','A paid primary precedes a newer trial');
assert.equal(state.subscriptionId,'loyalty-sub');assert.equal(state.subscriptionUpdatedAt,loyalty.updated_at);
assert.deepEqual(state.planIds,['loyalty','trial','menu']);assert.deepEqual(state.planNames,['الولاء','تجربة','المنيو']);assert.equal(state.planName,'الولاء + تجربة + المنيو');
assert.deepEqual(state.activePlanIds,['loyalty','trial','menu']);
assert.equal(state.subscriptionExpiryMixed,false);assert.equal(state.planExpiresAtExact,active.expires_at);assert.equal(state.subscriptionExpiryEditable,true);assert.equal(state.hasActivePlan,true);
assert(!Object.hasOwn(state,'subscriptionRevision'),'Revision belongs exclusively to the atomic database snapshot');checks++;
const raw=[trial,menu,loyalty];const before=JSON.stringify(raw);summarize(raw,now);assert.equal(JSON.stringify(raw),before,'Summary must not mutate history');checks++;
const mixed=summarize([menu,{...loyalty,expires_at:null}],now);assert.equal(mixed.subscriptionExpiryMixed,true);assert.equal(mixed.planExpiresAtExact,null);assert.equal(mixed.planExpiresAt,null);assert.equal(mixed.planRemainingDays,null);assert.equal(mixed.hasActivePlan,true);checks++;
const unlimited=summarize([{...menu,expires_at:null},{...loyalty,expires_at:null}],now);assert.equal(unlimited.subscriptionExpiryMixed,false);assert.equal(unlimited.planExpiresAtExact,null);assert.equal(unlimited.planRemainingDays,null);checks++;
const sameInstant=summarize([menu,{...loyalty,expires_at:'2026-11-01T03:00:00+03:00'}],now);assert.equal(sameInstant.subscriptionExpiryMixed,false,'Equivalent offsets share a deadline');checks++;
assert.equal(summarize([{...menu,expires_at:'2026-11-01T00:00:00.000001Z'},{...loyalty,expires_at:'2026-11-01T00:00:00.000002Z'}],now).subscriptionExpiryMixed,true,'Distinct database microseconds cannot look shared');checks++;
const archived=[{...active,id:'archived-expired',plan_id:'archived-expired',status:'expired',created_at:'2026-10-08T00:00:00Z'},{...active,id:'archived-cancelled',plan_id:'archived-cancelled',status:'cancelled',created_at:'2026-10-09T00:00:00Z'}];
assert.deepEqual(summarize([...archived,menu],now).planIds,['menu']);
const historyOnly=summarize(archived,now);assert.deepEqual(historyOnly.planIds,[]);assert.deepEqual(historyOnly.planNames,[]);assert.equal(historyOnly.subscriptionExpiryEditable,false);assert.equal(historyOnly.hasActivePlan,false);assert.equal(historyOnly.subscriptionStatus,'ملغي');checks++;
assert.deepEqual(historyOnly.activePlanIds,[]);
const expiredStanding=summarize([{...menu,expires_at:'2026-10-08T00:00:00Z'},{...loyalty,expires_at:'2026-10-08T00:00:00Z'},...archived],now);
assert.deepEqual(expiredStanding.planIds,['loyalty','menu']);assert.equal(expiredStanding.subscriptionExpiryEditable,true);assert.equal(expiredStanding.hasActivePlan,false);assert.equal(expiredStanding.subscriptionStatus,'منتهي');assert.equal(expiredStanding.planRemainingDays,0);checks++;
const future={...loyalty,started_at:'2026-10-10T00:00:00Z'};
assert.deepEqual(summarize([menu,future],now).planIds,['menu','loyalty'],'Scheduled standing assignments remain visible for a shared deadline');
assert.deepEqual(summarize([menu,future],now).activePlanIds,['menu'],'Scheduled plans must not appear as enabled services');
assert.equal(summarize([menu,future],now).subscriptionExpiryEditable,true);assert.equal(summarize([future],now).subscriptionExpiryEditable,false);assert.equal(summarize([future],now).hasActivePlan,false);checks++;
const prepared={...trial,activation_source:'admin_prepared_trial',started_at:null,expires_at:null};
const preparedOnly=summarize([prepared],now);assert.equal(preparedOnly.trialAwaitingDelivery,true);assert.equal(preparedOnly.subscriptionExpiryEditable,false);assert.equal(preparedOnly.subscriptionExpiryMixed,false);assert.equal(preparedOnly.planExpiresAtExact,null);checks++;
const withPrepared=summarize([menu,prepared],now);assert.equal(withPrepared.planId,'menu');assert.equal(withPrepared.subscriptionExpiryEditable,true);assert.equal(withPrepared.trialAwaitingDelivery,false);assert.equal(withPrepared.subscriptionExpiryMixed,true);assert.equal(withPrepared.planStartedAt,'2026-10-01');checks++;
const disabled=summarize([menu,{...loyalty,platform_plans:{active:false}}],now);assert.deepEqual(disabled.planIds,['menu']);assert.equal(disabled.planName,'المنيو');checks++;
const repeated=summarize([menu,{...menu,id:'duplicate',created_at:'2026-10-02T00:00:00Z'}],now);assert.deepEqual(repeated.planIds,['menu']);assert.deepEqual(repeated.planNames,['المنيو']);checks++;
const modernName=summarize([{...menu,plan_name_snapshot:null,platform_plans:{active:true,name:'اسم الباقة الحالي'}}],now);assert.deepEqual(modernName.planNames,['اسم الباقة الحالي']);checks++;
const {getServiceSubscriptionAccess}=load('lib/platform/service-subscriptions.ts');
const serviceRows=[{planId:'menu',planName:'المنيو',status:'active',startedAt:menu.started_at,expiresAt:'2026-10-09T12:01:00Z',features:['menu']},{planId:'loyalty',planName:'الولاء',status:'active',startedAt:menu.started_at,expiresAt:'2026-10-09T12:02:00Z',features:['loyalty']}];
assert.deepEqual(new Set(getServiceSubscriptionAccess(serviceRows,now).features),new Set(['menu','loyalty']));
assert.deepEqual(getServiceSubscriptionAccess(serviceRows,now+60000).features,['loyalty']);
assert.deepEqual(getServiceSubscriptionAccess(serviceRows,now+120000).features,[]);checks++;
const shared=serviceRows.map(row=>({...row,expiresAt:'2026-10-09T12:01:00Z'}));assert.deepEqual(getServiceSubscriptionAccess(shared,now+60000).features,[]);checks++;
console.log(`PASS admin subscription status: ${checks} standing-cohort, actual expiry, shared/mixed deadlines, historical exclusion, prepared trial, primary precedence and service-union checks.`);
