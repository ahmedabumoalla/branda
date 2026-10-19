import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
function load(relative, stubs, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const exports = {};
  cache.set(relative, exports);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", output)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`, stubs, cache);
    return dependency(name);
  }, exports);
  return exports;
}

const cafeId = "bb404c1a-a439-41ab-aed8-ea0c17875bd9";
const product = { id: "dish", cafe_id: cafeId, category_id: "category", name: "Dish", description: "Original detail", price: 21, available: true, image_storage_path: `${cafeId}/dish/image.webp`, media: [], promo: null, deleted_at: null };
function fixture({ features = ["menu"], status = "active", variant = null, concurrent = false, rows = [product] } = {}) {
  const trace = [], pendingQueries = new Map(), pendingMedia = new Map();
  const tables = {
    cafes: { id: cafeId, slug: "rast", name: "Rast", status },
    menu_categories: [{ id: "category", name: "Drinks" }],
    cafe_settings: { logo_storage_path: `${cafeId}/logo.png` },
    menu_products: rows,
  };
  function barrier(store, key, size, value) {
    return new Promise(resolve => {
      store.set(key, () => resolve(value));
      if (store.size === size) for (const finish of store.values()) finish();
    });
  }
  function result(table) {
    trace.push(table);
    const value = { data: tables[table], error: null };
    return concurrent && table !== "cafes" ? barrier(pendingQueries, table, 3, value) : Promise.resolve(value);
  }
  const signedRows = paths => paths.map(item => ({ path: item, signedUrl: `https://media.invalid/${item}` }));
  const admin = { from(table) {
    const builder = { select() { return builder; }, eq() { return builder; }, is() { return builder; }, order() { return builder; }, range() { return builder; }, maybeSingle() { return result(table); }, then(resolve, reject) { return result(table).then(resolve, reject); } };
    return builder;
  }, storage: { from(bucket) { return { async createSignedUrls(paths) { trace.push(`direct:${bucket}`); return { data: signedRows(paths), error: null }; } }; } } };
  const stubs = {
    react: { cache: fn => fn },
    "next/cache": { unstable_cache: fn => {
      const values = new Map();
      return (...args) => { const key = JSON.stringify(args); if (!values.has(key)) values.set(key, fn(...args)); return values.get(key); };
    } },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async () => { trace.push("entitlements"); return features; } },
    "@/lib/data/kath-menu-assets": { getKathMenuAssets: async paths => {
      trace.push("stable-media");
      return concurrent ? barrier(pendingMedia, "media", 2, signedRows(paths)) : signedRows(paths);
    } },
    "@/lib/cafe/published-logo": { publishedMenuLogo: async () => {
      trace.push("logo");
      return concurrent ? barrier(pendingMedia, "logo", 2, "https://logo.invalid/reviewed.webp") : "https://logo.invalid/reviewed.webp";
    } },
    "@/lib/menu/logo-variants": { standaloneLogoVariant: () => variant },
    "@/lib/data/standalone-highlights": { getStandaloneHighlights: async (_id, products) => ({ asOf: 0, items: products.map(item => ({ id: item.id, imageUrl: item.images[0]?.url ?? null })) }) },
    "@/lib/whatsapp/green-api": { isGreenApiConfigured: () => false },
  };
  return { ...load("lib/data/standalone-menu.ts", stubs), trace };
}
let checks = 0;
async function test(run) { await run(); checks++; }

