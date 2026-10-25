import type { FinanceCommand, FinanceCommandResult, FinanceDocument, FinanceSnapshot } from "./brand-finance";

export type OfflineSale = {
  id: string; scope: string; command: FinanceCommand; document: FinanceDocument;
  status: "queued" | "conflict" | "synced"; error?: string; result?: FinanceCommandResult;
  createdAt: string; localReference: string; reflected?: boolean; sequence?: number;
};
export type OfflineSession = { scope: string; snapshot: FinanceSnapshot; validatedAt: number; shellReady?: boolean };
export const posScope = (snapshot: Pick<FinanceSnapshot, "cafe" | "userId">) => `${snapshot.cafe.id}:${snapshot.userId}`;

/** Replay local documents into the last server snapshot without double-counting acknowledged sales. */
export function projectOfflineSales(snapshot: FinanceSnapshot, sales: OfflineSale[]): FinanceSnapshot {
  const scoped = sales.filter(sale => sale.scope === posScope(snapshot));
  const authoritativeIds = new Set(snapshot.documents.map(document => document.id));
  const authoritativeReferences = new Set(snapshot.documents.map(document => document.local_reference).filter(Boolean));
  const isReflected = (sale: OfflineSale) => authoritativeIds.has(sale.document.id) || authoritativeReferences.has(sale.localReference);
  const pending = scoped.filter(sale => (sale.status !== "synced" || !sale.reflected) && !isReflected(sale));
  const known = scoped.filter(sale => !isReflected(sale));
  return {
    ...snapshot,
    documents: [...known.map(sale => ({ ...sale.document, local_reference: sale.localReference, sync_status: sale.status })), ...snapshot.documents.map(document => {
      const local = scoped.find(sale => sale.document.id === document.id || sale.localReference === document.local_reference);
      return local ? { ...document, local_reference: local.localReference, sync_status: local.status } : document;
    })],
    accounts: snapshot.accounts.map(account => ({ ...account, balance: account.balance + pending.filter(sale => sale.document.account_id === account.id).reduce((sum, sale) => sum + sale.document.paid, 0) })),
    stock: snapshot.stock.map(stock => ({ ...stock, quantity: stock.quantity - pending.filter(sale => sale.document.warehouse_id === stock.warehouse_id).reduce((sum, sale) => sum + sale.document.lines.filter(line => line.item_id === stock.item_id).reduce((amount, line) => amount + line.quantity, 0), 0) })),
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
