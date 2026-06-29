export type BrandaFinanceRoute = {
  title: string;
  href: string;
  description: string;
  status?: string;
};

export const brandaFinanceRoutes: BrandaFinanceRoute[] = [
  { title: "برندة المالية", href: "/dashboard/branda-finance", description: "مركز قيادة مالي موحد", status: "جاهز" },
  { title: "المبيعات", href: "/dashboard/branda-finance/sales", description: "شاشة كاشير ومبيعات محلية", status: "جاهز" },
  { title: "طلبات الصالة", href: "/dashboard/branda-finance/hall-orders", description: "طلبات طاولات وتحويل محلي لفاتورة", status: "محلي" },
  { title: "الفواتير", href: "/dashboard/branda-finance/invoicing", description: "قائمة فواتير المبيعات", status: "جاهز" },
  { title: "إنشاء فاتورة", href: "/dashboard/branda-finance/invoicing/create", description: "نموذج فاتورة مبيعات", status: "جاهز" },
  { title: "المشتريات", href: "/dashboard/branda-finance/purchases", description: "مساحة فواتير مشتريات", status: "محلي" },
  { title: "العملاء والموردين", href: "/dashboard/branda-finance/parties", description: "أرصدة وكشوف وأعمار ديون", status: "محلي" },
  { title: "المنتجات والمخزون", href: "/dashboard/branda-finance/catalog", description: "منتجات وخدمات ومستودعات", status: "محلي" },
  { title: "التقارير المالية", href: "/dashboard/branda-finance/reports", description: "مركز التقارير", status: "جاهز" },
  { title: "الكشوف الموحدة", href: "/dashboard/branda-finance/statements", description: "كشوف عملاء وموردين ومنتجات وخدمات", status: "جاهز" },
  { title: "للمحاسب", href: "/dashboard/branda-finance/accountant", description: "قيود وشجرة حسابات وتسويات", status: "محلي" },
  { title: "شجرة الحسابات", href: "/dashboard/branda-finance/accountant/chart-of-accounts", description: "حسابات وإضافة وتعديل محلي", status: "محلي" },
  { title: "نقاط الولاء", href: "/dashboard/branda-finance/loyalty-points", description: "قواعد نقاط مرتبطة بالكاشير", status: "محلي" },
  { title: "الحسابات البنكية", href: "/dashboard/branda-finance/banking", description: "صناديق وبنوك وإغلاق يومي", status: "محلي" },
  { title: "الرواتب والموظفين", href: "/dashboard/branda-finance/payroll", description: "رواتب وعهد وسلف", status: "محلي" },
  { title: "الأصول الثابتة", href: "/dashboard/branda-finance/assets", description: "سجل أصول وإهلاك", status: "محلي" },
  { title: "مراكز التكلفة", href: "/dashboard/branda-finance/cost-centers", description: "موازنات وتوزيع مصروفات", status: "محلي" },
  { title: "المشاريع", href: "/dashboard/branda-finance/projects", description: "ربحية المشاريع", status: "محلي" },
  { title: "الفروع", href: "/dashboard/branda-finance/branches", description: "أداء مالي حسب الفرع", status: "محلي" },
  { title: "للمطورين", href: "/dashboard/branda-finance/developer", description: "جاهزية API وwebhooks", status: "معطل" },
  { title: "التكاملات", href: "/dashboard/branda-finance/integrations", description: "تكاملات رسمية لاحقة", status: "معطل" },
  { title: "القوالب", href: "/dashboard/branda-finance/templates", description: "قوالب فواتير وإيصالات", status: "محلي" },
  { title: "التعاقد مع محاسب", href: "/dashboard/branda-finance/accountant-service", description: "طلب خدمة محاسب", status: "محلي" },
  { title: "مركز المساعدة", href: "/dashboard/branda-finance/help", description: "إرشادات وتدفقات العمل", status: "جاهز" },
];