await test(async () => {
  const db = fixture({ concurrent: true });
  let timer;
  try {
    const menu = await Promise.race([db.getStandaloneMenu("rast", true), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Independent catalog queries/media did not start together")), 2000); })]);
    assert.equal(menu.products.length, 1);
    assert.equal(menu.logoUrl, "https://logo.invalid/reviewed.webp");
    assert.equal(menu.products[0].price, 21);
    assert.equal(menu.highlights.items[0].imageUrl, menu.products[0].images[0].url);
    assert.deepEqual(new Set(db.trace.slice(2, 5)), new Set(["menu_categories", "cafe_settings", "menu_products"]));
  } finally { clearTimeout(timer); }
});
await test(async () => {
  const regular = fixture(), preview = fixture();
  assert.deepEqual(await preview.getStandaloneMenu("rast", true), await regular.getStandaloneMenu("rast"), "Preview keeps the same complete menu design payload");
  assert(preview.trace.includes("stable-media"));
  assert(!preview.trace.includes("direct:menu-products"));
  assert(regular.trace.includes("direct:menu-products"));
  assert(!regular.trace.includes("stable-media"));
});
await test(async () => {
  for (const options of [{ features: [] }, { status: "suspended" }]) {
    const db = fixture(options);
    assert.equal(await db.getStandaloneMenu("rast", true), null);
    assert(!db.trace.includes("menu_products"));
    assert(!db.trace.includes("logo"));
    assert(!db.trace.includes("stable-media"));
  }
  const db = fixture();
  assert.equal(await db.getStandaloneMenu("../private", true), null);
  assert.equal(db.trace.length, 0);
});
await test(async () => {
  const db = fixture({ variant: "/menu-logos/reviewed.webp" });
  assert.equal((await db.getStandaloneMenu("rast", true)).logoUrl, "/menu-logos/reviewed.webp");
  assert(!db.trace.includes("logo"), "A reviewed matching variant must not wait for unused original processing");
});
await test(async () => {
  const db = fixture();
  const originalNow = Date.now;
  let time = 1_800_000_000_000;
  Date.now = () => time;
  try {
    await db.getStandaloneMenu("rast", true);
    await db.getStandaloneMenu("rast", true);
    assert.equal(db.trace.filter(item => item === "logo").length, 1, "Preview reuses the exact processed logo within its safe signing window");
    assert.equal(db.trace.filter(item => item === "entitlements").length, 2, "Cached assets must not cache menu authorization");
    time += 20 * 60_000;
    await db.getStandaloneMenu("rast", true);
    assert.equal(db.trace.filter(item => item === "logo").length, 2, "A new signing window must renew the preview logo");
  } finally { Date.now = originalNow; }
});
await test(async () => {
  const db = fixture({ rows: [{ ...product, available: false }, { ...product, id: "hidden-category", category_id: "hidden" }] });
  assert.deepEqual((await db.getStandaloneMenu("rast", true)).products, []);
  assert(!db.trace.includes("stable-media"), "Hidden product media never enters the signing cache");
});
await test(async () => {
  const React = dependency("react");
  const { renderToStaticMarkup } = dependency("react-dom/server");
  const args = [];
  const page = load("app/menu/[slug]/page.tsx", {
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/lib/data/public-home-catalog": { isPublicHomeMenuSlug: async () => true },
    "@/lib/data/standalone-menu": { getStandaloneMenu: async (...values) => { args.push(values); return { slug: "rast", name: "Rast" }; } },
    "@/components/menu/bistro-menu": { BistroMenu: () => React.createElement("main", null, "menu") },
    "@/components/analytics/public-page-analytics": { PublicPageAnalytics: () => React.createElement("i", null, "ANALYTICS") },
    "@/components/menu/menu-auto-refresh": { MenuAutoRefresh: () => React.createElement("i", null, "POLLING") },
  });
  const params = Promise.resolve({ slug: "rast" });
  const preview = renderToStaticMarkup(await page.default({ params, searchParams: Promise.resolve({ showcase: "1" }) }));
  assert(preview.includes("inert"));
  assert(!preview.includes("ANALYTICS"));
  assert(!preview.includes("POLLING"));
  const regular = renderToStaticMarkup(await page.default({ params }));
  assert(regular.includes("ANALYTICS"));
  assert(regular.includes("POLLING"));
  assert.deepEqual(args, [["rast", true], ["rast", false]]);
});
console.log(`Menu showcase performance: ${checks} grouped concurrency, payload, visibility and preview checks passed`);
