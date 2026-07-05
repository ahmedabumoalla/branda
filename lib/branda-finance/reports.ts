export type BrandaFinanceReportStatus = "coming_soon" | "preview";

export type BrandaFinanceReportCategoryKey =
  | "accountant"
  | "financial"
  | "consolidated"
  | "tax"
  | "sales"
  | "purchases"
  | "inventory"
  | "payroll";

export type BrandaFinanceReportItem = {
  slug: string;
  title: string;
  section: string;
  description: string;
  tags?: string[];
  status: BrandaFinanceReportStatus;
  categoryKey: BrandaFinanceReportCategoryKey;
};

export type BrandaFinanceReportSection = {
  key: BrandaFinanceReportCategoryKey;
  title: string;
  eyebrow: string;
  description: string;
  reports: BrandaFinanceReportItem[];
};

function report(
  categoryKey: BrandaFinanceReportCategoryKey,
  section: string,
  slug: string,
  title: string,
  description: string,
  tags?: string[],
): BrandaFinanceReportItem {
  return {
    slug,
    title,
    section,
    description,
    tags,
    status: "coming_soon",
    categoryKey,
  };
}

export const brandaFinanceReportSections: BrandaFinanceReportSection[] = [
  {
    key: "accountant",
    title: "للمحاسب",
    eyebrow: "دفاتر وتسويات",
    description: "تقارير مراجعة وتدقيق تساعد المحاسب على تتبع القيود والحسابات.",
    reports: [
      report("accountant", "للمحاسب", "trial-balance", "ميزان المراجعة", "ملخص أرصدة الحسابات المدينة والدائنة خلال فترة محددة."),
      report("accountant", "للمحاسب", "statement-of-account", "كشف الحساب", "حركة حساب محدد مع الرصيد الافتتاحي والختامي."),
      report("accountant", "للمحاسب", "general-ledger", "دفتر الأستاذ العام", "تفاصيل القيود والحركات المحاسبية حسب الحساب."),
      report("accountant", "للمحاسب", "audit-log", "سجل التدقيق", "تتبع التغييرات المالية والعمليات الحساسة داخل الوحدة."),
      report("accountant", "للمحاسب", "bank-reconciliation", "تقرير تسوية مصرفية", "مطابقة أرصدة البنك مع الحركات المسجلة في النظام."),
      report("accountant", "للمحاسب", "foreign-currency-revaluation", "إعادة تقييم العملة الأجنبية", "إعادة تقييم أرصدة العملات الأجنبية حسب سعر صرف محدد."),
    ],
  },
  {
    key: "financial",
    title: "تقارير مالية",
    eyebrow: "قوائم وتشغيل",
    description: "القوائم المالية الأساسية وملخصات الأداء النقدي والإداري.",
    reports: [
      report("financial", "تقارير مالية", "income-statement", "قائمة الدخل", "إيرادات ومصروفات العلامة للوصول إلى صافي الربح أو الخسارة."),
      report("financial", "تقارير مالية", "cash-flow", "التدفق النقدي", "مصادر واستخدامات النقد خلال فترة مالية محددة."),
      report("financial", "تقارير مالية", "balance-sheet", "قائمة المركز المالي", "الأصول والالتزامات وحقوق الملكية في تاريخ محدد."),
      report("financial", "تقارير مالية", "cash-forecast", "التوقعات النقدية", "قراءة مستقبلية للتدفقات النقدية المتوقعة."),
      report("financial", "تقارير مالية", "management-reports-pdf", "تقارير الإدارة (PDF)", "حزمة PDF إدارية مختصرة للمتابعة الشهرية."),
    ],
  },
  {
    key: "consolidated",
    title: "التقارير المالية الموحدة",
    eyebrow: "مجموعة علامات",
    description: "قوائم موحدة عند وجود أكثر من فرع أو كيان ضمن نفس الإدارة.",
    reports: [
      report("consolidated", "التقارير المالية الموحدة", "consolidated-income-statement", "قائمة الدخل الموحد", "قائمة دخل مجمعة عبر الكيانات أو الفروع."),
      report("consolidated", "التقارير المالية الموحدة", "consolidated-cash-flow", "التدفق النقدي الموحد", "تجميع التدفقات النقدية من أكثر من مصدر تشغيلي."),
      report("consolidated", "التقارير المالية الموحدة", "consolidated-balance-sheet", "قائمة المركز المالي الموحدة", "مركز مالي موحد للكيانات المرتبطة."),
    ],
  },
  {
    key: "tax",
    title: "تقارير الضرائب",
    eyebrow: "امتثال",
    description: "تقارير تساعد على مراجعة الالتزامات الضريبية قبل الإقرار.",
    reports: [
      report("tax", "تقارير الضرائب", "vat", "ضريبة القيمة المضافة", "ملخص ضريبة القيمة المضافة على المبيعات والمشتريات."),
      report("tax", "تقارير الضرائب", "taxes", "الضرائب", "نظرة عامة على الضرائب المستحقة والمدفوعة."),
    ],
  },
  {
    key: "sales",
    title: "مبيعات",
    eyebrow: "عملاء وفواتير",
    description: "تقارير المبيعات والعملاء والتحصيل حسب أكثر من زاوية تشغيلية.",
    reports: [
      report("sales", "مبيعات", "customer-balances-summary", "ملخص أرصدة العملاء", "أرصدة العملاء المفتوحة والمغلقة في فترة محددة."),
      report("sales", "مبيعات", "customer-statement", "كشف حساب عميل", "حركة عميل واحد مع الفواتير والمدفوعات."),
      report("sales", "مبيعات", "customer-aging", "تقادم الحسابات المدينة", "تصنيف الذمم المدينة حسب عمر المستحقات."),
      report("sales", "مبيعات", "sales", "مبيعات", "مبيعات العلامة حسب العملاء والفروع والمشاريع والمنتجات.", ["حسب العميل", "حسب الفرع", "حسب المشروع", "حسب المنتج"]),
    ],
  },
  {
    key: "purchases",
    title: "مشتريات",
    eyebrow: "موردون ومصروفات",
    description: "تقارير الموردين والمشتريات والمصروفات حسب المنتج أو الخدمة.",
    reports: [
      report("purchases", "مشتريات", "supplier-balances-summary", "ملخص أرصدة الموردين", "أرصدة الموردين المفتوحة والمغلقة في فترة محددة."),
      report("purchases", "مشتريات", "supplier-statement", "كشف حساب مورد", "حركة مورد واحد مع الفواتير والمدفوعات."),
      report("purchases", "مشتريات", "supplier-aging", "تقادم الحسابات الدائنة", "تصنيف الذمم الدائنة حسب عمر المستحقات."),
      report("purchases", "مشتريات", "purchase-bills", "فواتير مشتريات", "تفاصيل فواتير الشراء والاعتمادات المرتبطة بها."),
      report("purchases", "مشتريات", "expenses", "مصروفات", "تحليل المصروفات حسب الحساب والفترة."),
      report("purchases", "مشتريات", "purchases-by-product-service", "مشتريات بحسب المنتج أو الخدمة", "تجميع المشتريات حسب المنتج أو الخدمة.", ["حسب المورد", "حسب الفرع"]),
    ],
  },
  {
    key: "inventory",
    title: "مخزون",
    eyebrow: "حركة ومستودعات",
    description: "تقارير حركة المخزون والملخصات الشهرية للمستودعات.",
    reports: [
      report("inventory", "مخزون", "inventory-movement", "حركة المخزون", "دخول وخروج المنتجات من المخزون خلال فترة محددة.", ["حسب المستودع"]),
      report("inventory", "مخزون", "monthly-inventory-summary", "الملخص الشهري للمخزون", "قيمة وكميات المخزون في نهاية كل شهر.", ["حسب المستودع"]),
    ],
  },
  {
    key: "payroll",
    title: "الرواتب",
    eyebrow: "موظفون",
    description: "تقارير مالية مرتبطة بحسابات الموظفين والرواتب.",
    reports: [
      report("payroll", "الرواتب", "employee-statement", "كشف حساب موظف", "حركة مستحقات ومدفوعات موظف محدد."),
    ],
  },
];

