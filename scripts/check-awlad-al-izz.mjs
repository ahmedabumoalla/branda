import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  new Function("require", "exports", source)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name === "next/image") return { __esModule: true, default: ({ priority, unoptimized, ...props }) => React.createElement("img", props) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name);
      return load(`${base}${fs.existsSync(`${base}.tsx`) ? ".tsx" : ".ts"}`, stubs, cache);
    }
    return require(name);
  }, exports);
  return exports;
}
const profile = load("lib/menu/awlad-al-izz.ts");
const { AWLAD_PRODUCTS, AWLAD_CATEGORIES } = load("lib/menu/awlad-al-izz-catalog.ts");
const { withAwladCatalogPreview } = load("lib/data/awlad-preview.ts", { "node:fs": { ...fs, existsSync: () => false } });
const { AwladAlIzz } = load("components/menu/awlad-al-izz.tsx");
const { AwladSections } = load("components/menu/awlad-sections.tsx");
const base = { cafeId: profile.AWLAD_CAFE_ID, slug: profile.AWLAD_SLUG, name: "أولاد العز", businessCategory: "hair_salons", products: [], categories: [], currencyCode: "IQD", currencyLabel: "د.ع", contacts: { location: null, instagramUrl: null, feedbackEnabled: false } };
const previous = { node: process.env.NODE_ENV, preview: process.env.BRANDA_AWLAD_CATALOG_PREVIEW };
try {
  process.env.BRANDA_AWLAD_CATALOG_PREVIEW = "true";
  process.env.NODE_ENV = "production";
  assert.equal(withAwladCatalogPreview(base).preview, false, "Draft catalog can never leak into production");
  process.env.NODE_ENV = "development";
  assert.equal(withAwladCatalogPreview({ ...base, cafeId: "another-tenant" }).preview, false);
  assert.equal(withAwladCatalogPreview({ ...base, products: [{ id: "existing" }] }).preview, false);
  assert.equal(withAwladCatalogPreview({ ...base, branch: { id: "branch" } }).preview, false);
  delete process.env.BRANDA_AWLAD_CATALOG_PREVIEW;
  assert.equal(withAwladCatalogPreview(base).preview, false);
  process.env.BRANDA_AWLAD_CATALOG_PREVIEW = "true";
  const { menu, preview } = withAwladCatalogPreview(base);
  assert(preview);
  assert.equal(menu.products.length, 28);
  assert.equal(profile.awladSectionMenu(menu, "salon").products.length, 4);
  assert.equal(profile.awladSectionMenu(menu, "cafe").products.length, 24);
  assert.equal(profile.awladSectionMenu(menu, "laser").products.length, 0);
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
  const home = render(AwladAlIzz, { menu });
  const workspace = render(AwladSections, { selected: "salon", onSelect() {} });
  assert.equal((workspace.match(/<button/g) ?? []).length, 3);
  assert(!workspace.includes("<img"));
  for (const section of ["salon", "cafe", "laser"]) {
    assert(!home.includes(`href="${profile.awladSectionHref(menu.slug, section)}"`), "Public menu never shows the section chooser");
  }
  assert(home.includes("<em>أولاد العز</em>") && home.includes("قهوة تركية وسط"));
  assert(!home.includes("الحلاقة العادية"));
  const cafe = render(AwladAlIzz, { menu, view: "cafe" });
  assert(cafe.includes("دينار عراقي"));
  assert(cafe.includes("د.ع"));
  assert(!cafe.includes("الحلاقة العادية"));
  assert(cafe.includes("قهوة تركية وسط"));
  assert(cafe.includes('aria-label="تصنيفات المنيو"'));
  const laser = render(AwladAlIzz, { menu, view: "laser" });
  assert(laser.includes("لم تُضف خدمات لهذا القسم بعد"));
  assert(!laser.includes("قهوة تركية وسط"));
  assert(!laser.includes("الحلاقة العادية"));
  assert(workspace.includes("الخدمات والمنيو"));
  assert(!laser.includes('aria-label="أقسام أولاد العز"'));
  const populatedLaser = render(AwladAlIzz, { menu: { ...menu, products: [{ ...menu.products[0], name: "خدمة ليزر", categoryId: load("lib/menu/awlad-al-izz-catalog.ts").AWLAD_CATEGORY_IDS.laser }] }, view: "laser" });
  assert(populatedLaser.includes("خدمة ليزر") && !populatedLaser.includes("لم تُضف خدمات لهذا القسم بعد"));
  const { menuLoadingBrand } = load("lib/menu/loading-brands.ts");
  assert.equal(menuLoadingBrand(profile.AWLAD_SLUG).accent, profile.AWLAD_BLUE);
  // Exercise search, filtering and product-details selection without a browser.
  const state = [];
  let cursor = 0;
  const hookReact = { ...React, useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; }, useRef: () => ({ current: null }), useEffect() {} };
  const interactiveCafe = load("components/menu/awlad-al-izz.tsx", { react: hookReact });
  const walk = tree => Array.isArray(tree) ? tree.flatMap(walk) : tree && typeof tree === "object" ? [tree, ...walk(tree.props?.children)] : [];
  const draw = () => { cursor = 0; return walk(interactiveCafe.AwladAlIzz({ menu })); };
  let nodes = draw();
  nodes.find(node => node.props?.type === "search").props.onChange({ target: { value: "قهوة تركية وسط" } });
  nodes = draw();
  assert.equal(nodes.filter(node => node.type === "button" && node.props["aria-label"]?.startsWith("تفاصيل ")).length, 1);
  nodes.find(node => node.props?.["aria-label"] === "تفاصيل قهوة تركية وسط").props.onClick();
  assert.equal(draw().find(node => node.props?.id === "awlad-product-title").props.children, "قهوة تركية وسط");
  draw().find(node => node.props?.["aria-label"] === "إغلاق تفاصيل الصنف").props.onClick();
  assert(!draw().some(node => node.props?.id === "awlad-product-title"));
  draw().find(node => node.props?.type === "search").props.onChange({ target: { value: "no-matching-item" } });
  assert(draw().some(node => node.props?.role === "status"));
  draw().find(node => node.type === "button" && node.props.children === "عرض كل الأصناف").props.onClick();
  assert.equal(draw().filter(node => node.type === "button" && node.props["aria-label"]?.startsWith("تفاصيل ")).length, 24);
  for (const name of ["haircut", "single-use", "facial", "groom", "coffee", "cold-drinks", "bakery"]) {
    const image = `public${profile.AWLAD_ASSETS}/${name}.webp`;
    assert(fs.statSync(image).size < 150_000, "Web imagery remains lightweight");
  }
  assert.equal(new Set(AWLAD_PRODUCTS.map(item => item.id)).size, AWLAD_PRODUCTS.length);
  assert.equal(new Set(AWLAD_CATEGORIES.map(item => item.id)).size, AWLAD_CATEGORIES.length);
  // Exercise the actual owner controls and mutation actions with an isolated draft file.
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "awlad-editor-test-"));
  try {
    const draft = load("lib/data/awlad-preview.ts", { "node:os": { tmpdir: () => directory } });
    const owner = { cafe: { id: base.cafeId }, products: [], categories: [] };
    const actions = load("app/actions/awlad-draft.ts", {
      "@/lib/data/menu": { getOwnerMenu: async () => owner }, "@/lib/data/awlad-preview": draft,
    });
    const catalog = draft.readAwladDraft();
    const product = catalog.products[0];
    await actions.saveDraftProduct({ ...product, name: "خدمة معدلة", available: false });
    assert(!draft.withAwladCatalogPreview(base).menu.products.some(p => p.id === product.id));
    await actions.saveDraftProduct({ ...product, name: "خدمة معدلة" });
    assert(draft.withAwladCatalogPreview(base).menu.products.some(p => p.name === "خدمة معدلة"));
    await actions.deleteDraftProduct(product.id);
    assert(!draft.readAwladDraft().products.some(p => p.id === product.id));
    owner.cafe.id = "other";
    await assert.rejects(actions.saveDraftProduct(product), /المعاينة غير متاحة/);

    const slots = [];
    let slot = 0;
    const hooks = { ...React, useMemo: f => f(), useState: initial => {
      const i = slot++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    }, useEffect() {}, useLayoutEffect() {}, useTransition: () => [false, f => f()], useRef: value => ({ current: value }) };
    const dashboard = load("components/dashboard/pages/menu-page.tsx", {
      react: hooks, "next/dynamic": () => () => null,
      "@/components/erp/inventory/catalog-tabs": {}, "@/components/erp/inventory/menu-ingredients-cache": {},
      "@/components/erp/navigation": { useRouter: () => ({}) }, "@/app/actions/menu": {}, "@/app/actions/awlad-draft": actions,
      "@/components/dashboard/menu/category-manager": {}, "@/components/dashboard/menu/product-card": { MenuProductCard: "card" },
      "@/components/dashboard/menu/branch-switcher": {}, "@/components/ui/design-system": { DashboardPageShell: "shell" },
      "@/components/ui/app-toast": { useAppToast: () => ({}) }, "@/lib/menu/product-position": {}, "@/lib/menu/menu-change": {},
      "@/lib/menu/product-copy": {}, "@/lib/commerce/product-details": {}, "@/lib/menu/product-price-mode": {},
    });
    const editor = () => {
      slot = 0;
      const nodes = walk(dashboard.MenuPageClient({ awlad: true, localDraft: true, cafeSlug: base.slug,
        businessCategory: "hair_salons", initialProducts: catalog.products, initialCategories: catalog.categories }));
      return [...nodes, ...walk(nodes.find(n => n.type === "shell").props.action)];
    };
    for (const [section, count] of [["salon",4],["cafe",24],["laser",0]]) {
      editor().find(n => n.props?.onSelect).props.onSelect(section);
      const nodes = editor();
      assert.equal(nodes.filter(n => n.type === "card").length, count);
      assert(nodes.some(n => n.type === "a" && n.props.href === profile.awladSectionHref(base.slug,section)));
    }
  } finally {
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  }
  const notFound = () => { throw new Error("NOT_FOUND"); };
  const route = (targetMenu) => load("app/menu/[slug]/[section]/page.tsx", {
    "next/navigation": { notFound }, "@/lib/data/standalone-menu": { getStandaloneMenu: async () => targetMenu },
    "@/lib/data/loyalty-cards": { getPublicLoyaltyProgramBySlug: async () => ({ enabled: true }) },
    "@/components/analytics/public-page-analytics": { PublicPageAnalytics: () => null },
    "@/components/menu/menu-auto-refresh": { MenuAutoRefresh: () => null },
  });
  await assert.rejects(route(base).default({ params: Promise.resolve({ slug: base.slug, section: "unknown" }) }), /NOT_FOUND/);
  await assert.rejects(route({ ...base, cafeId: "another-tenant" }).default({ params: Promise.resolve({ slug: "other", section: "cafe" }) }), /NOT_FOUND/);
  await assert.rejects(route(null).default({ params: Promise.resolve({ slug: base.slug, section: "cafe" }) }), /NOT_FOUND/);
  assert(renderToStaticMarkup(await route(base).default({ params: Promise.resolve({ slug: base.slug, section: "cafe" }) })).includes("قهوة تركية وسط"));
  // Exercise the real proxy, where salon aliases can redirect before the page runs.
  const { NextRequest } = require("next/server");
  let tenant = { id: profile.AWLAD_CAFE_ID, business_category: "hair_salons" };
  const query = {
    select() { return this; }, eq() { return this; }, is() { return this; }, abortSignal() { return this; },
    async maybeSingle() { return { data: tenant }; },
  };
  const { proxy } = load("proxy.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => query }) },
    "@/lib/supabase/middleware": { updateSession: () => { throw new Error("Public menu should not refresh auth"); } },
    "@/lib/cashier/persistent-session": { refreshCashierCookie: (_request, response) => response },
    "@/lib/cashier/session-recovery": { recoverExpiredCashierAction: async () => null },
    "@/lib/platform/storefront-availability": { isStorefrontEnabled: () => true, isStorefrontPath: () => false },
    "@/lib/commerce/hospital-account-routing": { hospitalAccountRouteHeader: "x-branda-hospital", isHospitalAccountRoute: () => false, isLegacyHospitalAccountLogin: () => false },
  });
  const request = slug => new NextRequest(`http://localhost:3024/menu/${slug}`);
  assert.equal((await proxy(request(base.slug))).headers.get("location"), null, "Awlad must reach its independent drinks menu");
  assert.equal((await proxy(request("renamed-awlad"))).headers.get("location"), null, "Identity follows tenant ID, not slug");
  tenant = { id: "another-salon", business_category: "hair_salons" };
  const otherSalon = await proxy(request("another-salon"));
  assert.equal(otherSalon.status, 307);
  assert.equal(new URL(otherSalon.headers.get("location")).pathname, "/salon/another-salon");
  tenant = { id: "cafe", business_category: "cafes_coffee" };
  assert.equal((await proxy(request("cafe"))).headers.get("location"), null);
  console.log("Awlad Al Izz passed: tenant routing, preview isolation, section separation, IQD, empty laser, dashboard links and seven optimized images");
} finally {
  if (previous.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.node;
  if (previous.preview === undefined) delete process.env.BRANDA_AWLAD_CATALOG_PREVIEW; else process.env.BRANDA_AWLAD_CATALOG_PREVIEW = previous.preview;
}
