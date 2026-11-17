import type { FinanceAccount, FinanceDocument, FinanceParty, FinanceProduct, FinanceShift } from "@/lib/finance/brand-finance";
import type { PointsBalance, PointsSettings } from "@/lib/erp/points";

export type AldeemPoint = {
  id: string; revision: number; name: string; branchId: string; branch: string; employeeId: string; employee: string;
  warehouseId: string; cashAccountId: string; cardAccountId: string; enabled: boolean;
  sales: number; orders: number; cash: number; card: number; earned: number; redeemed: number;
  shift: FinanceShift | null;
};
export type AldeemPointInput = Pick<AldeemPoint, "id" | "revision" | "name" | "branchId" | "employeeId" | "warehouseId" | "cashAccountId" | "cardAccountId" | "enabled">;
export type AldeemPosRegister = {
  points: AldeemPoint[]; userId: string; canManage: boolean;
  branches: { id: string; name: string }[]; staff: { id: string; name: string }[];
  warehouses: { id: string; name: string }[]; accounts: FinanceAccount[];
};
export type AldeemPosContext = {
  point: AldeemPoint; products: (FinanceProduct & { catalogSource: "inventory"; sku: string; barcode: string; unitName: string; unitFactor: number; priceSource?: "point" | "branch" | "default"; pricingError?: string | null })[]; userId: string; shift: FinanceShift | null;
  settings: { vat_rate: number; tax_inclusive: boolean }; pointsSettings: PointsSettings;
  cashBalance: number;
};
export type AldeemPosCustomer = FinanceParty & { points: PointsBalance };
export type AldeemCustomerAccount = {
  customer: FinanceParty; points: PointsBalance; documents: FinanceDocument[];
  entries: { id: string; kind: string; points: number; createdAt: string; note: string }[];
};
export const posMoney = (value: number) => Number(value || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function localCustomerPhone(value: string) {
  const digits = value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/\D/g, "");
  return digits.replace(/^(?:00966|966)/, "0");
}
