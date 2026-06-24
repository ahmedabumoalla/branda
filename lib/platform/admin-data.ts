export type PlatformFeature =
  | "all"
  | "home"
  | "menu"
  | "offers"
  | "pages"
  | "reservations"
  | "customers"
  | "loyalty"
  | "branches"
  | "reports"
  | "reviews"
  | "marketing"
  | "experience_reviews"
  | "cashier"
  | "orders"
  | "settings"
  | "theme"
  | "subscription";

export type PlanDurationUnit = "day" | "month" | "year";

export type PlatformPlan = {
  id: string;
  name: string;
  priceMonthly: number;
  offerEnabled: boolean;
  offerPrice?: number;
  offerLabel?: string | null;
  offerEndsAt?: string | null;
  durationOptions?: number[];
  durationUnit: PlanDurationUnit;
  durationCount: number;
  description: string;
  active: boolean;
  isDefault: boolean;
  features: PlatformFeature[];
  categoryId?: string;
  maxOrdersMonthly?: number | null;
  maxProductsMonthly?: number | null;
  maxReservationsMonthly?: number | null;
  maxBranches?: number | null;
  trialDays?: number | null;
  freeAfterTrial?: boolean;
};

export type PlatformCafe = {
  id: string;
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerLoginEmail?: string;
  passwordAccessNote?: string;
  maintenanceAccountNumber?: string;
  businessCategory?: string;
  businessCategoryLabel?: string;
  logoUrl?: string;
  logoAssetId?: string;
  description?: string;
  instagram?: string;
  whatsapp?: string;
  taxNumber?: string;
  commercialRegister?: string;
  maroofCertificate?: string;
  planId: string;
  planName?: string;
  planExpiresAt?: string;
  planStartedAt?: string;
  planRemainingDays?: number | null;
  hasActivePlan?: boolean;
  status: "نشط" | "موقوف";
  totalRevenue: number;
  totalOrders: number;
  customersCount: number;
  productsCount?: number;
  offersCount?: number;
  branchesCount?: number;
  reservationsCount?: number;
  reviewsCount?: number;
  experienceSubmissionsCount?: number;
  experienceRewardsCount?: number;
  loyaltyCardsCount?: number;
  supportTicketsCount?: number;
  subscriptionsCount?: number;
  renewalsCount?: number;
  createdAt: string;
  publicUrl?: string;
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
    | "تسجيل علامة"
    | "تغيير باقة"
    | "شراء دومين"
    | "ربط دومين";
  title: string;
  amount?: number;
  status: string;
  createdAt: string;
};

export const dashboardPlatformFeatures: { id: PlatformFeature; title: string; href: string }[] = [
  { id: "home", title: "الرئيسية", href: "/dashboard" },
  { id: "menu", title: "المنيو", href: "/dashboard/menu" },
  { id: "offers", title: "العروض", href: "/dashboard/offers" },
  { id: "pages", title: "الصفحات", href: "/dashboard/pages" },
  { id: "reservations", title: "الحجوزات", href: "/dashboard/reservations" },
  { id: "customers", title: "العملاء", href: "/dashboard/customers" },
  { id: "loyalty", title: "بطاقات الولاء", href: "/dashboard/loyalty" },
  { id: "branches", title: "الفروع", href: "/dashboard/branches" },
  { id: "reports", title: "التقارير", href: "/dashboard/reports" },
  { id: "reviews", title: "الأسئلة والتقييمات", href: "/dashboard/reviews" },
  { id: "marketing", title: "الأدوات التسويقية", href: "/dashboard/marketing" },
  { id: "experience_reviews", title: "مراجعة توثيق التجارب", href: "/dashboard/experience-reviews" },
  { id: "cashier", title: "الكاشير", href: "/dashboard/cashier" },
  { id: "orders", title: "طلبات العلامة", href: "/dashboard/orders" },
  { id: "settings", title: "إعدادات العلامة", href: "/dashboard/settings" },
  { id: "theme", title: "ثيم العلامة", href: "/dashboard/theme" },
  { id: "subscription", title: "الاشتراك والباقات", href: "/dashboard/subscription" },
];

export const allPlatformFeatures: { id: PlatformFeature; title: string }[] =
  dashboardPlatformFeatures.map(({ id, title }) => ({ id, title }));

export const mockPlatformPlans: PlatformPlan[] = [];
export const mockPlatformCafes: PlatformCafe[] = [];
export const mockPlatformCustomers: PlatformCustomer[] = [];
export const mockPlatformOperations: PlatformOperation[] = [];

export const mockPlatformOptions = {
  allowCafeSignup: true,
  requireCafeApproval: true,
  platformCommissionPercent: 3,
  supportEmail: "support@barndaksa.com",
  defaultPlanId: "starter",
};
