export type OverviewSnapshot = {
  role: string; branchId: string | null; showMoney: boolean; slug: string; brand: string; from: string; to: string;
  branches: { id: string; name: string }[];
  today: { sales: number; invoices: number; openShifts: number; labPending: number; byBranch: { branchId: string | null; total: number; invoices: number }[] };
  salesByDay: { day: string; invoices: number; total: number; refunds: number; profit: number | null }[];
  paymentsByDay: { day: string; cash: number; bank: number; pos: number }[];
  latestInvoices: { id: string; number: number; createdAt: string; customer: string; total: number; outstanding: number; branchId: string | null }[];
  unpaidInvoices: { id: string; number: number; createdAt: string; customer: string; total: number; outstanding: number }[];
  lowStock: { id: string; name: string; code: string; unit: string; minQuantity: number; quantity: number }[];
  labOrders: { id: string; number: number; status: string; requiredAt: string; customer: string; branchId: string; items: number }[];
  activity: { id: string; kind: string; origin: string | null; number: number; total: number; at: string; branchId: string | null; actor: string; party: string }[];
};
export type OverviewSearchResult =
  | { kind: "invoice"; rows: { id: string; number: number; createdAt: string; customer: string; total: number }[] }
  | { kind: "customer"; rows: { id: string; name: string; phone: string }[] };

export const overviewDocumentLabels: Record<string, string> = {
  sale: "فاتورة مبيعات", purchase: "فاتورة مشتريات", expense: "مصروف", settlement: "سداد", opening: "رصيد افتتاحي", journal: "قيد يومية", shift_variance: "فرق وردية", treasury: "حركة خزينة",
};
export function overviewDocumentLabel(kind: string, origin: string | null) {
  if (kind === "refund") return origin === "purchase" ? "مرتجع مشتريات" : "مرتجع مبيعات";
  if (kind === "settlement") return origin === "purchase" ? "دفعة لمورد" : "تحصيل من عميل";
  return overviewDocumentLabels[kind] ?? "مستند مالي";
}
export const invoiceHref = (id: string) => `/dashboard/finance?section=sales&view=invoice&invoice=${id}`;
export const customerHref = (id: string) => `/dashboard/finance?section=parties&view=customer&customer=${id}`;
