// Offline regression checks; --live also checks the public Souda menu and downloads its images.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

function load(relative) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", source)((name) => {
    if (name === "node:dns/promises") return { lookup: async () => [{ address: "203.0.113.10" }] };
    return name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
  }, exports);
  return exports;
}

const { analyzeMenuUrl } = load("lib/menu-import/url-extractor.ts");
const sourceUrl = "https://menu.example/menu";
const originalFetch = global.fetch;
async function analyze(html) {
  global.fetch = async () => new Response(html, { headers: { "content-type": "text/html" } });
  return analyzeMenuUrl(sourceUrl);
}

async function checkLiveMenu() {
  const menuUrl = "https://souda.rast-coffee.com/";
  const response = await originalFetch(menuUrl, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  const expected = new Map();
  let cardCount = 0;
  // Read the source's explicit fields independently of the extractor's nested-card parser.
  const sections = html.split(/<h3 class="category-title">/).slice(1);
  for (const section of sections) {
    const categoryName = section.split("</h3>")[0].replace(/\s+/g, " ").trim();
    for (const card of section.split('<div class="product-card">').slice(1)) {
      cardCount += 1;
      const productName = card.match(/<h4 class="product-name">([^<]+)<\/h4>/)[1].replace(/\s+/g, " ").trim();
      const price = Number(card.match(/<div class="product-price">\s*([\d.]+)/)[1]);
      const imageUrl = new URL(card.match(/<img src="([^"]+)"/)[1], menuUrl).href;
      const key = `${categoryName}:${productName}`.toLowerCase();
      if (!expected.has(key)) expected.set(key, { categoryName, productName, price, imageUrl });
    }
  }
  assert.ok(cardCount > 0, "The live fixture must contain product cards");
  global.fetch = async () => new Response(html, { headers: { "content-type": "text/html" } });
  const result = await analyzeMenuUrl(menuUrl);
  assert.deepEqual(result.items.map(({ categoryName, productName, price, imageUrl }) =>
    ({ categoryName, productName, price, imageUrl })), [...expected.values()]);
  assert.equal(result.report.withoutImageCount, 0);
  assert.equal(result.report.withoutPriceCount, 0);
  const pending = [...new Set(result.items.map((item) => item.imageUrl))];
  const imageCount = pending.length;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) {
      const imageUrl = pending.pop();
      assert.equal(new URL(imageUrl).origin, new URL(menuUrl).origin);
      const image = await originalFetch(imageUrl, { signal: AbortSignal.timeout(8000) });
      assert.equal(image.status, 200, imageUrl);
      assert.ok(["image/jpeg", "image/png", "image/webp", "image/avif"].includes(image.headers.get("content-type").split(";")[0]));
      const bytes = await image.arrayBuffer();
      assert.ok(bytes.byteLength > 0 && bytes.byteLength <= 10 * 1024 * 1024);
    }
  }));
  console.log(`PASS: live Souda menu: ${cardCount} cards, ${result.items.length} unique products, ${imageCount} images downloaded; all names, categories, prices and image URLs match the source.`);
}

async function run() {
  // Matches the public Souda page structure: calories precede the h4 name and price.
  const result = await analyze(`
    <h3 class="category-title">Hot Drinks</h3><div class="products-grid">
      <div class="product-card"><div class="product-image-container">
        <img src="/turkish.jpeg" alt="Turkish coffee"><div class="product-calories">🔥 5</div>
      </div><div class="product-info"><h4 class="product-name">Turkish coffee</h4>
        <div class="product-price">20 SAR</div></div></div>
      <div class="product-card"><div class="product-image-container">
        <img data-src="/v60.jpeg?size=large&amp;fit=cover" alt="">
        <div class="product-calories">🔥 100</div></div><div class="product-info">
        <h4 class="product-name">V60 (Colombia)</h4><div class="product-price"><span>18</span> SAR</div>
      </div></div></div>
    <h3 class="category-title">Cold Drinks</h3><div class="products-grid">
      <div class="product-card"><div class="product-info"><h4 class="product-name">Turkish coffee iced</h4>
        <div class="product-price">24 SAR</div></div></div>
      <div class="product-card"><h4 class="product-name">Ask for price</h4>
        <div class="product-calories">🔥 90</div></div></div>
    <footer><img src="/logo.svg" alt="logo"><div class="product-price">Delivery 99 SAR</div></footer>`);
  assert.deepEqual(result.items.map(({ categoryName, productName, price, calories, imageUrl }) =>
    ({ categoryName, productName, price, calories, imageUrl })), [
    { categoryName: "Hot Drinks", productName: "Turkish coffee", price: 20, calories: 5, imageUrl: "https://menu.example/turkish.jpeg" },
    { categoryName: "Hot Drinks", productName: "V60 (Colombia)", price: 18, calories: 100, imageUrl: "https://menu.example/v60.jpeg?size=large&fit=cover" },
    { categoryName: "Cold Drinks", productName: "Turkish coffee iced", price: 24, calories: null, imageUrl: null },
    { categoryName: "Cold Drinks", productName: "Ask for price", price: null, calories: 90, imageUrl: null },
  ]);
  assert.equal(result.report.extractedCount, 4);
  assert.equal(result.report.withoutImageCount, 2);
  assert.equal(result.items[3].status, "needs_review");

  const legacy = await analyze(`<h2 class="menu-title">Lunch</h2><div class="menu-item">
    <div class="menu-item-image"><img src="/soup.jpg" alt="Soup"></div>
    <h4>Soup</h4><span class="price-value">12.50 SAR</span></div>`);
  assert.equal(legacy.items.length, 1);
  assert.equal(legacy.items[0].price, 12.5);
  assert.equal(legacy.items[0].productName, "Soup");
  assert.equal(legacy.items[0].imageUrl, "https://menu.example/soup.jpg");

  const uncategorized = await analyze(`<div class="product-card"><h4 class="product-name">Tea</h4>
    <span class="product-price">10 SAR</span><img src="/tea.jpg"></div>`);
  assert.equal(uncategorized.items.length, 1);
  assert.equal(uncategorized.items[0].price, 10);
  const hiddenCards = await analyze(`<style>.test { content: '<div class="product-card">'; }</style>
    <!-- <div class="product-card"><h4>Hidden</h4><span class="price">99 SAR</span></div> -->
    <h2 class="menu-title">Drinks</h2><div class="product-card"><h4>Tea</h4><span class="price">10 SAR</span></div>`);
  assert.deepEqual(hiddenCards.items.map((item) => item.productName), ["Tea"]);

  const jsonLd = await analyze(`<script type="application/ld+json">{"@type":"MenuItem","name":"Cake","offers":{"price":30},"image":"https://menu.example/cake.jpg"}</script><p>Delivery 99 SAR</p>`);
  assert.deepEqual(jsonLd.items.map((item) => item.productName), ["Cake"]);
  const nextData = await analyze(`<script id="__NEXT_DATA__">{"props":{"items":[{"name":"Tea","price":10,"image":"https://menu.example/tea.jpg"}]}}</script><p>Delivery 99 SAR</p>`);
  assert.deepEqual(nextData.items.map((item) => item.productName), ["Tea"]);
  const textOnly = await analyze("<h2>Drinks</h2><p>Tea 10 SAR</p>");
  assert.equal(textOnly.items[0].productName, "Tea");
  assert.equal(textOnly.items[0].price, 10);
  console.log("PASS: Souda card association, bounded fields, fallback priority, legacy menu cards, JSON-LD, Next data, text-only.");
  if (process.argv.includes("--live")) await checkLiveMenu();
}

run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
