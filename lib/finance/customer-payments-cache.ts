import type { FinanceSnapshot } from "./brand-finance";
import type { CustomerPaymentDetail, CustomerPaymentRow } from "./customer-payment";
import { createBoundedCache } from "@/lib/performance/bounded-cache";

export type CustomerPaymentsRead = {
  items: CustomerPaymentRow[];
  total: number;
  detail?: CustomerPaymentDetail;
};

// A fresh authorized snapshot (including saves, refreshes or branch changes)
// replaces the scope. Never persist customer data across sessions or to disk.
const scopes = new WeakMap<FinanceSnapshot, ReturnType<typeof createBoundedCache>>();
export function customerPaymentsCache(snapshot: FinanceSnapshot) {
  let cache = scopes.get(snapshot);
  if (!cache) {
    cache = createBoundedCache(16, 4_000_000);
    scopes.set(snapshot, cache);
  }
  return cache;
}
export const customerPaymentsCacheTtl = 30_000;
