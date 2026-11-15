import { useFinance } from "../../components/finance/use-finance";
import type { FinanceSnapshot } from "../../lib/finance/brand-finance";
import type { OfflineSale } from "../../lib/finance/pos-offline";
import type { ReceiptBrand } from "../../components/finance/finance-receipt-print";
export function usePosFinance(snapshot: FinanceSnapshot, slug?: string) {
  const base = useFinance(snapshot, slug);
  return { ...base, offline: { ready: true, connected: true, syncing: base.pending, blocked: base.stale, assetsStatus: "تحفظ العمليات مباشرة في قاعدة البيانات على هذا الجهاز", brand: null as ReceiptBrand | null, sales: [] as OfflineSale[], pending: [] as OfflineSale[], retry: base.refresh, logout: async () => {} } };
}
