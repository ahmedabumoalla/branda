import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const requireDependency = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  cache.set(file, exports);
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith(".")) return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name)}.ts`, stubs, cache);
    return requireDependency(name);
  }, exports);
  return exports;
}

const { validWalletCoordinates, selectBranchWalletLocations, normalizeWalletLocations, MAX_WALLET_LOCATIONS } = load("lib/wallet/branch-locations.ts");
assert.deepEqual(validWalletCoordinates(0, "0"), { latitude: 0, longitude: 0 });
for (const values of [[null, null], ["", " "], [91, 0], [0, -181], [NaN, 1], [Infinity, 1], ["1x", 1], [true, false]]) {
  assert.equal(validWalletCoordinates(...values), null);
}
const branches = Array.from({ length: 12 }, (_, index) => ({ id: String(index).padStart(2, "0"), name: `Branch ${index}`, active: true, sortOrder: index, lat: 20 + index, lng: 40 + index }));
branches[11].primary = true;
const selection = selectBranchWalletLocations([...branches].reverse());
assert.equal(MAX_WALLET_LOCATIONS, 10);
assert.equal(selection.locations.length, 10);
assert.equal(selection.totalLocations, 12);
assert.deepEqual(selection.coveredBranchIds, ["11", "00", "01", "02", "03", "04", "05", "06", "07", "08"]);
assert.deepEqual(selection.excludedBranchIds, ["09", "10"]);
assert.deepEqual(selection, selectBranchWalletLocations(branches), "Selection must not depend on row order");
const duplicate = selectBranchWalletLocations([...branches, { ...branches[0], id: "duplicate" }]);
assert(duplicate.coveredBranchIds.includes("duplicate"));
assert.equal(duplicate.totalLocations, 12);
assert.equal(normalizeWalletLocations([...selection.locations, ...selection.locations]).length, 10);
assert.equal(normalizeWalletLocations(branches.map(branch => ({ latitude: branch.lat, longitude: branch.lng }))).length, 10);
assert.deepEqual(normalizeWalletLocations([{ latitude: Infinity, longitude: 0 }, { latitude: 0, longitude: 0 }]), [{ latitude: 0, longitude: 0, branchName: "", nearbyMessage: "" }]);
for (const closed of [{ active: false }, { deletedAt: "2026-11-17" }]) {
  const selected = selectBranchWalletLocations([{ ...branches[0], ...closed }]);
  assert.equal(selected.configured, true);
  assert.deepEqual(selected.locations, []);
}
assert.equal(selectBranchWalletLocations([{ ...branches[0], lat: null, lng: null }]).configured, false);
assert.equal(selectBranchWalletLocations([{ ...branches[0], lat: null, lng: null, walletLocationManaged: true }]).configured, true);

let rows = [], error = null, features = ["branches"], calls = [];
const query = {
  maybeSingle() { return Promise.resolve({ data: { slug: "brand-1c2b6f7e028f" }, error }); },
  select(value) { calls.push(["select", value]); return this; },
  eq(key, value) { calls.push(["eq", key, value]); return this; },
  order(key) { calls.push(["order", key]); return this; },
  then(resolve) { return Promise.resolve({ data: rows, error }).then(resolve); },
};
const { loadWalletBranchLocations } = load("lib/data/wallet-branch-locations.ts", {
  react: { cache: fn => fn },
  "@/lib/supabase/admin": { createAdminClient: () => ({ from: table => { calls.push(["from", table]); return query; } }) },
  "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async () => features },
});
const row = { id: "branch", cafe_id: "brand-a", name: "North", lat: 24, lng: 46, active: true, deleted_at: null, is_primary: false, sort_order: 0, welcome_message: "Welcome" };
rows = [row, { ...row, id: "foreign", cafe_id: "brand-b", lat: 21 }];
assert.deepEqual(await loadWalletBranchLocations("brand-a"), [{ latitude: 24, longitude: 46, branchName: "North", nearbyMessage: "Welcome" }]);
assert(calls.some(call => call[0] === "eq" && call[1] === "cafe_id" && call[2] === "brand-a"));
rows = [{ ...row, active: false }];
assert.deepEqual(await loadWalletBranchLocations("brand-a"), []);
rows = [{ ...row, lat: null, lng: null }];
assert.equal(await loadWalletBranchLocations("brand-a"), undefined);
rows = [{ ...row, lat: null, lng: null, wallet_location_managed: true }];
assert.deepEqual(await loadWalletBranchLocations("brand-a"), [], "Clearing a managed branch location must not restore the legacy location");
error = { message: "Unavailable" };
await assert.rejects(loadWalletBranchLocations("brand-a"));
error = null;
features = ["menu"];
rows = [row];
assert.equal((await loadWalletBranchLocations("brand-a")).length, 1, "Every brand with menu branch management must include its locations");
features = [];
calls = [];
assert.equal(await loadWalletBranchLocations("brand-a"), undefined);
assert.deepEqual(calls, [], "Brands without branch entitlement must not query branches");
features = ["loyalty"];
rows = [row];
assert.equal((await loadWalletBranchLocations("brand-a")).length, 1, "Fawasel loyalty-only includes all active branch locations");
console.log("Wallet branch location selection, tenant scope, eligibility, fallback and provider limit checks passed");
