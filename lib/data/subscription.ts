import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getPlatformPlans } from "@/lib/data/admin";
import { roundMoney } from "@/lib/finance/barndaksa-finance";
import { calculateSubscriptionAmount, sanitizeDurationMonths } from "@/lib/platform/subscription-durations";
import type { PendingSubscription, SubscriptionRecord } from "@/lib/platform/subscription";
import type { BankSubscriptionRequest, BankTransferDetails, CurrentSubscription } from "@/lib/platform/subscription-bank";

/** Snapshot time accompanies server subscription data for stable hydration. */
export function getSubscriptionReferenceTime() { return Date.now(); }

function mapDbStatusToPaymentStatus(status: string): SubscriptionRecord["paymentStatus"] {
  if (status === "active" || status === "trialing") return "paid";
  if (status === "past_due") return "pending";
  return "failed";
}

function mapDbRowToRecord(row: Record<string, unknown>): SubscriptionRecord {
  const plan = row.platform_plans as { name: string } | null;
  const status = row.status as string;
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    planName: plan?.name ?? (row.plan_id as string),
    amount: Number(row.amount_sar),
    paymentStatus: mapDbStatusToPaymentStatus(status),
    createdAt: row.created_at as string,
    paidAt: status === "active" || status === "trialing" ? ((row.started_at as string) ?? (row.created_at as string)) : undefined,
    paymentMethodLabel: (row.payment_method_label as string) ?? undefined,
  };
}

function normalizeCoupon(code?: string | null) {
  const value = code?.trim().toUpperCase() ?? "";
  return value || null;
}

export type SubscriptionCouponPreview = {
  ok: boolean;
  message: string;
  code?: string;
  discountPercent?: number;
  discountAmount?: number;
  totalAmount?: number;
  representativeName?: string;
};

export async function getOwnerSubscriptionHistory(): Promise<SubscriptionRecord[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, platform_plans(name)")
    .eq("cafe_id", cafe.id)
    .in("status", ["active", "trialing", "cancelled", "expired"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapDbRowToRecord).filter((record) => record.paymentStatus !== "pending");
}

export async function getOwnerPendingSubscription(): Promise<PendingSubscription | null> {
  return null;
}

async function previewCouponForPlan(planId: string, planAmount: number, couponCode?: string | null, durationMonths = 1): Promise<SubscriptionCouponPreview> {
  const code = normalizeCoupon(couponCode);
  if (!code) {
    return { ok: true, message: "بدون كوبون", totalAmount: planAmount };
  }

  const admin = createAdminClient();

  const { data: platformCoupon, error: platformCouponError } = await admin
    .from("platform_discount_coupons")
    .select("id, code, title, discount_percent, eligible_plan_ids, eligible_duration_months, active, valid_from, valid_until, max_redemptions, redeemed_count")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();

  if (platformCouponError && platformCouponError.code !== "42P01") throw platformCouponError;

  if (platformCoupon) {
    if (Array.isArray(platformCoupon.eligible_duration_months) && !platformCoupon.eligible_duration_months.includes(durationMonths)) return { ok: false, message: "الكوبون لا يشمل مدة الاشتراك المختارة" };
    const now = Date.now();
    const validFrom = platformCoupon.valid_from ? new Date(String(platformCoupon.valid_from)).getTime() : null;
    const validUntil = platformCoupon.valid_until ? new Date(String(platformCoupon.valid_until)).getTime() : null;
    if (validFrom && now < validFrom) return { ok: false, message: "كوبون الخصم لم يبدأ بعد" };
    if (validUntil && now > validUntil) return { ok: false, message: "انتهت صلاحية كوبون الخصم" };
    const maxRedemptions = platformCoupon.max_redemptions == null ? null : Number(platformCoupon.max_redemptions);
    if (maxRedemptions && Number(platformCoupon.redeemed_count ?? 0) >= maxRedemptions) {
      return { ok: false, message: "تم استهلاك عدد مرات الكوبون" };
    }
    const eligible = Array.isArray(platformCoupon.eligible_plan_ids) ? (platformCoupon.eligible_plan_ids as string[]) : [];
    if (eligible.length && !eligible.includes(planId)) {
      return { ok: false, message: "الكوبون غير متاح لهذه الباقة" };
    }
    const discountPercent = Number(platformCoupon.discount_percent ?? 0);
    const discountAmount = roundMoney(planAmount * discountPercent / 100);
    return {
      ok: true,
      message: discountPercent > 0 ? `تم تطبيق خصم منصة ${discountPercent}%` : "تم تطبيق كوبون المنصة",
      code,
      discountPercent,
      discountAmount,
      totalAmount: Math.max(0, roundMoney(planAmount - discountAmount)),
    };
  }

  const cafe = await requireOwnerCafeContext();
  const { data: previousPaid } = await admin
    .from("subscriptions")
    .select("id")
    .eq("cafe_id", cafe.id)
    .gt("amount_sar", 0)
    .in("status", ["active", "trialing"])
    .limit(1)
    .maybeSingle();

  if (previousPaid) {
    return { ok: false, message: "كوبون المندوب يستخدم مرة واحدة لأول اشتراك مدفوع فقط استخدم كوبون خصم المنصة للتجديد أو الترقية" };
  }

  const { data, error } = await admin
    .from("representative_coupons")
    .select("id, code, discount_percent, eligible_plan_ids, active, valid_from, valid_until, platform_representatives(full_name, active)")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { ok: false, message: "كوبون الخصم غير صالح" };
  }

  const rep = data.platform_representatives as { full_name?: string; active?: boolean } | null;
  if (rep?.active === false) {
    return { ok: false, message: "كوبون الخصم غير مفعل" };
  }

  const eligible = Array.isArray(data.eligible_plan_ids) ? (data.eligible_plan_ids as string[]) : [];
  if (eligible.length && !eligible.includes(planId)) {
    return { ok: false, message: "الكوبون غير متاح لهذه الباقة" };
  }

  const discountPercent = Number(data.discount_percent ?? 0);
  const discountAmount = roundMoney(planAmount * discountPercent / 100);
  return {
    ok: true,
    message: discountPercent > 0 ? `تم تطبيق خصم مندوب ${discountPercent}% لأول اشتراك مدفوع` : "تم ربط الكوبون بدون خصم مالي",
    code,
    discountPercent,
    discountAmount,
    totalAmount: Math.max(0, roundMoney(planAmount - discountAmount)),
    representativeName: rep?.full_name,
  };
}

