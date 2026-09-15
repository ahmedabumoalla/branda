import type { MenuProduct } from "@/lib/mock/menu";

export const STANDALONE_MENU_FEATURE = "standalone_menu";

/** Presentation only: preserve decimals, numeric separators and stored catalog text. */
export function menuDisplayText(value: string) {
  return value.replace(/ـ/gu, "").replace(/[،,.…]+(?=\s|$)/gu, "");
}

export type StandaloneMenuProduct = Pick<MenuProduct,
  "id" | "name" | "category" | "categoryId" | "description" | "price" |
  "calories" | "preparationTimeMinutes" | "ingredients" | "available" | "promo"
> & {
  images: { url: string; alt: string }[];
  videos: { url: string; alt: string }[];
};

export type StandaloneMenu = {
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  categories: { id: string; name: string; description: string | null }[];
  products: StandaloneMenuProduct[];
  contacts: {
    feedbackEnabled: boolean;
    instagramUrl: string | null;
    location: { label: string; googleUrl: string; appleUrl: string } | null;
  };
};

export function normalizeMenuSearch(value: string) {
  return value.normalize("NFKC").replace(/[\u0640\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا").toLowerCase().trim();
}

export function matchesMenuSearch(product: StandaloneMenuProduct, query: string) {
  const text = normalizeMenuSearch([product.name, product.description, product.category, ...product.ingredients].join(" "));
  return normalizeMenuSearch(query).split(/\s+/).every((word) => text.includes(word));
}

/** Only published, non-deleted categories are eligible; unassigned products remain visible. */
export function isStandaloneProductVisible(
  product: { deleted_at?: string | null; category_id: string | null },
  visibleCategoryIds: ReadonlySet<string>,
) {
  return !product.deleted_at && (!product.category_id || visibleCategoryIds.has(product.category_id));
}

export function isOwnedMenuAsset(path: string, cafeId: string) {
  return path.startsWith(`${cafeId}/`) && !path.includes("..") && !path.includes("\\") && !path.includes("%");
}
