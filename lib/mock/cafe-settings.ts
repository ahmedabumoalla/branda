import type { CafeDomainLinkStatus } from "@/lib/platform/cafe-domain";

export type CafeSettings = {
  cafeSlug: string;
  cafeName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  logoDataUrl?: string;
  taxNumber?: string;
  commercialRegister?: string;
  maroofCertificate?: string;
  instagram?: string;
  whatsapp?: string;
  description?: string;
  customDomain?: string;
  domainStatus?: CafeDomainLinkStatus;
};

export const CAFE_SETTINGS_KEY = "branda_qatrah_settings";

export const mockCafeSettings: CafeSettings = {
  cafeSlug: "qatrah",
  cafeName: "كوفي قطرة",
  ownerName: "مالك الكوفي",
  ownerEmail: "owner@qatrah.com",
  ownerPhone: "0550000000",
  description: "كوفي مختص يقدم القهوة والحلويات بتجربة رقمية عبر برندة.",
  domainStatus: "غير مربوط",
};