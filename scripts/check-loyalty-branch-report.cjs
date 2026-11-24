const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, stubs = {}) {
  const exported = {};
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", source)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts", stubs);
    if (name.startsWith(".")) return load(path.join(path.dirname(file), name) + ".ts", stubs);
    return require(name);
  }, exported);
  return exported;
}
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const filters = { from: "", to: "", branchId: "", search: "", page: 1 };
const timestamp = "2026-11-01T12:00:00Z";
const summary = { issuedCards: 1001, downloadedCards: 0, appleInstalledCards: 0, googleSaveLinks: 0,
  stamps: 0, redemptions: 0, customers: 1001, staff: 1, lastActivityAt: timestamp, lastActivityKind: "issue" };
const customer = n => ({ id: uuid(n), cardId: uuid(n + 10000), name: "Customer", phone: null,
  branchId: uuid(90000), branchName: "Branch", issuedAt: timestamp, source: "cashier", cashierId: uuid(80000), cashierName: "Employee",
  downloadedAt: null, appleInstalledAt: null, googleSaveLinkAt: null, stamps: 0, redemptions: 0,
  lastActivityAt: timestamp, lastActivityKind: "issue" });
function fixture() {
  const state = { role: "owner", features: ["loyalty"], calls: [], drift: false, duplicate: false, failure: false };
  const stubs = {
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => ({ id: uuid(99999), name: "Brand", role: state.role }) },
    "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => state.features },
    "@/lib/supabase/admin": { createAdminClient: () => assert.fail("Report must use authenticated context") },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name, args) => {
      state.calls.push({ name, args });
      const start = (args.p_page - 1) * args.p_page_size;
      const total = state.drift && args.p_page > 1 ? 1000 : 1001;
      return { error: state.failure ? { message: "private SQL detail" } : null, data: {
        summary, branches: [{ ...summary, id: uuid(90000), name: "Branch", active: true, address: "", city: "", phone: "", workingHours: "", createdAt: timestamp }],
        customers: Array.from({ length: Math.max(0, Math.min(args.p_page_size, total - start)) }, (_, i) => ({ ...customer(state.duplicate ? i + 1 : start + i + 1), bearerCode: "PRIVATE" })),
        staff: [], total, page: args.p_page, pageSize: args.p_page_size, asOf: timestamp,
      } };
    } }) },
  };
  return { state, ...load("lib/data/loyalty-branch-report.ts", stubs), ...load("app/actions/loyalty-branch-report.ts", stubs) };
}
async function main() {
  const { parseBranchReportFilters } = load("lib/loyalty/branch-report-validation.ts");
  assert.equal(parseBranchReportFilters(filters).from, null);
  const parsed = parseBranchReportFilters({ ...filters, from: "2026-11-24", to: "2026-11-24", branchId: "unassigned" });
  assert.equal(parsed.from, "2026-11-23T21:00:00.000Z");
  assert.equal(parsed.to, "2026-11-24T21:00:00.000Z");
  for (const change of [{ from: "2026-02-30", to: "2026-03-01" }, { from: "2026-11-25", to: "2026-11-24" },
    { from: "2026-11-24" }, { branchId: "foreign-sql" }, { cafeId: uuid(1) }, { page: 0 }, { search: "x".repeat(81) }]) {
    assert.throws(() => parseBranchReportFilters({ ...filters, ...change }));
  }
  for (const role of ["owner", "manager", "platform_admin"]) {
    const ctx = fixture(); ctx.state.role = role;
    const result = await ctx.getOwnerLoyaltyBranchReport({ ...filters, branchId: "unassigned" });
    assert.equal(result.customers.length, 25);
    assert(!JSON.stringify(result).includes("PRIVATE"));
    assert.equal(ctx.state.calls[0].args.p_cafe_id, uuid(99999));
    assert.equal(ctx.state.calls[0].args.p_branch_id, null);
    assert.equal(ctx.state.calls[0].args.p_unassigned, true);
  }
  for (const mutation of [s => { s.role = "staff"; }, s => { s.features = []; }]) {
    const ctx = fixture(); mutation(ctx.state);
    await assert.rejects(() => ctx.getOwnerLoyaltyBranchReport(filters));
    assert.equal(ctx.state.calls.length, 0);
  }
  const ctx = fixture();
  const report = await ctx.getOwnerLoyaltyBranchExport({ ...filters, branchId: uuid(90000), page: 4 });
  assert.equal(report.customers.length, 1001);
  assert.equal(new Set(report.customers.map(c => c.cardId)).size, 1001);
  assert.deepEqual(ctx.state.calls.map(c => c.args.p_page), [1, 2, 3]);
  assert(ctx.state.calls.every(c => c.args.p_to === ctx.state.calls[0].args.p_to && c.args.p_branch_id === uuid(90000)));
  for (const field of ["drift", "duplicate"]) {
    const changed = fixture(); changed.state[field] = true;
    await assert.rejects(() => changed.getOwnerLoyaltyBranchExport(filters));
  }
  const failed = fixture(); failed.state.failure = true;
  const failure = await failed.loadLoyaltyBranchReportAction(filters);
  assert.equal(failure.ok, false); assert(!JSON.stringify(failure).includes("private SQL"));
  console.log("PASS branch report validation, tenant/role authorization, DTO privacy, all-time/date filters, 1001-card export pagination, drift detection and safe errors");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
