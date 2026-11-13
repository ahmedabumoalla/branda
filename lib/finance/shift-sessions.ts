import { z } from "zod";
import type { MonitoredShift } from "./shift-monitor";
import type { InvoicePayment } from "./payment-management";
import type { ShiftAnalytics } from "./shift-analytics";

const day = z.union([z.literal(""), z.iso.date()]);
export const shiftSessionFiltersSchema = z.object({
  query: z.string().trim().max(120).default(""), accountId: z.union([z.literal(""), z.uuid()]).default(""),
  status: z.enum(["", "open", "closed", "handover"]).default(""), from: day.default(""), to: day.default(""),
  sort: z.enum(["opened_desc", "opened_asc", "number_desc", "number_asc", "closed_desc", "employee_asc"]).default("opened_desc"),
  offset: z.number().int().min(0).max(100000).default(0),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, "تاريخ البداية بعد تاريخ النهاية");
export type ShiftSessionFilters = z.infer<typeof shiftSessionFiltersSchema>;
export const emptyShiftSessionFilters: ShiftSessionFilters = { query: "", accountId: "", status: "", from: "", to: "", sort: "opened_desc", offset: 0 };
export type ShiftSessionListRow = MonitoredShift & { sales_total: number; refunded_total: number; net_sales: number; device_count: number };
export type ShiftSessionList = { rows: ShiftSessionListRow[]; total: number; offset: number; limit: number };
export const sessionTabs = ["summary", "movements", "invoices", "refunds", "payments", "activity"] as const;
export type ShiftSessionTab = typeof sessionTabs[number];
export type ShiftSessionSummary = {
  shift: ShiftSessionListRow; analytics: ShiftAnalytics;
  counts: Record<"movements" | "invoices" | "refunds" | "payments" | "activity", number>;
};
export type ShiftSessionDocument = {
  id: string; number: number; kind: string; createdAt: string; customerName: string; creatorName: string;
  total: number; paid: number; refundedTotal: number; outstanding: number; accountName: string; note: string;
  invoiceId: string | null; invoiceNumber: string | null; payment: InvoicePayment | null;
};
export type ShiftSessionActivity = { id: string; action: string; createdAt: string; actor: string; note: string };
export type ShiftSessionRows = { rows: ShiftSessionDocument[]; total: number; offset: number; limit: number };
export type ShiftSessionActivities = { rows: ShiftSessionActivity[]; total: number; offset: number; limit: number };
