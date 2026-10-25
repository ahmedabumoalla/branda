import { BookOpen, Boxes, Clock3, Landmark, LayoutDashboard, Printer, ReceiptText, Settings2, ShoppingBag, Users } from "lucide-react";

export const financeSections = [
  { id: "overview", label: "نظرة مالية", icon: LayoutDashboard },
  { id: "sales", label: "المبيعات", icon: ReceiptText },
  { id: "purchases", label: "المشتريات", icon: ShoppingBag },
  { id: "parties", label: "العملاء والموردون", icon: Users },
  { id: "inventory", label: "الأصناف والمخزون", icon: Boxes },
  { id: "treasury", label: "الخزينة والأرصدة", icon: Landmark },
  { id: "shifts", label: "الورديات", icon: Clock3 },
  { id: "reports", label: "الدفاتر والتقارير", icon: BookOpen },
  { id: "printer", label: "إعداد الطابعة", icon: Printer },
  { id: "settings", label: "الإعدادات والفريق", icon: Settings2 },
] as const;

export type FinanceSection = typeof financeSections[number]["id"];

export function resolveFinanceSection(value: string | null, canAdminister: boolean): FinanceSection {
  return financeSections.find(item => item.id === value && (item.id !== "settings" || canAdminister))?.id ?? "overview";
}
