import type { FinanceShift } from "./brand-finance";

export type PosShiftReport = {
  shift: FinanceShift;
  brandName: string;
  accountName: string;
  generatedAt: string;
  invoiceCount: number;
  salesTotal: number;
  refundsTotal: number;
  netSales: number;
  supplierPayoutTotal?: number;
  supplierPayouts?: { id: string; number: number; supplierName: string; amount: number; note: string; createdAt: string; attachments: { id: string; name: string }[] }[];
  payments: { kind: string; collected: number; refunded: number }[];
};
