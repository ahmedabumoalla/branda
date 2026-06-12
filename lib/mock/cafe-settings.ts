import type { CafeDomainLinkStatus } from "@/lib/platform/cafe-domain";

export type CafeSettings = {
  cafeSlug: string;
  cafeName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  logoDataUrl?: string;
  /** IndexedDB asset reference — mock only; production → Storage URL */
  logoAssetId?: string;
  taxNumber?: string;
  commercialRegister?: string;
  maroofCertificate?: string;
  instagram?: string;
  whatsapp?: string;
  description?: string;
  customDomain?: string;
  domainStatus?: CafeDomainLinkStatus;
  purchasedDomain?: string;
  purchasedDomainStatus?: CafeDomainLinkStatus;
  purchasedDomainCreatedAt?: string;
  purchasedDomainConnectedAt?: string;
};

export const CAFE_SETTINGS_KEY = "barndaksa_qatrah_settings";

export const mockCafeSettings: CafeSettings = {
  cafeSlug: "qatrah",
  cafeName: "كوفي قطرة",
  ownerName: "مالك الكوفي",
  ownerEmail: "owner@qatrah.com",
  ownerPhone: "0550000000",
  description: "كوفي مختص يقدم القهوة والحلويات بتجربة رقمية عبر بارنداكسا.",
  domainStatus: "غير مربوط",
};