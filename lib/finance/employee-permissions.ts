import { z } from "zod";
import type { CashierPermissions } from "./cashier-permissions";
import { canFinance, type FinanceRole } from "./permissions";

export const employeePermissionCatalog = [
  { domain: "sales", label: "المبيعات", actions: ["read", "create", "update", "delete", "pay", "return"] },
  { domain: "pos", label: "نقطة البيع", actions: ["read", "create"] },
  { domain: "loyalty", label: "الولاء", actions: ["read", "stamp", "redeem", "issue", "settings"] },
  { domain: "purchases", label: "المشتريات", actions: ["read", "create", "update", "delete", "approve", "credit", "return"] },
  { domain: "suppliers", label: "الموردون", actions: ["read", "create", "update", "delete", "pay"] },
  { domain: "inventory", label: "المخزون", actions: ["read", "create", "update", "delete", "approve", "settings"] },
  { domain: "finance", label: "المالية والخزينة", actions: ["read", "create", "update", "delete", "approve", "settings"] },
  { domain: "accounting", label: "المحاسبة", actions: ["read", "create", "update", "delete", "approve"] },
  { domain: "reports", label: "التقارير", actions: ["read"] },
  { domain: "shifts", label: "الورديات", actions: ["read", "create", "update", "approve"] },
] as const;

type CatalogGroup = typeof employeePermissionCatalog[number];
type GroupKeys<T> = T extends CatalogGroup ? `${T["domain"]}.${T["actions"][number]}` : never;
export type EmployeePermissionKey = GroupKeys<CatalogGroup>;
export type EmployeePermissionRule = { enabled: boolean; approverId: string | null };
export type EmployeePermissions = Record<EmployeePermissionKey, EmployeePermissionRule>;
export type EmployeePermissionApprover = { userId: string; name: string };

export const employeePermissionDescriptions: Record<EmployeePermissionKey, string> = {
  "sales.read": "يعرض فواتير المبيعات وتفاصيلها ضمن نطاق عمل الموظف",
  "sales.create": "يتيح إنشاء فواتير المبيعات وإصدارها وفق قواعد النظام",
  "sales.update": "يتيح تعديل مسودات المبيعات والبيانات التي يسمح النظام بتعديلها",
  "sales.delete": "يتيح حذف مسودات المبيعات القابلة للحذف دون حذف الفواتير المرحلة",
  "sales.pay": "يتيح تسجيل دفعات العملاء وتسوية المستحقات على فواتير المبيعات",
  "sales.return": "يتيح إنشاء مرتجع مبيعات للمبالغ والكميات المسموح بإرجاعها",
  "pos.read": "يتيح فتح نقطة البيع وعرض الأصناف المتاحة للكاشير",
  "pos.create": "يتيح تنفيذ البيع من الكاشير مع صلاحية إنشاء المبيعات ووردية متاحة عند اشتراطها",
  "loyalty.read": "يعرض بطاقة العميل ورصيد الأختام والمكافآت المتاحة",
  "loyalty.stamp": "يتيح إضافة الأختام المستحقة إلى بطاقة العميل وفق برنامج الولاء",
  "loyalty.redeem": "يتيح استبدال مكافأة متاحة للعميل وفق شروط برنامج الولاء",
  "loyalty.issue": "يتيح إصدار بطاقات ولاء للعملاء المؤهلين",
  "loyalty.settings": "يتيح تحديد الحد الأدنى للفاتورة واحتساب الأختام على الفواتير الآجلة",
  "purchases.read": "يعرض فواتير المشتريات وتفاصيل المورد والمبالغ المستحقة",
  "purchases.create": "يتيح إنشاء فواتير مشتريات وإضافة بنودها ضمن نطاق العمل",
  "purchases.update": "يتيح تعديل مسودات المشتريات والبيانات المتاحة للتعديل",
  "purchases.delete": "يتيح حذف مسودات المشتريات القابلة للحذف وفق حالة المستند",
  "purchases.approve": "يتيح اعتماد مستندات المشتريات التي تتطلب الاعتماد",
  "purchases.credit": "يتيح حفظ مشتريات بدفعة جزئية أو دون دفع وتسجيل المتبقي على المورد",
  "purchases.return": "يتيح إنشاء مرتجع مشتريات للكميات والمبالغ المؤهلة للإرجاع",
  "suppliers.read": "يعرض بيانات الموردين وأرصدتهم وحركة التعامل معهم",
  "suppliers.create": "يتيح إضافة مورد جديد لاستخدامه في المشتريات والسداد",
  "suppliers.update": "يتيح تحديث بيانات الموردين ووسائل التواصل معهم",
  "suppliers.delete": "يتيح حذف المورد القابل للحذف وفق ارتباطاته المالية",
  "suppliers.pay": "يتيح تسجيل سداد للمورد من حساب متاح أو صندوق الوردية",
  "inventory.read": "يعرض الأصناف المخزنية والأرصدة والحركات المسموح للموظف برؤيتها",
  "inventory.create": "يتيح إضافة أصناف مخزنية جديدة إلى المواد المخزنة",
  "inventory.update": "يتيح تعديل بيانات الأصناف ومسودات مستندات المخزون قبل ترحيلها",
  "inventory.delete": "يتيح حذف سجلات المخزون القابلة للحذف دون تجاوز قيود الحركات المسجلة",
  "inventory.approve": "يتيح اعتماد مستندات وحركات المخزون التي تتطلب الاعتماد",
  "inventory.settings": "يتيح إدارة إعدادات المخزون والمستودعات ضمن حدود الباقة",
  "finance.read": "يعرض الخزينة والأرصدة والسندات المالية ضمن نطاق العمل",
  "finance.create": "يتيح إنشاء السندات والعمليات المالية على الحسابات المتاحة",
  "finance.update": "يتيح تعديل السندات المالية والبيانات القابلة للتعديل حسب حالتها",
  "finance.delete": "يتيح حذف المسودات المالية القابلة للحذف وفق قواعد النظام",
  "finance.approve": "يتيح اعتماد السندات والعمليات المالية التي تتطلب الاعتماد",
  "finance.settings": "يتيح تعديل إعدادات الوظائف المالية المتاحة دون إدارة صلاحيات الموظفين",
  "accounting.read": "يعرض القيود والدفاتر المحاسبية ضمن نطاق العمل",
  "accounting.create": "يتيح إنشاء قيود محاسبية مع تطبيق قواعد التوازن والفترات المالية",
  "accounting.update": "يتيح تعديل مسودات القيود والبيانات التي يسمح النظام بتعديلها",
  "accounting.delete": "يتيح حذف مسودات القيود القابلة للحذف دون حذف القيود المرحلة",
  "accounting.approve": "يتيح اعتماد القيود والمستندات المحاسبية التي تتطلب الاعتماد",
  "reports.read": "يتيح عرض التقارير والملخصات المالية المتاحة ضمن نطاق العمل",
  "shifts.read": "يعرض سجلات الورديات وأرصدة الصناديق وتفاصيل التسليم المتاحة",
  "shifts.create": "يتيح فتح وردية وتسجيل النقدية المعدودة عند البداية وفق شروط التشغيل",
  "shifts.update": "يتيح إقفال الوردية وتسجيل النقدية المعدودة وتسليم الصندوق",
  "shifts.approve": "يتيح الإشراف على الورديات واعتماد إجراءاتها المسموح بها",
};

