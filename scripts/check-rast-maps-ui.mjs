import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const exports = {};
  cache.set(relative, exports);
  const code = ts.transpileModule(readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    if (name === "@/app/actions/loyalty-experience") return {};
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(existsSync(path.join(root, `${next}.tsx`)) ? `${next}.tsx` : `${next}.ts`);
    }
    return dependency(name);
  }, exports);
  return exports;
}

const { RastLoyaltyDashboard } = load("components/rast-loyalty/rast-dashboard.tsx");
function render(latitude, longitude) {
  return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: { refresh() {} } },
    React.createElement(RastLoyaltyDashboard, {
      initialDashboard: { program: { enabled: false, purchasesRequired: 7, rewardName: "Coffee", terms: "" } },
      initialExperience: { rewardValidityDays: 30, nearbyMessage: "Welcome", latitude, longitude },
      identity: { slug: "rast", name: "Rast", logoUrl: null },
      signupUrl: "https://example.test/loyalty/rast",
      walletAvailability: { apple: false, google: false },
    })));
}

for (const [latitude, longitude, expected] of [
  [null, null, ""],
  [24.7136, 46.6753, "https://www.google.com/maps/search/?api=1&amp;query=24.7136,46.6753"],
  [0, 0, "https://www.google.com/maps/search/?api=1&amp;query=0,0"],
  [24.7136, null, ""],
]) {
  const html = render(latitude, longitude);
  const urlInputs = html.match(/<input\b[^>]*type="url"[^>]*>/g) ?? [];
  assert.equal(urlInputs.length, 1, "one branch URL field replaces the coordinate pair");
  assert.ok(urlInputs[0].includes(`value="${expected}"`), "saved coordinates initialize a canonical location link");
  assert.match(urlInputs[0], /dir="ltr"/);
  assert.match(urlInputs[0], /aria-describedby="rast-maps-url-hint"/);
  assert.doesNotMatch(urlInputs[0], /\brequired(?:\s|=|>)/, "the location link can be cleared");
  assert.match(html, /رابط قوقل ماب للفرع/);
  assert.match(html, /id="rast-maps-url-hint"[^>]*>[^<]*رابط المشاركة المختصر[^<]*إلغاء تذكير القرب/);
  assert.doesNotMatch(html, /خط العرض|خط الطول|inputMode="decimal"/, "manual coordinate inputs are gone");
}
console.log("PASS: Rast Maps URL field SSR checks (saved, empty, zero and incomplete coordinates); no browser or backend calls.");
