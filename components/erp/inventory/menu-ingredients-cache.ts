import { loadInventoryMenuIngredients } from "@/app/actions/inventory-menu-ingredients";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";

// Session memory for the menu ingredients dialog. The server read returns the same inventory snapshot
// for every product of the brand, so the dialog shows the last snapshot at once and still asks the
// server about the opened product in the background. Nothing is stored outside this browser tab.
export type MenuIngredientsResult = Awaited<ReturnType<typeof loadInventoryMenuIngredients>>;

const FRESH_MS = 60_000;
const pending = new Map<string, Promise<MenuIngredientsResult>>();
const verifiedAt = new Map<string, number>();
const snapshots = new Map<string, FinanceSnapshot>();

const keyOf = (slug: string, productId: string) => `${slug}:${productId}`;

/** One server read per product at a time; concurrent callers share it. */
export function requestMenuIngredients(slug: string, productId: string): Promise<MenuIngredientsResult> {
  const key = keyOf(slug, productId);
  const running = pending.get(key);
  if (running) return running;
  const promise = loadInventoryMenuIngredients(slug, productId).then(result => {
    if (result.ok) { snapshots.set(slug, result.snapshot); verifiedAt.set(key, Date.now()); }
    return result;
  }).finally(() => { pending.delete(key); });
  pending.set(key, promise);
  return promise;
}

/** Last snapshot for the brand, only when it already lists this menu product. */
export function cachedMenuIngredients(slug: string, productId: string) {
  const snapshot = snapshots.get(slug);
  return snapshot?.products.some(product => product.id === productId) ? snapshot : undefined;
}

/** True while the server confirmed this exact product within the last minute. */
export function isMenuIngredientsFresh(slug: string, productId: string) {
  const at = verifiedAt.get(keyOf(slug, productId));
  return at !== undefined && Date.now() - at < FRESH_MS;
}

export function rememberMenuIngredients(slug: string, snapshot: FinanceSnapshot) {
  snapshots.set(slug, snapshot);
}

/** A read for another product of the same brand that is still running, if any. */
export function pendingMenuIngredients(slug: string) {
  for (const [key, promise] of pending) if (key.startsWith(`${slug}:`)) return promise;
  return undefined;
}

/** Starts the first read on intent. Later opens reuse the snapshot, so hovering many cards costs one read. */
export function prewarmMenuIngredients(slug: string, productId: string) {
  if (snapshots.has(slug) || pendingMenuIngredients(slug)) return;
  void requestMenuIngredients(slug, productId).catch(() => undefined);
}