export const employeePermissionKeys = employeePermissionCatalog.flatMap(group => group.actions.map(action => `${group.domain}.${action}` as EmployeePermissionKey));
const permissionRuleSchema = z.object({ enabled: z.boolean(), approverId: z.string().uuid().nullable() }).strict();
export const employeePermissionsSchema = z.object(Object.fromEntries(employeePermissionKeys.map(key => [key, permissionRuleSchema])) as Record<EmployeePermissionKey, typeof permissionRuleSchema>).strict().superRefine((policy, context) => {
  for (const key of employeePermissionKeys) {
    if (policy[key].approverId && (!policy[key].enabled || key.endsWith(".read"))) context.addIssue({ code: "custom", path: [key, "approverId"], message: "الموافقة متاحة للإجراءات المفعلة فقط باستثناء الاطلاع" });
  }
});

/** Display defaults for legacy staff only; the server remains authoritative. */
export function legacyEmployeePermissions(role: FinanceRole, pos: Partial<CashierPermissions> = {}): EmployeePermissions {
  const policy = Object.fromEntries(employeePermissionKeys.map(key => {
    const [domain, action] = key.split(".");
    let enabled = role === "owner";
    if (!enabled) {
      if (domain === "sales") enabled = action === "read" ? canFinance(role, "dashboard") || canFinance(role, "pos") : action === "create" ? canFinance(role, "pos") : canFinance(role, "accounting_write") || action === "return" && canFinance(role, "pos");
      if (domain === "pos") enabled = canFinance(role, "pos");
      if (domain === "purchases" || domain === "suppliers") enabled = canFinance(role, "accounting_write") || canFinance(role, "pos") && (action === "read" || domain === "purchases" && action === "create");
      if (domain === "inventory") enabled = canFinance(role, action === "read" ? "inventory_read" : "inventory_write");
      if (domain === "finance") enabled = canFinance(role, "treasury_write");
      if (domain === "accounting") enabled = action === "read" ? canFinance(role, "reports") : canFinance(role, "accounting_write");
      if (domain === "reports") enabled = canFinance(role, "reports");
      if (domain === "shifts") enabled = action === "read" ? canFinance(role, "shifts_read") || canFinance(role, "pos") : action === "approve" ? canFinance(role, "shifts_manage") : canFinance(role, "pos");
    }
    return [key, { enabled, approverId: null }];
  })) as EmployeePermissions;
  if (role !== "owner") {
    for (const [legacy, key] of Object.entries(cashierPermissionKeys) as [keyof CashierPermissions, EmployeePermissionKey][]) {
      if (pos[legacy] !== undefined) policy[key].enabled = pos[legacy] === true;
    }
  }
  return policy;
}

const cashierPermissionKeys = { createItem: "inventory.create", createSupplier: "suppliers.create", credit: "purchases.credit", supplierPayout: "suppliers.pay" } as const;
export function cashierPermissionsFromEmployeePolicy(policy: EmployeePermissions): CashierPermissions {
  return Object.fromEntries(Object.entries(cashierPermissionKeys).map(([legacy, key]) => [legacy, policy[key].enabled])) as CashierPermissions;
}
