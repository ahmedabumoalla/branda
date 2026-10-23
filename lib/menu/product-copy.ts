import type { MenuProduct } from "@/lib/mock/menu";

/** A detached editor draft; only the normal authenticated save publishes it. */
export function createProductCopy(product: MenuProduct, products: MenuProduct[]): MenuProduct {
  const copy = structuredClone(product);
  const base = `${product.name} - نسخة`;
  let name = base;
  let suffix = 2;
  const names = new Set(products.map((item) => item.name));
  while (names.has(name)) name = `${base} ${suffix++}`;
  return { ...copy, id: crypto.randomUUID(), name };
}
