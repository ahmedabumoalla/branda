import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";

const calls = [];
const dependency = createRequire(import.meta.url);
const navigator = { userAgent: "", sendBeacon: (url) => { calls.push(url); return true; } };
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", "navigator", "fetch", "localStorage", "crypto", output)(
    name => name.startsWith(".") ? load(`${path.join(path.dirname(file), name)}.ts`) : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : dependency(name), exports, navigator,
    () => assert.fail("The tracking test must never call a real endpoint"),
    { getItem: () => null, setItem: () => {} }, { randomUUID },
  );
  return exports;
}
const { trackBrandEngagement } = load("lib/analytics/public-tracking.ts");
const { reportCustomerUsage } = load("lib/analytics/customer-usage-tracking.ts");
for (const agent of ["Mozilla/5.0 (compatible; BrandaSpeedGuard/1.0)", "Chrome-Lighthouse", "Mozilla/5.0 Safari/605.1.15"]) {
  navigator.userAgent = agent;
  calls.length = 0;
  trackBrandEngagement("test", "menu_view");
  reportCustomerUsage("test", "menu_view", "fixture-session", 30);
  assert.equal(calls.length, agent.includes("Guard") || agent.includes("Lighthouse") ? 0 : 2);
}
console.log("Speed guard tracking passed: guard and Lighthouse excluded; ordinary customer tracking preserved; zero network calls");
