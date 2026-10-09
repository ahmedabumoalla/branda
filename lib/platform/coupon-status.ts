import type { PlatformDiscountCoupon } from "@/lib/data/platform-coupons";

export function couponStatus(coupon: PlatformDiscountCoupon, now: number) {
  if (!coupon.active) return "paused";
  if (coupon.validUntil && Date.parse(coupon.validUntil) < now) return "expired";
  if (coupon.maxRedemptions && coupon.redeemedCount >= coupon.maxRedemptions) return "exhausted";
  if (coupon.validFrom && Date.parse(coupon.validFrom) > now) return "scheduled";
  return "active";
}
export const couponStatusLabels = { active: "نشط", paused: "متوقف", expired: "منتهي", exhausted: "مكتمل الاستخدام", scheduled: "مجدول" };
export function couponSaudiDate(value?: string) {
  if (!value) return "";
  return new Date(Date.parse(value) + 3 * 3600000).toISOString().slice(0, 10);
}
export function couponDateBoundary(value: string | undefined | null, end = false) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${end ? "23:59:59.999" : "00:00:00"}+03:00` : value;
  const parsed = Date.parse(date);
  if (!Number.isFinite(parsed)) throw new Error("حدد تاريخ صلاحية صحيحًا");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(parsed + 3 * 3600000).toISOString().slice(0, 10) !== value) throw new Error("حدد تاريخ صلاحية صحيحًا");
  return new Date(parsed).toISOString();
}
