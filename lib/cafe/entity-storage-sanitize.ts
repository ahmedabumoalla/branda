import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { MarketingCampaign } from "@/lib/mock/marketing";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { BrandaCustomerSession } from "@/lib/customer/session";
import { isLegacyDataImageUrl } from "@/lib/cafe/image-asset-pipeline";

export function jsonContainsBase64Images(json: string): boolean {
  return json.includes("data:image");
}

export function assertNoBase64Images(json: string, context: string) {
  if (jsonContainsBase64Images(json)) {
    throw new Error(`${context}: image assets must use IndexedDB references, not base64.`);
  }
}

export function sanitizeMenuProduct(product: MenuProduct): MenuProduct {
  const next = { ...product };
  if (isLegacyDataImageUrl(next.imageDataUrl)) {
    delete next.imageDataUrl;
  }
  return next;
}

export function sanitizeMenuProducts(products: MenuProduct[]): MenuProduct[] {
  return products.map(sanitizeMenuProduct);
}

export function sanitizeMenuCategory(category: MenuCategoryRecord): MenuCategoryRecord {
  const next = { ...category };
  if (isLegacyDataImageUrl(next.imageDataUrl)) {
    delete next.imageDataUrl;
  }
  return next;
}

export function sanitizeMenuCategories(categories: MenuCategoryRecord[]): MenuCategoryRecord[] {
  return categories.map(sanitizeMenuCategory);
}

export function sanitizeCafeOffer(offer: CafeOffer): CafeOffer {
  const next = { ...offer };
  if (isLegacyDataImageUrl(next.bannerImageUrl)) {
    delete next.bannerImageUrl;
  }
  return next;
}

export function sanitizeCafeOffers(offers: CafeOffer[]): CafeOffer[] {
  return offers.map(sanitizeCafeOffer);
}

export function sanitizeMarketingCampaign(campaign: MarketingCampaign): MarketingCampaign {
  return { ...campaign };
}

export function sanitizeCustomerSession(session: BrandaCustomerSession): BrandaCustomerSession {
  const next = { ...session };
  if (isLegacyDataImageUrl(next.avatarUrl)) {
    delete next.avatarUrl;
  }
  return next;
}

export function sanitizeCafeSettingsRecord(settings: CafeSettings): CafeSettings {
  const next = { ...settings };
  if (isLegacyDataImageUrl(next.logoDataUrl)) {
    delete next.logoDataUrl;
  }
  return next;
}
