import { z } from "zod";

const reference = z.union([z.uuid(), z.literal("")]);
const amount = z.number().finite().min(0).max(1_000_000_000);
export const invoiceDraftSchema = z.object({
  invoice: z.object({
    lines: z.array(z.object({
      key: z.number().int().nonnegative(), productId: reference,
      catalogSource: z.enum(["menu", "inventory"]).optional(), unitName: z.string().max(30).optional(), unitFactor: z.number().finite().positive().max(1e6).optional(),
      quantity: z.number().finite().min(0).max(9999), price: amount.optional(),
      description: z.string().max(500).optional(), discount: amount.optional(),
      discountKind: z.enum(["amount", "percent"]).optional(), vatRate: z.number().min(0).max(100).optional(),
      name: z.string().trim().max(160).optional(), kind: z.enum(["product", "service"]).optional(),
      taxCategory: z.enum(["S", "Z", "E", "O"]).optional(), exemptionReason: z.string().max(250).optional(),
    }).strict()).min(1).max(100),
    warehouseId: reference, partyId: reference, accountId: reference,
    paymentKind: z.enum(["cash", "bank", "pos", "credit"]),
    discountValue: amount, discountKind: z.enum(["amount", "percent"]), discountEnabled: z.boolean().optional(),
    vatRate: z.number().min(0).max(100).optional(), taxInclusive: z.boolean().optional(), note: z.string().max(500),
    manualNumber: z.string().trim().max(40).optional(), currency: z.enum(["SAR", "USD", "EUR", "GBP", "AED"]).optional(),
    exchangeRate: z.number().finite().positive().max(1_000_000).optional(), priceListId: reference.optional(), statusId: reference.optional(),
    adjustment: z.object({ typeId: reference, amount }).strict().optional(), applyCredit: z.boolean().optional(),
  }).strict(),
  template: z.enum(["standard", "thermal"]),
  deliveryMethod: z.enum(["print", "whatsapp", "email", "both"]).default("print"),
  issuer: z.object({ name: z.string().max(160), vatNumber: z.string().max(15), address: z.string().max(500) }).strict().optional(),
  supplyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deposit: z.object({ kind: z.enum(["amount", "percent"]), value: amount, paid: z.boolean() }).strict().default({ kind: "amount", value: 0, paid: false }),
  shipping: z.enum(["auto", "none", "main", "secondary"]).default("none"),
  delivery: z.object({ confirmed: z.boolean(), date: z.union([z.iso.datetime({ offset: true }), z.literal("")]) }).strict().default({ confirmed: false, date: "" }),
  attachments: z.array(z.uuid()).max(20).default([]),
  extraFields: z.array(z.object({ key: z.number().int().nonnegative(), title: z.string().max(100), value: z.string().max(500) }).strict()).max(5),
}).strict();
export type InvoiceDraftPayload = z.infer<typeof invoiceDraftSchema>;
export type InvoiceDraftSummary = { id: string; revision: number; updatedAt: string; partyId: string; note: string };
