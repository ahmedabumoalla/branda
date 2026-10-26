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
  payments: { kind: string; collected: number; refunded: number }[];
};
