import { z } from "zod";

export const financeCategories = {
  subscription: "اشتراكات العلامات",
  database: "قواعد البيانات",
  hosting: "الاستضافة والنشر",
  whatsapp: "خدمات واتساب",
  software: "البرامج والخدمات",
  other: "مدفوعات أخرى",
} as const;
export function saudiDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export const financeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const financeFilterSchema = z.object({
  page: z.number().int().min(0).max(100000).default(0),
  kind: z.enum(["all", "collection", "payment"]).default("all"),
  from: financeDate,
  to: financeDate,
}).refine(value => value.from <= value.to);
export type FinanceFilter = z.infer<typeof financeFilterSchema>;
export const financeDraftSchema = z.object({
  id: z.string().uuid(), kind: z.enum(["collection", "payment"]),
  category: z.enum(["subscription", "database", "hosting", "whatsapp", "software", "other"]),
  party: z.string().trim().max(200), description: z.string().trim().min(1).max(500),
  date: financeDate.refine(value => value <= saudiDate() && value >= "2000-01-01"),
  amount: z.number().positive().max(9999999999.99).multipleOf(0.01),
  currency: z.enum(["SAR", "USD"]), exchangeRate: z.number().positive().max(10000).multipleOf(0.000001),
  reference: z.string().trim().max(200), notes: z.string().trim().max(2000),
  cafeId: z.string().uuid().or(z.literal("")), requestId: z.string().uuid().or(z.literal("")),
  planId: z.string().max(120), months: z.number().int(),
}).superRefine((value, ctx) => {
  if (value.currency === "SAR" && value.exchangeRate !== 1) ctx.addIssue({ code: "custom", message: "Invalid rate" });
  if (value.kind === "collection" && (!value.cafeId || value.currency !== "SAR" || (!value.requestId && (!value.planId || ![1, 3, 6, 12].includes(value.months))))) ctx.addIssue({ code: "custom", message: "Missing subscription" });
  if (value.kind === "payment" && (!value.party || value.category === "subscription")) ctx.addIssue({ code: "custom", message: "Missing payment details" });
});
export type FinanceDraft = z.infer<typeof financeDraftSchema>;
export type FinanceEntry = {
  id: string; voucher_number: number; kind: "collection" | "payment"; source: string;
  category: keyof typeof financeCategories; party: string; description: string;
  occurred_on: string; currency: "SAR" | "USD"; amount: number; exchange_rate: number; amount_sar: number;
  reference: string; notes: string; subscription_id: string | null; subscription_request_id: string | null;
  hasReceipt: boolean;
};
export type FinancePage = { entries: FinanceEntry[]; total: number; filter: FinanceFilter; totals: { collections: number; payments: number; count: number } };
export type FinanceOptions = {
  cafes: { id: string; name: string }[];
  plans: { id: string; name: string; price_sar: number; annual_discount_percent: number; duration_options: number[] }[];
  requests: { id: string; cafe_id: string; plan_id: string; plan_name: string; amount_sar: number; duration_count: number; coupon_code_snapshot: string | null }[];
};
export function financeDefaults(): FinanceFilter { const today = saudiDate(); return { page: 0, kind: "all", from: `${today.slice(0, 7)}-01`, to: today }; }
