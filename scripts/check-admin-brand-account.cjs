// Stubbed checks for picking packages on a new brand account, editing any account from the
// administration and reading the recorded subscription price. No database and no messages
const fs = require("node:fs");
const assert = require("node:assert/strict");
const ts = require("typescript");

function load(file, stubs = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "exports", "console", code)(name => {
    if (name === "server-only") return {};
    if (name in stubs) return stubs[name];
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`, stubs);
    return require(name);
  }, exports, { error() {} });
  return exports;
}

/** Records every query and answers it from the scenario */
function client(log, answer) {
  return {
    from(table) {
      const call = { table, op: "select", filters: [] };
      const builder = {
        select() { return builder; },
        update(payload) { call.op = "update"; call.payload = payload; return builder; },
        insert(payload) { call.op = "insert"; call.payload = payload; return builder; },
        eq(key, value) { call.filters.push(["eq", key, value]); return builder; },
        neq(key, value) { call.filters.push(["neq", key, value]); return builder; },
        in(key, value) { call.filters.push(["in", key, value]); return builder; },
        is() { return builder; }, order() { return builder; }, limit() { return builder; }, maybeSingle() { return builder; },
        then(resolve, reject) { log.push(call); return Promise.resolve(answer.query(call)).then(resolve, reject); },
      };
      return builder;
    },
    rpc: async (name, args) => { log.push({ rpc: name, args }); return answer.rpc(name, args); },
    auth: { admin: {
      getUserById: async () => answer.user(),
      updateUserById: async (id, body) => { log.push({ auth: id, body }); return answer.authUpdate(body); },
    } },
  };
}

const cafe = "4e5a661a-7029-40ec-a3bc-dc75959a05bb", owner = "9b0f7a52-1f0e-4a53-9c11-6f2f6c1a7d10";
let checks = 0;

function account(scenario = {}) {
  const log = [], created = [], replaced = [], staged = [];
  const answer = {
    rpc: name => name === "admin_brand_onboarding_status" ? { data: scenario.delivery ? [{ cafeId: cafe, state: scenario.delivery }] : [], error: null } : { data: null, error: null },
    user: () => ({ data: { user: scenario.user ?? { id: owner, phone: "966511111111", email: null, user_metadata: { full_name: "Owner" } } }, error: null }),
    authUpdate: () => ({ error: scenario.authError ?? null }),
    query(call) {
      if (call.table === "platform_plans") return { data: (scenario.activePlans ?? ["menu", "loyalty"]).map(id => ({ id })), error: null };
      if (call.table === "cafes" && call.op === "select" && call.filters.some(f => f[1] === "slug")) return { data: scenario.slugTaken ? [{ id: "other" }] : [], error: null };
      if (call.table === "cafes" && call.op === "select") return { data: scenario.brand === null ? null : { id: cafe, owner_user_id: owner, status: "active", name: "Brand", name_en: null, slug: "brand-one", business_category: "cafes_coffee", ...scenario.brand }, error: null };
      if (call.table === "cafes" && call.op === "update") return { data: [{ id: cafe }], error: null };
      if (call.table === "profiles" && call.op === "select") return { data: scenario.clash ? [{ id: "other" }] : [], error: null };
      if (call.table === "profiles" && call.op === "update") return { data: [{ id: owner }], error: null };
      if (call.table === "cafe_settings") return { data: scenario.settingsBlocked ? [] : [{ cafe_id: cafe }], error: null };
      if (call.table === "audit_logs") return { error: null };
      throw Error(`unexpected query ${call.table} ${call.op}`);
    },
  };
  const api = load("lib/data/admin-brand-account.ts", {
    "@/lib/data/cafes": { requirePlatformAdmin: async () => ({ id: "admin" }) },
    "@/lib/data/admin-brand-onboarding": {
      createAdminBrandAccount: async input => { created.push(input); return cafe; },
      updateAdminBrandOwner: async input => { staged.push(input); },
    },
    "@/lib/data/admin-brand-subscriptions": { replacePreparedBrandPlans: async (id, plans) => { replaced.push([id, plans]); if (scenario.plansFail) throw Error("conflict"); } },
    "@/lib/supabase/admin": { createAdminClient: () => client(log, answer) },
    "@/lib/supabase/server": { createClient: async () => client(log, answer) },
  });
  return { api, log, created, replaced, staged, authCalls: () => log.filter(item => item.auth), updates: table => log.filter(item => item.table === table && item.op === "update") };
}

const draft = { requestId: "0d4f4c0e-6a57-4d43-9d0a-1d6d0b9a6e11", brandName: "Brand", brandNameEn: "", slug: "", category: "cafes_coffee", ownerName: "", phone: "", email: "", password: "" };
const ownerInput = { requestId: draft.requestId, cafeId: cafe, ownerName: "Owner", phone: "0511111111", email: "", password: "" };
const profileInput = { cafeId: cafe, brandName: "Brand", brandNameEn: "", slug: "brand-one", category: "cafes_coffee" };

(async () => {
  // New account: the picked packages are required, verified before anything is created and applied afterwards
  for (const planIds of [[], ["Bad Id"]]) { const c = account(); await assert.rejects(() => c.api.createAdminBrandAccountWithPlans({ ...draft, planIds }), /اختر باقة واحدة/); assert.equal(c.created.length, 0); checks++; }
  { const c = account({ activePlans: ["menu"] }); await assert.rejects(() => c.api.createAdminBrandAccountWithPlans({ ...draft, planIds: ["menu", "retired"] }), /لم تعد متاحة/); assert.equal(c.created.length, 0); checks++; }
  { const c = account(); const result = await c.api.createAdminBrandAccountWithPlans({ ...draft, planIds: ["menu", "loyalty", "menu"] });
    assert.deepEqual(result, { cafeId: cafe, plansApplied: true }); assert.deepEqual(c.created, [draft]); assert(!("planIds" in c.created[0])); assert.deepEqual(c.replaced, [[cafe, ["menu", "loyalty"]]]); checks++; }
  { const c = account({ plansFail: true }); assert.deepEqual(await c.api.createAdminBrandAccountWithPlans({ ...draft, planIds: ["menu", "loyalty"] }), { cafeId: cafe, plansApplied: false }); assert.equal(c.created.length, 1); checks++; }

  // Owner data: an account waiting for its handoff keeps the staged flow and a send in flight blocks edits
  for (const delivery of ["ready", "editing"]) { const c = account({ delivery }); assert.deepEqual(await c.api.saveAdminBrandOwner(ownerInput), { contactOnly: false }); assert.deepEqual(c.staged, [ownerInput]); assert.equal(c.authCalls().length, 0); assert.equal(c.updates("profiles").length, 0); checks++; }
  for (const delivery of ["sending", "uncertain"]) { const c = account({ delivery }); await assert.rejects(() => c.api.saveAdminBrandOwner(ownerInput), /قيد التنفيذ/); assert.equal(c.staged.length + c.authCalls().length + c.updates("profiles").length, 0); checks++; }
  // Delivered or self-registered phone login: the phone and password change on the live login
  for (const delivery of ["sent", undefined]) { const c = account({ delivery });
    assert.deepEqual(await c.api.saveAdminBrandOwner({ ...ownerInput, phone: "0522222222", password: "new-secret-1", ownerName: "New Owner", email: "Owner@Example.com" }), { contactOnly: false });
    assert.equal(c.staged.length, 0); assert.deepEqual(c.authCalls(), [{ auth: owner, body: { phone: "+966522222222", phone_confirm: true, password: "new-secret-1", user_metadata: { full_name: "New Owner" } } }]);
    assert.deepEqual(c.updates("profiles")[0].payload, { full_name: "New Owner", phone: "966522222222", email: "owner@example.com" });
    assert.deepEqual(c.updates("cafe_settings")[0].payload, { owner_name: "New Owner", owner_phone: "966522222222", owner_email: "owner@example.com" });
    const audit = c.log.find(item => item.table === "audit_logs").payload; assert.equal(audit.action, "admin_brand_owner_updated"); assert(!JSON.stringify(audit).includes("new-secret-1")); checks++; }
  { const c = account({ delivery: "sent" }); await c.api.saveAdminBrandOwner(ownerInput); assert.equal(c.authCalls().length, 0); assert.equal(c.updates("profiles").length, 1); checks++; }
  { const c = account({ delivery: "sent" }); await assert.rejects(() => c.api.saveAdminBrandOwner({ ...ownerInput, phone: "" }), /لا يمكن إزالة جوال دخول/); assert.equal(c.authCalls().length, 0); checks++; }
  { const c = account({ delivery: "sent", clash: true }); await assert.rejects(() => c.api.saveAdminBrandOwner({ ...ownerInput, phone: "0522222222" }), /مرتبط بحساب موجود/); assert.equal(c.authCalls().length + c.updates("profiles").length, 0); checks++; }
  for (const [authError, expected] of [[{ code: "phone_exists" }, /مرتبط بحساب موجود/], [{ code: "weak_password" }, /متطلبات الأمان/], [{ code: "unexpected", message: "private provider payload" }, /خدمة الحساب/]]) {
    const c = account({ delivery: "sent", authError }); await assert.rejects(() => c.api.saveAdminBrandOwner({ ...ownerInput, phone: "0522222222", password: "new-secret-1" }), expected); assert.equal(c.updates("profiles").length + c.updates("cafe_settings").length, 0); checks++; }
  { const c = account({ delivery: "sent", settingsBlocked: true }); await assert.rejects(() => c.api.saveAdminBrandOwner(ownerInput), /تعذر تحديث بيانات التواصل/); checks++; }
  // An email login keeps its login address: phone and email are contact details only, the password still applies
  { const c = account({ user: { id: owner, phone: null, email: "legacy@example.com", user_metadata: { full_name: "Owner" } } });
    assert.deepEqual(await c.api.saveAdminBrandOwner({ ...ownerInput, phone: "0522222222", email: "contact@example.com", password: "new-secret-1" }), { contactOnly: true });
    assert.deepEqual(c.authCalls(), [{ auth: owner, body: { password: "new-secret-1" } }]); assert.deepEqual(c.updates("profiles")[0].payload, { full_name: "Owner" });
    assert.deepEqual(c.updates("cafe_settings")[0].payload, { owner_name: "Owner", owner_phone: "966522222222", owner_email: "contact@example.com" }); checks++; }
  { const c = account({ delivery: "sent", brand: { status: "archived" } }); await assert.rejects(() => c.api.saveAdminBrandOwner(ownerInput), /غير متاحة للتعديل/); assert.equal(c.authCalls().length, 0); checks++; }

  // Brand data: only changed fields are written and the short link is fixed after the handoff
  { const c = account({ delivery: "sent" }); await c.api.updateAdminBrandProfile(profileInput); assert.equal(c.updates("cafes").length, 0); checks++; }
  { const c = account({ delivery: "sent" }); await c.api.updateAdminBrandProfile({ ...profileInput, brandName: "Renamed", brandNameEn: "Renamed EN", category: "restaurants" });
    assert.deepEqual(c.updates("cafes")[0].payload, { name: "Renamed", name_en: "Renamed EN", business_category: "restaurants" }); checks++; }
  for (const delivery of ["sent", "sending", undefined]) { const c = account({ delivery }); await assert.rejects(() => c.api.updateAdminBrandProfile({ ...profileInput, slug: "new-link" }), /يثبت بعد تسليم الحساب/); assert.equal(c.updates("cafes").length, 0); checks++; }
  { const c = account({ delivery: "ready", slugTaken: true }); await assert.rejects(() => c.api.updateAdminBrandProfile({ ...profileInput, slug: "new-link" }), /مستخدم/); assert.equal(c.updates("cafes").length, 0); checks++; }
  { const c = account({ delivery: "ready" }); await assert.rejects(() => c.api.updateAdminBrandProfile({ ...profileInput, slug: "Bad_Link" }), /يتكون الرابط المختصر/); checks++; }
  { const c = account({ delivery: "ready" }); await c.api.updateAdminBrandProfile({ ...profileInput, slug: "New-Link" }); assert.deepEqual(c.updates("cafes")[0].payload, { slug: "new-link" }); checks++; }
  { const c = account({ delivery: "sent" }); await assert.rejects(() => c.api.updateAdminBrandProfile({ ...profileInput, category: "beauty_centers" }), /نوع نشاط متاح/); checks++; }
  // A brand on an activity that is no longer offered, with an old style link, can still be renamed
  { const c = account({ delivery: "sent", brand: { business_category: "events_conferences", slug: "Old_Link" } }); await c.api.updateAdminBrandProfile({ ...profileInput, brandName: "Renamed", category: "events_conferences", slug: "Old_Link" });
    assert.deepEqual(c.updates("cafes")[0].payload, { name: "Renamed" }); checks++; }
  { const c = account({ brand: null }); await assert.rejects(() => c.api.updateAdminBrandProfile(profileInput), /غير متاحة للتعديل/); checks++; }

  // Starting packages are replaced only while the account waits for its handoff
  function plans(state) {
    const calls = [];
    const api = load("lib/data/admin-brand-subscriptions.ts", {
      "@/lib/data/cafes": { requirePlatformAdmin: async () => ({ id: "admin" }) },
      "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name, args) => {
        calls.push({ name, args });
        const next = name === "admin_brand_subscription_state" ? state : name === "admin_add_brand_plans" ? { ...state, revision: "b".repeat(32), currentPlanIds: [...state.currentPlanIds, ...args.p_plan_ids] } : { ...state, revision: "c".repeat(32) };
        return { data: next, error: null };
      } }) },
    });
    return { api, calls };
  }
  const state = { revision: "a".repeat(32), currentPlanIds: ["trial"], sharedExpiresAt: null, trialAwaitingDelivery: true, subscriptions: [] };
  { const c = plans(state); await c.api.replacePreparedBrandPlans(cafe, ["trial"]); assert.deepEqual(c.calls.map(x => x.name), ["admin_brand_subscription_state"]); checks++; }
  { const c = plans(state); await c.api.replacePreparedBrandPlans(cafe, ["menu", "loyalty"]);
    assert.deepEqual(c.calls.map(x => x.name), ["admin_brand_subscription_state", "admin_add_brand_plans", "admin_remove_brand_plans"]);
    assert.deepEqual(c.calls[1].args, { p_cafe_id: cafe, p_plan_ids: ["menu", "loyalty"], p_expected_revision: "a".repeat(32) });
    assert.deepEqual(c.calls[2].args, { p_cafe_id: cafe, p_plan_ids: ["trial"], p_expected_revision: "b".repeat(32) }); checks++; }
  { const c = plans(state); await c.api.replacePreparedBrandPlans(cafe, ["trial", "menu"]); assert.deepEqual(c.calls.map(x => x.name), ["admin_brand_subscription_state", "admin_add_brand_plans"]); checks++; }
  { const c = plans({ ...state, trialAwaitingDelivery: false }); await assert.rejects(() => c.api.replacePreparedBrandPlans(cafe, ["menu"]), /بدأت مدة باقات/); assert.equal(c.calls.length, 1); checks++; }

  // Recorded subscription price: current packages are totalled, ended ones are listed apart
  const now = Date.now(), iso = offset => new Date(now + offset * 86_400_000).toISOString();
  const plan = { active: true, name: "Menu", price_sar: 92 };
  const rows = [
    { id: "1", plan_id: "menu", status: "active", activation_source: "admin_manual_change", amount_sar: 78, base_amount_sar: 199, discount_amount_sar: 121, payment_method_label: "تغيير يدوي من الأدمن", paid_at: null, started_at: iso(-5), expires_at: iso(25), plan_name_snapshot: "المنيو", duration_unit: "month", duration_count: 1, platform_plans: plan },
    { id: "2", plan_id: "loyalty", status: "trialing", activation_source: "admin_prepared_trial", amount_sar: 0, base_amount_sar: 0, discount_amount_sar: 0, payment_method_label: null, paid_at: null, started_at: iso(-1), expires_at: null, plan_name_snapshot: null, duration_unit: "day", duration_count: 7, platform_plans: [{ active: true, name: "Loyalty", price_sar: 0 }] },
    { id: "3", plan_id: "menu", status: "active", activation_source: "legacy", amount_sar: 480, base_amount_sar: null, discount_amount_sar: 0, payment_method_label: null, paid_at: iso(-70), started_at: iso(-70), expires_at: iso(-40), plan_name_snapshot: "المنيو", duration_unit: "month", duration_count: 3, platform_plans: plan },
    { id: "4", plan_id: "menu", status: "cancelled", activation_source: "legacy", amount_sar: 10, base_amount_sar: 10, discount_amount_sar: 0, payment_method_label: null, paid_at: null, started_at: iso(-90), expires_at: null, plan_name_snapshot: "المنيو", duration_unit: "month", duration_count: 1, platform_plans: plan },
  ];
  const billing = await load("lib/data/admin-brand-billing.ts", {
    "@/lib/data/cafes": { requirePlatformAdmin: async () => ({ id: "admin" }) },
    "@/lib/supabase/server": { createClient: async () => client([], { query: () => ({ data: rows, error: null }) }) },
  }).getAdminBrandBilling(cafe);
  assert.deepEqual(billing.rows.map(row => [row.state, row.current]), [["نشطة", true], ["جاهزة ولم تبدأ التجربة", true], ["منتهية", false], ["ملغاة", false]]);
  assert.equal(billing.currentTotal, 78); assert.equal(billing.currentCount, 2);
  assert.deepEqual([billing.rows[0].baseAmount, billing.rows[0].discount, billing.rows[0].listPrice, billing.rows[0].duration], [199, 121, 92, "شهر"]);
  assert.deepEqual([billing.rows[1].planName, billing.rows[1].duration, billing.rows[2].duration, billing.rows[2].baseAmount], ["Loyalty", "7 أيام", "3 أشهر", null]);
  checks++;

  console.log(`Admin brand account: ${checks} groups passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
