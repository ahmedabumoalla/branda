import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

function summaries(size, slug = "brand-a") {
  return Array.from({ length: size }, (_, index) => ({
    id: `${slug}-${index + 1}`,
    name: index === size - 1 ? `منتج خاص ${index + 1}` : `منتج ${index + 1}`,
    price: (index % 50) + 1,
    available: true,
    categoryId: index % 2 ? "hot" : "cold",
    category: index % 2 ? "ساخن" : "بارد",
    imageAssetId: `cover-${index + 1}.webp`,
    promo:
      index % 5 === 0
        ? {
            kind: "خصم",
            discountMode: "percent",
            discountPercent: 10,
            startDate: "2026-01-01",
            endDate: "2026-12-31",
          }
        : null,
  }));
}

for (const size of [0, 1, 16, 94, 122, 250]) {
  test(`one catalog response contains every lightweight summary: ${size}`, () => {
    const products = summaries(size);
    const payload = { products, categories: [], totalCount: products.length };
    assert.equal(payload.products.length, size);
    assert.equal(payload.totalCount, payload.products.length);
    assert.equal(new Set(products.map((product) => product.id)).size, size);
    assert.equal("cursor" in payload, false);
    assert.equal("nextCursor" in payload, false);
  });
}

test("local search, category, price and offer filters cover the complete catalog", () => {
  const products = summaries(122);
  assert.deepEqual(
    products.filter((product) => product.name.includes("خاص")).map((product) => product.id),
    ["brand-a-122"],
  );
  assert.equal(products.filter((product) => product.categoryId === "hot").length, 61);
  assert.equal(products.filter((product) => product.price < 20).length, 57);
  assert.equal(products.filter((product) => Boolean(product.promo)).length, 25);
});

test("catalog cache is tenant scoped and deduplicates a pending request", async () => {
  const cache = new Map();
  const pending = new Map();
  let requests = 0;
  async function load(slug) {
    const key = `public-product-catalog-summary:${slug}`;
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(() => {
      requests += 1;
      const products = summaries(2, slug);
      const payload = { products, categories: [], totalCount: products.length };
      cache.set(key, payload);
      pending.delete(key);
      return payload;
    });
    pending.set(key, request);
    return request;
  }

  const [a1, a2] = await Promise.all([load("brand-a"), load("brand-a")]);
  const b = await load("brand-b");
  assert.strictEqual(a1, a2);
  assert.equal(requests, 2);
  assert.notDeepEqual(a1.products, b.products);
  await load("brand-a");
  assert.equal(requests, 2);
});

test("catalog implementation has one summary request and no scroll pagination", async () => {
  const [page, hook, route, data, summaryType, card, image, detailRoute, detail] =
    await Promise.all([
      source("components/cafe/product-collection-page.tsx"),
      source("lib/cafe/use-public-product-catalog.ts"),
      source("app/api/public/cafe/[slug]/catalog/route.ts"),
      source("lib/data/menu.ts"),
      source("lib/cafe/public-product-summary.ts"),
      source("components/cafe/themes/customer-mobile-experience.tsx"),
      source("components/ui/local-asset-image.tsx"),
      source("app/api/public/cafe/[slug]/products/[id]/route.ts"),
      source("components/cafe/product-detail-client.tsx"),
    ]);
  const catalogQuery = data.slice(
    data.indexOf("export async function getPublicProductCatalogSummaryBySlug"),
    data.indexOf("export async function getPublicMenuBySlug"),
  );

  for (const forbidden of [
    "IntersectionObserver",
    "loadMore",
    "loadingMore",
    "hasMore",
    "paginationSentinel",
    "عرض المزيد",
    "تم عرض",
    "barndaksa-stagger-grid",
  ]) {
    assert.doesNotMatch(page, new RegExp(forbidden));
  }
  assert.doesNotMatch(hook, /cursor|nextCursor|scroll|poll/i);
  assert.match(hook, /public-product-catalog-summary:/);
  assert.match(hook, /cachedRequest/);
  assert.match(route, /getPublicProductCatalogSummaryBySlug/);
  assert.doesNotMatch(route, /cursor|nextCursor/);
  assert.doesNotMatch(catalogQuery, /select\("\*"\)|attachEventTicketSettings|event_ticket_settings/);
  assert.match(
    catalogQuery,
    /id,category_id,legacy_category,name,image_url,image_storage_path,price,available,promo/,
  );
  for (const field of [
    "description",
    "ingredients",
    "calories",
    "videoAssetId",
    "videoStoragePath",
    "imageGallery",
    "media",
    "eventTicketSettings",
  ]) {
    assert.doesNotMatch(summaryType, new RegExp(field));
  }
  assert.match(card, /prefetch=\{false\}/);
  assert.match(card, /isSummary/);
  assert.match(card, /LocalAssetImage/);
  assert.match(image, /loading="lazy"/);
  assert.doesNotMatch(page, /ProductMediaDisplay|<video|router\.prefetch/);
  assert.match(page, /product\/\$\{item\.id\}/);
  assert.match(detailRoute, /getPublicProductBySlug/);
  assert.doesNotMatch(detail, /usePublicProductCatalog/);
  assert.doesNotMatch(`${page}\n${hook}\n${route}\n${catalogQuery}`, /update\(|delete\(/i);
});
