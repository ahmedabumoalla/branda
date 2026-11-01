import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";

const require = createRequire(import.meta.url);
const brand = { identity: { slug: "loyalty-brand", name: "علامة الولاء" }, program: { enabled: true } };
let landing = brand, showcaseAllowed = true, menuCalls = 0, landingCalls = 0;
let menu = { slug: "menu-brand", name: "Menu Brand", businessCategory: "cafes_coffee", loyaltyEnabled: false };
const stubs = {
  react: { ...React, cache: fn => fn },
  "next/navigation": { redirect: url => { throw Error(`redirect:${url}`); }, notFound: () => { throw Error("not-found"); } },
  "@/lib/data/loyalty-landing": { getPublicLoyaltyLanding: async () => { landingCalls++; return landing; } },
  "@/lib/data/standalone-menu": { getStandaloneMenu: async () => { menuCalls++; return menu; } },
  "@/lib/data/public-home-catalog": { isPublicHomeMenuSlug: async () => showcaseAllowed },
  "@/lib/data/loyalty-cards": { getPublicLoyaltyProgramBySlug: async () => { throw Error("unexpected program load"); } },
  "@/lib/data/gift-orders": { getGiftStoreSettings: async () => { throw Error("unexpected store load"); } },
  "@/lib/data/salon": { getSalonAnnouncements: async () => [] },
  "@/lib/data/loyalty-identity": { getLoyaltyBrandAppearance: async () => ({ colors: {} }) },
  "@/lib/menu/loco-brand": { isLocoMenu: () => false },
};
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "exports", code)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/components/")) return new Proxy({}, { get: () => () => null });
    return require(name);
  }, exports);
  return exports;
}
let checks = 0;
for (const route of ["app/menu/[slug]/page.tsx", "app/salon/[slug]/page.tsx"]) {
  const page = load(route);
  const props = { params: Promise.resolve({ slug: "loyalty-brand" }), searchParams: Promise.resolve({}) };
  landing = brand; menuCalls = 0;
  await assert.rejects(() => page.default(props), /redirect:\/loyalty\/loyalty-brand\/qr/);
  assert.equal(menuCalls, 0, `${route}: no catalog query before loyalty-only redirect`);
  const metadata = await page.generateMetadata(props);
  assert(metadata.title.includes(brand.identity.name));
  assert.equal(metadata.alternates.canonical, "/loyalty/loyalty-brand/qr");
  assert.equal(menuCalls, 0, `${route}: metadata does not load unavailable catalog`);
  checks += 2;
  landing = null; menu = null;
  await assert.rejects(() => page.default(props), /not-found/);
  checks++;
  menu = { slug: "menu-brand", name: "Menu Brand", businessCategory: route.includes("salon") ? "hair_salons" : "cafes_coffee", loyaltyEnabled: false, cafeId: "cafe" };
  assert(await page.default(props));
  assert((await page.generateMetadata(props)).title.includes("Menu Brand"));
  checks++;
}
const menuPage = load("app/menu/[slug]/page.tsx");
landing = brand; showcaseAllowed = false; menuCalls = 0; landingCalls = 0;
const preview = { params: Promise.resolve({ slug: "loyalty-brand" }), searchParams: Promise.resolve({ showcase: "1" }) };
await assert.rejects(() => menuPage.default(preview), /not-found/);
assert.equal((await menuPage.generateMetadata(preview)).robots.index, false);
assert.equal(landingCalls, 0, "Unpublished showcase is rejected before brand identity lookup");
assert.equal(menuCalls, 0);
checks++;
showcaseAllowed = true;
await assert.rejects(() => menuPage.default(preview), /redirect:\/loyalty\/loyalty-brand\/qr/);
assert.equal((await menuPage.generateMetadata(preview)).robots.index, false);
assert.equal(menuCalls, 0, "A published showcase cannot expose a disabled menu");
checks++;
const proxy = fs.readFileSync("proxy.ts", "utf8");
assert(proxy.includes("(?:c|app)"));
assert(proxy.indexOf('target.pathname = `/menu/${slug}`') < proxy.indexOf('if (!isStorefrontEnabled() && isStorefrontPath(pathname))'));
assert(proxy.includes('request.method === "GET" || request.method === "HEAD"'));
assert(!fs.readFileSync("app/loyalty/[slug]/page.tsx", "utf8").includes("getPublicLoyaltyLanding"), "Member enrollment route must not redirect back to QR");
checks++;
console.log(`PASS ${checks} loyalty-only public route, metadata and existing alias checks`);
