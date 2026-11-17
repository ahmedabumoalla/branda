/** Aldeem is a sweets retailer: sale products are inventory items. */
export const isAldeemStockCatalog = (slug?: string) => slug === "khayal-aldeem";

export function retailProductNeedsSetup(item: { meta: { kind: string; payload: Record<string, unknown> } }) {
  const price = item.meta.payload.salePrice;
  return item.meta.kind === "product" && (price === undefined || price === null || price === "" || !Number.isFinite(Number(price)));
}
