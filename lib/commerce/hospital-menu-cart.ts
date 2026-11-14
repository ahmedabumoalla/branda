import type { StandaloneMenuProduct } from "@/lib/menu/standalone-menu";

export type HospitalCartLine = { productId: string; quantity: number; priceOptionIndex?: number };
export function hospitalLineKey(line: Pick<HospitalCartLine, "productId" | "priceOptionIndex">) {
  return `${line.productId}:${line.priceOptionIndex ?? "base"}`;
}
export function hospitalProductPrice(product: StandaloneMenuProduct, priceOptionIndex?: number) {
  if (product.available === false) return null;
  if (product.priceOptions?.length) {
    if (priceOptionIndex === undefined || !Number.isInteger(priceOptionIndex)) return null;
    const price = product.priceOptions[priceOptionIndex];
    return typeof price === "number" && Number.isFinite(price) && price >= 0 ? { min: price, max: price } : null;
  }
  if (priceOptionIndex !== undefined || !Number.isFinite(product.price) || product.price < 0) return null;
  const range = product.priceRange;
  return { min: product.price, max: range && range.min === product.price && Number.isFinite(range.max) && range.max > product.price ? range.max : product.price };
}
export function hospitalCartTotal(products: StandaloneMenuProduct[], lines: HospitalCartLine[]) {
  let min = 0, max = 0;
  for (const line of lines) {
    const product = products.find(item => item.id === line.productId);
    const price = product && hospitalProductPrice(product, line.priceOptionIndex);
    if (!price || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) return null;
    min += Math.round(price.min * 100) * line.quantity;
    max += Math.round(price.max * 100) * line.quantity;
  }
  return { min: min / 100, max: max / 100 };
}