export async function validateOwnerPlanCoupon(planId: string, couponCode?: string | null, durationMonths = 1) {
  await requireOwnerCafeContext();
  const plans = await getPlatformPlans();
  const plan = plans.find((item) => item.id === planId && item.active);
  if (!plan) throw new Error("الباقة غير موجودة");
  const amount = calculateSubscriptionAmount(plan, sanitizeDurationMonths(durationMonths));
  return previewCouponForPlan(plan.id, amount, couponCode, durationMonths);
}

export async function startOwnerPlanCheckout(planId: string, couponCode?: string | null, durationMonths = 1): Promise<string> {
  const cafe = await requireOwnerCafeContext();
  const plans = await getPlatformPlans();
  const plan = plans.find((item) => item.id === planId && item.active);
  if (!plan) throw new Error("الباقة غير موجودة");

  const selectedDurationMonths = sanitizeDurationMonths(durationMonths);
  const baseAmount = calculateSubscriptionAmount(plan, selectedDurationMonths);
  const coupon = await previewCouponForPlan(plan.id, baseAmount, couponCode, selectedDurationMonths);
  if (!coupon.ok) throw new Error(coupon.message);

  const supabase = createAdminClient();
  const normalizedCoupon = normalizeCoupon(coupon.code);

  const { data: platformCouponRow } = normalizedCoupon
    ? await supabase
        .from("platform_discount_coupons")
        .select("id")
        .eq("code", normalizedCoupon)
        .eq("active", true)
        .maybeSingle()
    : { data: null } as { data: null };

  const { data: couponRow } = normalizedCoupon && !platformCouponRow
    ? await supabase
        .from("representative_coupons")
        .select("id, representative_id")
        .eq("code", normalizedCoupon)
        .eq("active", true)
        .maybeSingle()
    : { data: null } as { data: null };

  if (couponRow) {
    await supabase
      .from("brand_referrals")
      .upsert(
        {
          cafe_id: cafe.id,
          representative_id: couponRow.representative_id,
          coupon_id: couponRow.id,
        },
        { onConflict: "cafe_id", ignoreDuplicates: true }
      );
    await supabase
      .from("cafes")
      .update({ representative_id: couponRow.representative_id, referral_coupon_id: couponRow.id, referral_started_at: new Date().toISOString() })
      .eq("id", cafe.id)
      .is("referral_coupon_id", null);
  }

  await supabase
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("cafe_id", cafe.id)
    .eq("status", "past_due");

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      cafe_id: cafe.id,
      plan_id: planId,
      status: "past_due",
      amount_sar: coupon.totalAmount ?? baseAmount,
      base_amount_sar: baseAmount,
      discount_amount_sar: coupon.discountAmount ?? 0,
      coupon_code_snapshot: normalizedCoupon,
      platform_coupon_id: platformCouponRow?.id ?? null,
      representative_id: couponRow?.representative_id ?? null,
      plan_name_snapshot: plan.name,
      duration_unit: "month",
      duration_count: selectedDurationMonths,
      activation_source: "brand_card_checkout",
      payment_provider: "pending",
      payment_method_label: "بانتظار اختيار بوابة الدفع",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

// An owner may check payment status, but cannot activate a subscription.
export async function completeOwnerPlanPayment(subscriptionId?: string): Promise<boolean> {
  const cafe = await requireOwnerCafeContext();
  if (!subscriptionId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscriptions").select("id")
    .eq("cafe_id", cafe.id).eq("id", subscriptionId).eq("status", "active").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function failOwnerPlanPayment(): Promise<void> {
  const cafe = await requireOwnerCafeContext();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("cafe_id", cafe.id)
    .eq("status", "past_due");

  if (error) throw error;
}

export async function getAvailablePlans() {
  await requireOwnerCafeContext();
  const plans = await getPlatformPlans();
  return plans.filter((plan) => plan.active);
}

export async function getOwnerActiveSubscription() {
  return getOwnerPendingSubscription();
}

export async function getOwnerSubscriptionRequests() {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscription_payment_requests")
    .select("id,plan_id,plan_name,amount_sar,duration_count,status,receipt_channel,receipt_storage_path,created_at,admin_response,coupon_code_snapshot,annual_discount_amount_sar,coupon_discount_amount_sar,base_amount_sar")
    .eq("cafe_id", cafe.id).order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []).map((row): BankSubscriptionRequest => ({
    id: String(row.id), planId: String(row.plan_id), planName: String(row.plan_name), amount: Number(row.amount_sar),
    couponCode: row.coupon_code_snapshot ? String(row.coupon_code_snapshot) : undefined,
    annualDiscountAmount: Number(row.annual_discount_amount_sar ?? 0), couponDiscountAmount: Number(row.coupon_discount_amount_sar ?? 0), baseAmount: Number(row.base_amount_sar),
    durationMonths: Number(row.duration_count), status: String(row.status), receiptChannel: row.receipt_channel === "whatsapp" ? "whatsapp" : "upload",
    receiptStoragePath: row.receipt_storage_path ? String(row.receipt_storage_path) : undefined,
    createdAt: String(row.created_at), adminResponse: row.admin_response ? String(row.admin_response) : undefined,
  }));
}

export async function getCurrentOwnerSubscription(): Promise<CurrentSubscription | null> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscriptions").select("id,plan_id,status,started_at,expires_at")
    .eq("cafe_id", cafe.id).in("status", ["active", "trialing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { id: String(data.id), planId: String(data.plan_id), status: String(data.status), startedAt: data.started_at ? String(data.started_at) : null, expiresAt: data.expires_at ? String(data.expires_at) : null } : null;
}

export async function getBankTransferDetails(): Promise<BankTransferDetails | null> {
  await requireOwnerCafeContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("platform_settings").select("subscription_bank_details").eq("id", "default").single();
  if (error) throw error;
  const details = data?.subscription_bank_details as Partial<BankTransferDetails> | null;
  if (!details?.beneficiary || !details.bankName || !details.iban) return null;
  return { beneficiary: details.beneficiary, bankName: details.bankName, iban: details.iban, accountNumber: details.accountNumber ?? "" };
}

const bankQuoteErrors: Record<string, string> = {
  "Coupon invalid": "الكوبون غير صالح أو غير مفعل",
  "Coupon scheduled": "لم تبدأ صلاحية الكوبون بعد",
  "Coupon expired": "انتهت صلاحية الكوبون",
  "Coupon plan unavailable": "الكوبون لا يشمل الباقة المختارة",
  "Coupon duration unavailable": "الكوبون لا يشمل مدة الاشتراك المختارة",
  "Coupon exhausted": "اكتمل حد استخدام الكوبون أو حجز في طلبات قيد المراجعة",
  "Plan unavailable": "الباقة غير متاحة اختر باقة أخرى",
  "Invalid duration": "اختر مدة اشتراك صحيحة",
};
export type BankSubscriptionQuote = { baseAmount: number; annualDiscountAmount: number; couponDiscountAmount: number; totalAmount: number; couponCode: string | null };
export async function previewOwnerBankSubscription(planId: string, durationMonths: number, couponCode?: string): Promise<BankSubscriptionQuote> {
  const cafe = await requireOwnerCafeContext();
  if (cafe.role !== "owner") throw new Error("معاينة طلب الاشتراك متاحة من حساب المالك");
  sanitizeDurationMonths(durationMonths);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_bank_subscription", { p_plan_id: planId, p_duration_months: durationMonths, p_coupon_code: normalizeCoupon(couponCode) });
  if (error) throw new Error(bankQuoteErrors[error.message] ?? "تعذر التحقق من الكوبون حاول مجددًا");
  return data as BankSubscriptionQuote;
}

export async function createOwnerBankRequest(planId: string, durationMonths: number, couponCode?: string): Promise<BankSubscriptionRequest[]> {
  const cafe = await requireOwnerCafeContext();
  if (cafe.role !== "owner") throw new Error("طلب الاشتراك متاح من حساب المالك أنهِ وضع الصيانة وسجّل بحساب المالك لإنشاء الطلب");
  if (!planId || ![1, 3, 6, 12].includes(durationMonths)) throw new Error("اختر باقة ومدة صحيحة");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_bank_subscription_request", { p_plan_id: planId, p_duration_months: durationMonths, p_coupon_code: normalizeCoupon(couponCode) });
  if (error) {
    const reasons: Record<string, string> = {
      ...bankQuoteErrors,
      "An open request already exists": "لديك طلب اشتراك مفتوح بالفعل حدّث الصفحة لمتابعة الطلب وإرسال الإيصال",
      "Plan unavailable": "هذه الباقة غير متاحة للاشتراك حاليًا اختر باقة أخرى أو حدّث الصفحة",
      "Duration unavailable": "المدة المختارة غير متاحة لهذه الباقة اختر مدة أخرى",
      "Invalid duration": "اختر مدة اشتراك صحيحة ثم تابع",
      "Unauthorized": "انتهت جلسة الدخول سجّل الدخول إلى حساب المالك ثم حاول مجددًا",
      "Forbidden": "تعذر التحقق من ملكية الحساب سجّل الدخول إلى حساب المالك ثم حاول مجددًا",
    };
    console.error("[createOwnerBankRequest]", { code: error.code, message: error.message });
    throw new Error(reasons[error.message] ?? "تعذر إنشاء طلب الاشتراك الآن حاول مجددًا أو تواصل مع الدعم");
  }
  return getOwnerSubscriptionRequests();
}

export async function submitOwnerBankReceipt(requestId: string, formData?: FormData) {
  const cafe = await requireOwnerCafeContext();
  if (cafe.role !== "owner" || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("طلب غير صالح");
  const supabase = await createClient();
  const { data: request, error: lookupError } = await supabase.from("subscription_payment_requests").select("id,status")
    .eq("id", requestId).eq("cafe_id", cafe.id).eq("status", "awaiting_receipt").maybeSingle();
  if (lookupError || !request) throw new Error("الطلب غير متاح لإرسال الإيصال");
  if (!formData) {
    const { error } = await supabase.rpc("submit_subscription_whatsapp_receipt", { p_request_id: requestId });
    if (error) throw new Error("تعذر إرسال الطلب للمراجعة");
  } else {
    const file = formData.get("receipt");
    if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error("اختر إيصالًا بحد أقصى 5 ميجابايت");
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = bytes.subarray(0, 5).toString("ascii") === "%PDF-" ? "pdf"
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpg"
      : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png" : null;
    if (!kind) throw new Error("صيغة الإيصال غير مدعومة استخدم PDF أو JPG أو PNG");
    const storagePath = `${cafe.id}/${requestId}/${crypto.randomUUID()}.${kind}`;
    const { error: uploadError } = await supabase.storage.from("subscription-receipts").upload(storagePath, bytes, { contentType: kind === "pdf" ? "application/pdf" : kind === "jpg" ? "image/jpeg" : "image/png", upsert: false });
    if (uploadError) throw new Error("تعذر رفع الإيصال حاول مجددًا");
    const { error } = await supabase.rpc("attach_subscription_payment_receipt", { p_request_id: requestId, p_storage_path: storagePath });
    if (error) {
      await supabase.storage.from("subscription-receipts").remove([storagePath]);
      throw new Error("تعذر إرفاق الإيصال بالطلب حاول مجددًا");
    }
  }
  return getOwnerSubscriptionRequests();
}
