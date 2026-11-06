import type { MarketingConnectionStatus } from "@/lib/marketing/types";

export const LOCO_CAFE_ID = "321fd305-1883-48df-ab69-829cf7d1bc48";
export const LOCO_BRAND_SLUG = "brand-9a8c97305195";

export type BrandWhatsAppDashboard = {
  brandName: string;
  configured: boolean;
  transactionalEnabled: boolean;
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
