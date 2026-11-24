import "server-only";
import groups from "@/lib/menu/awj-catalog.json";
import { AWJ_ASSETS, AWJ_ID } from "@/lib/menu/awj";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";

export function awjPreview(menu: StandaloneMenu): StandaloneMenu {
  if (process.env.NODE_ENV !== "development" || process.env.BRANDA_AWJ_PREVIEW !== "true"
    || menu.cafeId !== AWJ_ID || menu.branch || menu.products.length || menu.categories.length) return menu;
  return {
    ...menu,
    categories: groups.map(g => ({ id: g.key, name: g.name, description: g.en })),
    products: groups.flatMap(g => g.items.map(p => ({
      id: p.key, categoryId: g.key, category: g.name, name: p.name, description: p.en,
      price: p.prices[0], priceOptions: p.prices.length > 1 ? p.prices : [],
      currencyCode: menu.currencyCode, available: true, ingredients: [], videos: [],
      images: [{ url: `${AWJ_ASSETS}/products/${p.key}.webp`, alt: p.name }],
    }))),
  };
}
