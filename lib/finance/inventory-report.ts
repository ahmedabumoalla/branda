import type { FinanceItem, FinanceSnapshot } from "./brand-finance";

export type InventoryStatus = "negative" | "zero" | "low" | "available";
export type InventoryFilter = InventoryStatus | "all" | "missing_cost" | "unlinked";
export type InventoryReportRow = {
  key: string;
  item: FinanceItem;
  warehouseId: string;
  warehouseName: string;
  active: boolean;
  quantity: number;
  averageCost: number | null;
  estimatedValue: number | null;
  missingCost: boolean;
  status: InventoryStatus;
  minimumQuantity: number;
  belowMinimum: number;
  productName: string | null;
};
export const inventoryStatusNames: Record<InventoryStatus, string> = {
  negative: "رصيد سالب", zero: "نفد المخزون", low: "عند حد التنبيه أو أقل", available: "متوفر",
};
export type InventoryReportFilters = {
  warehouseId?: string;
  search?: string;
  status?: InventoryFilter;
  includeInactive?: boolean;
};

/** Current balances only: movement history is capped and cannot reconstruct stock or turnover. */
export function buildInventoryReport(snapshot: Pick<FinanceSnapshot, "items" | "warehouses" | "stock" | "products">, filters: InventoryReportFilters = {}) {
  const stocks = new Map(snapshot.stock.map(stock => [`${stock.item_id}:${stock.warehouse_id}`, stock]));
  const products = new Map(snapshot.products.map(product => [product.id, product.name]));
  const query = (filters.search ?? "").trim().toLocaleLowerCase("ar");
  const rows: InventoryReportRow[] = [];
  for (const warehouse of snapshot.warehouses) {
    if (filters.warehouseId && warehouse.id !== filters.warehouseId) continue;
    for (const item of snapshot.items) {
      const active = item.active && warehouse.active;
      if (!filters.includeInactive && !active) continue;
      const key = `${item.id}:${warehouse.id}`;
      const stock = stocks.get(key);
      // Include active item/warehouse pairs with no balance so zero stock is visible.
      if (!active && !stock) continue;
      const quantity = stock?.quantity ?? 0;
      const minimumQuantity = Math.max(0, item.min_quantity);
      const status: InventoryStatus = quantity < 0 ? "negative" : quantity === 0 ? "zero" : quantity <= minimumQuantity ? "low" : "available";
      // Never substitute the item's all-warehouse average for the selected warehouse's cost.
      // A genuine zero-cost receipt is known; a positive number alone cannot prove the basis.
      const averageCost = stock?.cost_known === true && Number.isFinite(stock.average_cost) && stock.average_cost >= 0 ? stock.average_cost : null;
      const missingCost = quantity !== 0 && averageCost === null;
      const productName = item.menu_product_id ? products.get(item.menu_product_id) ?? null : null;
      if (query && ![item.name, item.sku, warehouse.name, productName ?? ""].some(value => value.toLocaleLowerCase("ar").includes(query))) continue;
      if (filters.status && filters.status !== "all") {
        if (filters.status === "missing_cost" ? !missingCost : filters.status === "unlinked" ? !!item.menu_product_id : status !== filters.status) continue;
      }
      rows.push({ key, item, warehouseId: warehouse.id, warehouseName: warehouse.name, active, quantity, averageCost,
        estimatedValue: quantity === 0 ? 0 : averageCost === null ? null : quantity * averageCost,
        missingCost, status, minimumQuantity, belowMinimum: Math.max(0, minimumQuantity - quantity), productName });
    }
  }
  const priority: Record<InventoryStatus, number> = { negative: 0, zero: 1, low: 2, available: 3 };
  rows.sort((a, b) => priority[a.status] - priority[b.status] || a.item.name.localeCompare(b.item.name, "ar") || a.warehouseName.localeCompare(b.warehouseName, "ar"));
  const summary = {
    items: new Set(rows.map(row => row.item.id)).size,
    warehouses: new Set(rows.map(row => row.warehouseId)).size,
    negative: rows.filter(row => row.status === "negative").length,
    zero: rows.filter(row => row.status === "zero").length,
    low: rows.filter(row => row.status === "low").length,
    missingCost: rows.filter(row => row.missingCost).length,
    estimatedValue: rows.reduce((sum, row) => sum + (row.estimatedValue ?? 0), 0),
    negativeEstimatedValue: rows.reduce((sum, row) => sum + (row.quantity < 0 ? row.estimatedValue ?? 0 : 0), 0),
  };
  return { rows, summary };
}

/** Pass these typed cells to the shared financeCsv/downloadFinanceCsv formula-safe serializer. */
export function inventoryReportCsvRows(rows: InventoryReportRow[]): (string | number)[][] {
  return [["الصنف", "الرمز", "المستودع", "الحالة", "الكمية الحالية", "الوحدة", "متوسط تكلفة المستودع", "القيمة التقديرية بالريال", "حد التنبيه", "الكمية للوصول إلى الحد", "توثيق التكلفة", "ربط المنيو", "النشاط"],
    ...rows.map(row => [row.item.name, row.item.sku, row.warehouseName, inventoryStatusNames[row.status], row.quantity, row.item.unit,
      row.averageCost ?? "غير متاحة", row.estimatedValue ?? "غير مكتملة", row.minimumQuantity, row.belowMinimum,
      row.missingCost ? "تحتاج مراجعة" : row.quantity === 0 && row.averageCost === null ? "لا يوجد رصيد للتقييم" : "متاحة",
      row.productName ?? (row.item.menu_product_id ? "منتج مرتبط غير ظاهر" : "صنف مستقل"), row.active ? "نشط" : "مؤرشف"] )];
}
