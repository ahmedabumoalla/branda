import type { FinanceDocument } from "./brand-finance";
import type { IssuedCompanyInvoice } from "@/lib/data/company-invoices";

export type InvoiceSchedule = { amount: number; start: string; frequency: "weekly" | "fortnightly" | "monthly" | "quarterly" | "half_yearly" | "yearly"; note: string };
export type InvoiceDetail = {
  payments: import("./payment-management").InvoicePayment[];
  paymentCollectors: { id: string; name: string }[];
  document: FinanceDocument;
  customer: { id: string; name: string; phone: string; email: string; tax_number: string; details: Record<string, unknown> } | null;
  warehouse: { id: string; name: string } | null;
  creator: { id: string; name: string };
  invoice: IssuedCompanyInvoice | null;
  related: FinanceDocument[];
  movements: { id: string; name: string; quantity: number; unit_cost: number; created_at: string; warehouse: string; itemId?: string; warehouseId?: string; sku?: string; unit?: string; balance?: number | null }[];
  journal: { id: string; account: string; debit: number; credit: number; memo: string }[];
  metadata: { customer?: { name: string; phone: string; tax_number: string }; delivery?: { confirmed: boolean; date: string }; schedule?: InvoiceSchedule | null };
  activity: { id: string; action: string; created_at: string; actor: string; documentId: string }[];
};

/** Integer halalas avoid cumulative rounding; calendar periods clamp to month end. */
export function invoiceInstallments(total: number, schedule: InvoiceSchedule) {
  const cents = Math.round(total * 100), payment = Math.round(schedule.amount * 100);
  if (!Number.isFinite(cents) || !Number.isFinite(payment) || cents <= 0 || payment <= 0 || Math.ceil(cents / payment) > 600 || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.start)) return [];
  const start = new Date(`${schedule.start}T12:00:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== schedule.start) return [];
  return Array.from({ length: Math.ceil(cents / payment) }, (_, index) => {
    const date = new Date(start);
    if (schedule.frequency === "weekly" || schedule.frequency === "fortnightly") date.setUTCDate(start.getUTCDate() + index * (schedule.frequency === "weekly" ? 7 : 14));
    else {
      const months = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 }[schedule.frequency];
      date.setUTCDate(1); date.setUTCMonth(start.getUTCMonth() + index * months);
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(start.getUTCDate(), last));
    }
    return { number: index + 1, date: date.toISOString().slice(0, 10), amount: Math.min(payment, cents - index * payment) / 100 };
  });
}

/** Display allocation only: actual invoice collection covers oldest installments first.
 * Credit returns cancel the tail of the original agreement; no payment is created here. */
export function invoiceInstallmentBalances(invoice: Pick<FinanceDocument, "total" | "outstanding" | "refunded_total">, schedule: InvoiceSchedule) {
  const total = Math.max(0, Math.round(invoice.total * 100));
  const credit = Math.min(total, Math.max(0, Math.round((invoice.refunded_total ?? 0) * 100)));
  const payable = total - credit;
  const collected = Math.min(payable, Math.max(0, payable - Math.round(invoice.outstanding * 100)));
  let offset = 0;
  return invoiceInstallments(invoice.total, schedule).map(row => {
    const amount = Math.round(row.amount * 100), due = Math.max(0, Math.min(amount, payable - offset));
    const paid = Math.max(0, Math.min(due, collected - offset));
    offset += amount;
    return { ...row, paid: paid / 100, cancelled: (amount - due) / 100, remaining: (due - paid) / 100, status: due === 0 ? "cancelled" : paid === due ? "paid" : paid > 0 ? "partial" : "unpaid" };
  });
}
