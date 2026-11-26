import type { FinanceItem } from "./brand-finance";

export type MenuCostLine = { itemId: string; name: string; unit: string; quantity: number; amount: number | null; divisor: number };
export type MenuServingCost = { amount: number | null; lines: MenuCostLine[] };
export type MenuServingCosts = Record<string, MenuServingCost>;

export function recipeLinks(item: FinanceItem) {
  return item.product_links ?? (item.menu_product_id ? [{ product_id: item.menu_product_id, quantity: 1 }] : []);
}

export function menuServingCosts(items: FinanceItem[], visible: Set<string>, live: Set<string>): MenuServingCosts {
  const costs: MenuServingCosts = {};
  for (const item of items) {
    if (!item.active) continue;
    const links = recipeLinks(item);
    const divisor = item.cost_mode === "equal_split" ? Math.max(1, links.filter(link => live.has(link.product_id)).length) : 1;
    for (const link of links) {
      if (!visible.has(link.product_id)) continue;
      const quantity = Number(link.quantity);
      const amount = item.cost_known ? Number((Number(item.average_cost) * quantity / divisor).toFixed(6)) : null;
      const cost = costs[link.product_id] ??= { amount: 0, lines: [] };
      cost.lines.push({ itemId: item.id, name: item.name, unit: item.unit, quantity, amount, divisor });
      cost.amount = cost.amount === null || amount === null ? null : cost.amount + amount;
    }
  }
  return costs;
}
