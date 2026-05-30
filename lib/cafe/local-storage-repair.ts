import { getCustomerKey, type BrandaCustomerSession } from "@/lib/customer/session";
import { sanitizeCafeSettingsForStorage } from "@/lib/cafe/cafe-settings-storage";
import {
  assertNoBase64Images,
  sanitizeCafeOffer,
  sanitizeCafeOffers,
  sanitizeMenuCategory,
  sanitizeMenuCategories,
  sanitizeMenuProduct,
  sanitizeMenuProducts,
  sanitizeCustomerSession,
} from "@/lib/cafe/entity-storage-sanitize";
import {
  optimizeDataUrlForStorage,
  type ImageAssetPurpose,
} from "@/lib/cafe/image-asset-pipeline";
import {
  buildAssetId,
  dataUrlToBlob,
  FIXED_ASSET_IDS,
  saveOptimizedImageAsset,
  type LocalAssetKind,
} from "@/lib/cafe/local-asset-store";
import { CAFE_SETTINGS_KEY, type CafeSettings } from "@/lib/mock/cafe-settings";
import {
  CUSTOM_IDENTITY_THEME_KEY,
  loadCustomIdentityTheme,
  saveCustomIdentityTheme,
  type CustomIdentityTheme,
} from "@/lib/mock/custom-identity-theme";
import { MARKETING_KEY, type MarketingCampaign } from "@/lib/mock/marketing";
import { MENU_CATEGORIES_KEY, type MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeOffer } from "@/lib/mock/offers";

export type MigrationReport = {
  migratedImages: number;
  repairedKeys: string[];
  failedImages: number;
  message?: string;
};

export type MigrationResult = MigrationReport & {
  migratedCustomTheme: boolean;
  migratedCafeLogo: boolean;
  repairedStorage: boolean;
};

const MENU_KEY = "branda_qatrah_menu";
const OFFERS_KEY = "branda_qatrah_offers";

let migrationPromise: Promise<MigrationResult> | null = null;

async function migrateDataUrlField(
  dataUrl: string,
  kind: LocalAssetKind,
  purpose: ImageAssetPurpose,
  entityId?: string
): Promise<string | null> {
  try {
    const optimized = await optimizeDataUrlForStorage(dataUrl, purpose, `${kind}-legacy`);
    return saveOptimizedImageAsset(kind, optimized, entityId);
  } catch {
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const optimized = {
        blob,
        mimeType: blob.type || "image/png",
        width: 0,
        height: 0,
        sizeBytes: blob.size,
        originalSizeBytes: blob.size,
        wasOptimized: false,
        fileName: `${kind}-legacy.bin`,
      };
      return saveOptimizedImageAsset(kind, optimized, entityId);
    } catch {
      return null;
    }
  }
}

