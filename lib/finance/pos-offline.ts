import type { FinanceCommand, FinanceCommandResult, FinanceDocument, FinanceSnapshot } from "./brand-finance";

export type OfflineStockDeduction = { item_id: string; warehouse_id: string; quantity: number };
export type OfflineSale = {
  id: string; scope: string; command: FinanceCommand; document: FinanceDocument;
  status: "queued" | "conflict" | "synced"; error?: string; result?: FinanceCommandResult;
  createdAt: string; localReference: string; reflected?: boolean; sequence?: number;
  stockDeductions?: OfflineStockDeduction[];
};
export type OfflineSession = { scope: string; snapshot: FinanceSnapshot; validatedAt: number; shellReady?: boolean };
export const posScope = (snapshot: Pick<FinanceSnapshot, "cafe" | "userId">) => `${snapshot.cafe.id}:${snapshot.userId}`;

/** Display units of the finished product for the selected warehouse, including deficits. */
export function getProductStockQuantity(product: FinanceSnapshot["products"][number], stock: FinanceSnapshot["stock"], warehouseId: string): number {
  const components = product.stock_components ?? (product.itemId ? [{ item_id: product.itemId, quantity: 1 }] : []);
  if (!components.length) return product.stock_components != null || !product.stockTracked ? Infinity : 0;
  let quantity = Infinity;
  for (const component of components) {
    if (!Number.isFinite(component.quantity) || component.quantity <= 0) return 0;
    const balance = stock.find(row => row.item_id === component.item_id && row.warehouse_id === warehouseId)?.quantity ?? 0;
    quantity = Math.min(quantity, balance / component.quantity);
  }
  const scaled = quantity * 1000;
  return Math.trunc(scaled + Math.sign(scaled) * Number.EPSILON * Math.max(1, Math.abs(scaled))) / 1000;
}

/** Persist the recipe used on this device without changing the immutable server command. */
export function offlineStockDeductions(snapshot: FinanceSnapshot, document: FinanceDocument): OfflineStockDeduction[] {
  if (!document.warehouse_id) return [];
  const products = new Map((snapshot.products ?? []).map(product => [product.id, product]));
  const deductions = new Map<string, number>();
  for (const line of document.lines) {
    const product = line.product_id ? products.get(line.product_id) : undefined;
    const legacyItemId = line.item_id ?? product?.itemId;
    const components = product?.stock_components ?? (legacyItemId ? [{ item_id: legacyItemId, quantity: 1 }] : []);
    for (const component of components) {
      if (!component.item_id || !Number.isFinite(component.quantity) || component.quantity <= 0 || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      const milliUnits = Math.round((line.quantity * component.quantity + Number.EPSILON) * 1000);
      deductions.set(component.item_id, (deductions.get(component.item_id) ?? 0) + milliUnits);
    }
  }
  return [...deductions].map(([item_id, milliUnits]) => ({ item_id, warehouse_id: document.warehouse_id!, quantity: milliUnits / 1000 }));
}

/** Replay local documents into the last server snapshot without double-counting acknowledged sales. */
export function projectOfflineSales(snapshot: FinanceSnapshot, sales: OfflineSale[]): FinanceSnapshot {
  const scoped = sales.filter(sale => sale.scope === posScope(snapshot));
  const authoritativeIds = new Set(snapshot.documents.map(document => document.id));
  const authoritativeReferences = new Set(snapshot.documents.map(document => document.local_reference).filter(Boolean));
  const isReflected = (sale: OfflineSale) => authoritativeIds.has(sale.document.id) || authoritativeReferences.has(sale.localReference);
  const pending = scoped.filter(sale => (sale.status !== "synced" || !sale.reflected) && !isReflected(sale));
  const known = scoped.filter(sale => !isReflected(sale));
  const stock = new Map(snapshot.stock.map(row => [`${row.warehouse_id}:${row.item_id}`, { ...row }]));
  for (const sale of pending) {
    for (const deduction of sale.stockDeductions ?? offlineStockDeductions(snapshot, sale.document)) {
      const key = `${deduction.warehouse_id}:${deduction.item_id}`;
      const row = stock.get(key) ?? { item_id: deduction.item_id, warehouse_id: deduction.warehouse_id, quantity: 0, average_cost: 0, cost_known: false };
      stock.set(key, { ...row, quantity: (Math.round(row.quantity * 1000) - Math.round(deduction.quantity * 1000)) / 1000 });
    }
  }
  return {
    ...snapshot,
    documents: [...known.map(sale => ({ ...sale.document, local_reference: sale.localReference, sync_status: sale.status })), ...snapshot.documents.map(document => {
      const local = scoped.find(sale => sale.document.id === document.id || sale.localReference === document.local_reference);
      return local ? { ...document, local_reference: local.localReference, sync_status: local.status } : document;
    })],
    accounts: snapshot.accounts.map(account => ({ ...account, balance: account.balance + pending.filter(sale => sale.document.account_id === account.id).reduce((sum, sale) => sum + sale.document.paid, 0) })),
    stock: [...stock.values()],
  };
}

export function pendingSales(sales: OfflineSale[]) { return sales.filter(sale => sale.status !== "synced"); }

export type PosSyncResponse = { ok: true; data: FinanceCommandResult; snapshot?: FinanceSnapshot } | { ok: false; kind: "auth" | "conflict" | "retry"; message: string };

/** FIFO with durable acknowledgement; uncertain network results keep the same request ID. */
export async function drainOfflineSales(dependencies: {
  list: () => Promise<OfflineSale[]>;
  send: (sale: OfflineSale) => Promise<PosSyncResponse>;
  acknowledge: (sale: OfflineSale, response: Extract<PosSyncResponse, { ok: true }>) => Promise<void>;
  conflict: (sale: OfflineSale, message: string) => Promise<void>;
  authRequired: (message: string) => void;
}) {
  const sales = (await dependencies.list()).filter(sale => sale.status !== "synced").sort((a, b) => a.sequence != null && b.sequence != null ? a.sequence - b.sequence : a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const sale of sales) {
    if (sale.status === "conflict") return;
    let response: PosSyncResponse;
    try { response = await dependencies.send(sale); } catch { return; }
    if (!response.ok) {
      if (response.kind === "auth") dependencies.authRequired(response.message);
      else if (response.kind === "conflict") await dependencies.conflict(sale, response.message);
      return;
    }
    // If storage fails after server commit, the row remains queued and the server deduplicates the retry.
    await dependencies.acknowledge(sale, response);
  }
}
