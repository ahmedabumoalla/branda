export type PlatformFeatureCategory =
  | "core"
  | "commerce"
  | "operations"
  | "growth"
  | "experience"
  | "settings"
  | "finance";

export type PlatformFeatureRiskLevel =
  | "safe"
  | "business"
  | "financial"
  | "compliance"
  | "integration";

export type PlatformFeatureStatus = "active" | "preview" | "coming_soon" | "hidden";

export type PlatformFeaturePlanLevel = "starter" | "basic" | "pro" | "growth" | "enterprise";

export type PlatformFeatureDefinition = {
  id:
    | "home"
    | "pages"
    | "menu"
    | "orders"
    | "reservations"
    | "offers"
    | "loyalty"
    | "cashier"
    | "customers"
    | "reports"
    | "settings"
    | "theme"
    | "domains"
    | "branches"
    | "reviews"
    | "marketing"
    | "experience_reviews"
    | "branda_finance"
    | "subscription";
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  category: PlatformFeatureCategory;
  route: string;
  sidebarVisible: boolean;
  packageAssignable: boolean;
  defaultEnabled: boolean;
  requiredPlanLevel?: PlatformFeaturePlanLevel;
  iconKey?: string;
  riskLevel: PlatformFeatureRiskLevel;
  status: PlatformFeatureStatus;
  sortOrder: number;
  dependencies?: PlatformFeatureDefinition["id"][];
};

export type PlatformFeatureId = PlatformFeatureDefinition["id"];
export type PlatformFeatureCode = "all" | PlatformFeatureId;

