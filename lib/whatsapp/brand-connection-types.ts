import { MERAM_CAFE_ID, MERAM_SLUG } from "@/lib/commerce/meram-profile";
import type { MarketingConnectionStatus } from "@/lib/marketing/types";

export const LOCO_CAFE_ID = "321fd305-1883-48df-ab69-829cf7d1bc48";
export const LOCO_BRAND_SLUG = "brand-9a8c97305195";
export const WAHED_MASOUB_CAFE_ID = "8dbf85ba-df8f-4218-bc6f-9d2b39e937ef";
export const WAHED_MASOUB_BRAND_SLUG = "brand-3c0437f1733a";

export function supportsPrivateWhatsApp(cafeId: string | null | undefined) {
  return cafeId === LOCO_CAFE_ID || cafeId === WAHED_MASOUB_CAFE_ID;
}
export function supportsBrandWhatsAppConnection(cafeId: string | null | undefined) {
  return supportsPrivateWhatsApp(cafeId) || cafeId === MERAM_CAFE_ID;
}
export function supportsPrivateWhatsAppSlug(slug: string | null | undefined) {
  return slug === LOCO_BRAND_SLUG || slug === WAHED_MASOUB_BRAND_SLUG || slug === MERAM_SLUG;
}

export type BrandWhatsAppDashboard = {
  phoneCountry: import("@/lib/auth/brand-phone").BrandPhoneCountry;
  brandName: string;
  configured: boolean;
  transactionalEnabled: boolean;
  platformFallback: boolean;
  orderNotificationsOnly?: true;
  connection: {
    status: MarketingConnectionStatus;
    phone: string;
    verifiedPhone: string | null;
    lastError: string | null;
  } | null;
};

export type BrandWhatsAppAction =
  | { action: "connect"; phone: string }
  | { action: "refresh" | "qr" | "disconnect" };

export type BrandWhatsAppResult = {
  dashboard: BrandWhatsAppDashboard;
  qr?: string;
  qrStatus?: string;
};
