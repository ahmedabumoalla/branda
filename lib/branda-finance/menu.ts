export type BrandaFinanceIconKey =
  | "reports"
  | "invoices"
  | "sales"
  | "purchases"
  | "contacts"
  | "payroll"
  | "inventory"
  | "accountant"
  | "banking"
  | "assets"
  | "costCenters"
  | "projects"
  | "branches"
  | "developers"
  | "integrations"
  | "templates"
  | "hireAccountant"
  | "help";

export type BrandaFinanceMenuItem = {
  title: string;
  icon: BrandaFinanceIconKey;
  description: string;
  href: string;
  badge?: string;
};

const ready = "جاهز";
const local = "محلي";

export const brandaFinanceMenuItems: BrandaFinanceMenuItem[] = [
  { title: "التقارير المالية", icon: "reports", description: "مركز تقارير مالية بمعاينات محلية", href: "/dashboard/branda-finance/reports", badge: ready },
  { title: "المبيعات", icon: "sales", description: "شاشة كاشير ومبيعات مرتبطة بالفواتير", href: "/dashboard/branda-finance/sales", badge: ready },
  { title: "طلبات الصالة", icon: "sales", description: "تدفق ويتر وطاولات وتحويل محلي لفاتورة", href: "/dashboard/branda-finance/hall-orders", badge: local },
  { title: "الفواتير", icon: "invoices", description: "قائمة فواتير المبيعات وإنشاء فاتورة", href: "/dashboard/branda-finance/invoicing", badge: ready },
  { title: "المشتريات", icon: "purchases", description: "فواتير مشتريات وأوامر شراء ومردودات", href: "/dashboard/branda-finance/purchases", badge: local },
  { title: "الكشوف الموحدة", icon: "reports", description: "كشوف عملاء وموردين ومنتجات وخدمات", href: "/dashboard/branda-finance/statements", badge: ready },
  { title: "العملاء والموردين", icon: "contacts", description: "أرصدة وكشوف حساب وأعمار ديون", href: "/dashboard/branda-finance/parties", badge: local },
  { title: "الرواتب والموظفين", icon: "payroll", description: "رواتب وعهد وسلف واستقطاعات", href: "/dashboard/branda-finance/payroll", badge: local },
  { title: "المنتجات والخدمات والمخزون", icon: "inventory", description: "منتجات وخدمات ومستودعات وتنبيهات", href: "/dashboard/branda-finance/catalog", badge: local },
  { title: "للمحاسب", icon: "accountant", description: "شجرة حسابات وقيود وتسويات محلية", href: "/dashboard/branda-finance/accountant", badge: local },
  { title: "نقاط الولاء", icon: "contacts", description: "قواعد كسب واستبدال النقاط وربطها بالكاشير", href: "/dashboard/branda-finance/loyalty-points", badge: local },
  { title: "الحسابات البنكية", icon: "banking", description: "صناديق وبنوك وإغلاق يومي", href: "/dashboard/branda-finance/banking", badge: local },
  { title: "الأصول الثابتة", icon: "assets", description: "سجل أصول وإهلاك وصيانة", href: "/dashboard/branda-finance/assets", badge: local },
  { title: "مراكز التكلفة", icon: "costCenters", description: "توزيع دخل ومصروف حسب المركز", href: "/dashboard/branda-finance/cost-centers", badge: local },
  { title: "المشاريع", icon: "projects", description: "إيراد وتكلفة وهامش المشروع", href: "/dashboard/branda-finance/projects", badge: local },
  { title: "الفروع", icon: "branches", description: "مبيعات وصندوق ومخزون حسب الفرع", href: "/dashboard/branda-finance/branches", badge: local },
  { title: "للمطورين", icon: "developers", description: "جاهزية API وwebhooks بدون مفاتيح", href: "/dashboard/branda-finance/developer", badge: "جاهزية" },
  { title: "التكاملات", icon: "integrations", description: "ZATCA وmada والبنوك والطابعات معطلة بوضوح", href: "/dashboard/branda-finance/integrations", badge: "معطل" },
  { title: "القوالب", icon: "templates", description: "قوالب فاتورة وإيصالات وعروض وأوامر شراء", href: "/dashboard/branda-finance/templates", badge: local },
  { title: "التعاقد مع محاسب", icon: "hireAccountant", description: "طلب خدمة محاسب وقائمة مستندات", href: "/dashboard/branda-finance/accountant-service", badge: local },
  { title: "مركز المساعدة", icon: "help", description: "مقالات إعداد وأسئلة شائعة", href: "/dashboard/branda-finance/help", badge: ready },
];
