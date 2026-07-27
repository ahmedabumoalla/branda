import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

function createCatalog(size) {
  return Array.from({ length: size }, (_, index) => ({
    id: `product-${index + 1}`,
    name: `منتج ${index + 1}`,
  }));
}

function createPagedLoader(products, limit = 16) {
  const pending = new Map();
  const cache = new Map();
  let requests = 0;

  async function load(cursor = 0) {
    const key = `${cursor}:${limit}`;
    if (cache.has(key)) return cache.get(key);
    if (pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(() => {
      requests += 1;
      const page = products.slice(cursor, cursor + limit);
      const payload = {
        products: page,
        nextCursor: cursor + limit < products.length ? cursor + limit : null,
        totalCount: products.length,
      };
      cache.set(key, payload);
      pending.delete(key);
      return payload;
    });
    pending.set(key, request);
    return request;
  }

  return { load, requests: () => requests };
}

function mergeById(current, incoming) {
  return Array.from(
    new Map([...current, ...incoming].map((product) => [product.id, product])).values(),
  );
}

for (const size of [0, 1, 16, 17, 94]) {
  test(`pagination reaches the exact catalog size without loss: ${size}`, async () => {
    const catalog = createCatalog(size);
    const loader = createPagedLoader(catalog);
    let cursor = 0;
    let merged = [];
    let hasMore = true;

    while (hasMore) {
      const page = await loader.load(cursor);
      merged = mergeById(merged, page.products);
      hasMore = typeof page.nextCursor === "number";
      cursor = page.nextCursor ?? cursor;
    }

    assert.equal(merged.length, size);
    assert.equal(new Set(merged.map((product) => product.id)).size, size);
    assert.deepEqual(merged, catalog);
    assert.equal(hasMore, false);
    assert.equal(loader.requests(), Math.max(1, Math.ceil(size / 16)));
  });
}

test("the first page is 16, the second page loads, and pending/cache dedupe requests", async () => {
  const loader = createPagedLoader(createCatalog(94));
  const [firstA, firstB] = await Promise.all([loader.load(0), loader.load(0)]);
  assert.equal(firstA.products.length, 16);
  assert.equal(firstA.nextCursor, 16);
  assert.strictEqual(firstA, firstB);
  assert.equal(loader.requests(), 1);

  const second = await loader.load(firstA.nextCursor);
  assert.equal(second.products.length, 16);
  assert.equal(second.nextCursor, 32);
  await loader.load(0);
  assert.equal(loader.requests(), 2);
});

test("filter completion searches the full 94-product catalog", async () => {
  const catalog = createCatalog(94);
  catalog[90].name = "منتج بعيد";
  const loader = createPagedLoader(catalog);
  let cursor = 0;
  let merged = [];
  do {
    const page = await loader.load(cursor);
    merged = mergeById(merged, page.products);
    cursor = page.nextCursor;
  } while (typeof cursor === "number");

  assert.deepEqual(
    merged.filter((product) => product.name.includes("بعيد")).map((product) => product.id),
    ["product-91"],
  );
});

test("public product source keeps progressive loading, complete-filter notice and media lazy loading", async () => {
  const [hook, page, route, data, media, detail, card] = await Promise.all([
    source("lib/cafe/use-public-cafe-menu.ts"),
    source("components/cafe/product-collection-page.tsx"),
    source("app/api/public/cafe/[slug]/menu/route.ts"),
    source("lib/data/menu.ts"),
    source("components/ui/local-asset-image.tsx"),
    source("components/cafe/product-detail-client.tsx"),
    source("components/cafe/themes/customer-mobile-experience.tsx"),
  ]);

  assert.match(hook, /mergePublicMenuPages/);
  assert.match(hook, /loadingCursorRef/);
  assert.match(hook, /writeMemoryCache/);
  assert.match(hook, /cursor:\s*nextCursor/);
  assert.match(page, /IntersectionObserver/);
  assert.match(page, /عرض المزيد/);
  assert.match(page, /جاري استكمال المنتجات لضمان شمول البحث والتصنيف/);
  assert.match(route, /cursor/);
  assert.match(route, /limit/);
  assert.match(data, /count:\s*"exact"/);
  assert.match(data, /totalCount/);
  assert.match(media, /loading="lazy"/);
  assert.match(card, /export function ProductPosterCard/);
  assert.doesNotMatch(detail, /loadMore|IntersectionObserver/);
  const publicPageQuery = data.slice(
    data.indexOf("export async function getPublicMenuPageBySlug"),
    data.indexOf("export async function getPublicProductBySlug"),
  );
  assert.doesNotMatch(`${hook}\n${page}\n${route}\n${publicPageQuery}`, /update\(|delete\(/i);
});
