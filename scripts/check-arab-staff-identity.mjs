import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
function load(file, mocks = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const result = {};
  cache.set(file, result);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name);
      return load(target + (fs.existsSync(target + ".ts") ? ".ts" : ".tsx"), mocks, cache);
    }
    return dependency(name);
  }, result);
  return result;
}

const { ARAB_COUNTRIES } = load("lib/auth/brand-phone.ts");
const { normalizeEmployeeContactPhones, normalizeFinanceContactPhones } = load("lib/finance/contact-phones.ts");
let country = "SA", role = "owner", enabled = true, checks = 0;
const cafe = { id: "94b9326e-9fd1-4b15-aa70-008ac4387f4b", slug: "fixture-brand", name: "Fixture brand" };
const userId = "10000000-0000-4000-8000-000000000001";
const created = [], grants = [], logins = [], notices = [];
const snapshot = () => ({ cafe, role, canAdminister: true, ownerUserId: userId, userId });
const client = {
  auth: { signInWithPassword: async value => { logins.push(value); return { data: { user: { id: userId } }, error: null }; } },
  rpc: async (name, args) => { grants.push({ name, args }); return { data: { id: userId, changed: true }, error: null }; },
};
const mocks = {
  "@/lib/data/cafes": { requireOwnerCafeContext: async () => ({ ...cafe, role }) },
  "@/lib/data/brand-phone-country": { getBrandPhoneCountry: async () => country, getBrandPhoneCountryBySlug: async () => country },
  "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => enabled ? ["finance"] : [] },
  "@/lib/data/brand-finance": { getBrandFinanceSnapshot: async () => snapshot() },
  "@/lib/data/finance-cashier-maintenance": { getFinanceCashierMaintenance: async () => null },
  "@/lib/supabase/server": { createClient: async () => client },
  "@/lib/supabase/admin": { createAdminClient: () => ({ auth: { admin: {
    createUser: async value => { created.push(value); return { data: { user: { id: userId } }, error: null }; },
    deleteUser: async () => { throw Error("Unexpected cleanup"); },
  } } }) },
  "@/lib/whatsapp/green-api": { sendGreenApiSalesCashierWelcome: async value => notices.push(value) },
  "@/lib/barndaksa/env": {},
  "next/headers": {},
};
const finance = load("lib/data/finance-access.ts", mocks);
const { normalizeStaffPhone } = load("lib/staff/brand-staff-server.ts", { ...mocks, "@/lib/whatsapp/brand-connection-types": {} });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error("Network forbidden in isolated staff checks"); };
try {
  for (const item of ARAB_COUNTRIES) {
    country = item.code;
    const canonical = `${item.callingCode}${item.example}`;
    const employee = { mobile: item.placeholder };
    normalizeEmployeeContactPhones(employee, country);
    assert.equal(employee.mobile, canonical);
    const foreignEmployee = { mobile: "+" + canonical };
    normalizeEmployeeContactPhones(foreignEmployee, "SA");
    assert.equal(foreignEmployee.mobile, canonical);
    assert.equal(normalizeStaffPhone(item.placeholder, country), "+" + canonical);
    assert.equal(normalizeStaffPhone("+" + canonical, "SA"), "+" + canonical);
    if (country !== "SA") {
      const contact = { mobile: item.placeholder };
      normalizeFinanceContactPhones(contact, country);
      assert.equal(contact.mobile, canonical);
      assert.throws(() => normalizeFinanceContactPhones({ mobile: "+966512345678" }, country));
    }
    const input = { name: "Fixture employee", phone: item.placeholder, password: "Test-pass1" };
    assert((await finance.provisionSalesCashier(input)).ok);
    assert.equal(created.at(-1).phone, "+" + canonical);
    assert.equal(notices.at(-1).phone, canonical);
    assert.equal(grants.at(-1).name, "brand_finance_cashier_with_permissions");
    country = "SA";
    assert((await finance.provisionSalesCashier({ ...input, phone: "+" + canonical })).ok);
    assert.equal(created.at(-1).phone, "+" + canonical);
    assert((await finance.provisionFinancePhoneStaff({ ...input, phone: "+" + canonical, role: "accountant" })).ok);
    assert.equal(created.at(-1).phone, "+" + canonical);
    assert.equal(grants.at(-1).name, "brand_finance_add_phone_staff");
    assert((await finance.signInFinance(cafe.slug, "+" + canonical, "fixture-password")).ok);
    assert.equal(logins.at(-1).phone, "+" + canonical);
    checks++;
  }
  const legacySaudi = { phone: "0112345678", mobile: "0501234567" };
  normalizeFinanceContactPhones(legacySaudi, "SA");
  assert.deepEqual(legacySaudi, { phone: "0112345678", mobile: "0501234567" });
  const palestinianOffice = { phone: "+97022345678" };
  normalizeFinanceContactPhones(palestinianOffice, "PS");
  assert.deepEqual(palestinianOffice, { phone: "+97022345678" });
  assert.throws(() => normalizeFinanceContactPhones({ phone: "+966112345678" }, "PS"));
  assert.throws(() => normalizeEmployeeContactPhones({ mobile: "+447700900123" }, "SA"));
  const before = created.length;
  role = "cashier";
  await assert.rejects(() => finance.provisionSalesCashier({ name: "Fixture", phone: "+201012345678", password: "Test-pass1" }));
  role = "owner"; enabled = false;
  await assert.rejects(() => finance.provisionSalesCashier({ name: "Fixture", phone: "+201012345678", password: "Test-pass1" }));
  assert.equal(created.length, before);
  checks += 4;
  console.log(`PASS Arab staff identity: ${checks} actual finance/Loco/HR country and authorization groups; no live calls`);
} finally { globalThis.fetch = originalFetch; }
