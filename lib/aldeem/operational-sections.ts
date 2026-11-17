export const ALDEEM_OPERATIONAL_SECTIONS: Record<string, { title: string; route: string; description: string }> = {
  overview: { title: 'نظرة عامة', route: '/dashboard/system/overview', description: 'المبيعات والتحصيل والمخزون من سجلات الحساب' },
  'inventory-products': { title: 'المنتجات', route: '/dashboard/system/inventory/items', description: 'منتجات الحلويات وأسعارها وباركودها ووحداتها وأرصدتها في الفروع والمستودعات' },
  'inventory-warehouses': { title: 'المستودعات', route: '/dashboard/system/inventory/warehouses', description: 'المستودعات والأرصدة والمستندات المخزنية' },
  'inventory-disposal-orders': { title: 'أوامر الإتلاف', route: '/dashboard/system/inventory/requisitions?kind=issue', description: 'سجّل الإتلاف بإذن صرف مخزني مع السبب والكميات والتشغيلة ثم راجع المستند قبل ترحيله' },
  'finance-treasuries': { title: 'الخزائن والحسابات البنكية', route: '/dashboard/system/finance/treasury', description: 'الأرصدة والحركات والتحويلات والمطابقة البنكية' },
  'finance-journal': { title: 'القيود اليومية', route: '/dashboard/system/accounting/journals', description: 'إنشاء القيود ومراجعتها واعتمادها وترحيلها' },
  'finance-reports': { title: 'التقارير المالية', route: '/dashboard/system/accounting/reports', description: 'الأستاذ العام وميزان المراجعة حسب الفترة والحساب' },
  'finance-disbursements': { title: 'سندات الصرف', route: '/dashboard/system/finance/expenses', description: 'المصروفات والسندات واعتماد الصرف' },
  'finance-receipts': { title: 'سندات القبض', route: '/dashboard/system/finance/receipts', description: 'التحصيل والسندات وربط الحسابات المالية' },
  'finance-chart-of-accounts': { title: 'دليل الحسابات', route: '/dashboard/system/accounting/accounts', description: 'الحسابات الرئيسية والفرعية والتصنيف المحاسبي' },
  'finance-cost-centers': { title: 'مراكز التكلفة', route: '/dashboard/system/accounting/cost-centers', description: 'إنشاء مراكز التكلفة وربطها بالقيود' },
  'employee-management': { title: 'إدارة الموظفين', route: '/dashboard/system/employees', description: 'ملفات الموظفين والمستندات والارتباط بالفروع' },
  'employee-roles': { title: 'الأدوار والصلاحيات', route: '/dashboard/system/roles', description: 'صلاحيات الحسابات وتعيين الأدوار' },
  'employee-schedules': { title: 'مواعيد العمل', route: '/dashboard/system/attendance/schedule', description: 'جدول الورديات والتعيينات والحضور والإجازات' },
  'employee-payroll': { title: 'الرواتب', route: '/dashboard/system/payroll/contracts', description: 'العقود ومسيرات الرواتب والقسائم والسلف' },
  'employee-organization': { title: 'الهيكل التنظيمي', route: '/dashboard/system/organization/chart', description: 'الأقسام والمسميات والمديرون والارتباط الإداري' },
  'account-settings': { title: 'إعدادات الحساب', route: '/dashboard/system/settings/general', description: 'إعدادات الحساب والضريبة والترقيم والهوية' },
  'account-information': { title: 'معلومات الحساب', route: '/dashboard/system/settings/account', description: 'بيانات المنشأة واستخدام الحساب' },
};

export function aldeemOperationalRoute(href: string) {
  if (href.length > 2000 || !href.startsWith('/') || href.startsWith('//')) return null;
  const url = new URL(href, 'https://aldeem.invalid');
  const path = url.pathname.replace(/^\/finance\/khayal-aldeem\/system/, '/dashboard/system');
  if (!/^\/dashboard\/system\/(overview|inventory|accounting|finance|employees|roles|attendance|payroll|organization|settings)(\/|$)/.test(path)) return null;
  return `${path}${url.search}`;
}
