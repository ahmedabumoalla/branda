import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("dashboard uses count queries and a five-row recent order limit", async () => {
  const page = await source("app/dashboard/page.tsx");
  const data = await source("lib/data/dashboard-home.ts");

  assert.doesNotMatch(page, /getOwnerOrders|getCafeCustomers|getOwnerMenu|getOwnerExperienceData/);
  assert.ok((data.match(/count:\s*"exact",\s*head:\s*true/g) ?? []).length >= 4);
  assert.match(data, /\.limit\(safeLimit\)/);
  assert.match(data, /Math\.min\(Math\.max\(limit,\s*1\),\s*5\)/);
  assert.match(page, /Suspense/);
});

test("bootstrap payload contains shell data and no page resources", async () => {
  const route = await source("app/api/public/cafe/[slug]/fast/route.ts");
  const client = await source("lib/cafe/public-cafe-fast-layer.ts");
  const combined = `${route}\n${client}`;

  assert.doesNotMatch(combined, /getPublicMenuBySlug|getPublicOffersBySlug|getPublicExperienceCampaigns|getPublicBranchesBySlug/);
  assert.doesNotMatch(combined, /\bmenu:\s*|products:\s*\[|offers:\s*\[|loyaltyRewards|experienceCampaigns/);
  assert.match(route, /public-cafe-bootstrap-v2/);
});

test("public resources are page-scoped, paginated and tenant-scoped", async () => {
  const products = await source("app/api/public/cafe/[slug]/menu/route.ts");
  const offers = await source("app/api/public/cafe/[slug]/offers/route.ts");
  const detail = await source("app/api/public/cafe/[slug]/products/[id]/route.ts");
  const menuData = await source("lib/data/menu.ts");

  assert.match(products, /limit.*20/);
  assert.match(products, /public-products:\$\{normalizedSlug\}/);
  assert.match(offers, /public-offers:\$\{normalizedSlug\}/);
  assert.match(detail, /public-product:\$\{normalizedSlug\}:\$\{id\}/);
  assert.match(menuData, /\.eq\("cafe_id", cafe\.id\)/);
  assert.match(menuData, /\.range\(cursor, cursor \+ limit\)/);
});

test("browser resources use memory cache and in-flight request deduplication", async () => {
  const hook = await source("lib/cafe/use-public-cafe-menu.ts");
  const cache = await source("lib/performance/browser-cache.ts");
  const layout = await source("app/c/[slug]/layout.tsx");
  const dock = await source("components/cafe/themes/customer-mobile-experience.tsx");

  assert.match(hook, /cachedRequest\(resourceKey/);
  assert.match(hook, /readMemoryCache/);
  assert.match(cache, /const inFlight = new Map/);
  assert.match(cache, /if \(pending\) return pending/);
  assert.match(layout, /CafeThemePageProvider/);
  assert.match(dock, /prefetch=\{false\}/);
  assert.match(dock, /onPointerEnter/);
  assert.match(dock, /onTouchStart/);
  assert.match(dock, /router\.prefetch/);
});

test("removed systems stay absent from the rebuilt dashboard and bootstrap", async () => {
  const files = [
    await source("app/dashboard/page.tsx"),
    await source("components/dashboard/dashboard-home-client.tsx"),
    await source("components/dashboard/dashboard-home-sections.tsx"),
    await source("app/api/public/cafe/[slug]/fast/route.ts"),
  ].join("\n");

  assert.doesNotMatch(files, /reservations|product_reviews|product_questions|marketing_tools|branda.finance/i);
});
