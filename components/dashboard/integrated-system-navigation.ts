import type { LucideIcon } from "lucide-react";
import { ReceiptText, Monitor, Store, Hammer, ClipboardCheck, CalendarDays, HardHat, BadgeDollarSign, KeyRound, ClipboardList, Workflow, Users, Coins, Star, BadgeCheck, Boxes, ShoppingBag, Timer, WalletCards, Landmark, Banknote, ListOrdered, UserRoundCog, Network, CalendarCheck, HandCoins, ChartNoAxesCombined, MapPin, FileText, Settings } from "lucide-react";
import { financeMenuGroups, financeMenuHref, type FinanceMenuEntry, type FinanceSection } from "@/components/finance/finance-navigation";
import { NAQWA_SLUG } from "@/lib/platform/naqwa";
import { isAldeemCafe } from "@/lib/platform/aldeem";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";
import { usesExistingBranchWorkflow } from "@/lib/loyalty/branch-access";
import { isMindSalesSimplified, isSalesViewVisible } from "@/lib/finance/sales-features";
import { isHospitalStore } from "@/lib/commerce/hospital-profile";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { aldeemSystemGroups } from "./aldeem-navigation";

type SystemItem = { label: string; id?: string; view?: FinanceMenuEntry["view"]; unavailable?: boolean; section?: FinanceSection; href?: string; feature?: string; salonOnly?: boolean; giftsOnly?: boolean; pos?: boolean; financeOnly?: boolean };
export type SystemGroup = { id: string; label: string; icon: LucideIcon; items: SystemItem[]; /** A single destination shown as one link instead of an expandable group */ direct?: boolean };

export function isIntegratedLoyaltyRoute(pathname: string, financeActive: boolean) {
  return financeActive && (pathname === "/dashboard/loyalty" || pathname.startsWith("/dashboard/loyalty/") || pathname === "/dashboard/cashier" || pathname === "/dashboard/read-operations");
}

export function isIntegratedDashboardRoute(pathname: string, financeActive: boolean) {
  return isIntegratedLoyaltyRoute(pathname, financeActive) || financeActive && ["/dashboard/branches", "/dashboard/settings", "/dashboard/subscription"].some(href => pathname === href || pathname.startsWith(`${href}/`));
}

