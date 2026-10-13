import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { z } from "zod";

const cafeId = "f0000000-0000-4000-8000-000000000101";
const code = ts.transpileModule(fs.readFileSync(new URL("../lib/data/brand-deletion.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture({ authorized = true, assets = [], removeError = false, removeThrows = false, finished = true, purgeError = null } = {}) {
  const calls = []; const exports = {};
  const db = { async rpc(name, args) {
    calls.push([name, args]);
    if (name === "admin_delete_brand") return { data: { cafeId, slug: "fixture" }, error: purgeError };
    if (name === "admin_brand_deletion_assets") return { data: assets, error: null };
    if (name === "admin_finish_brand_deletion") return { data: finished, error: null };
    throw Error("Unexpected RPC");
  } };
  const imports = {
    "server-only": {}, "zod": { z },
    "@/lib/data/cafes": { requirePlatformAdmin: async () => { if (!authorized) throw Error("forbidden"); } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/admin": { createAdminClient: () => ({ storage: { from: bucket => ({ remove: async paths => {
      calls.push(["remove", bucket, paths]);
      if (removeThrows) throw Error("network");
      return { error: removeError ? Error("storage failure") : null };
    } }) } }) },
  };
  vm.runInNewContext(code, { exports, require: name => { assert(name in imports); return imports[name]; } });
  return { api: exports, calls };
}
test("all deletion entry points reject non-admin before database or Storage access", async () => {
  const { api, calls } = fixture({ authorized: false });
  await assert.rejects(api.permanentlyDeleteBrand({ cafeId, confirmation: "fixture" }), /forbidden/);
  await assert.rejects(api.finishBrandDeletion(cafeId), /forbidden/);
  await assert.rejects(api.getPendingBrandDeletions(), /forbidden/);
  assert.equal(calls.length, 0);
});
test("bad confirmation from database never starts Storage cleanup", async () => {
  const { api, calls } = fixture({ purgeError: { message: "CONFIRMATION_MISMATCH" } });
  await assert.rejects(api.permanentlyDeleteBrand({ cafeId, confirmation: "wrong" }));
  assert.equal(calls.length, 1);
});
test("actual manifest paths are grouped by bucket and batched without loss", async () => {
  const assets = Array.from({ length: 205 }, (_, n) => ({ bucket: "menu-products", path: `${cafeId}/${n}.png` }));
  assets.push({ bucket: "cafe-logos", path: `${cafeId}/logo.png` });
  const { api, calls } = fixture({ assets });
  assert.equal(await api.finishBrandDeletion(cafeId), true);
  const removals = calls.filter(c => c[0] === "remove");
  assert.deepEqual(removals.map(c => c[2].length), [100, 100, 5, 1]);
  assert.deepEqual(removals.flatMap(c => c[2]), assets.map(a => a.path));
  assert.equal(calls.at(-1)[0], "admin_finish_brand_deletion");
});
for (const failure of [{ removeError: true }, { removeThrows: true }, { finished: false }]) {
  test(`durable cleanup stays pending on ${JSON.stringify(failure)}`, async () => {
    const { api, calls } = fixture({ ...failure, assets: [{ bucket: "cafe-logos", path: `${cafeId}/logo.png` }] });
    const result = await api.permanentlyDeleteBrand({ cafeId, confirmation: "fixture" });
    assert.equal(result.cleanupPending, true);
    if (failure.removeError || failure.removeThrows) assert(!calls.some(c => c[0] === "admin_finish_brand_deletion"));
  });
}
test("retry completes using current remaining assets without repeating relational purge", async () => {
  const { api, calls } = fixture();
  assert.equal(await api.finishBrandDeletion(cafeId), true);
  assert.deepEqual(calls.map(c => c[0]), ["admin_brand_deletion_assets", "admin_finish_brand_deletion"]);
});
test("malformed asset manifest cannot reach privileged Storage", async () => {
  const { api, calls } = fixture({ assets: [{ bucket: "logos" }] });
  await assert.rejects(api.finishBrandDeletion(cafeId));
  assert(!calls.some(c => c[0] === "remove"));
});
