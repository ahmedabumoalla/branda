"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgePercent,
  CalendarClock,
  Clock3,
  LockKeyhole,
  Pause,
  Pencil,
  Play,
  Save,
  Sparkles,
  Table2,
  TicketPercent,
} from "lucide-react";
import {
  activateBrandCouponAction,
  createBrandCouponAction,
  draftBrandCouponAction,
  pauseBrandCouponAction,
  updateBrandCouponAction,
  type BrandCouponActionResult,
} from "@/app/actions/advanced-coupons";
import type {
  AdvancedCouponMetric,
  AdvancedCouponMetricKey,
  AdvancedCouponOfferRow,
  AdvancedCouponSuggestion,
  AdvancedCouponsDashboardData,
  BrandCouponDiscountType,
  BrandCouponRow,
  BrandCouponStatus,
  BrandCouponTargetSegment,
} from "@/lib/data/advanced-coupons";

type Props = {
  data: AdvancedCouponsDashboardData | null;
  configError?: string;
};

type CouponFormState = {
  code: string;
  title: string;
  description: string;
  discountType: BrandCouponDiscountType;
  discountValue: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  maxRedemptionsPerCustomer: string;
  minimumOrderAmount: string;
  targetSegment: BrandCouponTargetSegment;
  status: BrandCouponStatus;
};

const emptyCouponForm: CouponFormState = {
  code: "",
  title: "",
  description: "",
  discountType: "percentage",
  discountValue: "10",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
  maxRedemptionsPerCustomer: "",
  minimumOrderAmount: "0",
  targetSegment: "all",
  status: "draft",
};

const metricIcons: Record<AdvancedCouponMetricKey, typeof TicketPercent> = {
  activeOffers: TicketPercent,
  expiredOffers: Clock3,
  upcomingOffers: CalendarClock,
  discountOrders: BadgePercent,
};

const offerStatusTone: Record<AdvancedCouponOfferRow["status"], string> = {
  نشط: "bg-emerald-50 text-emerald-700",
  منتهي: "bg-stone-100 text-stone-700",
  قادم: "bg-sky-50 text-sky-700",
  متوقف: "bg-amber-50 text-amber-700",
  مسودة: "bg-[#FCF8F3] text-[#6B3A25]",
};

const couponStatusTone: Record<BrandCouponStatus, string> = {
  draft: "bg-[#FCF8F3] text-[#6B3A25]",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  expired: "bg-stone-100 text-stone-700",
};

const couponStatusLabel: Record<BrandCouponStatus, string> = {
  draft: "مسودة",
  active: "نشط",
  paused: "متوقف",
  expired: "منتهي",
};

const segmentLabel: Record<BrandCouponTargetSegment, string> = {
  all: "كل العملاء",
  new_customers: "عملاء جدد",
  inactive_customers: "عملاء معرضون للفقد",
  loyalty_customers: "عملاء الولاء",
  high_value_customers: "عملاء عالي التفاعل",
};

const suggestionTone: Record<AdvancedCouponSuggestion["key"], string> = {
  winback: "border-amber-200 bg-amber-50 text-amber-950",
  newCustomers: "border-sky-200 bg-sky-50 text-sky-950",
  loyalty: "border-[#D9A33F]/35 bg-[#FFF7E3] text-[#4A281D]",
  quietPeriod: "border-emerald-200 bg-emerald-50 text-emerald-950",
  weakProduct: "border-[#E7D7C6] bg-white text-[#311912]",
};

