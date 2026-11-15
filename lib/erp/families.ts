import { z } from "zod";

// Productive families: a family is a supplier, a receipt is a posted purchase invoice, a return is a purchase
// return and a payout is a supplier payment. This module only adds the family identity and the receipt terms.
export const familyModes = { cash: "استلام ودفع نقدي", after_sale: "استلام والدفع بعد البيع" } as const;
export type FamilyMode = keyof typeof familyModes;

const short = z.string().trim().max(160);
export const familyProfileSchema = z.object({
  ownerName: short, phone: short, nationalId: short, licenseNumber: short,
  licenseExpiry: z.union([z.iso.date(), z.literal("")]), city: short, iban: short, bankName: short,
  defaultMode: z.enum(["cash", "after_sale"]), note: z.string().trim().max(1000),
});
export type FamilyProfile = z.infer<typeof familyProfileSchema>;
export const emptyFamilyProfile: FamilyProfile = { ownerName: "", phone: "", nationalId: "", licenseNumber: "", licenseExpiry: "", city: "", iban: "", bankName: "", defaultMode: "after_sale", note: "" };

export const saveFamilySchema = z.object({
  requestId: z.uuid(), id: z.uuid().nullable(), revision: z.number().int().min(0),
  // New family: either an existing supplier account or a new one created under this id
  supplierId: z.uuid(), createSupplier: z.boolean(), name: z.string().trim().min(2).max(160),
  active: z.boolean(), profile: familyProfileSchema,
});
export type SaveFamilyInput = z.infer<typeof saveFamilySchema>;

export const familyItemSchema = z.object({
  requestId: z.uuid(), familyId: z.uuid(), name: z.string().trim().min(2).max(150), flavor: z.string().trim().max(100),
  barcode: z.string().trim().max(64), buyPrice: z.number().finite().min(0).max(99999999), salePrice: z.number().finite().min(0).max(99999999),
  minQuantity: z.number().finite().min(0).max(1000000),
});
export type FamilyItemInput = z.infer<typeof familyItemSchema>;
export const linkFamilyItemSchema = z.object({ familyId: z.uuid(), itemId: z.uuid(), linked: z.boolean() });

export const receiveFamilySchema = z.object({
  requestId: z.uuid(), purchaseId: z.uuid(), familyId: z.uuid(), branchId: z.uuid(), warehouseId: z.uuid(),
  mode: z.enum(["cash", "after_sale"]), accountId: z.uuid().nullable(), date: z.iso.date(),
  returnBy: z.union([z.iso.date(), z.literal("")]), invoiceNumber: z.string().trim().max(80), note: z.string().trim().max(1000),
  lines: z.array(z.object({ id: z.uuid(), itemId: z.uuid(), quantity: z.number().positive().max(1e6).multipleOf(.001), price: z.number().finite().min(0).max(1e9) })).min(1).max(100),
}).superRefine((value, ctx) => {
  if (value.mode === "cash" && !value.accountId) ctx.addIssue({ code: "custom", path: ["accountId"], message: "اختر الخزينة التي يصرف منها المبلغ" });
  if (new Set(value.lines.map(line => line.itemId)).size !== value.lines.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "لا تكرر الصنف في الاستلام نفسه" });
});
export type ReceiveFamilyInput = z.infer<typeof receiveFamilySchema>;

export const returnFamilySchema = z.object({
  requestId: z.uuid(), financeId: z.uuid(), accountId: z.uuid().nullable(), expectedTotal: z.number().finite().min(0).max(1e9), note: z.string().trim().max(1000),
  lines: z.array(z.object({ lineId: z.uuid(), quantity: z.number().positive().max(1e6), expectedReturnedQuantity: z.number().min(0) })).min(1).max(100),
});
export type ReturnFamilyInput = z.infer<typeof returnFamilySchema>;

export const payFamilySchema = z.object({
  requestId: z.uuid(), supplierId: z.uuid(), financeId: z.uuid(), accountId: z.uuid(), amount: z.number().finite().positive().max(1e9), note: z.string().trim().max(1000),
});
export type PayFamilyInput = z.infer<typeof payFamilySchema>;

export type FamilyRefundLine = { id: string; item_id: string | null; name: string; quantity: number; net: number; tax: number; returned_quantity: number; returned_net: number; returned_tax: number };
export type FamilyRecord = {
  id: string; number: number; revision: number; active: boolean; supplierId: string; name: string; phone: string; profile: Partial<FamilyProfile>; createdAt: string;
  itemCount: number; received: number; returned: number; sold: number; remaining: number; receivedValue: number; soldValue: number; paid: number; payable: number; dueNow: number;
};
export type FamilyItem = {
  itemId: string; familyId: string; name: string; barcode: string | null; sku: string; unit: string; flavor: string; active: boolean; cost: number; price: number;
  received: number; returned: number; sold: number; stock: { warehouseId: string; quantity: number }[]; soldByBranch: { branchId: string | null; quantity: number }[];
};
export type FamilyConsignment = {
  id: string; number: number; familyId: string; branchId: string; warehouseId: string; mode: FamilyMode; purchaseId: string; financeId: string; purchaseNumber: string;
  returnBy: string | null; note: string; receivedAt: string; total: number; refunded: number; paid: number; outstanding: number; dueNow: number;
  lines: { itemId: string; name: string; quantity: number; returned: number; sold: number; remaining: number; unitCost: number }[]; refundLines: FamilyRefundLine[];
};
export type FamilyActivity = { kind: "received" | "returned" | "paid" | "sold" | "sale_return"; at: string; familyId: string; branchId: string | null; itemId: string | null; number: number; quantity: number | null; amount: number };
export type FamilyCore = {
  branches: { id: string; name: string }[]; warehouses: { id: string; name: string; branchId: string | null }[];
  families: FamilyRecord[]; items: FamilyItem[]; consignments: FamilyConsignment[]; activity: FamilyActivity[];
};
export type FamilySnapshot = FamilyCore & {
  role: string; canWrite: boolean; canPay: boolean; slug: string; brand: string; branchScope: { branchId: string | null; revision: number; name?: string | null };
  accounts: { id: string; name: string; kind: string }[]; suppliers: { id: string; name: string; phone: string }[];
  supplierRecords: { id: string; revision: number; payload: Record<string, unknown> }[]; unlinkedItems: { id: string; name: string; barcode: string | null }[];
};
export type FamilyPortalSnapshot = FamilyCore & { brand: { name: string; slug: string } };

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
/** Same formula the purchase return uses, so the expected total always matches the ledger */
export function familyReturnTotal(lines: FamilyRefundLine[], quantities: Record<string, number>) {
  return round(lines.reduce((sum, line) => {
    const quantity = quantities[line.id] ?? 0;
    if (!(quantity > 0) || !(line.quantity > 0)) return sum;
    const share = (line.returned_quantity + quantity) / line.quantity;
    return sum + round(line.net * share) - line.returned_net + round(line.tax * share) - line.returned_tax;
  }, 0));
}
export function familyReceiptTotal(lines: { quantity: number; price: number }[]) {
  return round(lines.reduce((sum, line) => sum + round(line.quantity * line.price), 0));
}
