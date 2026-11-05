import "server-only";

import { requireCashierPermission } from "@/lib/data/cashier";
import { assertRastLoyaltyEntitlement } from "@/lib/data/rast-loyalty-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyticsCouponLookupSchema, analyticsCouponRedeemSchema, analyticsCouponPreviewSchema,
  type AnalyticsCouponErrorCode, type AnalyticsCouponPreview } from "@/lib/analytics/analytics-coupons";

export class AnalyticsCouponError extends Error {
  constructor(message: string, public code: AnalyticsCouponErrorCode) { super(message); }
}

async function context() {
  // The existing guard validates the private cashier cookie and owner session where applicable.
  const db = createAdminClient();
  try {
    const session = await requireCashierPermission("loyalty", db);
    await assertRastLoyaltyEntitlement(session.cafeId);
    return { db, session };
  } catch {
    throw new AnalyticsCouponError("سجل دخولك إلى الكاشير بحساب لديه صلاحية الولاء", "unauthorized");
  }
}

function databaseError(error: { code?: string; message?: string }, mutate: boolean): never {
  const reason = String(error.message ?? "").toUpperCase();
  if (error.code === "42501") throw new AnalyticsCouponError("انتهت الجلسة أو لم تعد لديك صلاحية صرف الكوبون", "unauthorized");
  if (/IDEMPOTENCY|REQUEST_MISMATCH/.test(reason)) {
    throw new AnalyticsCouponError("لم نتأكد من نتيجة الصرف السابق أعد المحاولة بنفس البيانات", "uncertain");
  }
  if (/ALREADY[\s_]REDEEMED/.test(reason)) throw new AnalyticsCouponError("سبق صرف هذا الكوبون ولا يمكن استخدامه مرة أخرى", "already_redeemed");
  if (error.code === "22023") {
    throw new AnalyticsCouponError("الكوبون غير متاح لهذه العملية تحقق من الكود والجوال والصلاحية والحد الأدنى للفاتورة", "not_available");
  }
  throw new AnalyticsCouponError(mutate ? "لم نتأكد من نتيجة الصرف أعد المحاولة بنفس البيانات" : "تعذر التحقق من الكوبون أعد المحاولة", mutate ? "uncertain" : "unavailable");
}

export async function loadAnalyticsCoupon(raw: unknown): Promise<AnalyticsCouponPreview> {
  const { db, session } = await context();
  const parsed = analyticsCouponLookupSchema.safeParse(raw);
  if (!parsed.success) throw new AnalyticsCouponError("أدخل كود الكوبون وجوال العميل ومبلغ الفاتورة بشكل صحيح", "invalid");
  const input = parsed.data;
  const result = await db.rpc("analytics_coupon_preview", {
    p_session_token: session.token, p_code: input.code, p_phone: input.phone, p_subtotal: input.subtotal,
  });
  if (result.error) databaseError(result.error, false);
  const data = analyticsCouponPreviewSchema.parse(result.data);
  if (data.status !== "available" || data.subtotal !== input.subtotal) {
    throw new AnalyticsCouponError("تغيرت بيانات الكوبون أعد التحقق قبل الصرف", "unavailable");
  }
  return data;
}

export async function redeemAnalyticsCoupon(raw: unknown): Promise<AnalyticsCouponPreview> {
  const { db, session } = await context();
  const parsed = analyticsCouponRedeemSchema.safeParse(raw);
  if (!parsed.success) throw new AnalyticsCouponError("راجع بيانات الكوبون ومبلغ الفاتورة قبل تأكيد الصرف", "invalid");
  const input = parsed.data;
  const result = await db.rpc("analytics_coupon_redeem", {
    p_session_token: session.token, p_code: input.code, p_phone: input.phone, p_subtotal: input.subtotal, p_key: input.idempotencyKey,
  });
  if (result.error) databaseError(result.error, true);
  const data = analyticsCouponPreviewSchema.parse(result.data);
  if (data.status !== "redeemed" || data.subtotal !== input.subtotal) {
    throw new AnalyticsCouponError("لم نتأكد من نتيجة الصرف أعد المحاولة بنفس البيانات", "uncertain");
  }
  return data;
}
