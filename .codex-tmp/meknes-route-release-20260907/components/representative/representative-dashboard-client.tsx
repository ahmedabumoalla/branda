"use client";

import { useState, type ElementType, type FormEvent } from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  Building2,
  CalendarDays,
  Eye,
  EyeOff,
  ExternalLink,
  Filter,
  KeyRound,
  Search,
  LogOut,
  MapPin,
  ReceiptText,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { changeRepresentativePasswordAction } from "@/app/actions/representatives";
import { logoutAction } from "@/app/actions/auth";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import type { RepresentativeDashboard } from "@/lib/data/representatives";

function formatSar(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string) {
  if (!value) return "لا يوجد";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  if (status === "paid") return "تمت التصفية";
  if (status === "cancelled") return "ملغية";
  if (status === "accrued") return "غير مصفاة";
  return "بدون عمولة";
}

function MetricCard({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: string | number;
  icon: ElementType;
  hint?: string;
}) {
  return (
    <article className="rounded-[16px] border border-white/10 bg-[#17100d] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <Icon className="mb-3 h-5 w-5 text-[#D9A33F]" />
      <p className="text-xs font-black text-[#CBB29C]">{title}</p>
      <p className="mt-1.5 text-2xl font-black text-[#FCF8F3]">{value}</p>
      {hint ? <p className="mt-2 text-xs font-bold text-[#806A5E]">{hint}</p> : null}
    </article>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-[#F2E7D9]">{label}</span>
      <div className="relative">
        <input
          required
          minLength={8}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-14 w-full rounded-2xl border border-[#D9A33F]/25 bg-[#211711] px-4 pl-12 text-right font-bold text-[#FCF8F3] outline-none placeholder:text-[#A98E7A] focus:border-[#D9A33F]/60"
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#D9A33F]"
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </label>
  );
}

export function RepresentativeDashboardClient({
  dashboard,
}: {
  dashboard: RepresentativeDashboard;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(
    dashboard.brands[0]?.id ?? null
  );
  const [brandQuery, setBrandQuery] = useState("");
  const [onlyPaid, setOnlyPaid] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredBrands = dashboard.brands.filter((brand) => {
    const matchesQuery = [brand.name, brand.slug, brand.branch?.city, brand.branch?.name]
      .some((value) => (value ?? "").toLowerCase().includes(brandQuery.trim().toLowerCase()));
    const matchesPaid = !onlyPaid || Boolean(brand.firstPaidSubscriptionAt);
    return matchesQuery && matchesPaid;
  });

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordLoading(true);
    setPasswordMessage("");

    const result = await changeRepresentativePasswordAction({
      currentPassword,
      newPassword,
      newPasswordConfirmation,
    });

    setPasswordLoading(false);
    setPasswordMessage(result.message);

    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirmation("");
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#100c0a] px-3 py-4 text-[#F8F4EF] sm:px-4 lg:px-5">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <BarndaksaLogo variant="dark" width={132} height={52} />
            <div className="hidden border-r border-white/10 pr-5 sm:block">
              <p className="text-xs font-black text-[#D9A33F]">بوابة المندوب</p>
              <p className="mt-1 font-black text-[#FCF8F3]">
                {dashboard.representative.fullName}
              </p>
            </div>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-[#F2E7D9] transition hover:bg-white/10"
            >
              <LogOut className="h-5 w-5" />
              تسجيل الخروج
            </button>
          </form>
        </header>

        <section className="mb-5 rounded-[18px] border border-[#D9A33F]/20 bg-gradient-to-l from-[#4A281D] via-[#311912] to-[#17100d] p-5">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-black text-[#F6C35B]">مرحبًا {dashboard.representative.fullName}</p>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">لوحة أداء المندوب</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black">
                  الرقم الوظيفي {dashboard.representative.employeeNumber}
                </span>
                <span className="rounded-xl border border-[#D9A33F]/25 bg-[#D9A33F]/15 px-4 py-2 text-sm font-black text-[#F6C35B]">
                  الكوبون {dashboard.representative.couponCode}
                </span>
              </div>
            </div>

            <div className="rounded-[14px] border border-white/10 bg-black/15 p-4">
              <p className="text-xs font-black text-[#CBB29C]">إجمالي نصيبك المستحق</p>
              <p className="mt-1.5 text-2xl font-black text-[#F6C35B]">
                {formatSar(dashboard.summary.commissionAmount)}
              </p>
              <p className="mt-2 text-xs font-bold text-[#CBB29C]">
                غير المصفى {formatSar(dashboard.summary.unsettledAmount)}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="العلامات المسجلة بالكوبون"
            value={dashboard.summary.registeredBrandsCount}
            icon={Store}
          />
          <MetricCard
            title="العلامات المشتركة"
            value={dashboard.summary.paidBrandsCount}
            icon={Users}
          />
          <MetricCard
            title="قيمة الاشتراكات"
            value={formatSar(dashboard.summary.subscriptionsAmount)}
            icon={ReceiptText}
            hint="القيمة المدفوعة المسجلة"
          />
          <MetricCard
            title="إجمالي نصيبك"
            value={formatSar(dashboard.summary.commissionAmount)}
            icon={BadgeDollarSign}
          />
          <MetricCard
            title="مبالغ غير مصفاة"
            value={formatSar(dashboard.summary.unsettledAmount)}
            icon={Wallet}
          />
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-[18px] border border-white/10 bg-[#17100d] p-4 sm:p-5">
            <div className="mb-5 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-[#D9A33F]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black">تفاصيل العلامات التجارية</h2>
                <p className="mt-1 text-sm font-bold text-[#CBB29C]">
                  الاشتراكات والتجديدات والمواقع والمستحقات
                </p>
              </div>
              <button type="button" onClick={() => setFiltersOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-2xl border border-[#D9A33F]/25 bg-[#D9A33F]/10 px-4 py-3 text-sm font-black text-[#F6C35B]"><Filter className="h-4 w-4" /> فلترة</button>
            </div>

            {filtersOpen ? (
              <div className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
                  <input value={brandQuery} onChange={(event) => setBrandQuery(event.target.value)} placeholder="بحث باسم العلامة أو المدينة" className="h-12 w-full rounded-2xl border border-white/10 bg-[#100c0a] px-4 pr-12 font-bold text-[#FCF8F3] outline-none" />
                </div>
                <label className="flex items-center gap-2 rounded-2xl bg-[#100c0a] px-4 py-3 font-black text-[#F2E7D9]"><input type="checkbox" checked={onlyPaid} onChange={(event) => setOnlyPaid(event.target.checked)} /> العلامات المشتركة فقط</label>
              </div>
            ) : null}

            <div className="space-y-4">
              {filteredBrands.map((brand) => {
                const expanded = expandedBrandId === brand.id;

                return (
                  <article
                    key={brand.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-[#100c0a]"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedBrandId(expanded ? null : brand.id)}
                      className="flex w-full flex-col gap-4 p-5 text-right sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <h3 className="text-lg font-black text-[#FCF8F3]">{brand.name}</h3>
                        <p className="mt-2 text-xs font-bold text-[#CBB29C]">
                          تاريخ التسجيل {formatDate(brand.registeredAt)}
                          {"  "}
                          عدد التجديدات {brand.renewalsCount}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-xl bg-white/5 px-3 py-2 text-xs font-black text-[#F2E7D9]">
                          {formatSar(brand.subscriptionsAmount)}
                        </span>
                        <span className="rounded-xl bg-[#D9A33F]/15 px-3 py-2 text-xs font-black text-[#F6C35B]">
                          نصيبك {formatSar(brand.commissionAmount)}
                        </span>
                      </div>
                    </button>

                    {expanded ? (
                      <div className="border-t border-white/10 p-5">
                        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-xl bg-white/5 p-3">
                            <p className="text-xs font-bold text-[#CBB29C]">بداية أول اشتراك</p>
                            <p className="mt-2 text-sm font-black">{formatDate(brand.firstPaidSubscriptionAt)}</p>
                          </div>
                          <div className="rounded-xl bg-white/5 p-3">
                            <p className="text-xs font-bold text-[#CBB29C]">نهاية احتساب العمولة</p>
                            <p className="mt-2 text-sm font-black">{formatDate(brand.commissionEndAt)}</p>
                          </div>
                          <div className="rounded-xl bg-white/5 p-3">
                            <p className="text-xs font-bold text-[#CBB29C]">إجمالي نصيبك</p>
                            <p className="mt-2 text-sm font-black text-[#F6C35B]">{formatSar(brand.commissionAmount)}</p>
                          </div>
                          <div className="rounded-xl bg-white/5 p-3">
                            <p className="text-xs font-bold text-[#CBB29C]">غير مصفى</p>
                            <p className="mt-2 text-sm font-black text-amber-300">{formatSar(brand.unsettledAmount)}</p>
                          </div>
                        </div>

                        <div className="mb-5 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-bold text-[#CBB29C]">اسم المسؤول</p><p className="mt-2 text-sm font-black">{brand.ownerName || "غير متوفر"}</p></div>
                          <div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-bold text-[#CBB29C]">رقم الجوال</p><p className="mt-2 text-sm font-black">{brand.ownerPhone || "غير متوفر"}</p></div>
                          <div className="rounded-xl bg-white/5 p-3"><p className="text-xs font-bold text-[#CBB29C]">البريد الإلكتروني</p><p className="mt-2 text-sm font-black">{brand.ownerEmail || "غير متوفر"}</p></div>
                        </div>

                        <div className="mb-5 rounded-2xl border border-[#D9A33F]/15 bg-[#D9A33F]/5 p-4">
                          <div className="flex items-start gap-3">
                            <MapPin className="mt-1 h-5 w-5 shrink-0 text-[#D9A33F]" />
                            <div className="min-w-0 flex-1">
                              <p className="font-black">موقع الفرع الأساسي</p>
                              {brand.branch ? (
                                <>
                                  <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                                    {brand.branch.name}
                                    {brand.branch.address ? `  ${brand.branch.address}` : ""}
                                    {brand.branch.city ? `  ${brand.branch.city}` : ""}
                                  </p>
                                  {brand.branch.mapUrl ? (
                                    <Link
                                      href={brand.branch.mapUrl}
                                      target="_blank"
                                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#D9A33F]/15 px-4 py-2 text-sm font-black text-[#F6C35B]"
                                    >
                                      فتح الموقع
                                      <ExternalLink className="h-4 w-4" />
                                    </Link>
                                  ) : null}
                                </>
                              ) : (
                                <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                                  لم يتم تسجيل موقع فرع أساسي لهذه العلامة
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[720px] text-right">
                            <thead>
                              <tr className="border-b border-white/10 text-xs font-black text-[#CBB29C]">
                                <th className="pb-3 pl-3">الباقة</th>
                                <th className="pb-3 pl-3">الفترة</th>
                                <th className="pb-3 pl-3">القيمة</th>
                                <th className="pb-3 pl-3">النسبة</th>
                                <th className="pb-3 pl-3">نصيبك</th>
                                <th className="pb-3">الحالة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {brand.subscriptions.map((subscription) => (
                                <tr key={subscription.id} className="border-b border-white/5 text-sm font-bold">
                                  <td className="py-4 pl-3">{subscription.planName}</td>
                                  <td className="py-4 pl-3">
                                    <p>{formatDate(subscription.startedAt)}</p>
                                    <p className="mt-1 text-xs text-[#CBB29C]">
                                      إلى {formatDate(subscription.expiresAt)}
                                    </p>
                                  </td>
                                  <td className="py-4 pl-3">{formatSar(subscription.amount)}</td>
                                  <td className="py-4 pl-3 text-[#F6C35B]">{subscription.commissionRate}%</td>
                                  <td className="py-4 pl-3">{formatSar(subscription.commissionAmount)}</td>
                                  <td className="py-4">
                                    <span className="rounded-lg bg-white/5 px-3 py-2 text-xs text-[#CBB29C]">
                                      {statusLabel(subscription.commissionStatus)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {!brand.subscriptions.length ? (
                            <p className="py-8 text-center font-bold text-[#CBB29C]">
                              لا توجد اشتراكات مدفوعة حتى الآن
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {!filteredBrands.length ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center font-bold text-[#CBB29C]">
                  لا توجد علامات تجارية مطابقة للفلترة الحالية
                </div>
              ) : null}
            </div>
          </section>

          <aside className="rounded-[18px] border border-white/10 bg-[#17100d] p-4 sm:p-5">
            <div className="mb-6 flex items-center gap-3">
              <KeyRound className="h-7 w-7 text-[#D9A33F]" />
              <div>
                <h2 className="text-xl font-black">إدارة الحساب</h2>
                <p className="mt-1 text-sm font-bold text-[#CBB29C]">تغيير كلمة المرور</p>
              </div>
            </div>

            <form onSubmit={submitPassword} className="space-y-4">
              <PasswordInput
                label="كلمة المرور السابقة"
                value={currentPassword}
                onChange={setCurrentPassword}
              />
              <PasswordInput
                label="كلمة المرور الجديدة"
                value={newPassword}
                onChange={setNewPassword}
              />
              <PasswordInput
                label="تأكيد كلمة المرور الجديدة"
                value={newPasswordConfirmation}
                onChange={setNewPasswordConfirmation}
              />

              {passwordMessage ? (
                <div className="rounded-xl border border-[#D9A33F]/20 bg-[#D9A33F]/10 px-4 py-3 text-sm font-black text-[#F6C35B]">
                  {passwordMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={passwordLoading}
                className="mt-2 flex h-14 w-full items-center justify-center rounded-2xl bg-[#D9A33F] font-black text-[#211711] disabled:opacity-60"
              >
                {passwordLoading ? "جاري التحديث" : "حفظ كلمة المرور الجديدة"}
              </button>
            </form>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-black text-[#CBB29C]">بريد الحساب</p>
              <p className="mt-2 break-all text-sm font-black">{dashboard.representative.email}</p>
            </div>
            <div className="mt-4 rounded-2xl border border-[#D9A33F]/20 bg-[#D9A33F]/10 p-4">
              <p className="text-xs font-black text-[#CBB29C]">الدعم الفني</p>
              <p className="mt-2 text-sm font-bold text-[#F2E7D9]">في حال الحاجة إلى دعم فني يرجى إرسال بريد رسمي إلى</p>
              <a href="mailto:cto.barndaksa@gmail.com" className="mt-2 block break-all text-sm font-black text-[#F6C35B]">cto.barndaksa@gmail.com</a>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