function money(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function discountLabel(coupon: Pick<BrandCouponRow, "discountType" | "discountValue">) {
  return coupon.discountType === "percentage" ? `${coupon.discountValue}%` : money(coupon.discountValue);
}

function MetricValue({ metric }: { metric: AdvancedCouponMetric }) {
  if (metric.value === null) {
    return <span className="text-base font-black text-[#806A5E]">لا توجد بيانات كافية</span>;
  }

  return <span className="text-3xl font-black text-[#311912]">{metric.value}</span>;
}

function LockedAdvancedCouponsPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
      <div className="rounded-3xl border border-[#E7D7C6] bg-white p-6 text-center shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-[#311912]">
          الكوبونات المتقدمة غير مفعلة في باقتك الحالية
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-7 text-[#806A5E]">
          تواصل مع الأدمن لتفعيل الميزة
        </p>
      </div>
    </div>
  );
}

function EmptyOffersState() {
  return (
    <div className="rounded-2xl border border-dashed border-[#D8C4B3] bg-[#FCF8F3] p-6 text-center">
      <h2 className="text-lg font-black text-[#311912]">
        لا توجد عروض أو كوبونات بعد
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#806A5E]">
        ابدأ بإنشاء عروض من صفحة العروض، وستظهر هنا تحليلاتها.
      </p>
    </div>
  );
}

