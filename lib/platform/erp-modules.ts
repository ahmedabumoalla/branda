// Sections of the integrated system that a package may include, in the three groups the platform sells:
// Branda Finance, Branda Employees and Branda Manufacturing. The ids are the sidebar section ids.
// A package without a list (null) includes every section, which is how every existing package behaves.
export const erpModuleCatalog = [
  { id: "finance", title: "مزايا باقة برندة المالية", modules: [
    ["overview", "النظرة العامة"], ["tracking", "المتابعة والتتبع"], ["families", "الأسر المنتجة"],
    ["sales", "المبيعات"], ["pos", "نقاط البيع"], ["store", "المتجر الإلكتروني"], ["customers", "العملاء"], ["credits", "النقاط والأرصدة"], ["memberships", "العضويات"],
    ["inventory", "المخزون"], ["purchases", "المشتريات"], ["finance", "المالية"], ["accounting", "الحسابات العامة"], ["reports", "التقارير"], ["branches", "الفروع"],
    ["templates", "القوالب"], ["tasks", "إدارة المهام"], ["bookings", "الحجوزات"], ["contracting", "المقاولات"], ["installments", "إدارة الأقساط"],
    ["targets", "المبيعات المستهدفة والعمولات"], ["rentals", "إدارة الإيجارات والوحدات"], ["work-orders", "أوامر الشغل"], ["workflows", "دورات العمل"], ["time", "تتبع الوقت"],
  ] },
  { id: "employees", title: "مزايا باقة برندة لإدارة الموظفين", modules: [
    ["employees", "الموظفون"], ["organization", "الهيكل التنظيمي"], ["attendance", "الحضور"], ["payroll", "المرتبات"], ["requests", "الطلبات"],
  ] },
  { id: "manufacturing", title: "مزايا برندة للتصنيع", modules: [
    ["manufacturing", "التصنيع"],
  ] },
] as const;

export const erpModuleIds: readonly string[] = erpModuleCatalog.flatMap(group => group.modules.map(([id]) => id));

/** Keeps only known section ids; null stays null and means every section */
export function normalizeErpModules(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return erpModuleIds.filter(id => value.includes(id));
}

/** Sections allowed by the current packages together: any package without a list allows everything */
export function resolveErpModules(lists: readonly (string[] | null | undefined)[]): string[] | null {
  if (!lists.length || lists.some(list => !list)) return null;
  return erpModuleIds.filter(id => lists.some(list => list!.includes(id)));
}

/** Sections outside the catalog, such as account settings, are never hidden by a package */
export function erpModuleAllowed(allowed: readonly string[] | null | undefined, groupId: string) {
  return !allowed || !erpModuleIds.includes(groupId) || allowed.includes(groupId);
}
