'use client';
import { readFinancePosPurchases } from '@/app/actions/finance-pos-purchases';
import type { PosPurchaseCatalog } from '@/lib/finance/pos-purchases';

const entries = new Map<string, { value?: PosPurchaseCatalog; at: number; pending?: ReturnType<typeof readFinancePosPurchases> }>();
export const posPurchaseKey = (slug: string, user: string, shift: string) => `${slug}:${user}:${shift}`;
export function peekPosPurchases(key: string) { return entries.get(key)?.value ?? null; }
export function loadPosPurchases(slug: string, user: string, shift: string, force = false) {
  const key = posPurchaseKey(slug, user, shift);
  const entry = entries.get(key) ?? { at: 0 };
  if (entry.pending) return entry.pending;
  if (!force && entry.value && Date.now() - entry.at < 60_000) return Promise.resolve({ ok: true as const, data: entry.value });
  const pending = readFinancePosPurchases(slug, shift).then(result => {
    if (result.ok) { entry.value = result.data; entry.at = Date.now(); }
    return result;
  }).finally(() => { entry.pending = undefined; });
  entry.pending = pending; entries.set(key, entry);
  if (entries.size > 8) entries.delete(entries.keys().next().value!);
  return pending;
}
export function invalidatePosPurchases(slug: string, user: string, shift: string) {
  const entry = entries.get(posPurchaseKey(slug, user, shift));
  if (entry) entry.at = 0;
}
