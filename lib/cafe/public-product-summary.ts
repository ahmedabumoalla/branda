import type { ProductPromo } from "@/lib/mock/menu";

export type PublicPromoSummary = Pick<
  ProductPromo,
  | "kind"
  | "discountMode"
  | "discountPercent"
  | "discountedPrice"
  | "customText"
  | "startDate"
  | "endDate"
>;

export type PublicProductSummary = {
  id: string;
  name: string;
  price: number;
  available: boolean;
  categoryId?: string;
  category: string;
  imageAssetId?: string;
  imageDataUrl?: string | null;
  promo?: PublicPromoSummary | null;
};

export type PublicCategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
  visible: true;
};

export type PublicProductCatalogPayload = {
  products: PublicProductSummary[];
  categories: PublicCategorySummary[];
  totalCount: number;
};
