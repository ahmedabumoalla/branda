export type PlatformFeature =
  | "menu"
  | "offers"
  | "reservations"
  | "loyalty"
  | "customers"
  | "branches"
  | "reports"
  | "reviews"
  | "orders"
  | "pages"
  | "marketing"
  | "theme"
  | "settings";

export type PlanDurationUnit = "day" | "month" | "year";

export type PlatformPlan = {
  id: string;
  name: string;
  priceMonthly: number;
  offerEnabled: boolean;
  offerPrice?: number;
  durationUnit: PlanDurationUnit;
  durationCount: number;
  description: string;
  active: boolean;
  isDefault: boolean;
  features: PlatformFeature[];
};

export type PlatformCafe = {
  id: string;
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  planId: string;
  status: "نشط" | "موقوف";
  totalRevenue: number;
  totalOrders: number;
  customersCount: number;
  createdAt: string;
  customDomain?: string;
  customDomainStatus?: "غير مربوط" | "بانتظار التحقق" | "مربوط";
  purchasedDomain?: string;
  purchasedDomainStatus?: "غير مربوط" | "بانتظار التحقق" | "مربوط";
  purchasedDomainCreatedAt?: string;
  purchasedDomainConnectedAt?: string;
};

export type PlatformCustomer = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  cafeId: string;
  cafeName: string;
  status: "نشط" | "موقوف";
  totalSpent: number;
  loyaltyPoints: number;
  createdAt: string;
};

export type PlatformOperation = {
  id: string;
  cafeId: string;
  cafeName: string;
  customerName?: string;
  type:
    | "طلب"
    | "حجز"
    | "دفع"
    | "تقييم"
    | "تسجيل كوفي"
    | "تغيير باقة"
    | "شراء دومين"
    | "ربط دومين";
  title: string;
  amount?: number;
  status: string;
  createdAt: string;
};

export const allPlatformFeatures: { id: PlatformFeature; title: string }[] = [
  { id: "menu", title: "المنيو" },
  { id: "offers", title: "العروض" },
  { id: "reservations", title: "الحجوزات" },
  { id: "loyalty", title: "الولاء" },
  { id: "customers", title: "العملاء" },
  { id: "branches", title: "الفروع" },
  { id: "reports", title: "التقارير" },
  { id: "reviews", title: "التقييمات والأسئلة" },
  { id: "orders", title: "الطلبات" },
  { id: "pages", title: "الصفحات التعريفية" },
  { id: "marketing", title: "التسويق" },
  { id: "theme", title: "ثيم الكوفي" },
  { id: "settings", title: "الإعدادات" },
];

export const mockPlatformPlans: PlatformPlan[] = [];
export const mockPlatformCafes: PlatformCafe[] = [];
export const mockPlatformCustomers: PlatformCustomer[] = [];
export const mockPlatformOperations: PlatformOperation[] = [];

export const mockPlatformOptions = {
  allowCafeSignup: true,
  requireCafeApproval: true,
  platformCommissionPercent: 3,
  supportEmail: "support@branda.com",
  defaultPlanId: "starter",
};
