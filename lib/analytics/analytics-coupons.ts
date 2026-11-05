import { z } from "zod";

const money = (max: number) => z.number().finite().nonnegative().max(max)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001);

export const analyticsCouponConfigSchema = z.object({
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: money(100000).refine(value => value > 0),
  minimumOrderAmount: money(1000000),
  validityDays: z.number().int().min(1).max(365),
  terms: z.string().trim().max(400),
}).strict().refine(value => value.discountType !== "percentage" || value.discountValue <= 100);

export type AnalyticsCouponConfig = z.infer<typeof analyticsCouponConfigSchema>;

/** Keep this format identical to the database's per-recipient message renderer. */
export function buildAnalyticsCouponMessage(body: string, coupon: AnalyticsCouponConfig, code: string, startsAt: string | number) {
  const start = typeof startsAt === "number" ? startsAt : Date.parse(startsAt);
  const expiry = new Date(start + coupon.validityDays * 86400000 + 3 * 3600000).toISOString().slice(0, 16).replace("T", " ");
  const discount = coupon.discountType === "percentage" ? `${coupon.discountValue}%` : `${coupon.discountValue} ر.س`;
  return [body.trim(), "", `كوبونك الخاص: ${code}`, `الخصم: ${discount}`,
    `الحد الأدنى للفاتورة: ${coupon.minimumOrderAmount} ر.س`,
    `صالح حتى: ${expiry} بتوقيت الرياض`,
    "يستخدم مرة واحدة لصاحب هذا الرقم لدى العلامة",
    ...(coupon.terms.trim() ? [`الشروط: ${coupon.terms.trim()}`] : []),
  ].join("\n");
}

export function normalizeAnalyticsCouponPhone(value: string) {
  let phone = value.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)));
  if (!/^[+\d\s()-]+$/.test(phone)) return "";
  phone = phone.replace(/\D/g, "");
  if (phone.startsWith("00966")) phone = phone.slice(2);
  if (phone.startsWith("05")) phone = `966${phone.slice(1)}`;
  if (/^5\d{8}$/.test(phone)) phone = `966${phone}`;
  return /^9665\d{8}$/.test(phone) ? phone : "";
}

const lookupFields = {
  code: z.string().trim().max(40).transform(value => value.toUpperCase()).pipe(z.string().regex(/^BC-[A-F0-9]{32}$/)),
  phone: z.string().trim().max(30).transform(normalizeAnalyticsCouponPhone).pipe(z.string().regex(/^9665\d{8}$/)),
  subtotal: money(1000000).refine(value => value > 0),
};
export const analyticsCouponLookupSchema = z.object(lookupFields).strict();
export const analyticsCouponRedeemSchema = z.object({ ...lookupFields, idempotencyKey: z.uuid() }).strict();
export const analyticsCouponPreviewSchema = z.object({
  couponId: z.uuid(), title: z.string(), customerName: z.string(),
  discountType: z.enum(["percentage", "fixed"]), discountValue: money(100000).refine(value => value > 0),
  minimumOrderAmount: money(1000000), subtotal: money(1000000),
  discountAmount: money(1000000), totalAfterDiscount: money(1000000),
  expiresAt: z.string().datetime({ offset: true }), terms: z.string().max(400),
  status: z.enum(["available", "redeemed"]), redeemedAt: z.string().datetime({ offset: true }).nullable(),
}).refine(value => value.discountAmount > 0 && value.discountAmount <= value.subtotal
  && Math.abs(value.subtotal - value.discountAmount - value.totalAfterDiscount) < 0.005
  && (value.discountType !== "percentage" || value.discountValue <= 100)
  && (value.status === "redeemed") === Boolean(value.redeemedAt));

export type AnalyticsCouponLookupInput = z.input<typeof analyticsCouponLookupSchema>;
export type AnalyticsCouponRedeemInput = z.input<typeof analyticsCouponRedeemSchema>;
export type AnalyticsCouponPreview = z.infer<typeof analyticsCouponPreviewSchema>;
export type AnalyticsCouponErrorCode = "invalid" | "unavailable" | "unauthorized" | "uncertain" | "not_available" | "already_redeemed";
export type AnalyticsCouponResult<T> = { ok: true; data: T } | { ok: false; message: string; code: AnalyticsCouponErrorCode };
