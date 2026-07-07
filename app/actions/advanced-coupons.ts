"use server";

import { revalidatePath } from "next/cache";
import {
  createOwnerBrandCoupon,
  updateOwnerBrandCoupon,
  updateOwnerBrandCouponStatus,
  type BrandCouponFormInput,
} from "@/lib/data/advanced-coupons";

export type BrandCouponActionResult = {
  ok: boolean;
  message: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تنفيذ العملية. حاول مرة أخرى.";
}

async function runCouponAction(
  successMessage: string,
  action: () => Promise<void>,
): Promise<BrandCouponActionResult> {
  try {
    await action();
    revalidatePath("/dashboard/advanced-coupons");
    return { ok: true, message: successMessage };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function createBrandCouponAction(input: BrandCouponFormInput) {
  return runCouponAction("تم إنشاء الكوبون بنجاح.", () => createOwnerBrandCoupon(input));
}

export async function updateBrandCouponAction(couponId: string, input: BrandCouponFormInput) {
  return runCouponAction("تم تحديث الكوبون بنجاح.", () => updateOwnerBrandCoupon(couponId, input));
}

export async function pauseBrandCouponAction(couponId: string) {
  return runCouponAction("تم إيقاف الكوبون مؤقتًا.", () => updateOwnerBrandCouponStatus(couponId, "paused"));
}

export async function activateBrandCouponAction(couponId: string) {
  return runCouponAction("تم تفعيل الكوبون.", () => updateOwnerBrandCouponStatus(couponId, "active"));
}

export async function draftBrandCouponAction(couponId: string) {
  return runCouponAction("تم نقل الكوبون إلى المسودة.", () => updateOwnerBrandCouponStatus(couponId, "draft"));
}
