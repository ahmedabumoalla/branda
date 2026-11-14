import { z } from "zod";

export const giftStoreSettingsSchema = z.object({
  enabled: z.boolean(), deliveryEnabled: z.boolean(), pickupEnabled: z.boolean(),
  deliveryFee: z.number().finite().min(0).max(10000),
  paymentMethods: z.array(z.enum(["cod", "bank_transfer"])).min(1).max(2),
  pickupLocation: z.string().trim().max(1000).default(""), deliveryNotes: z.string().trim().max(1000).default(""),
  bankInstructions: z.string().trim().max(2000).default(""),
}).refine(v => v.deliveryEnabled || v.pickupEnabled, "فعّل التوصيل أو الاستلام من المحل");
export type GiftStoreSettings = z.infer<typeof giftStoreSettingsSchema> & { vatRate: number; taxInclusive: boolean };
const identifier = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const giftOrderInputSchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/), requestId: z.uuid(),
  customerName: z.string().trim().min(2).max(120), phone: z.string().transform(value => value.replace(/[\s+()-]/g, "").replace(/^05/, "9665").replace(/^00966/, "966")).pipe(z.string().regex(/^9665\d{8}$/)),
  fulfillment: z.enum(["delivery", "pickup"]), city: z.string().trim().max(100).default(""), address: z.string().trim().max(1000).default(""),
  paymentMethod: z.enum(["cod", "bank_transfer"]), giftMessage: z.string().trim().max(1000).default(""), notes: z.string().trim().max(1000).default(""),
  expectedTotal: z.number().finite().min(0).max(100_000_000),
  items: z.array(z.object({ productId: z.uuid(), optionId: identifier.optional(), quantity: z.number().int().min(1).max(99), selections: z.array(z.object({ groupId: identifier, choiceIds: z.array(identifier).max(50).optional(), text: z.string().trim().max(1000).optional(), attachmentToken: z.uuid().optional() })).max(20).default([]) })).min(1).max(30),
});
export type GiftOrderInput = z.input<typeof giftOrderInputSchema>;
export type GiftOrderStatus = "pending" | "quote_requested" | "accepted" | "preparing" | "ready" | "completed" | "cancelled" | "refunded";
export type GiftPaymentStatus = "unpaid" | "paid" | "partially_refunded" | "refunded";
export type GiftOrderReceipt = { id: string; number: number; trackingToken: string; total: number; status: GiftOrderStatus; paymentStatus: GiftPaymentStatus; duplicate?: boolean };
export type GiftOrderLine = { id: string; productId: string; name: string; catalogKind: "product" | "service"; optionId: string | null; selections: { label: string; value: string; priceDelta: number; attachmentId?: string }[]; quantity: number; unitPrice: number; lineTotal: number };
export type GiftOrder = {
  id: string; number: number; customerName: string; phone: string; fulfillment: "delivery" | "pickup"; city: string; address: string;
  giftMessage: string; notes: string; paymentMethod: "cod" | "bank_transfer"; status: GiftOrderStatus; paymentStatus: GiftPaymentStatus;
  subtotal: number; deliveryFee: number; tax: number; total: number; vatRate: number; taxInclusive: boolean;
  financeDocumentId: string | null; createdAt: string; updatedAt: string; items: GiftOrderLine[];
};
export type GiftOrderTracking = Pick<GiftOrder, "id" | "number" | "status" | "paymentStatus" | "subtotal" | "deliveryFee" | "tax" | "total" | "createdAt" | "updatedAt"> & { items: Pick<GiftOrderLine, "name" | "quantity" | "unitPrice" | "lineTotal">[] };
export const giftOrderCommandSchema = z.object({
  id: z.uuid(), requestId: z.uuid(), action: z.enum(["accept", "prepare", "ready", "complete", "cancel", "quote", "confirm_payment"]),
  amount: z.number().finite().min(0).max(100_000_000).optional(), accountId: z.uuid().optional(), warehouseId: z.uuid().optional(), shiftId: z.uuid().optional(), note: z.string().trim().max(1000).optional(),
});
export type GiftOrderCommand = z.infer<typeof giftOrderCommandSchema>;
export type GiftOrderCommandResult = { id: string; status: GiftOrderStatus; paymentStatus: GiftPaymentStatus; financeDocumentId: string | null; financeDocumentNumber?: number; duplicate?: boolean };
export const giftOrderStatusLabel: Record<GiftOrderStatus, string> = { pending: "طلب جديد", quote_requested: "طلب تسعير", accepted: "مقبول", preparing: "قيد التجهيز", ready: "جاهز", completed: "مكتمل", cancelled: "ملغي", refunded: "مسترد" };
export const giftPaymentStatusLabel: Record<GiftPaymentStatus, string> = { unpaid: "بانتظار الدفع", paid: "مدفوع", partially_refunded: "مسترد جزئيًا", refunded: "مسترد بالكامل" };

export function previewGiftOrderTotal(subtotal: number, fulfillment: "delivery" | "pickup", settings: GiftStoreSettings) {
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const deliveryFee = fulfillment === "delivery" ? settings.deliveryFee : 0;
  const base = round(subtotal + deliveryFee);
  const tax = round(settings.taxInclusive ? base - base / (1 + settings.vatRate / 100) : base * settings.vatRate / 100);
  return { subtotal: round(subtotal), deliveryFee, tax, total: settings.taxInclusive ? base : round(base + tax) };
}
