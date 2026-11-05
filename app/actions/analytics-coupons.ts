"use server";

import { AnalyticsCouponError, loadAnalyticsCoupon, redeemAnalyticsCoupon } from "@/lib/data/analytics-coupons";
import type { AnalyticsCouponLookupInput, AnalyticsCouponPreview, AnalyticsCouponRedeemInput, AnalyticsCouponResult } from "@/lib/analytics/analytics-coupons";

export async function loadAnalyticsCouponAction(input: AnalyticsCouponLookupInput): Promise<AnalyticsCouponResult<AnalyticsCouponPreview>> {
  try { return { ok: true, data: await loadAnalyticsCoupon(input) }; }
  catch (error) {
    if (error instanceof AnalyticsCouponError) return { ok: false, message: error.message, code: error.code };
    return { ok: false, message: "تعذر التحقق من الكوبون أعد المحاولة", code: "unavailable" };
  }
}

export async function redeemAnalyticsCouponAction(input: AnalyticsCouponRedeemInput): Promise<AnalyticsCouponResult<AnalyticsCouponPreview>> {
  try { return { ok: true, data: await redeemAnalyticsCoupon(input) }; }
  catch (error) {
    if (error instanceof AnalyticsCouponError) return { ok: false, message: error.message, code: error.code };
    return { ok: false, message: "لم نتأكد من نتيجة صرف الكوبون أعد المحاولة بنفس البيانات", code: "uncertain" };
  }
}
