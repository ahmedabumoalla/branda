"use strict";
const fs = require("node:fs"), ts = require("typescript"), assert = require("node:assert/strict"), crypto = require("node:crypto");
const loaded = new Set();
function load(file, mocks = {}) {
  loaded.add(file); const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "exports", code)(name => name === "server-only" ? {} : name in mocks ? mocks[name] : name.startsWith("@/") ? {} : require(name), exports);
  return exports;
}
const cafeId = "00000000-0000-4000-8000-000000000001", ownerId = "00000000-0000-4000-8000-000000000002";
const aliases = load("lib/auth/owner-login-alias.ts"), phoneUtils = load("lib/auth/phone-utils.ts"), profile = load("lib/commerce/hospital-profile.ts");
let cafe, owner, account, queries, authLookups, logins, snapshots, rejectPassword;
function reset() {
  cafe = { id: cafeId, owner_user_id: ownerId };
  owner = { id: ownerId, phone: "966500000000", email: "owner@example.test", role: "cafe_owner", status: "active" };
  account = { id: ownerId, email: aliases.ownerLoginAliasEmail("مايند"), email_confirmed_at: "2026-11-14T00:00:00Z", app_metadata: { admin_hospital_split: cafeId } };
  queries = []; authLookups = []; logins = []; snapshots = []; rejectPassword = false;
}
const client = { auth: { async signInWithPassword(credentials) { logins.push(credentials); return rejectPassword ? { data: { user: null }, error: { code: "invalid_credentials" } } : { data: { user: { id: ownerId } }, error: null }; } } };
const admin = {
  from(table) {
    const query = { table, filters: [] }; queries.push(query);
    const builder = { select(value) { query.columns = value; return this; }, eq(key, value) { query.filters.push([key, value]); return this; }, is(key, value) { query.filters.push([key, value]); return this; }, in(key, value) { query.filters.push([key, value]); return this; }, async maybeSingle() { return { data: table === "cafes" ? cafe : owner, error: null }; } };
    return builder;
  },
  auth: { admin: { async getUserById(id) { authLookups.push(id); return { data: { user: account }, error: null }; } } },
};
const finance = load("lib/data/finance-access.ts", {
  "@/lib/auth/owner-login-alias": aliases, "@/lib/commerce/hospital-profile": profile,
  "@/lib/finance/permissions": { financeStaffRoles: ["cashier", "manager", "accountant"] },
  "@/lib/supabase/server": { createClient: async () => client },
  "@/lib/supabase/admin": { createAdminClient: () => admin },
  "@/lib/data/brand-finance": { getBrandFinanceSnapshot: async slug => { snapshots.push(slug); return { role: "owner" }; } },
  "@/lib/auth/phone-utils": phoneUtils,
  "@/lib/finance/sales-cashier-password": { isSalesCashierPassword: () => true, SALES_CASHIER_PASSWORD_HINT: "password" },
});
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
(async () => {
  reset(); const byPhone = await finance.signInFinance("mind-hospital", "0500000000", "test-only-password");
  check(byPhone.ok && byPhone.redirectTo === "/finance/mind-hospital/pos", "Hospital owner lands in cashier");
  check(logins[0].email === account.email && !logins[0].phone, "Shared contact phone targets separate hospital Auth identity");
  check(authLookups[0] === ownerId && snapshots[0] === "mind-hospital", "Identity lookup and post-password authorization remain target-scoped");
  check(queries[0].filters.some(([key, value]) => key === "slug" && value === "mind-hospital") && queries[1].filters.some(([key, value]) => key === "id" && value === ownerId), "Contact lookup derives owner from target tenant");
  reset(); await finance.signInFinance("mind-hospital", "+966 50 000 0000", "test-only-password");
  check(logins[0].email === account.email, "Normalized international phone matches owner contact");
  reset(); await finance.signInFinance("mind-hospital", " OWNER@EXAMPLE.TEST ", "test-only-password");
  check(logins[0].email === account.email, "Owner contact email routes to hospital Auth identity");
  reset(); await finance.signInFinance("mind-hospital", "مايند", "test-only-password");
  check(logins[0].email === aliases.ownerLoginAliasEmail("مايند") && queries.length === 0, "Username alias keeps normal Auth flow without contact lookup");
  reset(); await finance.signInFinance("mind-hospital", "0511111111", "test-only-password");
  check(logins[0].phone === "+966511111111" && !logins[0].email && authLookups.length === 0, "Other staff phones are not remapped to owner");
  reset(); await finance.signInFinance("mind-hospital", "staff@example.test", "test-only-password");
  check(logins[0].email === "staff@example.test" && authLookups.length === 0, "Other staff email remains unchanged");
  reset(); await finance.signInFinance("mind-hospital", "966500000000@example.test", "test-only-password");
  check(logins[0].email === "966500000000@example.test" && authLookups.length === 0, "Email digits cannot be misclassified as the owner's phone");
  reset(); await finance.signInFinance("other-brand", "0500000000", "test-only-password");
  check(logins[0].phone === "+966500000000" && queries.length === 0 && authLookups.length === 0, "All other brands bypass hospital contact mapping");
  for (const alter of [() => { account.app_metadata.admin_hospital_split = "different-tenant"; }, () => { account.id = "different-user"; }, () => { account.email = "unrelated@example.test"; }, () => { account.email_confirmed_at = null; }, () => { owner.status = "suspended"; }, () => { owner.role = "customer"; }]) {
    reset(); alter(); await assert.rejects(() => finance.signInFinance("mind-hospital", "0500000000", "test-only-password"), /Finance sign in unavailable/);
    check(logins.length === 0 && snapshots.length === 0, "Invalid account binding cannot authenticate a different identity");
  }
  reset(); rejectPassword = true; const failed = await finance.signInFinance("mind-hospital", "0500000000", "wrong-password");
  check(!failed.ok && snapshots.length === 0 && !JSON.stringify(failed).includes("accounts.barndaksa.invalid"), "Wrong password has generic response and no authorization bypass");
  // UI must honor the server-authorized destination rather than entering the broad staff shell.
  const React = require("react"), navigation = [];
  const component = load("components/finance/hospital-login.tsx", {
    react: { ...React, useRef: value => ({ current: value }), useState: value => [value, () => {}] },
    "next/navigation": { useRouter: () => ({ replace: value => navigation.push(value), refresh() {} }) },
    "@/app/actions/finance-access": { loginFinanceAction: async () => ({ ok: true, redirectTo: "/finance/mind-hospital/pos" }) },
    "./finance-login.module.css": { default: new Proxy({}, { get: (_, key) => key }) },
  });
  function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : []; }
  const oldFormData = global.FormData;
  global.FormData = class { get(name) { return name === "identity" ? "مايند" : "test-only-password"; } };
  try { const tree = component.HospitalLogin({ slug: "mind-hospital" }); await nodes(tree).find(n => n.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: {} }); }
  finally { global.FormData = oldFormData; }
  check(navigation[0] === "/finance/mind-hospital/pos", "Login UI follows cashier destination");
  const route = fs.readFileSync("app/finance/[slug]/system/login/page.tsx", "utf8"); loaded.add("app/finance/[slug]/system/login/page.tsx");
  check(!/<HospitalLogin[^>]*destination/.test(route) && /<FinanceLogin[^>]*destination="system"/.test(route), "Hospital system entry no longer overrides destination, other brands preserved");
  for (const file of ["scripts/check-hospital-login.cjs", "package.json", "package-lock.json"]) loaded.add(file);
  const result = { at: new Date().toISOString(), command: "node scripts/check-hospital-login.cjs", runtime: process.version, checks, passed: true, inputs: Object.fromEntries([...loaded].map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")])), limits: ["Mocked Auth/read-only lookups, no live sign-in or account mutation"] };
  fs.mkdirSync("output/mind-hospital-20261114", { recursive: true }); fs.writeFileSync("output/mind-hospital-20261114/login-check.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checks, passed: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
