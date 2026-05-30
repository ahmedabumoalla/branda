import type { BrandaCustomerSession } from "@/lib/customer/session";
import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { CafeThemeId, ThemeClasses } from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";

export type CafeThemePageProps = {
  slug: string;
  cafeSettings: CafeSettings;
  themeId: CafeThemeId;
  theme: ThemeClasses;
  customer: BrandaCustomerSession | null;
  products: MenuProduct[];
  offers: CafeOffer[];
  availableProducts: MenuProduct[];
  popularProducts: MenuProduct[];
  latestProducts: MenuProduct[];
  bannerOffers: CafeOffer[];
  activeRewards: LoyaltyReward[];
  loyaltySettings: LoyaltySettings;
  isPreview?: boolean;
  previewThemeId?: string | null;
  /** Dashboard builder passes unsaved draft for live preview */
  customIdentityOverride?: CustomIdentityTheme;
  /** Unsaved blob preview URLs for builder only */
  customIdentityPreviewUrls?: {
    logoUrl?: string;
    backgroundUrl?: string;
  };
  /** Resolved cafe logo from IndexedDB (not base64 in settings) */
  cafeLogoUrl?: string;
};
