export type MarketingCampaignStatus = "نشطة" | "مجدولة" | "متوقفة";

export type MarketingCampaign = {
  id: string;
  title: string;
  channel: "واتساب" | "انستقرام" | "سناب" | "رابط مباشر" | "QR";
  audience: string;
  message: string;
  code?: string;
  discountPercent?: number;
  influencerName?: string;
  influencerPhone?: string;
  commissionPercent?: number;
  status: MarketingCampaignStatus;
  startDate?: string;
  endDate?: string;
  visits: number;
  conversions: number;
  createdAt: string;
  /** IndexedDB reference — mock only */
  imageAssetId?: string;
};

export const MARKETING_KEY = "barndaksa_qatrah_marketing";

export const mockMarketingCampaigns: MarketingCampaign[] = [
  {
    id: "1",
    title: "عرض افتتاح المنيو الرقمي",
    channel: "واتساب",
    audience: "عملاء الكوفي",
    message: "خصم خاص على أول طلب من كوفي قطرة عبر برندة.",
    code: "QATRAH15",
    discountPercent: 15,
    status: "نشطة",
    startDate: "2026-05-22",
    endDate: "2026-06-22",
    visits: 240,
    conversions: 38,
    createdAt: "2026-05-22",
  },
];