// Items without destinations are explicitly unavailable, never placeholder links.
export const integratedSystemGroups: SystemGroup[] = [
  { id: "sales", label: "المبيعات", icon: ReceiptText, items: financeMenuGroups.find(group => group.id === "sales")!.entries },
  { id: "pos", label: "نقاط البيع", icon: Monitor, items: [{ label: "فتح نقطة البيع", pos: true }, { label: "إدارة الكاشير", section: "cashiers" }, { label: "الورديات", section: "shifts" }, { label: "إعداد الطابعة", section: "printer" }] },
  { id: "store", label: "المتجر الإلكتروني", icon: Store, items: [{ label: "إدارة المحتوى", href: "/dashboard/system/store" }, { label: "الصفحات", href: "/dashboard/system/store/pages" }, { label: "معرض الصور", href: "/dashboard/system/store/media" }, { label: "قوائم المتجر", href: "/dashboard/system/store/menus" }, { label: "القوالب", href: "/dashboard/system/store/templates" }, { label: "المخزون", href: "/dashboard/system/store/inventory" }, { label: "الإعدادات", href: "/dashboard/system/store/settings" }, { label: "المنتجات والخدمات", href: "/dashboard/menu", feature: "menu" }] },
  { id: "manufacturing", label: "التصنيع", icon: Hammer, items: [{ label: "قوائم مواد الإنتاج", href: "/dashboard/system/manufacturing/bom" }, { label: "خطط الإنتاج", href: "/dashboard/system/manufacturing/plans" }, { label: "أوامر التصنيع", href: "/dashboard/system/manufacturing/orders" }, { label: "التكاليف غير المباشرة", href: "/dashboard/system/manufacturing/overheads" }, { label: "محطات العمل", href: "/dashboard/system/manufacturing/workstations" }, { label: "الإعدادات", href: "/dashboard/system/manufacturing/settings" }] },
  { id: "tasks", label: "إدارة المهام", icon: ClipboardCheck, items: [{ label: "المهام والمشاريع", href: "/dashboard/system/tasks" }, { label: "مسارات المهام", href: "/dashboard/system/tasks/flows" }, { label: "الإعدادات", href: "/dashboard/system/tasks/settings" }] },
  { id: "bookings", label: "الحجوزات", icon: CalendarDays, items: [{ label: "تقويم الحجوزات", href: "/dashboard/system/bookings" }, { label: "إعدادات الحجوزات", href: "/dashboard/system/bookings/settings" }, { label: "إدارة الحجوزات", href: "/dashboard/bookings", feature: "menu", salonOnly: true }] },
  { id: "contracting", label: "المقاولات", icon: HardHat, items: [{ label: "المناقصات", href: "/dashboard/system/contracting/bids" }, { label: "المشاريع", href: "/dashboard/system/contracting/projects" }, { label: "جداول التكاليف", href: "/dashboard/system/contracting/cost-sheets" }, { label: "عروض الأسعار", href: "/dashboard/system/contracting/quotations" }, { label: "العقود", href: "/dashboard/system/contracting/contracts" }, { label: "المستخلصات", href: "/dashboard/system/contracting/certificates" }, { label: "بنود الأعمال", href: "/dashboard/system/contracting/work-items" }, { label: "الإعدادات", href: "/dashboard/system/contracting/settings" }] },
  { id: "installments", label: "إدارة الأقساط", icon: BadgeDollarSign, items: [{ label: "عقود الأقساط", href: "/dashboard/system/installments" }, { label: "جدول التحصيل", href: "/dashboard/system/installments/schedule" }, { label: "الإعدادات", href: "/dashboard/system/installments/settings" }] },
  { id: "targets", label: "المبيعات المستهدفة والعمولات", icon: Banknote, items: [{ label: "أهداف وقواعد المبيعات", href: "/dashboard/system/commissions/rules" }, { label: "عمولات المبيعات", href: "/dashboard/system/commissions/commissions" }, { label: "فترات العمولات", href: "/dashboard/system/commissions/periods" }, { label: "تعيين مسؤول المبيعات", href: "/dashboard/system/commissions/sales" }] },
  { id: "rentals", label: "إدارة الإيجارات والوحدات", icon: KeyRound, items: [{ label: "الوحدات", href: "/dashboard/system/rentals/units" }, { label: "أوامر الحجز", href: "/dashboard/system/rentals/reservations" }, { label: "قواعد التسعير", href: "/dashboard/system/rentals/pricing" }, { label: "عقود الإيجار", href: "/dashboard/system/rentals/contracts" }, { label: "أقساط العقود", href: "/dashboard/system/rentals/installments" }, { label: "الأسعار الموسمية", href: "/dashboard/system/rentals/seasonal" }, { label: "الإعدادات", href: "/dashboard/system/rentals/settings" }] },
  { id: "work-orders", label: "أوامر الشغل", icon: ClipboardList, items: [{ label: "إدارة أوامر الشغل", href: "/dashboard/system/work-orders" }, { label: "إضافة أمر شغل", href: "/dashboard/system/work-orders/new" }, { label: "إعدادات أوامر الشغل", href: "/dashboard/system/work-orders/settings" }] },
  { id: "workflows", label: "دورات العمل", icon: Workflow, items: [{ label: "مسارات العمل والموافقات", href: "/dashboard/system/workflows" }, { label: "إضافة دورة عمل", href: "/dashboard/system/workflows/new" }, { label: "الإعدادات", href: "/dashboard/system/workflows/settings" }] },
  { id: "customers", label: "العملاء", icon: Users, items: [{ label: "إدارة العملاء", href: "/dashboard/system/customers" }, { label: "إضافة عميل", href: "/dashboard/system/customers/new" }, { label: "المواعيد", href: "/dashboard/system/customers/appointments" }, { label: "قائمة الاتصال", href: "/dashboard/system/customers/contacts" }, { label: "إدارة علاقات العملاء", href: "/dashboard/system/customers/crm" }, { label: "إعدادات العملاء", href: "/dashboard/system/customers/settings" }, { label: "العملاء والموردون", section: "parties" }] },
  { id: "credits", label: "النقاط والأرصدة", icon: Coins, items: [{ label: "إدارة شحن الأرصدة", href: "/dashboard/system/credits/charges" }, { label: "إدارة استهلاك الأرصدة", href: "/dashboard/system/credits/usages" }, { label: "إدارة الباقات", href: "/dashboard/system/credits/packages" }, { label: "أنواع الرصيد", href: "/dashboard/system/credits/types" }] },
  { id: "loyalty", label: "الولاء", icon: Star, items: [
    { label: "إدارة المكافآت", href: "/dashboard/loyalty", feature: "loyalty" },
    { label: "هوية الفروع", href: "/dashboard/loyalty/branches", feature: "branches" },
    { label: "إدارة الكاشير", href: "/dashboard/cashier", feature: "cashier" },
    { label: "سجل عملاء الولاء", href: "/dashboard/loyalty/customers", feature: "loyalty" },
    { label: "سجل قراءات الكاشير", href: "/dashboard/loyalty/reads", feature: "loyalty" },
    { label: "سجل عمليات الكاشير", href: "/dashboard/read-operations", feature: "loyalty" },
    { label: "إدارة رسائل الولاء", href: "/dashboard/loyalty/messages", feature: "loyalty" },
    { label: "إعدادات الولاء", href: "/dashboard/loyalty/settings", feature: "loyalty", financeOnly: true },
    { label: "دليل نظام الولاء", href: "/dashboard/loyalty/guide", feature: "loyalty" },
  ] },
  { id: "memberships", label: "العضويات", icon: BadgeCheck, items: [{ label: "إدارة العضويات", href: "/dashboard/system/memberships" }, { label: "إدارة الاشتراكات", href: "/dashboard/system/memberships/renewals" }, { label: "سياسة العضويات", href: "/dashboard/system/memberships/policy" }] },
  { id: "inventory", label: "المخزون", icon: Boxes, items: [{ label: "المنتجات والخدمات", href: "/dashboard/system/inventory/items" }, { label: "المستودعات", href: "/dashboard/system/inventory/warehouses" }, { label: "جرد المخزون", href: "/dashboard/system/inventory/stocktaking" }, { label: "إعدادات المخزون والمنتجات", href: "/dashboard/system/inventory/settings" }] },
  { id: "purchases", label: "المشتريات", icon: ShoppingBag, items: [{ label: "فواتير الشراء", href: "/dashboard/system/purchases/invoices" }, { label: "مرتجعات المشتريات", href: "/dashboard/system/purchases/returns" }, { label: "الموردون", href: "/dashboard/system/purchases/suppliers" }, { label: "مدفوعات الموردين", href: "/dashboard/system/purchases/payments" }, { label: "إعدادات المشتريات", href: "/dashboard/system/purchases/settings" }, { label: "فواتير الموردين", section: "purchases" }] },
  { id: "time", label: "تتبع الوقت", icon: Timer, items: [{ label: "سجلات الوقت", href: "/dashboard/system/time" }, { label: "فوترة الساعات", href: "/dashboard/system/time/billing" }, { label: "التقارير", href: "/dashboard/system/time/reports" }, { label: "الإعدادات", href: "/dashboard/system/time/settings" }] },
  { id: "finance", label: "المالية", icon: WalletCards, items: [{ label: "نظرة مالية", section: "overview" }, { label: "الخزينة والأرصدة", section: "treasury" }, { label: "المصروفات", href: "/dashboard/system/finance/expenses" }, { label: "سندات القبض", href: "/dashboard/system/finance/receipts" }, { label: "العهد المالية", href: "/dashboard/system/finance/custodies" }, { label: "أنواع التسوية", href: "/dashboard/system/finance/settlement-types" }, { label: "المطابقة البنكية", href: "/dashboard/system/finance/bank-statements" }, { label: "إعدادات المالية", href: "/dashboard/system/finance/settings" }] },
  { id: "accounting", label: "الحسابات العامة", icon: Landmark, items: [{ label: "القيود اليومية", href: "/dashboard/system/accounting/journals" }, { label: "أضف قيد", href: "/dashboard/system/accounting/journals/create" }, { label: "دليل الحسابات", href: "/dashboard/system/accounting/accounts" }, { label: "تقارير الحسابات", href: "/dashboard/system/accounting/reports" }] },
  { id: "requests", label: "الطلبات", icon: ListOrdered, items: [{ label: "طلبات الموظفين", href: "/dashboard/system/requests" }, { label: "أنواع الطلبات", href: "/dashboard/system/requests/types" }, { label: "إدارة الطلبات", href: "/dashboard/orders", feature: "menu", giftsOnly: true }] },
  { id: "employees", label: "الموظفون", icon: UserRoundCog, items: [{ label: "إدارة الموظفين", section: "settings" }, { label: "أدوار الموظفين والصلاحيات", href: "/dashboard/system/roles" }, { label: "عهد الموظفين", href: "/dashboard/system/employee-assets" }, { label: "أنواع العهد", href: "/dashboard/system/employee-assets/types" }] },
  { id: "organization", label: "الهيكل التنظيمي", icon: Network, items: [{ label: "إدارة المسميات الوظيفية", href: "/dashboard/system/organization/designation" }, { label: "إدارة الأقسام", href: "/dashboard/system/organization/department" }, { label: "إدارة المستويات الوظيفية", href: "/dashboard/system/organization/level" }, { label: "إدارة أنواع الوظائف", href: "/dashboard/system/organization/type" }, { label: "الهيكل التنظيمي", href: "/dashboard/system/organization/chart" }] },
  { id: "attendance", label: "الحضور", icon: CalendarCheck, items: [{ label: "سجلات الحضور", href: "/dashboard/system/attendance/logs" }, { label: "أيام الحضور", href: "/dashboard/system/attendance/days" }, { label: "مسيرات الحضور", href: "/dashboard/system/attendance/sheets" }, { label: "الإجازات والأذونات", href: "/dashboard/system/attendance/leaves" }, { label: "الورديات", href: "/dashboard/system/attendance/shifts" }, { label: "جدول العمل", href: "/dashboard/system/attendance/schedule" }, { label: "جلسات الحضور", href: "/dashboard/system/attendance/sessions" }, { label: "تسويات الإجازة", href: "/dashboard/system/attendance/settlements" }, { label: "الإعدادات", href: "/dashboard/system/attendance/settings" }] },
  { id: "payroll", label: "المرتبات", icon: HandCoins, items: [{ label: "العقود", href: "/dashboard/system/payroll/contracts" }, { label: "مسير الرواتب", href: "/dashboard/system/payroll/runs" }, { label: "قسائم الرواتب", href: "/dashboard/system/payroll/payslips" }, { label: "السلف", href: "/dashboard/system/payroll/loans" }, { label: "بنود الراتب", href: "/dashboard/system/payroll/components" }, { label: "قوالب الراتب", href: "/dashboard/system/payroll/structures" }, { label: "الإعدادات", href: "/dashboard/system/payroll/settings" }] },
  { id: "reports", label: "التقارير", icon: ChartNoAxesCombined, items: [{ label: "جميع التقارير", href: "/dashboard/system/reports" }, { label: "المبيعات", href: "/dashboard/system/reports/sales" }, { label: "المشتريات", href: "/dashboard/system/reports/purchases" }, { label: "الحسابات العامة", href: "/dashboard/system/reports/accounting" }, { label: "الشيكات", href: "/dashboard/system/reports/cheques" }, { label: "التصنيع", href: "/dashboard/system/reports/manufacturing" }, { label: "الرسائل", href: "/dashboard/system/reports/sms" }, { label: "النقاط والأرصدة", href: "/dashboard/system/reports/credits" }, { label: "الموظفون", href: "/dashboard/system/reports/employees" }, { label: "العضويات", href: "/dashboard/system/reports/memberships" }, { label: "الإيجارات", href: "/dashboard/system/reports/rentals" }, { label: "دورات العمل", href: "/dashboard/system/reports/workflows" }, { label: "أوامر الشغل", href: "/dashboard/system/reports/work-orders" }, { label: "العملاء", href: "/dashboard/system/reports/customers" }, { label: "المخزون", href: "/dashboard/system/reports/inventory" }, { label: "تتبع الوقت", href: "/dashboard/system/reports/time" }, { label: "استهلاك العملات الذكية", href: "/dashboard/system/reports/ai" }, { label: "سجل النشاطات", href: "/dashboard/system/reports/activity" }, { label: "الدفاتر والتقارير المالية", section: "reports" }] },
  { id: "branches", label: "الفروع", icon: MapPin, items: [{ label: "إدارة الفروع", href: "/dashboard/system/branches" }, { label: "أضف فرع", href: "/dashboard/system/branches/new" }, { label: "إعدادات الفروع", href: "/dashboard/system/branches/settings" }, { label: "فروع المنيو الحالية", href: "/dashboard/branches", feature: "menu" }] },
  { id: "templates", label: "القوالب", icon: FileText, items: [{ label: "قوالب للطباعة", href: "/dashboard/system/templates/print" }, { label: "قوالب الفواتير الجاهزة", href: "/dashboard/system/templates/invoices" }, { label: "قوالب البريد الإلكتروني", href: "/dashboard/system/templates/email" }, { label: "قوالب الرسائل القصيرة", href: "/dashboard/system/templates/sms" }, { label: "الشروط والأحكام", href: "/dashboard/system/templates/terms" }, { label: "الملفات والمستندات", href: "/dashboard/system/templates/documents" }, { label: "قواعد الإرسال الآلي", href: "/dashboard/system/templates/rules" }] },
  { id: "settings", label: "الإعدادات", icon: Settings, items: [{"label":"معلومات الحساب","href":"/dashboard/system/settings/account"},{"label":"إعدادات الحساب","href":"/dashboard/system/settings/general"},{"label":"إعدادات SMTP","href":"/dashboard/system/settings/smtp"},{"label":"طرق الدفع","href":"/dashboard/system/settings/payments"},{"label":"إعدادات الرسائل","href":"/dashboard/system/settings/sms"},{"label":"الترقيم المتسلسل","href":"/dashboard/system/settings/numbering"},{"label":"إعدادات الضرائب","href":"/dashboard/system/settings/taxes"},{"label":"إدارة التطبيقات","href":"/dashboard/system/settings/apps"},{"label":"شعار وألوان النظام","href":"/dashboard/system/settings/brand"},{"label":"واجهة API","href":"/dashboard/system/settings/api"},{"label":"المساعد الذكي (Copilot)","href":"/dashboard/system/settings/copilot"}] },
];

