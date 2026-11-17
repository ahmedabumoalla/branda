export type OverviewDepartment = "all" | "sales" | "lab" | "manufacturing" | "loyalty";
export type OverviewFilters = { from: string; to: string; branch: string | null; department: OverviewDepartment };
export type OverviewBranch = { id: string | null; name: string; sales: number; invoices: number; refunds: number; lab: number; manufacturing: number; earned: number; redeemed: number };
export type OverviewWork = { id: string; number: string; status: string; branchId: string | null; createdAt: string; requiredAt?: string | null; name?: string };
export type OverviewDomain<T> = { data: T; error?: never } | { data?: never; error: string };
export type RealOverview = {
  at: string; filters: OverviewFilters; scopeBranch: string | null;
  branches: { id: string; name: string }[];
  sales: OverviewDomain<{ invoices: number; gross: number; refunds: number; refundCount: number; net: number; tax: number; paidAtIssue: number; byBranch: { branchId: string | null; invoices: number; sales: number; refunds: number }[]; days: { day: string; sales: number; invoices: number }[]; recent: { id: string; number: string; createdAt: string; branchId: string | null; kind: string; total: number }[] }> | null;
  lab: OverviewDomain<{ total: number; statuses: { status: string; count: number }[]; byBranch: { branchId: string | null; count: number }[]; recent: OverviewWork[] }> | null;
  manufacturing: OverviewDomain<{ total: number; statuses: { status: string; count: number }[]; byBranch: { branchId: string | null; count: number }[]; recent: OverviewWork[] }> | null;
  loyalty: OverviewDomain<{ earned: number; redeemed: number; redeemedValue: number; adjusted: number; reversed: number; customers: number; byBranch: { branchId: string | null; earned: number; redeemed: number }[] }> | null;
  current: OverviewDomain<{ points: number; openShifts: number; labPending: number; labHeld: number; manufacturingPending: number; outstandingPoints: number | null }>;
};

export function riyadhDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function overviewPeriod(days: number): Pick<OverviewFilters, "from" | "to"> {
  const to = riyadhDate();
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to };
}
