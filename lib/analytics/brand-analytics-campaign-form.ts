export function analyticsCampaignSaudiInput(timestamp: number) {
  return new Date(timestamp + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function analyticsCampaignSchedule(value: string, now = Date.now()): { scheduledAt: string; error: null } | { scheduledAt: null; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return { scheduledAt: null, error: "اختر تاريخ ووقت الإرسال بتوقيت الرياض" };
  const timestamp = Date.parse(`${value}:00+03:00`);
  if (!Number.isFinite(timestamp) || analyticsCampaignSaudiInput(timestamp) !== value) return { scheduledAt: null, error: "اختر تاريخًا ووقتًا صحيحين" };
  if (timestamp <= now) return { scheduledAt: null, error: "اختر موعدًا لاحقًا للإرسال" };
  if (timestamp > now + 365 * 86400_000) return { scheduledAt: null, error: "اختر موعدًا خلال ٣٦٥ يومًا من الآن" };
  return { scheduledAt: new Date(timestamp).toISOString(), error: null };
}

export function analyticsCampaignMessageTemplate(brandName: string, segment: "inactive" | "loyal" | "absent") {
  return segment === "loyal"
    ? `أهلًا بك من ${brandName}\nوجودك المتكرر يسعدنا وشكرًا لولائك وثقتك\nننتظر زيارتك القادمة بكل محبة`
    : `أهلًا بك من ${brandName}\nاشتقنا لزيارتك ويسعدنا نشوفك من جديد\nمرّ علينا وخلّنا نجدد لقاءنا`;
}

export function analyticsCampaignDraftError(title: string, body: string, kind: "message" | "offer" | "coupon" = "message") {
  if (!title.trim()) return "اكتب عنوانًا للحملة";
  if (title.trim().length > 100) return "عنوان الحملة لا يتجاوز ١٠٠ حرف";
  if (!body.trim()) return "اكتب الرسالة التي تريد إرسالها";
  if (body.trim().length > (kind === "coupon" ? 2000 : 3000)) return kind === "coupon" ? "رسالة الكوبون لا تتجاوز ٢٠٠٠ حرف قبل إضافة تفاصيله" : "الرسالة لا تتجاوز ٣٠٠٠ حرف";
  return null;
}
import { analyticsCouponConfigSchema, type AnalyticsCouponConfig } from "@/lib/analytics/analytics-coupons";


export type AnalyticsCampaignCouponDraft = {
  discountType: "percentage" | "fixed";
  discountValue: string;
  minimumOrderAmount: string;
  validityDays: string;
  terms: string;
};

export function analyticsCampaignCouponDraft(draft: AnalyticsCampaignCouponDraft): { coupon: AnalyticsCouponConfig; error: null } | { coupon: null; error: string } {
  const value = Number(draft.discountValue), minimum = Number(draft.minimumOrderAmount), days = Number(draft.validityDays);
  const decimal = /^\d+(?:\.\d{1,2})?$/;
  if (!decimal.test(draft.discountValue.trim()) || value <= 0) return { coupon: null, error: "أدخل قيمة خصم أكبر من صفر وبمنزلتين عشريتين على الأكثر" };
  if (draft.discountType === "percentage" && value > 100) return { coupon: null, error: "نسبة خصم الكوبون لا تتجاوز ١٠٠٪" };
  if (value > 100000) return { coupon: null, error: "قيمة خصم الكوبون لا تتجاوز ١٠٠ ألف ريال" };
  if (!decimal.test(draft.minimumOrderAmount.trim()) || minimum > 1000000) return { coupon: null, error: "حدد الحد الأدنى للفاتورة من صفر إلى مليون ريال وبمنزلتين عشريتين على الأكثر" };
  if (!/^\d+$/.test(draft.validityDays.trim()) || !Number.isInteger(days) || days < 1 || days > 365) return { coupon: null, error: "مدة صلاحية الكوبون من يوم واحد إلى ٣٦٥ يومًا" };
  if (draft.terms.trim().length > 400) return { coupon: null, error: "شروط الكوبون لا تتجاوز ٤٠٠ حرف" };
  const parsed = analyticsCouponConfigSchema.safeParse({ discountType: draft.discountType, discountValue: value, minimumOrderAmount: minimum, validityDays: days, terms: draft.terms.trim() });
  return parsed.success ? { coupon: parsed.data, error: null } : { coupon: null, error: "راجع قيمة الخصم وشروط الكوبون" };
}
