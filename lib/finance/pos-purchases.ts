import { z } from "zod";
import { purchaseDocumentSchema, supplierSchema, type PurchaseSettings, type PurchaseSnapshot } from "@/lib/erp/purchases";
import { branchScopeSchema, type BranchScope } from "@/lib/erp/branches";

export type PosPurchasePermissions = { createItem: boolean; createSupplier: boolean; credit: boolean; supplierPayout?: boolean };
export function posPurchasePermissions(role: string, settings: Partial<PurchaseSettings>): PosPurchasePermissions {
  const owner = role === "owner";
  return { createItem: owner || role === "manager" || settings.cashierCreateItem === true, createSupplier: owner || settings.cashierCreateSupplier !== false, credit: owner || settings.cashierCreditPurchase === true };
}
export const posPurchaseItemSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(150), sku: z.string().trim().min(1).max(60), unitId: z.uuid(), barcode: z.string().trim().max(64).default("") }).strict();
export type PosPurchaseItem = z.infer<typeof posPurchaseItemSchema>;
export const posPurchaseSchema = z.object({ shiftId: z.uuid(), branchScope: branchScopeSchema, invoice: purchaseDocumentSchema, newSupplier: supplierSchema.nullable().default(null), newItems: z.array(posPurchaseItemSchema).max(100).default([]), attachmentIds: z.array(z.uuid()).max(100).default([]) }).strict().superRefine((value, context) => {
  if (value.invoice.kind !== "invoice" || value.invoice.revision !== 0 || value.invoice.sourceId !== null || value.newSupplier && (value.newSupplier.revision !== 0 || value.newSupplier.openingBalance !== 0 || value.newSupplier.id !== value.invoice.supplierId)) context.addIssue({ code: "custom", message: "راجع بيانات فاتورة المشتريات الجديدة والمورد" });
  if (new Set(value.newItems.map(item => item.id)).size !== value.newItems.length || value.newItems.some(item => !value.invoice.lines.some(line => line.itemId === item.id))) context.addIssue({ code: "custom", message: "الأصناف الجديدة يجب أن تكون ضمن الفاتورة دون تكرار" });
});
export type PosPurchaseInput = z.infer<typeof posPurchaseSchema>;
export const posSupplierPayoutSchema = z.object({ shiftId: z.uuid(), branchScope: branchScopeSchema, supplierId: z.uuid(),
  newSupplier: supplierSchema.nullable().default(null), supplierName: z.string().max(160), supplierPhone: z.string().max(30),
  amount: z.number().finite().positive().max(999999999), note: z.string().trim().max(500), attachmentIds: z.array(z.uuid()).max(100),
}).strict().superRefine((value, context) => {
  if (value.newSupplier && (value.newSupplier.id !== value.supplierId || value.newSupplier.revision !== 0)) context.addIssue({ code: 'custom', message: 'راجع بيانات المورد الجديد' });
});
export type PosPurchaseCatalog = Pick<PurchaseSnapshot, "settings" | "suppliers" | "units" | "itemDefaults" | "costCenters" | "blockedItems" | "categories"> & { permissions: PosPurchasePermissions; branchScope: BranchScope; supplierBalances?: Record<string, number> };
