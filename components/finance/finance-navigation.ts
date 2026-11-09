import { canFinance } from "@/lib/finance/permissions";
import { BookOpen, Boxes, Clock3, Landmark, LayoutDashboard, Printer, ReceiptText, Settings2, ShoppingBag, UserRoundCog, Users } from "lucide-react";

export const financeSections = [
  { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
  { id: "sales", label: "المبيعات", icon: ReceiptText },
  { id: "purchases", label: "المشتريات", icon: ShoppingBag },
  { id: "parties", label: "العملاء والموردون", icon: Users },
  { id: "inventory", label: "الأصناف والمخزون", icon: Boxes },
  { id: "treasury", label: "الخزينة والأرصدة", icon: Landmark },
  { id: "cashiers", label: "إدارة الكاشير", icon: UserRoundCog },
  { id: "shifts", label: "الورديات", icon: Clock3 },
  { id: "reports", label: "الدفاتر والتقارير", icon: BookOpen },
  { id: "printer", label: "إعداد الطابعة", icon: Printer },
  { id: "settings", label: "الإعدادات والفريق", icon: Settings2 },
] as const;

export type FinanceSection = typeof financeSections[number]["id"];

export type FinanceMenuEntry = {
  id: string;
  label: string;
  section: FinanceSection;
  party?: "customer" | "supplier";
  view?: "items" | "movements";
};

// Children open existing workspace views; server authorization remains authoritative.
export const financeMenuGroups: { id: string; label: string; icon: typeof BookOpen; entries: FinanceMenuEntry[] }[] = [
  { id: "sales", label: "المبيعات والعملاء", icon: ReceiptText, entries: [
    { id: "sales", label: "الفواتير والمرتجعات", section: "sales" },
    { id: "customers", label: "بيانات العملاء وأرصدتهم", section: "parties", party: "customer" },
  ] },
  { id: "purchases", label: "المشتريات والموردون", icon: ShoppingBag, entries: [
    { id: "purchases", label: "فواتير المشتريات", section: "purchases" },
    { id: "suppliers", label: "بيانات الموردين وأرصدتهم", section: "parties", party: "supplier" },
  ] },
  { id: "inventory", label: "الأصناف والمخزون", icon: Boxes, entries: [
    { id: "inventory", label: "الأصناف والأرصدة والجرد", section: "inventory", view: "items" },
    { id: "movements", label: "حركات المخزون", section: "inventory", view: "movements" },
  ] },
  { id: "accounting", label: "الحسابات والخزينة", icon: BookOpen, entries: [
    { id: "treasury", label: "الخزينة والأرصدة", section: "treasury" },
    { id: "reports", label: "الدفاتر والتقارير", section: "reports" },
  ] },
  { id: "pos", label: "نقاط البيع والورديات", icon: UserRoundCog, entries: [
    { id: "cashiers", label: "إدارة الكاشير", section: "cashiers" },
    { id: "shifts", label: "الورديات والتسليم", section: "shifts" },
    { id: "printer", label: "إعداد الطابعة", section: "printer" },
  ] },
  { id: "settings", label: "الإعدادات والفريق", icon: Settings2, entries: [
    { id: "settings", label: "السياسة المحاسبية والفريق", section: "settings" },
    { id: "parties", label: "جميع أطراف التعامل", section: "parties" },
  ] },
];

export function financeMenuHref(entry: FinanceMenuEntry) {
  const params = new URLSearchParams({ section: entry.section });
  if (entry.party) params.set("party", entry.party);
  if (entry.view) params.set("view", entry.view);
  return `/dashboard/finance?${params}`;
}

export function resolveFinanceParty(value: string | null) {
  return value === "customer" || value === "supplier" || value === "employee" ? value : "all";
}

export function resolveFinanceMenuEntry(section: FinanceSection, party: string | null, view: string | null) {
  if (section === "parties") return party === "customer" ? "customers" : party === "supplier" ? "suppliers" : "parties";
  if (section === "inventory") return view === "movements" ? "movements" : "inventory";
  return section;
}

export function resolveFinanceSection(value: string | null, canAdminister: boolean, canManageCashiers = canAdminister): FinanceSection {
  return financeSections.find(item => item.id === value && (item.id !== "settings" || canAdminister) && (item.id !== "cashiers" || canManageCashiers))?.id ?? "overview";
}

export function financeSectionAllowed(section: FinanceSection, role: string, canManageCashiers = false) {
  if (section === "inventory") return canFinance(role,"inventory_read");
  if (section === "cashiers") return canManageCashiers || canFinance(role,"staff_manage");
  if (section === "settings") return canFinance(role,"settings_manage");
  if (section === "shifts") return canFinance(role,"shifts_read");
  if (section === "printer") return canFinance(role,"pos");
  return canFinance(role,"reports");
}