const storeGroupIds = new Set(["sales", "pos", "store", "customers", "loyalty", "inventory", "purchases", "finance", "accounting", "reports", "branches", "templates", "settings"]);
const storeReportPaths = new Set(["sales", "purchases", "accounting", "customers", "inventory", "activity"]);

/** Report families whose section exists in the MIND sidebar. Shared with the report catalog page. */
export const mindReportFamilies = new Set(["sales", "purchases", "accounting", "employees", "customers", "inventory", "activity"]);

/** Account-specific navigation; this deliberately does not grant or revoke permissions. */
const mindHiddenGroups = new Set([
  "store", "manufacturing", "tasks", "bookings", "contracting", "installments",
  "targets", "rentals", "work-orders", "workflows", "credits", "memberships",
  "time", "requests", "organization", "attendance", "payroll", "templates",
  // User request 2026-11-15: the whole reports and branches sections are removed from the MIND sidebar.
  "reports", "branches",
]);

export function integratedSystemGroupsForBrand(cafeSlug: string): SystemGroup[] {
  let groups = integratedSystemGroups.map(group => group.id === "settings" ? { ...group, items: [...group.items, { label: "إعدادات البراند", href: "/dashboard/settings", feature: "settings" }, { label: "الباقات والاشتراكات", href: "/dashboard/subscription" }] } : group);
  if (!usesExistingBranchWorkflow(cafeSlug)) groups = groups.map(group => group.id === "loyalty" ? { ...group, items: group.items.map(item => item.href === "/dashboard/loyalty/branches" ? { ...item, label: "الفروع", feature: "loyalty" } : item) } : group);
  if (cafeSlug === NAQWA_SLUG) return [
    { id: "overview", label: "نظرة مالية", icon: WalletCards, items: [{ label: "نظرة مالية", section: "overview" }] },
    ...financeMenuGroups.map(group => ({ id: group.id, label: group.label, icon: group.icon, items: group.entries.map(entry => ({ id: entry.id, section: entry.section, view: entry.view, label: entry.section === "cashiers" ? "إدارة المستخدمين والصلاحيات" : entry.label, href: financeMenuHref(entry) ?? undefined })) })),
    ...groups.filter(group => group.id === "loyalty"),
    { id: "products", label: "المنتجات والأسعار", icon: Store, items: [{ label: "إضافة المنتجات وتعديل الأسعار", href: "/dashboard/menu" }, { label: "فتح نقطة البيع", pos: true }] },
    { id: "users", label: "إدارة المستخدمين والصلاحيات", icon: UserRoundCog, items: [{ label: "المستخدمون وكلمات المرور", section: "cashiers" }, { label: "تغيير كلمة مرور المالك", href: "/dashboard/settings" }] },
  ];
  if (isAldeemCafe({ slug: cafeSlug })) return aldeemSystemGroups(groups);
  // Two entries belong to the hospital account alone: its loyalty registry sits under customers, and its POS
  // settings hold the WhatsApp invoice switch. Another brand shown the MIND options keeps the standard entries
  const hospital = isHospitalStore(cafeSlug);
  if (isMindSalesSimplified(cafeSlug)) return groups.filter(group => !mindHiddenGroups.has(group.id)).map(group => {
    if (group.id === "customers") return { ...group, items: group.items.filter(item => ["/dashboard/system/customers", "/dashboard/system/customers/new"].includes(item.href ?? "")) };
    if (group.id === "loyalty") return hospital ? { ...group, items: group.items.filter(item => item.href !== "/dashboard/loyalty/customers") } : group;
    if (group.id === "sales") return { ...group, items: group.items.filter(item => isSalesViewVisible(cafeSlug, item.view)) };
    if (group.id === "pos") return hospital ? { ...group, items: [...group.items, { label: "إعدادات نقاط البيع", section: "pos-settings" as const }] } : group;
    // User request 2026-11-15: MIND reports list only the families of sections present in its sidebar.
    if (group.id === "reports") return { ...group, items: group.items.filter(item => item.href === "/dashboard/system/reports" || mindReportFamilies.has(item.href?.split("/").at(-1) ?? "")) };
    // User request 2026-11-15: MIND finance menu drops settlement types, bank reconciliation and finance settings.
    if (group.id === "finance") return { ...group, items: group.items.filter(item => !["/dashboard/system/finance/settlement-types", "/dashboard/system/finance/bank-statements", "/dashboard/system/finance/settings"].includes(item.href ?? "")) };
    return group;
  });
  if (!isFawaselStore(cafeSlug)) return groups;
  return groups.filter(group => storeGroupIds.has(group.id)).map(group => {
    if (group.id === "store") return { ...group, label: "المتجر والمنتجات", items: [
      { label: "إدارة المنتجات", href: "/dashboard/menu", feature: "menu" },
      { label: "طلبات المتجر", href: "/dashboard/orders", feature: "menu" },
      { label: "عرض المتجر", href: `/menu/${encodeURIComponent(cafeSlug)}`, feature: "menu" },
      ...group.items.filter(item => item.href !== "/dashboard/menu"),
    ] };
    if (group.id === "loyalty") return { ...group, items: group.items.map(item => item.href === "/dashboard/loyalty/branches" ? { ...item, label: "الفروع", feature: "loyalty" } : item) };
    if (group.id === "reports") return { ...group, items: group.items.filter(item => item.section === "reports" || storeReportPaths.has(item.href?.split("/").at(-1) ?? "")) };
    if (group.id === "customers") return { ...group, items: group.items.filter(item => !item.href?.endsWith("/appointments")) };
    if (group.id === "accounting") return { ...group, items: group.items.filter(item => !item.href?.includes("/assets")) };
    if (group.id === "branches") return { ...group, items: group.items.map(item => item.href === "/dashboard/branches" ? { ...item, label: "فروع المتجر" } : item) };
    if (group.id === "settings") return { ...group, items: [...group.items, { label: "إعدادات المبيعات والشحن", section: "sales", view: "sales-settings" }, { label: "إعدادات المالية والصلاحيات", section: "settings" }] };
    return group;
  });
}

export function systemItemHref(item: SystemItem, context: { cafeSlug: string; enabledFeatures: readonly string[]; isSalon: boolean; isGifts: boolean }) {
  if (item.section === "sales" && !isSalesViewVisible(context.cafeSlug, item.view)) return null;
  if (item.unavailable) return null;
  if (context.cafeSlug === NAQWA_SLUG && item.href) return item.href;
  if (item.financeOnly && !featureCodesAllow([...context.enabledFeatures], "finance")) return null;
  if (item.feature && !featureCodesAllow([...context.enabledFeatures], item.feature)) return null;
  if (item.salonOnly && !context.isSalon) return null;
  if (item.giftsOnly && !context.isGifts && !isFawaselStore(context.cafeSlug)) return null;
  if (item.section) return `/dashboard/finance?section=${item.section}${item.view ? `&view=${item.view}` : ""}`;
  if (item.pos) return context.cafeSlug ? `/finance/${encodeURIComponent(context.cafeSlug)}/pos` : null;
  return item.href ?? null;
}
