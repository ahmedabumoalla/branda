import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
let features = [];
let operations = 0;
const service = new Proxy({}, { get: () => async () => { operations++; return {}; } });
const stubs = {
  "server-only": {},
  "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => features },
  "@/lib/data/menu": service,
  "@/lib/data/settings": service,
  "@/lib/data/offers": service,
  "@/lib/data/cafes": service,
  "@/lib/supabase/server": service,
  "@/lib/storage/upload-server": service,
};
function load(relative) {
  const output = ts.transpileModule(fs.readFileSync(relative, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => Object.hasOwn(stubs, name) ? stubs[name]
    : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : dependency(name), exports);
  return exports;
}
let checks = 0;
for (const [file, feature] of [["menu", "menu"], ["offers", "offers"], ["settings", "settings"]]) {
  const actions = load(`app/actions/${file}.ts`);
  for (const action of Object.values(actions)) {
    for (const denied of [[], [feature === "menu" ? "loyalty" : "menu"]]) {
      features = denied;
      await assert.rejects(() => action({}), /غير مفعلة/);
      assert.equal(operations, 0, "denied action must not read, mutate or upload");
      checks++;
    }
  }
  features = [feature];
  const read = Object.entries(actions).find(([name]) => name.startsWith("fetch"))[1];
  await read();
  assert.equal(operations, 1, "assigned service can read");
  operations = 0;
  checks++;
}
const upload = load("app/actions/upload.ts");
features = ["menu"];
await assert.rejects(() => upload.uploadImageAction("offer-banners", new FormData(), "product", "x"), /غير مفعلة/);
await assert.rejects(() => upload.uploadImageAction("cafe-backgrounds", new FormData(), "product", "x"), /غير متاحة/);
features = [];
await assert.rejects(() => upload.uploadProductVideoAction(new FormData(), "x"), /غير مفعلة/);
assert.equal(operations, 0);
checks += 3;
const loading = renderToStaticMarkup(load("app/admin/loading.tsx").default());
assert.match(loading, /role="status"/);
assert.match(loading, /aria-busy="true"/);
assert.match(loading, /motion-safe:animate-pulse/);
assert.match(loading, /جارٍ تحميل بيانات لوحة الإدارة/);
checks++;
console.log(`PASS owner service boundaries and admin loading: ${checks} checks`);