function EmptyCouponsState() {
  return (
    <div className="rounded-2xl border border-dashed border-[#D8C4B3] bg-[#FCF8F3] p-6 text-center">
      <h2 className="text-lg font-black text-[#311912]">
        لا توجد كوبونات فعلية بعد
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm font-bold leading-7 text-[#806A5E]">
        أنشئ كوبونًا من النموذج أعلاه أو جهز نموذجًا من الاقتراحات. لن يتم تطبيقه على طلبات العملاء في هذه المرحلة.
      </p>
    </div>
  );
}

function couponFormPayload(form: CouponFormState) {
  return {
    code: form.code,
    title: form.title,
    description: form.description,
    discountType: form.discountType,
    discountValue: form.discountValue,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    maxRedemptions: form.maxRedemptions,
    maxRedemptionsPerCustomer: form.maxRedemptionsPerCustomer,
    minimumOrderAmount: form.minimumOrderAmount,
    targetSegment: form.targetSegment,
    status: form.status,
  };
}

function formFromCoupon(coupon: BrandCouponRow): CouponFormState {
  return {
    code: coupon.code,
    title: coupon.title,
    description: coupon.description ?? "",
    discountType: coupon.discountType,
    discountValue: String(coupon.discountValue),
    startsAt: toDateTimeLocal(coupon.startsAt),
    endsAt: toDateTimeLocal(coupon.endsAt),
    maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : "",
    maxRedemptionsPerCustomer: coupon.maxRedemptionsPerCustomer ? String(coupon.maxRedemptionsPerCustomer) : "",
    minimumOrderAmount: String(coupon.minimumOrderAmount),
    targetSegment: coupon.targetSegment,
    status: coupon.status,
  };
}

function presetFromSuggestion(suggestion: AdvancedCouponSuggestion): CouponFormState {
  const presets: Record<AdvancedCouponSuggestion["key"], Partial<CouponFormState>> = {
    winback: { code: "WINBACK10", discountType: "percentage", discountValue: "10", targetSegment: "inactive_customers" },
    newCustomers: { code: "WELCOME10", discountType: "percentage", discountValue: "10", targetSegment: "new_customers" },
    loyalty: { code: "LOYALTY15", discountType: "percentage", discountValue: "15", targetSegment: "loyalty_customers" },
    quietPeriod: { code: "QUIET10", discountType: "percentage", discountValue: "10", targetSegment: "all" },
    weakProduct: { code: "PRODUCT10", discountType: "percentage", discountValue: "10", targetSegment: "high_value_customers" },
  };

  return {
    ...emptyCouponForm,
    ...presets[suggestion.key],
    title: suggestion.title,
    description: `${suggestion.segment} - ${suggestion.reason}`,
    status: "draft",
  };
}

function CouponForm({
  form,
  editingCouponId,
  pending,
  result,
  onChange,
  onCancelEdit,
  onSubmit,
}: {
  form: CouponFormState;
  editingCouponId: string | null;
  pending: boolean;
  result: BrandCouponActionResult | null;
  onChange: (next: CouponFormState) => void;
  onCancelEdit: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
            <TicketPercent className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-black text-[#311912]">
              {editingCouponId ? "تعديل كوبون" : "إنشاء كوبون"}
            </h2>
            <p className="text-xs font-bold text-[#806A5E]">
              الحفظ يضيف الكوبون لقاعدة البيانات فقط، ولا يطبقه على طلبات العملاء الآن.
            </p>
          </div>
        </div>
        {editingCouponId ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-xl border border-[#E7D7C6] px-4 py-2 text-xs font-black text-[#6B3A25]"
          >
            إلغاء التعديل
          </button>
        ) : null}
      </div>

      {result ? (
        <div className={`mb-4 rounded-xl border p-3 text-sm font-black ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {result.message}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          كود الكوبون
          <input
            required
            value={form.code}
            onChange={(event) => onChange({ ...form, code: event.target.value.toUpperCase() })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
            placeholder="WELCOME10"
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          العنوان
          <input
            required
            value={form.title}
            onChange={(event) => onChange({ ...form, title: event.target.value })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
            placeholder="كوبون ترحيبي"
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          نوع الخصم
          <select
            value={form.discountType}
            onChange={(event) => onChange({ ...form, discountType: event.target.value as BrandCouponDiscountType })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
          >
            <option value="percentage">نسبة مئوية</option>
            <option value="fixed">مبلغ ثابت</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          قيمة الخصم
          <input
            required
            min="0"
            step="0.01"
            type="number"
            value={form.discountValue}
            onChange={(event) => onChange({ ...form, discountValue: event.target.value })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          الحد الأدنى للطلب
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.minimumOrderAmount}
            onChange={(event) => onChange({ ...form, minimumOrderAmount: event.target.value })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          تاريخ البداية
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => onChange({ ...form, startsAt: event.target.value })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          تاريخ النهاية
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => onChange({ ...form, endsAt: event.target.value })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          الشريحة المستهدفة
          <select
            value={form.targetSegment}
            onChange={(event) => onChange({ ...form, targetSegment: event.target.value as BrandCouponTargetSegment })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
          >
            {Object.entries(segmentLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          حد الاستخدام الكلي
          <input
            min="1"
            type="number"
            value={form.maxRedemptions}
            onChange={(event) => onChange({ ...form, maxRedemptions: event.target.value })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
            placeholder="بدون حد"
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          حد الاستخدام لكل عميل
          <input
            min="1"
            type="number"
            value={form.maxRedemptionsPerCustomer}
            onChange={(event) => onChange({ ...form, maxRedemptionsPerCustomer: event.target.value })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
            placeholder="بدون حد"
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25]">
          الحالة
          <select
            value={form.status}
            onChange={(event) => onChange({ ...form, status: event.target.value as BrandCouponStatus })}
            className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold text-[#311912] outline-none focus:border-[#D9A33F]"
          >
            {Object.entries(couponStatusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-black text-[#6B3A25] md:col-span-2 xl:col-span-4">
          الوصف
          <textarea
            value={form.description}
            onChange={(event) => onChange({ ...form, description: event.target.value })}
            className="min-h-24 rounded-xl border border-[#E7D7C6] bg-white px-3 py-2 text-sm font-bold leading-7 text-[#311912] outline-none focus:border-[#D9A33F]"
            placeholder="ملاحظات داخلية أو وصف مختصر للكوبون"
          />
        </label>
        <div className="md:col-span-2 xl:col-span-4">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-[#6B3A25] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {pending ? "جار الحفظ..." : editingCouponId ? "حفظ التعديل" : "إنشاء الكوبون"}
          </button>
        </div>
      </form>
    </section>
  );
}

function CouponsTable({
  coupons,
  pending,
  onEdit,
  onPause,
  onActivate,
  onDraft,
}: {
  coupons: BrandCouponRow[];
  pending: boolean;
  onEdit: (coupon: BrandCouponRow) => void;
  onPause: (coupon: BrandCouponRow) => void;
  onActivate: (coupon: BrandCouponRow) => void;
  onDraft: (coupon: BrandCouponRow) => void;
}) {
  return (
    <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
          <Table2 className="h-5 w-5" />
        </span>
        <h2 className="text-base font-black text-[#311912]">الكوبونات الفعلية</h2>
      </div>

      {coupons.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-right text-sm">
            <thead>
              <tr className="border-b border-[#E7D7C6] text-xs font-black text-[#806A5E]">
                <th className="px-3 py-3">الكود</th>
                <th className="px-3 py-3">العنوان</th>
                <th className="px-3 py-3">الخصم</th>
                <th className="px-3 py-3">الحالة</th>
                <th className="px-3 py-3">البداية</th>
                <th className="px-3 py-3">النهاية</th>
                <th className="px-3 py-3">الاستخدام</th>
                <th className="px-3 py-3">إجمالي الخصم</th>
                <th className="px-3 py-3">الشريحة</th>
                <th className="px-3 py-3">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-b border-[#F2E7D9] last:border-0">
                  <td className="px-3 py-3 font-black text-[#311912]">{coupon.code}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{coupon.title}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{discountLabel(coupon)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${couponStatusTone[coupon.status]}`}>
                      {couponStatusLabel[coupon.status]}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{formatDateTime(coupon.startsAt)}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{formatDateTime(coupon.endsAt)}</td>
                  <td className="px-3 py-3 font-black text-[#311912]">{coupon.usageCount}</td>
                  <td className="px-3 py-3 font-black text-[#311912]">{money(coupon.totalDiscountAmount)}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{segmentLabel[coupon.targetSegment]}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onEdit(coupon)}
                        title="تعديل"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E7D7C6] text-[#6B3A25] disabled:opacity-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={pending || coupon.status === "active"}
                        onClick={() => onActivate(coupon)}
                        title="تفعيل"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 text-emerald-700 disabled:opacity-50"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={pending || coupon.status === "paused"}
                        onClick={() => onPause(coupon)}
                        title="إيقاف"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 text-amber-700 disabled:opacity-50"
                      >
                        <Pause className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={pending || coupon.status === "draft"}
                        onClick={() => onDraft(coupon)}
                        className="rounded-xl border border-[#E7D7C6] px-3 py-2 text-xs font-black text-[#6B3A25] disabled:opacity-50"
                      >
                        مسودة
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyCouponsState />
      )}
    </section>
  );
}

function RedemptionsTable({ data }: { data: Extract<AdvancedCouponsDashboardData, { enabled: true }> }) {
  return (
    <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
            <BadgePercent className="h-5 w-5" />
          </span>
          <h2 className="text-base font-black text-[#311912]">تقرير استخدام الكوبونات</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-black text-[#6B3A25]">
          <span className="rounded-full bg-[#FCF8F3] px-3 py-1">الاستخدام: {data.couponUsageTotal}</span>
          <span className="rounded-full bg-[#FCF8F3] px-3 py-1">إجمالي الخصم: {money(data.couponDiscountTotal)}</span>
        </div>
      </div>

      {data.latestRedemptions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead>
              <tr className="border-b border-[#E7D7C6] text-xs font-black text-[#806A5E]">
                <th className="px-3 py-3">الكوبون</th>
                <th className="px-3 py-3">العميل</th>
                <th className="px-3 py-3">الطلب</th>
                <th className="px-3 py-3">قيمة الخصم</th>
                <th className="px-3 py-3">وقت الاستخدام</th>
              </tr>
            </thead>
            <tbody>
              {data.latestRedemptions.map((redemption) => (
                <tr key={redemption.id} className="border-b border-[#F2E7D9] last:border-0">
                  <td className="px-3 py-3">
                    <p className="font-black text-[#311912]">{redemption.couponCode}</p>
                    <p className="text-xs font-bold text-[#806A5E]">{redemption.couponTitle}</p>
                  </td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{redemption.customerName}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{redemption.orderId ?? "-"}</td>
                  <td className="px-3 py-3 font-black text-[#311912]">{money(redemption.discountAmount)}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{formatDateTime(redemption.redeemedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#D8C4B3] bg-[#FCF8F3] p-6 text-center">
          <h3 className="text-base font-black text-[#311912]">لا يوجد استخدام مسجل للكوبونات بعد</h3>
          <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
            سيظهر سجل الاستخدام هنا بعد ربط الكوبونات بتجربة الطلب في مرحلة لاحقة.
          </p>
        </div>
      )}
    </section>
  );
}

function OffersTable({ offers }: { offers: AdvancedCouponOfferRow[] }) {
  return (
    <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
          <Table2 className="h-5 w-5" />
        </span>
        <h2 className="text-base font-black text-[#311912]">العروض الحالية من صفحة العروض</h2>
      </div>

      {offers.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-right text-sm">
            <thead>
              <tr className="border-b border-[#E7D7C6] text-xs font-black text-[#806A5E]">
                <th className="px-3 py-3">الاسم</th>
                <th className="px-3 py-3">الحالة</th>
                <th className="px-3 py-3">تاريخ البداية</th>
                <th className="px-3 py-3">تاريخ النهاية</th>
                <th className="px-3 py-3">نوع الخصم</th>
                <th className="px-3 py-3">عدد الاستخدام</th>
                <th className="px-3 py-3">الحالة المحسوبة</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id} className="border-b border-[#F2E7D9] last:border-0">
                  <td className="px-3 py-3 font-black text-[#311912]">{offer.title}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{offer.rawStatus}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{offer.startDate}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{offer.endDate}</td>
                  <td className="px-3 py-3 font-bold text-[#806A5E]">{offer.discountType}</td>
                  <td className="px-3 py-3 font-black text-[#311912]">
                    {offer.usageCount ?? "لا توجد بيانات كافية"}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${offerStatusTone[offer.status]}`}>
                      {offer.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyOffersState />
      )}
    </section>
  );
}

export function AdvancedCouponsPage({ data, configError }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<CouponFormState>(emptyCouponForm);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<BrandCouponActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!data) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          {configError ?? "تعذر تحميل الكوبونات المتقدمة"}
        </div>
      </div>
    );
  }

  if (!data.enabled) return <LockedAdvancedCouponsPage />;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = couponFormPayload(form);

    startTransition(async () => {
      const result = editingCouponId
        ? await updateBrandCouponAction(editingCouponId, payload)
        : await createBrandCouponAction(payload);
      setActionResult(result);

      if (result.ok) {
        setEditingCouponId(null);
        setForm(emptyCouponForm);
        router.refresh();
      }
    });
  }

  function editCoupon(coupon: BrandCouponRow) {
    setEditingCouponId(coupon.id);
    setForm(formFromCoupon(coupon));
    setActionResult(null);
  }

  function runStatusAction(
    coupon: BrandCouponRow,
    action: (couponId: string) => Promise<BrandCouponActionResult>,
  ) {
    startTransition(async () => {
      const result = await action(coupon.id);
      setActionResult(result);
      if (result.ok) router.refresh();
    });
  }

  function fillFromSuggestion(suggestion: AdvancedCouponSuggestion) {
    setEditingCouponId(null);
    setForm(presetFromSuggestion(suggestion));
    setActionResult({
      ok: true,
      message: "تم تجهيز بيانات الكوبون في النموذج. لم يتم حفظ أي شيء بعد.",
    });
  }

  return (
    <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">لوحة برندة</p>
          <h1 className="mt-1.5 text-2xl font-black text-[#311912] lg:text-3xl">الكوبونات المتقدمة</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#806A5E]">
            إدارة كوبونات العلامة وتحليل استخدامها مع اقتراحات مبنية على العملاء والطلبات والولاء، بدون تطبيق الكوبونات على طلبات العملاء في هذه المرحلة.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
          <Sparkles className="h-4 w-4" />
          Advanced Coupons v2
        </div>
      </header>

      {configError ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">
          {configError}
        </div>
      ) : null}

      <div className="mb-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />
        <p>
          هذه المرحلة تدير سجلات الكوبونات داخل لوحة العلامة فقط. تطبيق الكوبون على السلة أو الطلبات سيكون في مرحلة لاحقة.
        </p>
      </div>

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => {
          const Icon = metricIcons[metric.key];
          return (
            <article key={metric.key} className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-xs font-black text-[#806A5E]">{metric.label}</p>
              <p className="mt-1.5 min-h-10">
                <MetricValue metric={metric} />
              </p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">{metric.hint}</p>
            </article>
          );
        })}
      </section>

      <div className="mb-5">
        <CouponForm
          form={form}
          editingCouponId={editingCouponId}
          pending={pending}
          result={actionResult}
          onChange={setForm}
          onCancelEdit={() => {
            setEditingCouponId(null);
            setForm(emptyCouponForm);
            setActionResult(null);
          }}
          onSubmit={handleSubmit}
        />
      </div>

      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-5">
        {data.suggestions.map((suggestion) => (
          <article key={suggestion.key} className={`rounded-2xl border p-4 ${suggestionTone[suggestion.key]}`}>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
              <BadgePercent className="h-5 w-5" />
            </div>
            <div className="flex min-h-12 items-start justify-between gap-3">
              <h2 className="text-base font-black">{suggestion.title}</h2>
              <span className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-[11px] font-black">
                اقتراح فقط
              </span>
            </div>
            <p className="mt-3 text-xs font-black text-[#6B3A25]">الشريحة المناسبة</p>
            <p className="mt-1 text-sm font-bold leading-7">{suggestion.segment}</p>
            <div className="mt-4 rounded-xl bg-white/70 p-3">
              <p className="text-xs font-black text-[#6B3A25]">سبب الاقتراح</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{suggestion.reason}</p>
            </div>
            <div className="mt-3 rounded-xl bg-[#1A1117]/5 p-3">
              <p className="text-xs font-black text-[#6B3A25]">الإجراء المقترح</p>
              <p className="mt-1 text-xs font-bold leading-6 text-[#806A5E]">{suggestion.suggestedAction}</p>
            </div>
            <button
              type="button"
              onClick={() => fillFromSuggestion(suggestion)}
              className="mt-4 w-full rounded-xl bg-white/80 px-4 py-2 text-xs font-black text-[#6B3A25] ring-1 ring-black/5"
            >
              تجهيز كوبون من الاقتراح
            </button>
          </article>
        ))}
      </section>

      <div className="mb-5">
        <CouponsTable
          coupons={data.brandCoupons}
          pending={pending}
          onEdit={editCoupon}
          onPause={(coupon) => runStatusAction(coupon, pauseBrandCouponAction)}
          onActivate={(coupon) => runStatusAction(coupon, activateBrandCouponAction)}
          onDraft={(coupon) => runStatusAction(coupon, draftBrandCouponAction)}
        />
      </div>

      <div className="mb-5">
        <RedemptionsTable data={data} />
      </div>

      {data.totalOffers === 0 ? (
        <div className="mb-5">
          <EmptyOffersState />
        </div>
      ) : null}

      {data.missingSources.length ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-800">
          بعض مصادر البيانات غير متاحة حاليًا، لذلك تعرض المؤشرات المتأثرة عبارة "لا توجد بيانات كافية" بدلًا من رقم غير دقيق. المصادر: {data.missingSources.join("، ")}
        </div>
      ) : null}

      <OffersTable offers={data.latestOffers} />
    </div>
  );
}
