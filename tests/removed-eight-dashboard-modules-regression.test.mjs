import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const removedIds = [
  "pages",
  "advanced_coupons",
  "gift_cards_wallet",
  "coffee_subscriptions",
  "advanced_direct_orders",
  "marketplace_boost",
  "pos_integrations",
  "company_accounts",
];
const removedRoutes = [
  "/dashboard/pages",
  "/dashboard/advanced-coupons",
  "/dashboard/gift-cards-wallet",
  "/dashboard/coffee-subscriptions",
  "/dashboard/advanced-direct-orders",
  "/dashboard/marketplace-boost",
  "/dashboard/pos-integrations",
  "/dashboard/company-accounts",
];

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function collectOperationalFiles(directory, files = []) {
  const absolute = join(rootPath, directory);
  for (const entry of await readdir(absolute)) {
    if (entry.includes(".bak")) continue;
    const path = join(absolute, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      await collectOperationalFiles(relative(rootPath, path), files);
    } else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

test("removed feature ids and dashboard routes are absent from operational code", async () => {
  const files = [];
  for (const directory of ["app", "components", "lib"]) {
    await collectOperationalFiles(directory, files);
  }
  const violations = [];
  for (const path of files) {
    const content = await readFile(path, "utf8");
    for (const route of removedRoutes) {
      const exactRoute = new RegExp(`["']${route.replaceAll("/", "\\/")}["']`);
      if (exactRoute.test(content)) violations.push(`${relative(rootPath, path)}: ${route}`);
    }
    for (const id of removedIds) {
      const exactId = new RegExp(`["']${id}["']`);
      if (exactId.test(content)) violations.push(`${relative(rootPath, path)}: ${id}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("runtime registry, sidebar and public payload have no removed modules", async () => {
  const registry = await source("lib/platform/feature-registry.ts");
  const sidebar = await source("components/dashboard/DashboardSidebar.tsx");
  const publicPayload = await source("app/api/customer-fast/[slug]/route.ts");
  for (const value of [...removedIds, ...removedRoutes]) {
    assert.doesNotMatch(`${registry}\n${sidebar}\n${publicPayload}`, new RegExp(value.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(publicPayload, /cafe_pages|getPublicPagesBySlug|\bpages,/);
});

test("removal migration drops only proven exclusive database objects", async () => {
  const migration = await source("supabase/migrations/078_remove_eight_dashboard_modules.sql");
  for (const value of removedIds) assert.match(migration, new RegExp(`'${value}'`));
  assert.match(migration, /drop table if exists public\.cafe_pages/);
  assert.match(migration, /drop table if exists public\.brand_coupon_redemptions/);
  assert.match(migration, /drop table if exists public\.brand_coupons/);
  assert.match(migration, /drop function if exists public\.apply_brand_coupon_redemption/);
  assert.doesNotMatch(
    migration,
    /drop table if exists public\.(?:orders|order_items|offers|menu_products|customer_profiles|loyalty_cards|subscriptions|branches)/,
  );
});
