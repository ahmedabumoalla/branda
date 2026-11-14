import type { FinanceSnapshot } from "./brand-finance";
import type { InvoiceSettingsState } from "./invoice-settings";
import { createBoundedCache } from "@/lib/performance/bounded-cache";

export type EditableInvoiceSettings = InvoiceSettingsState & { canEdit: boolean };
// A new authenticated snapshot (including a mutation/refresh) gets a new cache.
// Weak keys isolate sessions/tenants and release memory when the workspace closes.
const scopes = new WeakMap<FinanceSnapshot, ReturnType<typeof createBoundedCache>>();
export function invoiceSettingsCache(snapshot: FinanceSnapshot) {
  let cache = scopes.get(snapshot);
  if (!cache) { cache = createBoundedCache(2, 2_000_000); scopes.set(snapshot, cache); }
  return cache;
}
export const invoiceSettingsCacheTtl = 5 * 60 * 1000;