export const platformFeatureRegistry: readonly PlatformFeatureDefinition[] = [
  {
    id: "home",
    titleAr: "لوحة التحكم",
    titleEn: "Dashboard",
    descriptionAr: "الواجهة الرئيسية لصاحب العلامة وملخص التشغيل.",
    category: "core",
    route: "/dashboard",
    sidebarVisible: true,
    packageAssignable: false,
    defaultEnabled: true,
    iconKey: "Home",
    riskLevel: "safe",
    status: "active",
    sortOrder: 10,
  },
  {
    id: "pages",
    titleAr: "الفرع الإلكتروني",
    titleEn: "Electronic Branch",
    descriptionAr: "صفحات الفرع الإلكتروني والمحتوى العام للعلامة.",
    category: "core",
    route: "/dashboard/pages",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "starter",
    iconKey: "FileText",
    riskLevel: "business",
    status: "active",
    sortOrder: 20,
  },
  {
    id: "menu",
    titleAr: "المنيو / المنتجات",
    titleEn: "Menu and Products",
    descriptionAr: "إدارة المنتجات والتصنيفات والأسعار المعروضة للعملاء.",
    category: "commerce",
    route: "/dashboard/menu",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "starter",
    iconKey: "Package",
    riskLevel: "business",
    status: "active",
    sortOrder: 30,
  },
  {
    id: "orders",
    titleAr: "الطلبات",
    titleEn: "Orders",
    descriptionAr: "استقبال وإدارة طلبات العملاء من الفرع الإلكتروني.",
    category: "commerce",
    route: "/dashboard/orders",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "starter",
    iconKey: "ShoppingBag",
    riskLevel: "business",
    status: "active",
    sortOrder: 40,
    dependencies: ["menu"],
  },
  {
    id: "reservations",
    titleAr: "الحجوزات",
    titleEn: "Reservations",
    descriptionAr: "إدارة حجوزات العملاء ومواعيد الحضور.",
    category: "operations",
    route: "/dashboard/reservations",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "basic",
    iconKey: "CalendarDays",
    riskLevel: "business",
    status: "active",
    sortOrder: 50,
  },
  {
    id: "offers",
    titleAr: "العروض",
    titleEn: "Offers",
    descriptionAr: "إدارة العروض الترويجية الظاهرة للعملاء.",
    category: "growth",
    route: "/dashboard/offers",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "basic",
    iconKey: "Gift",
    riskLevel: "business",
    status: "active",
    sortOrder: 60,
    dependencies: ["menu"],
  },
  {
    id: "loyalty",
    titleAr: "الولاء والمكافآت",
    titleEn: "Loyalty and Rewards",
    descriptionAr: "بطاقات الولاء والمكافآت المرتبطة بتجربة العملاء.",
    category: "growth",
    route: "/dashboard/loyalty",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "pro",
    iconKey: "Star",
    riskLevel: "business",
    status: "active",
    sortOrder: 70,
  },
  {
    id: "cashier",
    titleAr: "الكاشير",
    titleEn: "Cashier",
    descriptionAr: "أدوات تشغيل الكاشير أو بوابة الدخول حسب نوع النشاط.",
    category: "operations",
    route: "/dashboard/cashier",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "basic",
    iconKey: "DoorOpen",
    riskLevel: "business",
    status: "active",
    sortOrder: 80,
  },
  {
    id: "branches",
    titleAr: "الفروع",
    titleEn: "Branches",
    descriptionAr: "إدارة الفروع ومعلوماتها المرتبطة بالعلامة.",
    category: "operations",
    route: "/dashboard/branches",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "basic",
    iconKey: "MapPin",
    riskLevel: "business",
    status: "active",
    sortOrder: 90,
  },
  {
    id: "customers",
    titleAr: "العملاء",
    titleEn: "Customers",
    descriptionAr: "عرض عملاء العلامة وسجلهم التشغيلي.",
    category: "experience",
    route: "/dashboard/customers",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "basic",
    iconKey: "Users",
    riskLevel: "business",
    status: "active",
    sortOrder: 100,
  },
  {
    id: "reports",
    titleAr: "التقارير",
    titleEn: "Reports",
    descriptionAr: "تقارير مختصرة عن النشاط والطلبات والحجوزات.",
    category: "operations",
    route: "/dashboard/reports",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "pro",
    iconKey: "BarChart3",
    riskLevel: "business",
    status: "active",
    sortOrder: 110,
  },
  {
    id: "reviews",
    titleAr: "الأسئلة والتقييمات",
    titleEn: "Questions and Reviews",
    descriptionAr: "متابعة تقييمات العملاء وأسئلتهم العامة.",
    category: "experience",
    route: "/dashboard/reviews",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "basic",
    iconKey: "MessageSquareText",
    riskLevel: "business",
    status: "active",
    sortOrder: 120,
  },
  {
    id: "marketing",
    titleAr: "الأدوات التسويقية",
    titleEn: "Marketing Tools",
    descriptionAr: "أدوات تساعد العلامة في الترويج والتفاعل مع العملاء.",
    category: "growth",
    route: "/dashboard/marketing",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "pro",
    iconKey: "Megaphone",
    riskLevel: "business",
    status: "preview",
    sortOrder: 130,
  },
  {
    id: "experience_reviews",
    titleAr: "مراجعة توثيق التجارب",
    titleEn: "Experience Reviews",
    descriptionAr: "توثيقات التجارب والمكافآت المرتبطة بها.",
    category: "experience",
    route: "/dashboard/experience-reviews",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "pro",
    iconKey: "BadgeCheck",
    riskLevel: "business",
    status: "active",
    sortOrder: 140,
  },
  {
    id: "branda_finance",
    titleAr: "برندة المالية",
    titleEn: "Branda Finance",
    descriptionAr: "مدخل مالي تمهيدي للعلامة داخل لوحة التحكم.",
    category: "finance",
    route: "/dashboard/branda-finance",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "pro",
    iconKey: "Landmark",
    riskLevel: "financial",
    status: "preview",
    sortOrder: 150,
  },
  {
    id: "settings",
    titleAr: "الإعدادات",
    titleEn: "Settings",
    descriptionAr: "إعدادات العلامة الأساسية وبيانات التواصل.",
    category: "settings",
    route: "/dashboard/settings",
    sidebarVisible: true,
    packageAssignable: false,
    defaultEnabled: true,
    iconKey: "Settings",
    riskLevel: "business",
    status: "active",
    sortOrder: 160,
  },
  {
    id: "theme",
    titleAr: "الثيم",
    titleEn: "Theme",
    descriptionAr: "تخصيص هوية وثيم الفرع الإلكتروني.",
    category: "settings",
    route: "/dashboard/theme",
    sidebarVisible: true,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "basic",
    iconKey: "Palette",
    riskLevel: "business",
    status: "active",
    sortOrder: 170,
  },
  {
    id: "domains",
    titleAr: "الدومين",
    titleEn: "Domains",
    descriptionAr: "ربط وإدارة الدومينات من إعدادات العلامة.",
    category: "settings",
    route: "/dashboard/settings",
    sidebarVisible: false,
    packageAssignable: true,
    defaultEnabled: false,
    requiredPlanLevel: "pro",
    iconKey: "Globe",
    riskLevel: "integration",
    status: "active",
    sortOrder: 180,
  },
  {
    id: "subscription",
    titleAr: "الاشتراك والباقات",
    titleEn: "Subscription and Plans",
    descriptionAr: "إدارة اشتراك العلامة والباقات المتاحة.",
    category: "settings",
    route: "/dashboard/subscription",
    sidebarVisible: true,
    packageAssignable: false,
    defaultEnabled: true,
    iconKey: "CreditCard",
    riskLevel: "financial",
    status: "active",
    sortOrder: 190,
  },
];

export const platformFeatureIds = platformFeatureRegistry.map((feature) => feature.id);

export function getPlatformFeatureDefinition(featureId: string) {
  return platformFeatureRegistry.find((feature) => feature.id === featureId);
}
