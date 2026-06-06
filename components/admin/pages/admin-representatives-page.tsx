"use client";

import { BadgePercent, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createRepresentativeAction } from "@/app/actions/representatives";
import {
  AdminInput,
  AdminPageShell,
  BentoCard,
  BentoGrid,
  GoldButton,
  StatusBadge,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import type { PlatformPlan } from "@/lib/platform/admin-data";
import type { RepresentativeItem } from "@/lib/data/representatives";

export function AdminRepresentativesPage({
  initialRepresentatives,
  availablePlans,
  configError,
}: {
  initialRepresentatives: RepresentativeItem[];
  availablePlans: PlatformPlan[];
  configError?: string;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [credentials, setCredentials] = useState<{
    loginEmail: string;
    temporaryPassword: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const result = await createRepresentativeAction(new FormData(event.currentTarget));
      setCredentials(result);
      setFormOpen(false);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "تعذر إضافة المندوب"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageShell
      title="إدارة المناديب"
      subtitle="إدارة الحسابات والكوبونات والعمولات المرتبطة بالاشتراكات"
      action={
        <GoldButton
          onClick={() => {
            setFormError("");
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          إضافة مندوب
        </GoldButton>
      }
    >
      {configError ? (
        <p className="mb-5 font-black text-red-300">{configError}</p>
      ) : null}

      {credentials ? (
        <BentoCard variant="gold" className="mb-6">
          <p className="font-black text-white">بيانات دخول المندوب الجديدة</p>
          <p className="mt-3 font-bold text-white">{credentials.loginEmail}</p>
          <p className="mt-2 font-black text-white">{credentials.temporaryPassword}</p>
          <p className="mt-3 text-sm font-bold text-[#CBB29C]">
            يسجل المندوب بهذا البريد وكلمة المرور المؤقتة من صفحة تسجيل الدخول
          </p>
        </BentoCard>
      ) : null}

      <BentoGrid>
        {initialRepresentatives.map((representative) => (
          <BentoCard key={representative.id} variant="dark" span="2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-white">
                  {representative.fullName}
                </h2>
                <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                  {representative.employeeNumber} • {representative.region}
                </p>
                <p className="mt-1 text-sm font-bold text-[#CBB29C]">
                  {representative.email} • {representative.phone}
                </p>
              </div>

              <StatusBadge tone={representative.active ? "success" : "danger"}>
                {representative.active ? "نشط" : "متوقف"}
              </StatusBadge>
            </div>

            <div className="mt-5 rounded-2xl border border-[#D9A33F]/20 bg-[#D9A33F]/10 p-4">
              <p className="inline-flex items-center gap-2 font-black text-[#F6C35B]">
                <BadgePercent className="h-5 w-5" />
                {representative.couponCode}
              </p>
              <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                خصم {representative.discountPercent}% • تجربة مجانية{" "}
                {representative.freeTrialDays} يوم
              </p>
              <p className="mt-2 text-xs font-bold text-[#CBB29C]">
                {representative.eligiblePlanIds.length
                  ? `الباقات المشمولة ${representative.eligiblePlanIds.join(" • ")}`
                  : "العرض يشمل جميع الباقات"}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              {[
                ["العلامات المسجلة", representative.registeredBrandsCount],
                ["المدفوعة", representative.paidBrandsCount],
                ["عمولة المندوب", formatSar(representative.commissionAmount)],
                [
                  "إجمالي الاشتراكات",
                  formatSar(
                    representative.subscriptionRevenue + representative.renewalsRevenue
                  ),
                ],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-white/5 p-3">
                  <p className="text-xs font-black text-[#CBB29C]">{label}</p>
                  <p className="mt-2 font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </BentoCard>
        ))}

        {!initialRepresentatives.length && !formOpen ? (
          <BentoCard variant="dark" span="4">
            <div className="flex flex-col items-center py-10 text-[#CBB29C]">
              <Users className="h-12 w-12" />
              <p className="mt-4 font-black">لا يوجد مناديب حتى الآن</p>
            </div>
          </BentoCard>
        ) : null}
      </BentoGrid>

      {formOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-4 py-6 sm:px-6 sm:py-10">
          <form
            onSubmit={submit}
            dir="rtl"
            className="mx-auto w-full max-w-5xl rounded-[28px] border border-[#D9A33F]/20 bg-[#17100d] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8"
          >
            <h2 className="mb-5 text-2xl font-black text-white">إضافة مندوب</h2>

            {formError ? (
              <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 font-black text-red-300">
                {formError}
              </p>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">الاسم الكامل</span>
                <AdminInput
                  required
                  name="fullName"
                  placeholder="اكتب اسم المندوب"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">رقم الجوال</span>
                <AdminInput
                  required
                  name="phone"
                  inputMode="tel"
                  placeholder="05xxxxxxxx"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">تاريخ الميلاد</span>
                <AdminInput
                  required
                  name="birthDate"
                  type="date"
                  className="text-[#FCF8F3] [color-scheme:dark]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">البريد الإلكتروني</span>
                <AdminInput
                  required
                  name="email"
                  type="email"
                  placeholder="example@email.com"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">المنطقة</span>
                <AdminInput
                  required
                  name="region"
                  placeholder="مثال الرياض"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">الجنسية</span>
                <AdminInput
                  required
                  name="nationality"
                  placeholder="اكتب الجنسية"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">رقم الحساب البنكي</span>
                <AdminInput
                  name="bankAccountNumber"
                  placeholder="اختياري"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">رقم الآيبان</span>
                <AdminInput
                  name="iban"
                  placeholder="اختياري"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">اسم صاحب الحساب</span>
                <AdminInput
                  name="accountName"
                  placeholder="اختياري"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">كود سويفت</span>
                <AdminInput
                  name="swiftCode"
                  placeholder="اختياري"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">كود الكوبون</span>
                <AdminInput
                  required
                  name="couponCode"
                  placeholder="مثال AHMAD40"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">نسبة خصم العلامة</span>
                <AdminInput
                  required
                  name="discountPercent"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">أيام التجربة المجانية</span>
                <AdminInput
                  name="freeTrialDays"
                  type="number"
                  min="0"
                  max="365"
                  placeholder="0"
                  className="text-[#FCF8F3] placeholder:text-[#A98E7A]"
                />
              </label>

              <div className="rounded-2xl border border-[#D9A33F]/20 bg-white/[0.02] p-4 md:col-span-2">
                <p className="mb-3 text-sm font-black text-[#F2E7D9]">
                  الباقات المشمولة بالعرض
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {availablePlans.map((plan) => (
                    <label
                      key={plan.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 font-bold text-[#FCF8F3] transition hover:border-[#D9A33F]/35"
                    >
                      <input
                        type="checkbox"
                        name="eligiblePlanIds"
                        value={plan.id}
                        className="h-4 w-4 accent-[#D9A33F]"
                      />
                      <span>{plan.name}</span>
                    </label>
                  ))}
                </div>
                {!availablePlans.length ? (
                  <p className="text-sm font-bold text-[#CBB29C]">
                    لا توجد باقات متاحة حاليا
                  </p>
                ) : null}
                <p className="mt-3 text-xs font-bold text-[#CBB29C]">
                  بدون اختيار يكون العرض متاحا لجميع الباقات
                </p>
              </div>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-black text-[#F2E7D9]">
                  مرفق الحساب البنكي اختياري PDF أو صورة
                </span>
                <AdminInput
                  name="bankDocument"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="cursor-pointer text-[#FCF8F3] file:ml-4 file:rounded-xl file:border-0 file:bg-[#D9A33F] file:px-4 file:py-2 file:font-black file:text-[#311912]"
                />
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <GoldButton type="submit" disabled={saving}>
                {saving ? "جاري الحفظ" : "إضافة المندوب"}
              </GoldButton>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-2xl border border-white/10 px-6 font-black text-white"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
