import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = process.cwd();
function load(relative, stubs = {}, cache = new Map()) {
  relative = relative.replaceAll("\\", "/");
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/") || name.startsWith(".")) return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name)}.ts`, stubs, cache);
    return dependency(name);
  }, exports);
  return exports;
}
const id = "00000000-0000-4000-8000-000000000001";
const timestamp = "2026-10-04T12:00:00+00:00";
const fixture = () => ({
  customers: [{ id, cardId: id, name: "Test customer", phone: "966500000001", email: "customer@example.test", brand: { id, name: "Brand", slug: "brand" },
    sharedBrands: [{ id, name: "Brand", slug: "brand" }], identityMatch: "phone", status: "active", cardSuffix: "1234", joinedAt: timestamp,
    cardIssuedAt: timestamp, lastActivityAt: null, stamps: 2, stampsInCycle: 2, stampTarget: 7, stampTransactions: 2, scans: 0,
    rewardsEarned: 0, rewardsRedeemed: 0, rewardsExpired: 0, rewardsAvailable: 0, isFrequent: false,
    firstDownloadAt: null, lastDownloadAt: null, downloadCount: 0, firstInstalledAt: null, installedDeviceCount: 0, walletProviders: ["apple"] }],
  brands: [{ id, name: "Brand", slug: "brand", customers: 1, stamps: 2, rewardsRedeemed: 0 }],
  summary: { memberships: 1, uniqueCustomers: 1, sharedCustomers: 0, frequentCustomers: 0, stamps: 2, scans: 0, rewardsEarned: 0, rewardsRedeemed: 0, rewardsExpired: 0 },
  total: 1, page: 1, pageSize: 25, recordingStartedAt: timestamp, walletRecordingStartedAt: timestamp, frequentThreshold: 10,
});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const rejects = async (operation) => { await assert.rejects(operation); checks++; };
const validation = load("lib/admin/brand-customer-validation.ts");
assert.deepEqual(validation.parseBrandCustomerFilters({}), { search: "", brandId: "", segment: "all", sort: "recent", page: 1 }); checks++;
for (const invalid of [{ search: "x".repeat(101) }, { brandId: "not-a-uuid" }, { segment: "staff" }, { page: 0 }, { page: 1.1 }, { sort: "name" }]) {
  assert.throws(() => validation.parseBrandCustomerFilters(invalid)); checks++;
}
const sensitive = fixture();
sensitive.customers[0].cardCode = "secret-bearer-code";
sensitive.customers[0].sessionToken = "secret-session";
sensitive.internalTrace = "secret-trace";
const safe = validation.brandCustomersPageSchema.parse(sensitive);
check(!JSON.stringify(safe).includes("secret-"), "DTO strips unknown private fields");
check(validation.parseBrandCustomerFilters({ search: "  customer  " }).search === "customer", "trim search at boundary");
const malformed = fixture(); malformed.customers[0].cardSuffix = "full-card-code";
assert.throws(() => validation.brandCustomersPageSchema.parse(malformed)); checks++;

let role = "platform_admin"; let status = "active"; let user = { id }; let authError = null; let profileError = null;
let rpcError = null; let rpcCalls = []; let payload = fixture();
const client = {
  auth: { getUser: async () => ({ data: { user }, error: authError }) },
  from(table) {
    assert.equal(table, "profiles");
    return { select(columns) { assert.equal(columns, "role,status"); return { eq(column, value) { assert.equal(column, "id"); assert.equal(value, id); return {
      maybeSingle: async () => ({ data: { role, status }, error: profileError }),
    }; } }; } };
  },
  rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: payload, error: rpcError }; },
};
const data = load("lib/data/brand-customers.ts", { "server-only": {}, "@/lib/supabase/server": { createClient: async () => client } });
for (const deniedRole of ["owner", "manager", "staff", "customer"]) {
  role = deniedRole;
  await rejects(() => data.getAdminBrandCustomers({}));
  await rejects(() => data.getAdminBrandCustomerDetail(id));
}
role = "platform_admin";
for (const deniedStatus of ["suspended", "blocked", null]) {
  status = deniedStatus; await rejects(() => data.getAdminBrandCustomers({}));
}
status = "active"; user = null; await rejects(() => data.getAdminBrandCustomers({})); user = { id };
authError = new Error("auth-down"); await rejects(() => data.getAdminBrandCustomers({})); authError = null;
profileError = new Error("profile-down"); await rejects(() => data.getAdminBrandCustomers({})); profileError = null;
check(rpcCalls.length === 0, "all unauthorized requests denied before customer SQL");
const result = await data.getAdminBrandCustomers({ brandId: id, search: "  customer  ", segment: "shared", sort: "stamps", page: 2 });
check(result.customers.length === 1, "active admin data load");
assert.deepEqual(rpcCalls[0], { name: "get_admin_brand_customers", args: { p_search: "customer", p_brand_id: id, p_segment: "shared", p_sort: "stamps", p_page: 2, p_page_size: 25 } }); checks++;
payload = { customer: fixture().customers[0], memberships: fixture().customers, events: [], total: 0, page: 1, pageSize: 25 };
await data.getAdminBrandCustomerDetail(id, 2);
check(rpcCalls[1].args.p_customer_id === id && rpcCalls[1].args.p_page === 2, "detail uses validated profile identifier");
await rejects(() => data.getAdminBrandCustomerDetail("invalid"));
await rejects(() => data.getAdminBrandCustomers({ page: -1 }));
check(rpcCalls.length === 2, "invalid identifiers and filters never reach SQL");
rpcError = new Error("private SQL detail");
await assert.rejects(() => data.getAdminBrandCustomers({}), (error) => error.message === "Brand customers unavailable"); checks++;
rpcError = null; payload = { customers: "malformed" }; await rejects(() => data.getAdminBrandCustomers({}));
let actionFailure = false;
const actions = load("app/actions/brand-customers.ts", { "@/lib/data/brand-customers": {
  getAdminBrandCustomers: async () => { if (actionFailure) throw new Error("private database detail"); return fixture(); },
  getAdminBrandCustomerDetail: async () => { throw new Error("private customer detail"); },
} });
check((await actions.loadBrandCustomersAction({})).ok, "action returns successful typed result");
actionFailure = true;
check(!(await actions.loadBrandCustomersAction({})).ok, "action returns recoverable failure");
check(!JSON.stringify(await actions.loadBrandCustomerDetailAction(id)).includes("private"), "action never leaks backend errors");
console.log(`PASS brand customers server authorization and DTOs: ${checks} checks`);
