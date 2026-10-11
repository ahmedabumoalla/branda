const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(__dirname, "..");
const cache = new Map();
let admin;
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (name === "server-only") return {};
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => admin };
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const file = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(fs.existsSync(path.join(root, `${file}.tsx`)) ? `${file}.tsx` : `${file}.ts`);
    }
    return require(name);
  }, exports);
  return exports;
}

async function run() {
  const today = new Date(Date.now() + 10800000).toISOString().slice(0, 10);
  const product = { id: "p1", name: "Real coffee", price: 20, categoryId: "coffee", category: "Coffee", description: "Real description", available: true, ingredients: [], images: [{ url: "https://example.com/coffee.webp", alt: "Coffee" }], videos: [] };
  const base = { cafe_id: "rast", title: "Featured coffee", description: "Details", offer_type: "خصم", discount_percent: 20, code: "COFFEE", linked_product_id: "p1", visible_in_cafe: true, is_archived: false, deleted_at: null, status: "active", placement: "both", start_date: today, end_date: today, private_field: "MUST_NOT_LEAK" };
  const rows = [
    { ...base, id: "o1", banner_storage_path: "rast/o1/photo.webp" },
    { ...base, id: "o2", card_storage_path: "other/o2/private.webp", banner_storage_path: "rast/o1/private.webp" },
    { ...base, id: "foreign", cafe_id: "other" },
    { ...base, id: "draft", status: "draft" },
    { ...base, id: "hidden", visible_in_cafe: false },
    { ...base, id: "archived", is_archived: true },
    { ...base, id: "deleted", deleted_at: "2020-01-01" },
    { ...base, id: "future", start_date: "2099-01-01" },
    { ...base, id: "expired", end_date: "2020-01-01" },
    { ...base, id: "wrong-placement", placement: "قائمة العروض" },
    { ...base, id: "foreign-product", linked_product_id: "foreign-p" },
    { ...base, id: "unavailable", linked_product_id: "p2" },
  ];
  const signedPaths = [];
  admin = {
    from(table) {
      assert.equal(table, "offers");
      let selected = rows;
      const query = {
        select(columns) { assert(!columns.includes("*") && !columns.includes("code_owner")); return this; },
        eq(key, value) { selected = selected.filter((row) => row[key] === value); return this; },
        is(key, value) { return this.eq(key, value); },
        in(key, values) { selected = selected.filter((row) => values.includes(row[key])); return this; },
        or(expression) { const [key] = expression.split("."); assert(expression.includes(today)); selected = selected.filter((row) => row[key] == null || (key === "start_date" ? row[key] <= today : row[key] >= today)); return this; },
        order() { return this; }, limit() { return this; }, range(from, to) { selected = selected.slice(from, to + 1); return this; },
        then(resolve) { return Promise.resolve({ data: selected, error: null }).then(resolve); },
      };
      return query;
    },
    storage: { from(bucket) { assert.equal(bucket, "offer-banners"); return { async createSignedUrls(paths) { signedPaths.push(...paths); return { data: paths.map((p) => ({ path: p, signedUrl: `https://example.com/${p}` })), error: null }; } }; } },
  };
  const { getStandaloneHighlights } = load("lib/data/standalone-highlights.ts");
  const highlights = await getStandaloneHighlights("rast", [product, { ...product, id: "p2", available: false }]);
  assert.deepEqual(highlights.items.map((item) => item.id), ["o1", "o2"]);
  assert.deepEqual(signedPaths, ["rast/o1/photo.webp"]);
  assert.equal(highlights.items[1].imageUrl, product.images[0].url);
  assert.equal(highlights.items[0].expiresAt, Date.parse(`${today}T23:59:59.999+03:00`));
  assert(!JSON.stringify(highlights).includes("MUST_NOT_LEAK"));

  rows.push(
    { ...base, id: "multi", linked_product_id: "p1", offer_rules: { rastKind: "products", selectedProductIds: ["p1", "p3", "foreign-p", "p2"] } },
    { ...base, id: "general", linked_product_id: null, offer_rules: { rastKind: "general", appliesToAllProducts: true } },
    { ...base, id: "event", linked_product_id: null, offer_type: "عرض مخصص", target_type: "experience_campaign", offer_rules: { rastKind: "event", eventDate: today, eventTime: "19:30", eventLocation: "Rast branch" } },
  );
  const secondProduct = { ...product, id: "p3", name: "Second coffee", images: [{ url: "https://example.com/second.webp", alt: "Second coffee" }] };
  const campaigns = await getStandaloneHighlights("rast", [product, secondProduct, { ...product, id: "p2", available: false }]);
  assert.deepEqual(campaigns.items.filter((item) => item.id.startsWith("multi")).map((item) => [item.productId, item.imageUrl]), [["p1", product.images[0].url], ["p3", secondProduct.images[0].url]]);
  assert.equal(campaigns.items.find((item) => item.id === "general").kind, "general");
  const event = campaigns.items.find((item) => item.id === "event");
  assert.equal(event.kind, "event");
  assert.equal(event.discountPercent, null);
  assert.equal(event.code, null);
  assert.equal(event.eventLocation, "Rast branch");
  rows.push({ ...base, id: "old-event", linked_product_id: null, offer_type: "عرض مخصص", offer_rules: { rastKind: "event", eventDate: "2020-01-01" } });
  assert(!(await getStandaloneHighlights("rast", [product])).items.some((item) => item.id === "old-event"));
  const legacyPromo = { kind: "خصم", discountMode: "percent", discountPercent: 20, customText: base.title, startDate: today, endDate: today };
  const withLegacy = { ...product, promo: legacyPromo };
  const signedBeforeDisabled = signedPaths.length;
  const disabled = await getStandaloneHighlights("rast", [withLegacy], false);
  assert.deepEqual(disabled.items, []);
  assert.deepEqual(disabled.managedProductIds, [product.id]);
  assert.equal(signedPaths.length, signedBeforeDisabled, "Disabled feature never signs campaign media");
  const manual = await getStandaloneHighlights("rast", [{ ...withLegacy, promo: { ...legacyPromo, customText: "Independent product promo" } }], false);
  assert.deepEqual(manual.managedProductIds, []);
  assert.deepEqual((await getStandaloneHighlights("no-other-brand", [withLegacy], false)).managedProductIds, []);
  rows.push({ ...base, id: "other-owned", cafe_id: "basilico" });
  assert.deepEqual((await getStandaloneHighlights("basilico", [product])).items.map((item) => item.id), ["other-owned"]);

  const { BistroMenu } = load("components/menu/bistro-menu.tsx");
  const menu = { name: "Rast", slug: "rast", logoUrl: null, description: null, products: [product], categories: [{ id: "coffee", name: "Coffee", description: null }], contacts: { feedbackEnabled: false, instagramUrl: null, location: null }, highlights };
  const render = (m) => renderToStaticMarkup(React.createElement(BistroMenu, { menu: m }));
  const active = render(menu);
  assert(active.includes('id="rast-spotlight-title"'));
  assert(active.includes("Featured coffee") && active.includes('dir="ltr">COFFEE</b>'));
  assert(active.includes('dir="ltr">16</b>'));
  assert(active.includes('aria-pressed="true"') && active.includes('aria-pressed="false"'));
  const fallback = render({ ...menu, highlights: { asOf: Date.now(), items: [] } });
  assert(fallback.includes('id="rast-spotlight-title"') && !fallback.includes('dir="ltr">COFFEE</b>'));
  const expired = render({ ...menu, highlights: { asOf: Date.now(), items: [{ ...highlights.items[0], expiresAt: 1 }] } });
  assert(!expired.includes("Featured coffee"));
  assert(!render({ ...menu, products: [], highlights: undefined }).includes('id="rast-spotlight-title"'));
  assert(!render({ ...menu, slug: "basilico" }).includes('id="rast-spotlight-title"'));
  // Expanded artwork is the editor preview only; public menu keeps its approved layout
  const { RastSpotlight } = load("components/menu/rast-spotlight.tsx");
  const preview = (items) => renderToStaticMarkup(React.createElement(RastSpotlight, { menu: { ...menu, highlights: { asOf: Date.now(), items } }, preview: true, onSelect() {} }));
  const general = preview(campaigns.items.filter((item) => item.id === "general"));
  assert(general.includes("على المنيو كاملًا") && general.includes("discountArt") && general.includes("20"));
  const eventHtml = preview([event]);
  assert(eventHtml.includes("eventArt") && eventHtml.includes("Rast branch") && eventHtml.includes("19:30") && !eventHtml.includes("كود العرض"));
  assert(!render({ ...menu, slug: "basilico", highlights: campaigns }).includes("eventArt"));
  require("postcss").parse(fs.readFileSync(path.join(root, "components/menu/rast-spotlight.module.css"), "utf8"));
  console.log("PASS Rast highlights: publication/date/tenant/product filters, owned media, safe DTO, expiry, discount, selector, fallback, empty state, brand isolation and CSS");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