const brandaFinanceBaseReports = brandaFinanceReportSections.flatMap((section) => section.reports);

const brandaFinanceAdditionalReports: BrandaFinanceReportItem[] = [
  report("financial", "تقارير مالية", "profit-loss", "الأرباح والخسائر", "قائمة مختصرة للإيرادات والتكاليف والمصروفات وصافي الربح."),
  report("purchases", "مشتريات", "purchases", "تقرير المشتريات", "تحليل مشتريات الموردين والضريبة والمدفوعات."),
  report("inventory", "مخزون", "inventory", "تقرير المخزون", "أرصدة المنتجات وحركة المستودعات والتنبيهات."),
  report("sales", "مبيعات", "branches", "تقرير الفروع", "أداء كل فرع من المبيعات والصندوق والمستودع."),
  report("inventory", "مخزون", "products", "تقرير المنتجات", "ربحية المنتجات والمبيعات والمخزون."),
];

export const brandaFinanceReports = [
  ...brandaFinanceBaseReports,
  ...brandaFinanceAdditionalReports.filter(
    (additionalReport) => !brandaFinanceBaseReports.some((baseReport) => baseReport.slug === additionalReport.slug),
  ),
];

export function getBrandaFinanceReportBySlug(slug: string) {
  return brandaFinanceReports.find((reportItem) => reportItem.slug === slug);
}
