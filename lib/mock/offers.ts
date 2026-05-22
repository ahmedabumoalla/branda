export type OfferType =
  | "خصم"
  | "اشتر واحصل"
  | "منتج مجاني مع الطلب"
  | "كود مسوق"
  | "إطلاق منتج"
  | "عرض موسمي"
  | "عرض مخصص";

export type OfferStatus = "نشط" | "مجدول" | "متوقف";

export type OfferPlacement = "قائمة العروض" | "بانر الكوفي" | "كلاهما";

export type CafeOffer = {
  id: string;
  title: string;
  description: string;
  type: OfferType;
  status: OfferStatus;
  placement: OfferPlacement;
  visibleInCafe: boolean;

  discountPercent?: number;
  code?: string;
  startDate?: string;
  endDate?: string;

  codeOwnerName?: string;
  codeOwnerPhone?: string;
  codeOwnerNationalId?: string;
  codeOwnerEmail?: string;
  codeOwnerBankAccount?: string;
  codeOwnerCommissionPercent?: number;

  linkedProductId?: string;
  bannerImageUrl?: string;
  ctaText?: string;

  promoProductName?: string;
  promoProductPrice?: number;
  promoProductCategory?: string;
  promoProductDescription?: string;
};

export const mockOffers: CafeOffer[] = [
  {
    id: "1",
    title: "خصم 15% على أول طلب",
    description: "خصم ترحيبي للعملاء الجدد عند أول طلب من الكوفي.",
    type: "خصم",
    status: "نشط",
    placement: "كلاهما",
    discountPercent: 15,
    code: "WELCOME15",
    startDate: "2026-05-01",
    endDate: "2026-12-31",
    visibleInCafe: true,
    ctaText: "استخدم العرض",
  },
  {
    id: "2",
    title: "وصل مشروبنا الجديد",
    description: "جرّب آيس سبانش لاتيه الجديد من قطرة.",
    type: "إطلاق منتج",
    status: "نشط",
    placement: "بانر الكوفي",
    visibleInCafe: true,
    linkedProductId: "2",
    bannerImageUrl:
      "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?q=80&w=1200&auto=format&fit=crop",
    ctaText: "شاهد المنتج",
    promoProductName: "آيس سبانش لاتيه",
    promoProductPrice: 21,
    promoProductCategory: "بارد",
    promoProductDescription: "مشروب بارد بطعم متوازن ومناسب لعشاق القهوة الحلوة.",
  },
];