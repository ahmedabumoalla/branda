import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
const dependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));

function load(relative, stubs = {}, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const file = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(fs.existsSync(path.join(root, `${file}.tsx`)) ? `${file}.tsx` : `${file}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}

const cafeId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const foreignId = "33333333-3333-4333-8333-333333333333";
const offerId = "44444444-4444-4444-8444-444444444444";
const valid = { title: "Rast offer", description: "Details", type: "خصم", status: "نشط", placement: "بانر الكوفي", visibleInCafe: true, discountPercent: 20, offerRules: { rastKind: "products", selectedProductIds: [productId] } };

async function run() {
  const { rastCampaignSchema } = load("lib/offers/rast-offers.ts");
  assert(rastCampaignSchema.safeParse(valid).success);
  for (const change of [{ discountPercent: 101 }, { discountPercent: 0 }, { startDate: "2026-02-30" }, { startDate: "2026-10-09", endDate: "2026-10-01" }, { status: "مجدول" }, { offerRules: { rastKind: "products", selectedProductIds: [] } }, { offerRules: { rastKind: "event" } }]) assert(!rastCampaignSchema.safeParse({ ...valid, ...change }).success);
  assert(rastCampaignSchema.safeParse({ ...valid, offerRules: { rastKind: "general" } }).success);
  assert(rastCampaignSchema.safeParse({ ...valid, discountPercent: null, offerRules: { rastKind: "event", eventDate: "2026-10-10", eventTime: "19:30", eventLocation: "Rast" } }).success);

  const writes = [], filters = [], invalidations = [];
  let slug = "rast", failAuth = false, allowed = true, role = "owner", missing = false;
  const db = { from(table) {
    let ids = [], payload;
    const q = {
      select() { return q; }, eq(key, value) { filters.push([table, key, value]); return q; }, is() { return q; }, in(key, value) { ids = value; return q; },
      insert(value) { payload = value; writes.push([table, value]); return q; }, upsert(value) { return q.insert(value); }, update(value) { return q.insert(value); },
      maybeSingle() { return Promise.resolve({ data: missing ? null : { id: offerId, ...payload }, error: null }); },
      then(resolve) { return Promise.resolve({ data: table === "menu_products" ? ids.filter((id) => id === productId).map((id) => ({ id })) : [], error: null }).then(resolve); },
    }; return q;
  } };
  const data = load("lib/data/offers.ts", {
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => { if (failAuth) throw new Error("unauthorized"); return { id: cafeId, slug, role }; } },
    "@/lib/data/owner-service-access": { assertOwnerServiceEnabled: async () => { if (!allowed) throw new Error("package denied"); } },
    "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async () => allowed ? ["offers"] : [] },
    "next/cache": { revalidatePath: (value) => invalidations.push(value) },
    "@/lib/performance/server-memory-cache": { clearServerMemoryCache() {} },
  });
  await data.upsertOffer(valid);
  assert.equal(writes.length, 1); assert.equal(writes[0][1].cafe_id, cafeId);
  assert(filters.some(([table, key, value]) => table === "menu_products" && key === "cafe_id" && value === cafeId));
  assert(invalidations.includes("/menu/rast"));
  assert.equal(writes[0][1].linked_product_id, productId);
  assert.equal(writes[0][1].offer_rules.rastKind, "products");
  // Reject foreign products, foreign media and bad values before any write.
  await assert.rejects(data.upsertOffer({ ...valid, offerRules: { rastKind: "products", selectedProductIds: [foreignId] } }));
  await assert.rejects(data.upsertOffer({ ...valid, id: offerId, bannerStoragePath: `${foreignId}/${offerId}/private.webp` }));
  await assert.rejects(data.upsertOffer({ ...valid, discountPercent: 101 }));
  failAuth = true; await assert.rejects(data.upsertOffer(valid)); failAuth = false;
  assert.equal(writes.length, 1);
  await data.upsertOffer({ ...valid, status: "متوقف", offerRules: { rastKind: "general", selectedProductIds: [foreignId] } });
  assert.equal(writes.at(-1)[1].status, "inactive");
  assert.equal(writes.at(-1)[1].linked_product_id, null);
  assert.deepEqual(writes.at(-1)[1].offer_rules.selectedProductIds, []);
  assert.equal(writes.at(-1)[1].offer_rules.appliesToAllProducts, true);
  await data.upsertOffer({ ...valid, offerRules: { rastKind: "event", eventDate: "2026-10-10", eventTime: "19:30", eventLocation: "Rast" } });
  assert.equal(writes.at(-1)[1].discount_percent, null);
  assert.equal(writes.at(-1)[1].target_type, "experience_campaign");
  const before = writes.length; await data.softDeleteOffer(offerId);
  assert.equal(writes.length, before + 1); assert.equal(writes.at(-1)[1].is_archived, true);
  slug = "basilico";
  await data.upsertOffer(valid);
  assert.equal(writes.at(-1)[0], "offers", "Every brand derives promos without persistent product writes");
  await assert.rejects(data.upsertOffer({ ...valid, offerRules: { rastKind: "products", selectedProductIds: [foreignId] } }));
  allowed = false;
  const beforeDenied = writes.length;
  await assert.rejects(data.upsertOffer(valid));
  await assert.rejects(data.softDeleteOffer(offerId));
  await assert.rejects(data.getOwnerOffers());
  assert.equal(writes.length, beforeDenied);
  allowed = true; role = "staff";
  await assert.rejects(data.upsertOffer(valid));
  role = "owner";
  await data.upsertOffer({ ...valid, id: offerId });
  assert(filters.some(([table, key, value]) => table === "offers" && key === "cafe_id" && value === cafeId));
  missing = true;
  await assert.rejects(data.upsertOffer({ ...valid, id: foreignId }));
  await assert.rejects(data.softDeleteOffer(foreignId));
  missing = false;

  const { getPublishedOfferPromo, matchesLegacyOfferPromo } = load("lib/offers/published-offers.ts");
  const pricingProduct = { id: productId, price: 20, available: true };
  const publicOffer = { id: offerId, kind: "products", title: "Discount", productId, discountPercent: 20, expiresAt: null };
  assert.equal(getPublishedOfferPromo(pricingProduct, { items: [publicOffer] }).discountPercent, 20);
  assert.equal(getPublishedOfferPromo(pricingProduct, { items: [{ ...publicOffer, kind: "general", productId: null }] }).discountPercent, 20);
  for (const change of [{ kind: "event" }, { expiresAt: 1 }, { productId: foreignId }, { discountPercent: 101 }, { discountPercent: -1 }]) {
    assert.equal(getPublishedOfferPromo(pricingProduct, { items: [{ ...publicOffer, ...change }] }), null);
  }
  const manual = { kind: "خصم", discountMode: "percent", discountPercent: 35, startDate: "2000-01-01", endDate: "2099-12-31", customText: "Manual" };
  assert.equal(getPublishedOfferPromo({ ...pricingProduct, promo: manual }, { items: [publicOffer] }), manual);
  assert.equal(getPublishedOfferPromo({ ...pricingProduct, promo: manual }, { items: [{ ...publicOffer, discountPercent: 50 }] }).discountPercent, 50);
  assert.equal(getPublishedOfferPromo({ ...pricingProduct, promo: manual }, { items: [], managedProductIds: [productId] }), null);
  assert.equal(getPublishedOfferPromo({ ...pricingProduct, promo: manual }, { items: [] }), manual);
  const legacy = { title: "Manual", discount_percent: 35, start_date: "2000-01-01", end_date: null, created_at: "1999-01-01" };
  assert(matchesLegacyOfferPromo({ ...pricingProduct, promo: manual }, legacy));
  for (const patch of [{ title: "Other" }, { discount_percent: 36 }, { start_date: "2001-01-01" }, { end_date: "2098-12-31" }]) assert(!matchesLegacyOfferPromo({ ...pricingProduct, promo: manual }, { ...legacy, ...patch }));

  // Exercise real component effects/events with a deterministic hook scheduler, no browser.
  let cursor = 0, inView = true, reduced = false, effects = [], state = [], deps = [], cleanups = [], timers = new Map(), nextTimer = 1;
  const realSet = global.setInterval, realClear = global.clearInterval, realDocument = global.document;
  global.setInterval = (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; };
  global.clearInterval = (id) => timers.delete(id);
  global.document = { hidden: false };
  const react = {
    useRef: () => ({ current: null }),
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
    useEffect(fn, next) { const i = cursor++; if (!deps[i] || next.some((d, j) => !Object.is(d, deps[i][j]))) { deps[i] = next; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  try {
    const { RastSpotlight } = load("components/menu/rast-spotlight.tsx", { react, "motion/react": { useInView: () => inView, useReducedMotion: () => reduced } });
    const product = { id: productId, name: "Coffee", price: 20, available: true, images: [], videos: [], ingredients: [] };
    const item = { id: "one", title: "First", description: "Details", productId, discountPercent: 20, code: null, imageUrl: null, expiresAt: null };
    const menu = { products: [product], highlights: { asOf: Date.now(), items: [item, { ...item, id: "two", title: "Second" }] } };
    const render = () => { cursor = 0; effects = []; const tree = RastSpotlight({ menu, onSelect() {} }); effects.forEach((fn) => fn()); return tree; };
    const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
    const activeTitle = (tree) => nodes(tree).find((node) => node.type === "article").props["aria-label"];
    let tree = render(); assert.equal(activeTitle(tree), "First");
    const tick = () => { for (const { fn, ms } of [...timers.values()]) if (ms === 3000) fn(); };
    tick(); tree = render(); assert.equal(activeTitle(tree), "Second");
    tick(); tree = render(); assert.equal(activeTitle(tree), "First");
    tree.props.onMouseEnter(); render(); assert(![...timers.values()].some((timer) => timer.ms === 3000));
    tree.props.onMouseLeave(); tree = render();
    tree.props.onFocusCapture(); render(); assert.equal(timers.size, 0);
    tree.props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null }); tree = render();
    const pause = nodes(tree).find((node) => node.type === "button" && node.props["aria-label"] === "إيقاف التبديل التلقائي");
    pause.props.onClick(); tree = render(); assert.equal(timers.size, 0);
    nodes(tree).find((node) => node.type === "button" && node.props["aria-label"] === "تشغيل التبديل التلقائي").props.onClick(); render();
    global.document.hidden = true; tick(); assert.equal(activeTitle(render()), "First"); global.document.hidden = false;
    reduced = true; render(); assert.equal(timers.size, 0);
    reduced = false; inView = false; render(); assert.equal(timers.size, 0);
    inView = true; tree = render();
    nodes(tree).find((node) => node.type === "button" && node.props["aria-label"] === "البطاقة التالية").props.onClick();
    assert.equal(activeTitle(render()), "Second"); assert.equal(timers.size, 0);
  } finally { cleanups.forEach((cleanup) => cleanup?.()); global.setInterval = realSet; global.clearInterval = realClear; global.document = realDocument; }

  const { RastOffersPage } = load("components/dashboard/pages/rast-offers-page.tsx", { "@/app/actions/offers": {} });
  const html = renderToStaticMarkup(React.createElement(RastOffersPage, { initialOffers: [], products: [], brandName: "Basilico", slug: "basilico" }));
  for (const text of ["العروض والخصومات", "خصم على منتجات", "خصم على الكل", "إعلان فعالية", "حفظ البطاقة", "معاينة المحتوى"]) assert(html.includes(text));
  assert(html.includes("/menu/basilico") && html.includes("Basilico") && !html.includes("/menu/rast"));
  for (const file of ["components/menu/rast-spotlight.module.css", "components/dashboard/pages/rast-offers-page.module.css"]) postcss.parse(fs.readFileSync(path.join(root, file), "utf8"));
  console.log("PASS shared offers: validation, package/role/tenant/media rejection, scoped update/delete, all-brand lifecycle, pricing/expiry/manual promo preservation, preview controls, editor SSR and CSS");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
