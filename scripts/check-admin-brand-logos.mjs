import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/data/admin-brand-logos.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function("require", "exports", output)(name => { assert.equal(name, "server-only"); return {}; }, exports);
const { getAdminBrandLogos } = exports;
const calls = [];
const client = {
  from(table) {
    assert.equal(table, "cafe_custom_identity");
    return { select: () => ({ in: async () => ({ data: [{ cafe_id: "identity", logo_storage_path: "identity/logo.webp" }] }) }) };
  },
  storage: { from(bucket) {
    assert.equal(bucket, "cafe-logos");
    return { createSignedUrls: async (paths, ttl) => {
      calls.push(paths); assert.equal(ttl, 3600);
      return { data: paths.map(path => path.includes("missing") ? { path, error: "not found" } : { path, signedUrl: `https://storage.test/${path}` }) };
    } };
  } },
};
const result = await getAdminBrandLogos(client, [
  { id: "uploaded", cafe_settings: { logo_storage_path: "uploaded/logo.webp", logo_url: "https://old.test/logo" } },
  { id: "identity" },
  { id: "external", cafe_settings: { logo_url: "https://brand.test/logo.png" } },
  { id: "empty" },
  { id: "missing", cafe_settings: { logo_storage_path: "missing/logo.webp", logo_url: "https://fallback.test/logo.png" } },
  { id: "invalid", cafe_settings: { logo_storage_path: "uploaded/other.webp" } },
]);
assert.equal(calls.length, 1);
assert.equal(result.get("uploaded").url, "https://storage.test/uploaded/logo.webp");
assert.equal(result.get("identity").url, "https://storage.test/identity/logo.webp");
assert.equal(result.get("external").url, "https://brand.test/logo.png");
assert.equal(result.get("empty").url, "");
assert.equal(result.get("missing").url, "https://fallback.test/logo.png");
assert.equal(result.get("invalid").path, undefined);
const empty = await getAdminBrandLogos({}, []);
assert.equal(empty.size, 0);
const unavailable = await getAdminBrandLogos({ ...client, storage: { from: () => ({ createSignedUrls: async () => { throw Error("unavailable"); } }) } }, [
  { id: "uploaded", cafe_settings: { logo_storage_path: "uploaded/logo.webp", logo_url: "https://old.test/logo" } },
]);
assert.equal(unavailable.get("uploaded").url, "https://old.test/logo");
await getAdminBrandLogos(client, Array.from({ length: 201 }, (_, n) => ({ id: String(n), cafe_settings: { logo_storage_path: `${n}/logo.webp` } })));
assert.deepEqual(calls.slice(1).map(paths => paths.length), [100, 100, 1]);
assert(fs.existsSync(new URL("../public/brand/barndaksa-logo-brown.png", import.meta.url)));
console.log("PASS admin logos: uploaded/identity/external/missing/failure isolation/tenant path/batched signing; no network mutations");
