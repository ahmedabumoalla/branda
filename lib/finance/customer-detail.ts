import type { FinanceDocument, FinanceParty } from "./brand-finance";
import type { InvoicePayment } from "./payment-management";
import type { QuoteRecord } from "./quotation";

export const customerDetailTabs = ["details", "invoices", "payments", "quotes", "messages", "balance", "timeline"] as const;
export type CustomerDetailTab = typeof customerDetailTabs[number];
export type CustomerPayment = InvoicePayment & { invoiceNumber: number };
export type CustomerMessage = { id: string; invoiceId: string; invoiceNumber: number; status: string; deliveryStatus: string | null; createdAt: string; finishedAt: string | null };
export type CustomerBalanceEntry = { id: string; documentId: string; number: number; kind: string; date: string; memo: string; debit: number; credit: number; runningBalance: number };
export type CustomerTimelineEntry = { id: string; kind: string; action: string; date: string; actor: string; documentId: string | null; quoteId: string | null };
export type CustomerDetail = {
  customer: FinanceParty; tab: CustomerDetailTab; page: number; pageSize: number; total: number; hasMore: boolean;
  counts: { invoices: number; payments: number; quotes: number; messages: number; balance: number; timeline: number };
  summary: { invoiceTotal: number; refundedTotal: number; outstanding: number; balance: number; collected: number; unpaidCount: number;
    lastInvoice: { id: string; number: number; date: string; total: number; outstanding: number } | null;
    lastPayment: CustomerPayment | null; lastMessage: CustomerMessage | null };
  invoices: FinanceDocument[]; payments: CustomerPayment[]; quotes: QuoteRecord[]; messages: CustomerMessage[]; balance: CustomerBalanceEntry[]; timeline: CustomerTimelineEntry[];
};
