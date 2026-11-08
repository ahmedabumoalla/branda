import type { MenuProduct } from "@/lib/mock/menu";

export const STANDALONE_MENU_FEATURE = "standalone_menu";

export type MenuPriceRange = { min: number; max: number };

/** A published range is descriptive, never a pair of purchasable variants. */
export function readMenuPriceRange(details: unknown, price: number): MenuPriceRange | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const range = (details as Record<string, unknown>).menuPriceRange;
  if (!range || typeof range !== "object" || Array.isArray(range)) return undefined;
  const { min, max } = range as Record<string, unknown>;
  return typeof min === "number" && typeof max === "number" && Number.isFinite(min) && Number.isFinite(max)
    && min >= 0 && max > min && min === price ? { min, max } : undefined;
}

/** Presentation only: preserve decimals, numeric separators and stored catalog text. */
export function menuDisplayText(value: string) {
  return value.replace(/ـ/gu, "").replace(/[،,.…]+(?=\s|$)/gu, "");
}

export type StandaloneMenuProduct = Pick<MenuProduct,
  "id" | "name" | "category" | "categoryId" | "description" | "price" | "priceOptions" |
  "calories" | "preparationTimeMinutes" | "ingredients" | "available" | "promo" | "commerceDetails"
> & {
  priceRange?: MenuPriceRange;
  catalogKind?: "service" | "product";
  primaryMediaType?: "image" | "video";
  offers?: StandaloneHighlight[];
  images: { url: string; alt: string }[];
  videos: { url: string; alt: string }[];
};

export type StandaloneMenu = {
  presentation?: "signature";
  appearance?: { palette: Record<string, string>; heroUrl: string | null };
  branches?: { id: string; name: string; slug: string }[];
  branch?: { id: string; name: string; slug: string } | null;
  businessCategory?: string;
  cafeId?: string;
  loyaltyEnabled?: boolean;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  categories: { id: string; name: string; description: string | null }[];
  products: StandaloneMenuProduct[];
  highlights?: { asOf: number; items: StandaloneHighlight[]; managedProductIds?: string[] };
  contacts: {
    feedbackEnabled: boolean;
    instagramUrl: string | null;
    location: { label: string; googleUrl: string; appleUrl: string } | null;
  };
};

export type StandaloneHighlight = {
  freeProductId?: string;
  buyProductId?: string;
  buyQuantity?: number;
  rewardQuantity?: number;
  showInSpotlight?: boolean;
  offerType?: string;
  kind?: "products" | "general" | "event";
  productName?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  productId: string | null;
  discountPercent: number | null;
  code: string | null;
  expiresAt: number | null;
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
  product: { available?: boolean; deleted_at?: string | null; category_id: string | null },
  visibleCategoryIds: ReadonlySet<string>,
  includeUnavailable = false,
) {
  return (includeUnavailable || product.available !== false) && !product.deleted_at && (!product.category_id || visibleCategoryIds.has(product.category_id));
}

export function isOwnedMenuAsset(path: string, cafeId: string) {
  return path.startsWith(`${cafeId}/`) && !path.includes("..") && !path.includes("\\") && !path.includes("%");
}
