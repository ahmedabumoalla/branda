import type { MenuProduct } from "@/lib/mock/menu";
import {
  defaultMenuCategories,
  getCategoryNameById,
  loadMenuCategories,
  type MenuCategoryRecord,
} from "@/lib/mock/menu-categories";

export const UNCATEGORIZED_LABEL = "غير مصنف";

/** Resolve category id from categoryId or legacy category name. */
export function resolveProductCategoryId(
  product: MenuProduct,
  categories: MenuCategoryRecord[]
): string | null {
  if (product.categoryId) {
    const byId = categories.find((c) => c.id === product.categoryId);
    if (byId) return byId.id;
  }

  const legacyName = product.category?.trim();
  if (legacyName) {
    const byName = categories.find(
      (c) => c.name === legacyName || c.name.includes(legacyName) || legacyName.includes(c.name)
    );
    if (byName) return byName.id;
  }

  return null;
}

export function resolveProductCategoryLabel(
  product: MenuProduct,
  categories?: MenuCategoryRecord[]
): string {
  const list =
    categories ??
    (typeof window !== "undefined" ? defaultMenuCategories : defaultMenuCategories);

  const categoryId = resolveProductCategoryId(product, list);
  if (categoryId) {
    return getCategoryNameById(list, categoryId, product.category);
  }

  return product.category?.trim() || UNCATEGORIZED_LABEL;
}

/** All visible categories for customer strips — sorted by sortOrder. */
export function getVisibleCategoryNames(categories: MenuCategoryRecord[]): string[] {
  return [...categories]
    .filter((c) => c.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.name);
}

/** Filter dropdown options: all visible categories + uncategorized if needed. */
export function getCustomerCategoryFilterOptions(
  products: MenuProduct[],
  categories: MenuCategoryRecord[]
): string[] {
  const visible = getVisibleCategoryNames(categories);
  const available = products.filter((p) => p.available);
  const hasUncategorized = available.some(
    (p) => resolveProductCategoryId(p, categories) === null
  );

  const options = ["الكل", ...visible];
  if (hasUncategorized && !visible.includes(UNCATEGORIZED_LABEL)) {
    options.push(UNCATEGORIZED_LABEL);
  }
  return options;
}

export function productMatchesCategory(
  product: MenuProduct,
  categoryFilter: string,
  categories: MenuCategoryRecord[]
): boolean {
  if (categoryFilter === "الكل") return true;

  if (categoryFilter === UNCATEGORIZED_LABEL) {
    return resolveProductCategoryId(product, categories) === null;
  }

  const record = categories.find((c) => c.name === categoryFilter);
  if (!record) {
    return product.category === categoryFilter;
  }

  const productCategoryId = resolveProductCategoryId(product, categories);
  if (productCategoryId) return productCategoryId === record.id;

  return product.category === record.name;
}

/** @deprecated use getCustomerCategoryFilterOptions */
export function getFilterableCategoryNames(
  products: MenuProduct[],
  categories: MenuCategoryRecord[]
): string[] {
  return getCustomerCategoryFilterOptions(products, categories);
}

export type PriceRangeFilter = "all" | "under-20" | "20-40" | "over-40";

export function productMatchesPriceRange(
  product: MenuProduct,
  priceRange: PriceRangeFilter
): boolean {
  if (priceRange === "all") return true;
  if (priceRange === "under-20") return product.price < 20;
  if (priceRange === "20-40") return product.price >= 20 && product.price <= 40;
  if (priceRange === "over-40") return product.price > 40;
  return true;
}

export function isFilterActive(state: {
  query: string;
  category: string;
  priceRange: PriceRangeFilter;
  onlyOffers: boolean;
  sort: string;
}): boolean {
  return (
    Boolean(state.query.trim()) ||
    state.category !== "الكل" ||
    state.priceRange !== "all" ||
    state.onlyOffers ||
    state.sort !== "popular"
  );
}

export const DEFAULT_FILTER_STATE = {
  query: "",
  category: "الكل",
  priceRange: "all" as PriceRangeFilter,
  onlyOffers: false,
  sort: "popular" as const,
};
