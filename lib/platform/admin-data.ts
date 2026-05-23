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

export type PlatformPlan = {
  id: string;
  name: string;
  priceMonthly: number;
  description: string;
  active: boolean;
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
  type: "طلب" | "حجز" | "دفع" | "تقييم" | "تسجيل كوفي" | "تغيير باقة";
  title: string;
  amount?: number;
  status: string;
  createdAt: string;
};

export const PLATFORM_PLANS_KEY = "branda_platform_plans";
export const PLATFORM_CAFES_KEY = "branda_platform_cafes";
export const PLATFORM_CUSTOMERS_KEY = "branda_platform_customers";
export const PLATFORM_OPERATIONS_KEY = "branda_platform_operations";
export const PLATFORM_OPTIONS_KEY = "branda_platform_options";
export const ACTIVE_CAFE_PLAN_KEY = "branda_qatrah_active_plan";

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

export const mockPlatformPlans: PlatformPlan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 99,
    description: "مناسبة لكوفي صغير يبدأ بمنيو وحجوزات أساسية.",
    active: true,
    features: ["menu", "offers", "reservations", "customers", "settings"],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 199,
    description: "تشمل الولاء والفروع والتقييمات والطلبات.",
    active: true,
    features: [
      "menu",
      "offers",
      "reservations",
      "loyalty",
      "customers",
      "branches",
      "reviews",
      "orders",
      "settings",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 399,
    description: "كل أدوات برندة للكوفيهات الاحترافية.",
    active: true,
    features: [
      "menu",
      "offers",
      "reservations",
      "loyalty",
      "customers",
      "branches",
      "reports",
      "reviews",
      "orders",
      "pages",
      "marketing",
      "theme",
      "settings",
    ],
  },
];

export const mockPlatformCafes: PlatformCafe[] = [
  {
    id: "cafe_qatrah",
    slug: "qatrah",
    name: "كوفي قطرة",
    ownerName: "مالك قطرة",
    ownerEmail: "owner@qatrah.com",
    ownerPhone: "0550000000",
    planId: "pro",
    status: "نشط",
    totalRevenue: 12450,
    totalOrders: 286,
    customersCount: 92,
    createdAt: "2026-05-22",
  },
];

export const mockPlatformCustomers: PlatformCustomer[] = [
  {
    id: "mock_customer_1",
    fullName: "عبدالله",
    phone: "0550000001",
    email: "customer@email.com",
    cafeId: "cafe_qatrah",
    cafeName: "كوفي قطرة",
    status: "نشط",
    totalSpent: 520,
    loyaltyPoints: 180,
    createdAt: "2026-05-22",
  },
];

export const mockPlatformOperations: PlatformOperation[] = [
  {
    id: "op_1",
    cafeId: "cafe_qatrah",
    cafeName: "كوفي قطرة",
    customerName: "عبدالله",
    type: "طلب",
    title: "طلب جديد داخل الكوفي",
    amount: 49.45,
    status: "مكتمل",
    createdAt: "2026-05-22",
  },
  {
    id: "op_2",
    cafeId: "cafe_qatrah",
    cafeName: "كوفي قطرة",
    customerName: "محمد",
    type: "حجز",
    title: "طلب حجز طاولة",
    status: "بانتظار الرد",
    createdAt: "2026-05-22",
  },
];

export const mockPlatformOptions = {
  allowCafeSignup: true,
  requireCafeApproval: true,
  platformCommissionPercent: 3,
  supportEmail: "support@branda.com",
  defaultPlanId: "starter",
};