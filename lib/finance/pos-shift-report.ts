import type { FinanceShift } from "./brand-finance";

export type PosShiftReport = {
  shift: FinanceShift;
  brandName: string;
  accountName: string;
  generatedAt: string;
  invoiceCount: number;
  invoicesAtClose?: { kind: "cash" | "receivable" | "pos" | "bank" | "partial" | "other"; count: number; total: number }[];
  salesTotal: number;
  refundsTotal: number;
  netSales: number;
  supplierPayoutTotal?: number;
  purchaseTotal?: number;
  supplierPayouts?: { id: string; number: number; supplierName: string; amount: number; note: string; createdAt: string; attachments: { id: string; name: string }[] }[];
  payments: { kind: string; collected: number; refunded: number }[];
};
