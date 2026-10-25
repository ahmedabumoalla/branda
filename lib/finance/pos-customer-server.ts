import "server-only";
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { normalizePosCustomerPhone } from "./pos-customer";

/** Reuses the pager's existing feedback-token derivation; only its one-way hash reaches SQL */
export function prepareFinancePosCustomerPayload(payload: Record<string, unknown>, requestId: string) {
  const raw = payload.customerPhone;
  delete payload.pagerFeedbackHash;
  if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
    delete payload.customerPhone;
    if (payload.redeemRewardId) throw new Error("أدخل رقم جوال العميل قبل صرف المكافأة");
    delete payload.redeemRewardId;
    return;
  }
  const phone = typeof raw === "string" ? normalizePosCustomerPhone(raw) : null;
  if (!phone) throw new Error("أدخل رقم جوال سعودي صحيح أو اترك الحقل فارغًا");
  payload.customerPhone = phone;
  if (payload.redeemRewardId !== undefined && payload.redeemRewardId !== null && payload.redeemRewardId !== "") {
    if (!z.uuid().safeParse(payload.redeemRewardId).success) throw new Error("اختر مكافأة متاحة لهذا العميل");
  } else delete payload.redeemRewardId;
  z.uuid().parse(requestId);
  const token = createHmac("sha256", getSupabaseServiceRoleKey()).update(`branda:pager:feedback:v1:${requestId}`).digest("hex");
  payload.pagerFeedbackHash = createHash("sha256").update(token).digest("hex");
}