export async function migrateAllLegacyImageDataUrls(): Promise<MigrationReport> {
  const report: MigrationReport = {
    migratedImages: 0,
    repairedKeys: [],
    failedImages: 0,
  };

  if (typeof window === "undefined") return report;

  // Custom identity theme
  try {
    const theme = loadCustomIdentityTheme();
    let changed = false;
    const next: CustomIdentityTheme = { ...theme };

    if (theme.legacyLogoDataUrl?.startsWith("data:image")) {
      const assetId = await migrateDataUrlField(
        theme.legacyLogoDataUrl,
        "custom-theme-logo",
        "custom-theme-logo"
      );
      if (assetId) {
        next.logoAssetId = assetId;
        report.migratedImages += 1;
      } else report.failedImages += 1;
      delete next.legacyLogoDataUrl;
      changed = true;
    }

    if (theme.legacyBackgroundImageDataUrl?.startsWith("data:image")) {
      const assetId = await migrateDataUrlField(
        theme.legacyBackgroundImageDataUrl,
        "custom-theme-background",
        "custom-theme-background"
      );
      if (assetId) {
        next.backgroundAssetId = assetId;
        report.migratedImages += 1;
      } else report.failedImages += 1;
      delete next.legacyBackgroundImageDataUrl;
      changed = true;
    }

    if (changed) {
      saveCustomIdentityTheme(next);
      report.repairedKeys.push(CUSTOM_IDENTITY_THEME_KEY);
    }
  } catch {
    await stripBase64FromKey(CUSTOM_IDENTITY_THEME_KEY, [
      "logoDataUrl",
      "backgroundImageDataUrl",
      "legacyLogoDataUrl",
      "legacyBackgroundImageDataUrl",
    ]);
    report.repairedKeys.push(CUSTOM_IDENTITY_THEME_KEY);
  }

  // Cafe settings logo
  try {
    const settingsRaw = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (settingsRaw?.includes("data:image")) {
      const settings = JSON.parse(settingsRaw) as CafeSettings & { logoDataUrl?: string };
      if (settings.logoDataUrl?.startsWith("data:image")) {
        const assetId = await migrateDataUrlField(
          settings.logoDataUrl,
          "cafe-logo",
          "cafe-logo"
        );
        if (assetId) {
          settings.logoAssetId = assetId;
          report.migratedImages += 1;
        } else report.failedImages += 1;
        delete settings.logoDataUrl;
      }
      sanitizeCafeSettingsForStorage(settings);
      report.repairedKeys.push(CAFE_SETTINGS_KEY);
    }
  } catch {
    await stripBase64FromKey(CAFE_SETTINGS_KEY, ["logoDataUrl"]);
    report.repairedKeys.push(CAFE_SETTINGS_KEY);
  }

  // Menu products
  try {
    const menuRaw = localStorage.getItem(MENU_KEY);
    if (menuRaw?.includes("data:image")) {
      const products = JSON.parse(menuRaw) as MenuProduct[];
      let changed = false;
      const next = await Promise.all(
        products.map(async (product) => {
          if (!product.imageDataUrl?.startsWith("data:image")) return product;
          const assetId = await migrateDataUrlField(
            product.imageDataUrl,
            "product-image",
            "product-image",
            product.id
          );
          changed = true;
          if (assetId) {
            report.migratedImages += 1;
            return sanitizeMenuProduct({ ...product, imageAssetId: assetId });
          }
          report.failedImages += 1;
          return sanitizeMenuProduct(product);
        })
      );
      if (changed) {
        localStorage.setItem(MENU_KEY, JSON.stringify(next));
        report.repairedKeys.push(MENU_KEY);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  // Menu categories
  try {
    const catRaw = localStorage.getItem(MENU_CATEGORIES_KEY);
    if (catRaw?.includes("data:image")) {
      const categories = JSON.parse(catRaw) as MenuCategoryRecord[];
      let changed = false;
      const next = await Promise.all(
        categories.map(async (category) => {
          if (!category.imageDataUrl?.startsWith("data:image")) return category;
          const assetId = await migrateDataUrlField(
            category.imageDataUrl,
            "category-image",
            "category-image",
            category.id
          );
          changed = true;
          if (assetId) {
            report.migratedImages += 1;
            return sanitizeMenuCategory({ ...category, imageAssetId: assetId });
          }
          report.failedImages += 1;
          return sanitizeMenuCategory(category);
        })
      );
      if (changed) {
        localStorage.setItem(MENU_CATEGORIES_KEY, JSON.stringify(next));
        report.repairedKeys.push(MENU_CATEGORIES_KEY);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  // Offers
  try {
    const offersRaw = localStorage.getItem(OFFERS_KEY);
    if (offersRaw?.includes("data:image")) {
      const offers = JSON.parse(offersRaw) as CafeOffer[];
      let changed = false;
      const next = await Promise.all(
        offers.map(async (offer) => {
          if (!offer.bannerImageUrl?.startsWith("data:image")) return offer;
          const assetId = await migrateDataUrlField(
            offer.bannerImageUrl,
            "offer-banner",
            "offer-banner",
            offer.id
          );
          changed = true;
          if (assetId) {
            report.migratedImages += 1;
            return sanitizeCafeOffer({ ...offer, bannerAssetId: assetId });
          }
          report.failedImages += 1;
          return sanitizeCafeOffer(offer);
        })
      );
      if (changed) {
        localStorage.setItem(OFFERS_KEY, JSON.stringify(next));
        report.repairedKeys.push(OFFERS_KEY);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  // Marketing (future image fields)
  try {
    const marketingRaw = localStorage.getItem(MARKETING_KEY);
    if (marketingRaw?.includes("data:image")) {
      const campaigns = JSON.parse(marketingRaw) as (MarketingCampaign & {
        imageDataUrl?: string;
        imageAssetId?: string;
      })[];
      let changed = false;
      const next = await Promise.all(
        campaigns.map(async (campaign) => {
          const dataUrl = (campaign as { imageDataUrl?: string }).imageDataUrl;
          if (!dataUrl?.startsWith("data:image")) return campaign;
          const assetId = await migrateDataUrlField(
            dataUrl,
            "marketing-image",
            "marketing-image",
            campaign.id
          );
          changed = true;
          const copy = { ...campaign } as MarketingCampaign & {
            imageDataUrl?: string;
            imageAssetId?: string;
          };
          delete copy.imageDataUrl;
          if (assetId) {
            copy.imageAssetId = assetId;
            report.migratedImages += 1;
          } else report.failedImages += 1;
          return copy;
        })
      );
      if (changed) {
        localStorage.setItem(MARKETING_KEY, JSON.stringify(next));
        report.repairedKeys.push(MARKETING_KEY);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  // Customer sessions (qatrah mock + any slug key pattern)
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("branda_customer_session_")) continue;
      const raw = localStorage.getItem(key);
      if (!raw?.includes("data:image")) continue;

      const session = JSON.parse(raw) as BrandaCustomerSession & { avatarAssetId?: string };
      if (session.avatarUrl?.startsWith("data:image")) {
        const assetId = await migrateDataUrlField(
          session.avatarUrl,
          "customer-avatar",
          "customer-avatar",
          session.id
        );
        if (assetId) {
          session.avatarAssetId = assetId;
          report.migratedImages += 1;
        } else report.failedImages += 1;
        delete session.avatarUrl;
        localStorage.setItem(key, JSON.stringify(sanitizeCustomerSession(session)));
        report.repairedKeys.push(key);
      }
    }
  } catch {
    report.failedImages += 1;
  }

  if (report.migratedImages > 0 || report.repairedKeys.length > 0) {
    report.message =
      report.failedImages > 0
        ? `تم نقل ${report.migratedImages} صورة. بعض الصور التالفة قد تحتاج إعادة رفع.`
        : `تم نقل ${report.migratedImages} صورة وتحسين التخزين المحلي.`;
  }

  return report;
}

async function stripBase64FromKey(key: string, fields: string[]) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved?.includes("data:image")) return;
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    for (const field of fields) delete parsed[field];
    localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export async function migrateLegacyCustomIdentityAssets(): Promise<MigrationResult> {
  const report = await migrateAllLegacyImageDataUrls();
  return {
    ...report,
    migratedCustomTheme: report.repairedKeys.includes(CUSTOM_IDENTITY_THEME_KEY),
    migratedCafeLogo: report.repairedKeys.includes(CAFE_SETTINGS_KEY),
    repairedStorage: report.repairedKeys.length > 0,
  };
}

export async function runCustomIdentityMigrationOnce(): Promise<MigrationResult> {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyCustomIdentityAssets();
  }
  return migrationPromise;
}

export async function repairLocalImageStorage(
  confirmStripLegacy = true
): Promise<MigrationResult> {
  migrationPromise = null;
  const report = await migrateAllLegacyImageDataUrls();

  if (confirmStripLegacy) {
    await stripBase64FromKey(CUSTOM_IDENTITY_THEME_KEY, [
      "logoDataUrl",
      "backgroundImageDataUrl",
      "legacyLogoDataUrl",
      "legacyBackgroundImageDataUrl",
    ]);
    await stripBase64FromKey(CAFE_SETTINGS_KEY, ["logoDataUrl"]);
  }

  return {
    ...report,
    migratedCustomTheme: report.repairedKeys.includes(CUSTOM_IDENTITY_THEME_KEY),
    migratedCafeLogo: report.repairedKeys.includes(CAFE_SETTINGS_KEY),
    repairedStorage: true,
    message:
      report.message ??
      "تم إصلاح التخزين. أعد رفع الشعار أو الخلفية ثم احفظ الثيم إن لزم.",
  };
}

export function settingsContainsLegacyBase64(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const keys = [CAFE_SETTINGS_KEY, MENU_KEY, OFFERS_KEY, MENU_CATEGORIES_KEY, MARKETING_KEY];
    return keys.some((key) => {
      const saved = localStorage.getItem(key);
      return Boolean(saved && saved.includes("data:image"));
    });
  } catch {
    return true;
  }
}

export function anyLegacyBase64InProjectStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("branda_")) continue;
      const value = localStorage.getItem(key);
      if (value?.includes("data:image")) return true;
    }
    return false;
  } catch {
    return true;
  }
}

// re-export fixed ids for migration callers
export { FIXED_ASSET_IDS as LOCAL_ASSET_IDS };
