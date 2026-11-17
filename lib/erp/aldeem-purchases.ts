import { z } from "zod";
import { branchScopeSchema, type BranchContext } from "./branches";
import { purchaseDocumentSchema, purchaseSettingsSchema, purchaseTotals, type PurchaseInput } from "./purchases";
import type { FinanceDocument } from "@/lib/finance/brand-finance";

export const aldeemPurchaseKindSchema = z.enum(["request", "order", "invoice", "return"]);
export type AldeemPurchaseKind = z.infer<typeof aldeemPurchaseKindSchema>;
const status = z.enum(["draft", "pending", "approved", "rejected", "converted", "posted", "cancelled"]);
export const aldeemPurchaseSupplierSchema = z.object({ id: z.uuid(), name: z.string(), phone: z.string().nullable(), taxNumber: z.string().nullable(), active: z.boolean() });
export type AldeemPurchaseSupplier = z.infer<typeof aldeemPurchaseSupplierSchema>;
export const aldeemPurchaseItemSchema = z.object({
  id: z.uuid(), name: z.string(), sku: z.string().nullable(), unit: z.string(), active: z.boolean(),
  buyPrice: z.number().finite(), buyUnitName: z.string(), tax1: z.number().finite(), tax2: z.number().finite(),
  trackingMode: z.enum(["quantity", "serial", "lot", "expiry", "lot_expiry"]), units: z.array(z.object({ name: z.string(), factor: z.number().positive() })),
});
export type AldeemPurchaseItem = z.infer<typeof aldeemPurchaseItemSchema>;
export const aldeemPurchaseListRowSchema = z.object({
  id: z.uuid(), kind: aldeemPurchaseKindSchema, number: z.string(), displayNumber: z.string().nullable(),
  date: z.string(), createdAt: z.string(), status, supplierName: z.string(), total: z.number().finite(), financeId: z.uuid().nullable(),
  draft: purchaseDocumentSchema.optional(),
}).transform(({ draft, ...row }) => ({ ...row, total: draft ? purchaseTotals(draft).sarTotal : row.total }));
export type AldeemPurchaseListRow = z.infer<typeof aldeemPurchaseListRowSchema>;
export const aldeemPurchasePageSchema = z.object({ items: z.array(aldeemPurchaseListRowSchema).max(30), hasMore: z.boolean() });
const permissions = { canCreate: z.boolean(), canUpdate: z.boolean(), canApprove: z.boolean() };
export const aldeemPurchaseDefaultsSchema = z.object({
  brand: z.string(), branchScope: branchScopeSchema,
  branchContext: z.object({ requiresSelection: z.boolean().optional(), scope: branchScopeSchema.extend({ name: z.string().nullable().optional() }), canAll: z.boolean(), slug: z.string(), branches: z.array(z.object({ id: z.uuid(), name: z.string(), active: z.boolean(), is_primary: z.boolean() })) }),
  settings: purchaseSettingsSchema,
  financeSettings: z.object({ vat_rate: z.number(), tax_inclusive: z.boolean(), currency: z.string(), closed_through: z.string().nullable() }),
  warehouses: z.array(z.object({ id: z.uuid(), name: z.string(), active: z.boolean() })),
  accounts: z.array(z.object({ id: z.uuid(), name: z.string(), code: z.string(), kind: z.enum(["cash", "bank"]), balance: z.number(), active: z.boolean() })),
  costCenters: z.array(z.object({ id: z.uuid(), name: z.string() })), ...permissions,
});
export type AldeemPurchaseDefaults = z.infer<typeof aldeemPurchaseDefaultsSchema> & { branchContext: BranchContext };
const recordSchema = purchaseDocumentSchema.extend({ status, financeId: z.uuid().nullable(), createdAt: z.string(), total: z.number() }).transform(record => ({ ...record, total: record.status === "posted" ? record.total : purchaseTotals(record).sarTotal }));
// Preserve the original ledger's extension fields, including purchase debit/refund bases.
const documentSchema = z.object({ id: z.uuid(), kind: z.enum(["purchase", "refund"]), number: z.number(), total: z.number(), lines: z.array(z.object({ id: z.uuid(), quantity: z.number(), net: z.number(), tax: z.number() }).passthrough()) }).passthrough().transform(value => value as unknown as FinanceDocument);
export const aldeemPurchaseDetailSchema = z.object({
  record: recordSchema.nullable(), document: documentSchema.nullable(), supplier: aldeemPurchaseSupplierSchema.nullable(),
  receipt: z.object({ source_document_id: z.uuid(), receipt_document_id: z.uuid().nullable(), status: z.enum(["pending", "received"]), revision: z.number().int().positive() }).nullable(),
  items: z.array(aldeemPurchaseItemSchema), branchScope: branchScopeSchema, brand: z.string(), ...permissions,
});
export type AldeemPurchaseDetail = z.infer<typeof aldeemPurchaseDetailSchema>;

export function newAldeemPurchase(kind: Exclude<AldeemPurchaseKind, "return">): PurchaseInput {
  return { id: crypto.randomUUID(), revision: 0, kind, title: kind === "request" ? "طلب شراء" : kind === "order" ? "أمر شراء" : "فاتورة مشتريات", number: "", date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), dueDate: null, supplierId: null, supplierIds: [], warehouseId: null, sourceId: null, currency: "SAR", exchangeRate: 1, taxInclusive: true, discount: 0, discountType: "amount", shipping: 0, adjustment: 0, adjustmentAccountId: null, paid: 0, accountId: null, received: true, note: "", terms: "", customValues: {}, customStatus: "", lines: [] };
}
