"use server";

import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { frenchCatalogText } from "@/lib/cashier/catalog-translation";

export async function fetchMindFrenchLabels(requested: string[]): Promise<[string, string][]> {
  if (!Array.isArray(requested) || requested.length > 64 || requested.some(name => typeof name !== "string" || name.length > 500)) return [];
  const { client, cafe } = await getBrandFinanceContext("mind-hospital");
  if (cafe.slug !== "mind-hospital") return [];
  const { data, error } = await client.rpc("brand_finance_snapshot", { p_cafe_id: cafe.id });
  if (error || !data) return [];
  const snapshot = data as FinanceSnapshot;
  const allowed = new Set([
    ...snapshot.products.flatMap(product => [product.name, product.category]),
    ...snapshot.accounts.map(account => account.name),
    ...snapshot.warehouses.map(warehouse => warehouse.name),
  ]);
  const names = [...new Set(requested)].filter(name => allowed.has(name));
  const result: [string, string][] = [];
  for (let offset = 0; offset < names.length; offset += 8) {
    const batch = names.slice(offset, offset + 8);
    const values = await Promise.allSettled(batch.map(frenchCatalogText));
    values.forEach((value, index) => { if (value.status === "fulfilled") result.push([batch[index], value.value]); });
    if (values.every(value => value.status === "rejected")) break;
  }
  return result;
}
