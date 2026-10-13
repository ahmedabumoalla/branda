import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, root), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function setup(bodyOverflow = "", rootOverflow = "") {
  const cleanups = [];
  const doc = { body: { style: { overflow: bodyOverflow } }, documentElement: { style: { overflow: rootOverflow } }, activeElement: null };
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const exports = {};
    modules.set(path, exports);
    const imports = name => {
      if (name === "react") return { useRef: () => ({ current: { showModal() {}, close() {} } }), useId: () => "fixture", useEffect: effect => cleanups.push(effect()) };
      if (name === "react/jsx-runtime") return require(name);
      if (name.startsWith("@/lib/ui/")) return load(name.replace("@/", "") + ".ts");
      if (name.endsWith(".css")) return { default: {} };
      return {};
    };
    vm.runInNewContext(compile(path), { exports, require: imports, document: doc });
    return exports;
  }
  const { BrandDialog } = load("components/admin/brand-details-dialog.tsx");
  return { doc, cleanups, mount: () => BrandDialog({ title: "Fixture", children: null, close() {} }) };
}

for (const order of [[0, 1], [1, 0]]) {
  test(`nested dialogs restore page scrolling when closing in order ${order}`, () => {
    const { doc, cleanups, mount } = setup();
    mount(); mount();
    cleanups[order[0]]();
    assert.equal(doc.body.style.overflow, "hidden", "remaining dialog still locks background");
    assert.equal(doc.documentElement.style.overflow, "hidden");
    cleanups[order[1]]();
    assert.equal(doc.body.style.overflow, "", "body restored for all subsequent routes");
    assert.equal(doc.documentElement.style.overflow, "", "root restored for all subsequent routes");
  });
}
test("restore original styles and release safely on repeated cleanup", () => {
  const { doc, cleanups, mount } = setup("auto", "scroll");
  mount(); mount(); cleanups[0](); cleanups[0]();
  assert.equal(doc.documentElement.style.overflow, "hidden");
  cleanups[1]();
  assert.equal(doc.body.style.overflow, "auto");
  assert.equal(doc.documentElement.style.overflow, "scroll");
});
test("strict effect setup-cleanup-remount and reopening preserve scrolling", () => {
  const { doc, cleanups, mount } = setup();
  for (let n = 0; n < 4; n++) {
    mount(); assert.equal(doc.body.style.overflow, "hidden"); cleanups[n]();
    assert.equal(doc.body.style.overflow, ""); assert.equal(doc.documentElement.style.overflow, "");
  }
});
