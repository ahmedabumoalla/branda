"use client";

import Link from "next/link";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  CreditCard,
  ImagePlus,
  LogOut,
  Receipt,
  Save,
  Settings,
  Sparkles,
  Star,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { formatSar } from "@/lib/format";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import type {
  CustomerInvoice,
  CustomerOrder,
  CustomerTransaction,
} from "@/lib/mock/customer-activity";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import { ThemedInput } from "./themed-auth-panel";

type TabKey = "orders" | "reservations" | "transactions" | "invoices";

type Reservation = {
  id: string;
  type: string;
  date: string;
  time: string;
  guests: number;
  status: string;
  reservationCode?: string;
  reservationCodeUsedAt?: string;
  cashierConfirmedAt?: string;
  notes?: string;
  createdAt: string;
};

type Activity = {
  id: string;
  title: string;
  desc: string;
  date: string;
  type: string;
};

export type ThemedAccountPanelProps = {
  slug: string;
  experience: ThemeExperience;
  cafeName: string;
  homeHref: string;
  customer: BarndaksaCustomerSession;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  myOrders: CustomerOrder[];
  myReservations: Reservation[];
  myTransactions: CustomerTransaction[];
  myInvoices: CustomerInvoice[];
  loyaltyBalance: number;
  totalInvoices: number;
  latestActivity: Activity[];
  onLogout: () => void;
  onOpenSettings: () => void;
  settingsOpen: boolean;
  onCloseSettings: () => void;
  editName: string;
  editEmail: string;
  editAvatarPreview: string;
  avatarAssetId?: string;
  onEditName: (v: string) => void;
  onEditEmail: (v: string) => void;
  onPickAvatar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAvatar: () => void;
  onSaveSettings: () => void;
  loyaltyFeatureEnabled?: boolean;
  loyaltySlot?: ReactNode;
  experienceRewardsSlot?: ReactNode;
  passwordSlot?: ReactNode;
  fileRef: React.RefObject<HTMLInputElement | null>;
};

const tabs: { key: TabKey; title: string; icon: ElementType }[] = [
  { key: "orders", title: "طلباتي", icon: ClipboardList },
  { key: "reservations", title: "حجوزاتي", icon: CalendarDays },
  { key: "transactions", title: "سجل العمليات", icon: WalletCards },
  { key: "invoices", title: "الفواتير", icon: Receipt },
];

export function ThemedAccountPanel(props: ThemedAccountPanelProps) {
  const { experience, customer } = props;
  const { theme, account } = experience;
  const loyaltyFeatureEnabled = props.loyaltyFeatureEnabled !== false;

  const heroClass =
    account === "boutique" || account === "lounge-reservations"
      ? `barndaksa-premium-hero relative overflow-hidden rounded-b-[36px] shadow-[0_24px_80px_rgba(49,25,18,0.14)] ${theme.hero} py-8 sm:py-10`
      : account === "glow-panels"
        ? `barndaksa-premium-hero relative overflow-hidden rounded-b-[36px] border border-[#00e676]/15 shadow-[0_24px_80px_rgba(49,25,18,0.14)] ${theme.hero} py-8`
        : account === "minimal"
          ? `barndaksa-premium-hero rounded-b-[36px] py-10 shadow-[0_24px_80px_rgba(49,25,18,0.10)] ${theme.page}`
          : `barndaksa-premium-hero relative overflow-hidden rounded-b-[36px] border-b shadow-[0_24px_80px_rgba(49,25,18,0.14)] ${theme.hero} py-8`;

  const defaultTabOrder: TabKey[] =
    account === "lounge-reservations"
      ? ["reservations", "orders", "invoices", "transactions"]
      : ["orders", "reservations", "transactions", "invoices"];

  const orderedTabs = defaultTabOrder
    .map((k) => tabs.find((t) => t.key === k))
    .filter(Boolean) as typeof tabs;

  return (
    <>
      <section className={heroClass}>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href={props.homeHref}
            className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-black transition active:scale-95 ${theme.buttonOutline}`}
            >
              <ArrowRight className="h-5 w-5" />
              رجوع للكوفي
            </Link>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onOpenSettings}
                className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-black transition active:scale-95 ${theme.buttonOutline}`}
              >
                <Settings className="h-5 w-5" />
                إعدادات الحساب
              </button>
              <button
                type="button"
                onClick={props.onLogout}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-500/15 px-5 py-3 font-black text-red-600 transition active:scale-95"
              >
                <LogOut className="h-5 w-5" />
                تسجيل خروج
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div>
              <div
                className={`mb-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-black ${theme.badge}`}
              >
                <Sparkles className="h-4 w-4" />
                حساب العميل
              </div>
              <h1
                className={`break-words font-black leading-tight ${
                  account === "kiosk-big"
                    ? "text-3xl sm:text-4xl lg:text-5xl"
                    : "text-3xl sm:text-4xl lg:text-5xl"
                } ${experience.headingTracking}`}
              >
                أهلًا {customer.fullName}
              </h1>
              <p
                className={`mt-4 max-w-2xl text-sm font-bold leading-7 sm:text-base sm:leading-8 ${theme.muted}`}
              >
                تابع طلباتك، حجوزاتك، {loyaltyFeatureEnabled ? "نقاط الولاء، " : ""}الفواتير، وسجل العمليات.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => props.onTabChange("orders")}
                  className={`rounded-2xl px-4 py-3 text-sm font-black transition active:scale-95 ${theme.button}`}
                >
                  طلباتي
                </button>
                <button
                  type="button"
                  onClick={() => props.onTabChange("reservations")}
                  className={`rounded-2xl px-4 py-3 text-sm font-black transition active:scale-95 ${theme.buttonOutline}`}
                >
                  حجوزاتي
                </button>
                <button
                  type="button"
                  onClick={props.onOpenSettings}
                  className={`rounded-2xl px-4 py-3 text-sm font-black transition active:scale-95 ${theme.buttonOutline}`}
                >
                  تعديل بياناتي
                </button>
              </div>
            </div>

            <div className={`barndaksa-premium-card rounded-[32px] border border-black/5 p-5 shadow-[0_22px_70px_rgba(49,25,18,0.12)] sm:p-6 ${theme.card}`}>
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-24 w-24 shrink-0 overflow-hidden shadow-lg ${account === "boutique" ? "rounded-[24px]" : "rounded-3xl"} ${theme.button}`}
                >
                  <LocalAssetImage
                    assetId={customer.avatarAssetId}
                    fallbackSrc={customer.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center">
                        <UserRound className="h-11 w-11" />
                      </div>
                    }
                  />
                </div>
                <div>
                  <p className={`text-sm font-black ${theme.accent}`}>
                    بيانات الحساب
                  </p>
                  <h2 className="mt-1 text-2xl font-black">
                    {customer.fullName}
                  </h2>
                  <p className={`mt-1 font-bold ${theme.muted}`}>
                    {customer.phone}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div
          className={`mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 ${account === "kiosk-big" ? "lg:grid-cols-2" : "xl:grid-cols-4"}`}
        >
          <StatCard
            experience={experience}
            icon={ClipboardList}
            title="الطلبات"
            value={props.myOrders.length}
          />
          <StatCard
            experience={experience}
            icon={CalendarDays}
            title="الحجوزات"
            value={props.myReservations.length}
            highlight={account === "lounge-reservations"}
          />
          {loyaltyFeatureEnabled ? (
            <StatCard
              experience={experience}
              icon={Star}
              title="نقاط الولاء"
              value={props.loyaltyBalance}
            />
          ) : null}
          <StatCard
            experience={experience}
            icon={CreditCard}
            title="الفواتير"
            value={formatSar(props.totalInvoices)}
          />
        </div>

        {props.loyaltySlot ? (
          <div className="mb-8">{props.loyaltySlot}</div>
        ) : null}

        <div className="mb-8">
          <AccountAdPanel experience={experience} cafeName={props.cafeName} />
        </div>

        {props.experienceRewardsSlot ? (
          <div className="mb-8">{props.experienceRewardsSlot}</div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className={`barndaksa-premium-card rounded-[32px] border border-black/5 p-4 shadow-[0_22px_70px_rgba(49,25,18,0.10)] sm:p-5 ${theme.card}`}>
            <div
              className={`mb-6 flex gap-2 overflow-x-auto pb-1 ${
                account === "editorial-timeline"
                  ? "border-b-2 border-inherit pb-4"
                  : ""
              }`}
            >
              {orderedTabs.map((tab) => {
                const Icon = tab.icon;
                const active = props.activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => props.onTabChange(tab.key)}
                    className={`inline-flex shrink-0 items-center gap-2 px-5 py-3 text-sm font-black transition active:scale-95 ${
                      active ? theme.button : theme.buttonOutline
                    } ${account === "kiosk-big" ? "text-base py-4" : "rounded-2xl"}`}
                  >
                    <Icon className="h-5 w-5" />
                    {tab.title}
                  </button>
                );
              })}
            </div>

            {props.activeTab === "orders" && (
              <TabSection experience={experience} title="متابعة الطلبات">
                {props.myOrders.length ? (
                  props.myOrders.map((order) => (
                    <InfoCard
                      key={order.id}
                      experience={experience}
                      title={order.items.join("، ")}
                      badge={order.status}
                      desc={`${formatSar(order.total)} • ${order.createdAt}`}
                    />
                  ))
                ) : (
                  <EmptyState
                    experience={experience}
                    title="لا توجد طلبات"
                    desc="أي طلب من صفحة الكوفي سيظهر هنا."
                  />
                )}
              </TabSection>
            )}

            {props.activeTab === "reservations" && (
              <TabSection experience={experience} title="حجوزاتي">
                {props.myReservations.length ? (
                  props.myReservations.map((r) => (
                    <InfoCard
                      key={r.id}
                      experience={experience}
                      title={r.type}
                      badge={r.status}
                      desc={`${r.date} • ${r.time} • ${r.guests} أشخاص`}
                      footer={r.notes ? `ملاحظة: ${r.notes}` : undefined}
                      extra={
                        r.status === "مقبول" && r.reservationCode ? (
                          <div className="mt-4 rounded-2xl border border-inherit bg-white/70 p-4 text-center text-[#311912]">
                            {r.reservationCodeUsedAt ? (
                              <div className="font-black text-emerald-700">
                                تم تأكيد حضور هذا الحجز
                              </div>
                            ) : (
                              <>
                                <SecureQrCode
                                  kind="reservation"
                                  value={r.reservationCode}
                                  title={`QR حضور الحجز ${r.reservationCode}`}
                                  size={150}
                                />
                                <p className="mt-2 select-all font-mono text-xs font-black tracking-[0.16em]">
                                  {r.reservationCode}
                                </p>
                                <p className="mt-1 text-[11px] font-black text-[#806A5E]">
                                  QR يستخدم مرة واحدة لتأكيد حضور الحجز من
                                  الكاشير أو لوحة العلامة
                                </p>
                              </>
                            )}
                          </div>
                        ) : undefined
                      }
                    />
                  ))
                ) : (
                  <EmptyState
                    experience={experience}
                    title="لا توجد حجوزات"
                    desc="احجز من صفحة الكوفي."
                  />
                )}
              </TabSection>
            )}

            {props.activeTab === "transactions" && (
              <TabSection experience={experience} title="سجل العمليات">
                {props.myTransactions.length ? (
                  props.myTransactions.map((t) => (
                    <InfoCard
                      key={t.id}
                      experience={experience}
                      title={t.title}
                      badge={t.type}
                      desc={`${t.description} • ${t.createdAt}`}
                      value={
                        t.points
                          ? `+${t.points} نقطة`
                          : t.amount
                            ? formatSar(t.amount)
                            : undefined
                      }
                    />
                  ))
                ) : (
                  <EmptyState
                    experience={experience}
                    title="لا توجد عمليات"
                    desc="ستظهر الطلبات والنقاط هنا."
                  />
                )}
              </TabSection>
            )}

            {props.activeTab === "invoices" && (
              <TabSection experience={experience} title="الفواتير">
                {props.myInvoices.length ? (
                  props.myInvoices.map((inv) => (
                    <InfoCard
                      key={inv.id}
                      experience={experience}
                      title={inv.title}
                      badge={inv.status}
                      desc={inv.createdAt}
                      value={formatSar(inv.amount)}
                    />
                  ))
                ) : (
                  <EmptyState
                    experience={experience}
                    title="لا توجد فواتير"
                    desc="الفواتير المرتبطة بحسابك تظهر هنا."
                  />
                )}
              </TabSection>
            )}
          </div>

          <aside className="space-y-6">
            <div className={`barndaksa-premium-card rounded-[32px] p-6 shadow-[0_22px_70px_rgba(49,25,18,0.12)] ${theme.hero}`}>
              <p className={`text-sm font-bold opacity-80`}>رصيد الولاء</p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl lg:text-5xl">
                {props.loyaltyBalance}
              </h2>
              <p className={`mt-3 text-sm leading-7 opacity-80`}>
                يُحتسب تلقائيًا من عملياتك المسجلة.
              </p>
            </div>
            <div className={`barndaksa-premium-card rounded-[32px] border border-black/5 p-5 shadow-[0_22px_70px_rgba(49,25,18,0.10)] sm:p-6 ${theme.card}`}>
              <h2 className="mb-4 text-xl font-black">آخر النشاطات</h2>
              {props.latestActivity.length ? (
                <div className="space-y-3">
                  {props.latestActivity.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className={`rounded-2xl p-4 ${theme.buttonOutline}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-black">{item.title}</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}
                        >
                          {item.type}
                        </span>
                      </div>
                      <p className={`mt-2 text-sm font-bold ${theme.muted}`}>
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  experience={experience}
                  title="لا يوجد نشاط"
                  desc="ابدأ بطلب أو حجز."
                />
              )}
            </div>
          </aside>
        </div>
      </section>

      {props.settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className={`barndaksa-premium-card max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-black/5 p-5 shadow-2xl sm:p-6 ${theme.card}`}>
            <div className="mb-6 flex items-center justify-between border-b border-inherit pb-4">
              <h2 className="text-2xl font-black">تعديل بيانات العميل</h2>
              <button
                type="button"
                onClick={props.onCloseSettings}
                className={`p-3 ${theme.buttonOutline}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5">
              <div
                className={`flex items-center gap-4 p-4 ${theme.buttonOutline}`}
              >
                <div className={`h-24 w-24 overflow-hidden ${theme.button}`}>
                  <LocalAssetImage
                    assetId={props.avatarAssetId}
                    previewUrl={props.editAvatarPreview || undefined}
                    alt=""
                    className="h-full w-full object-cover"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center">
                        <UserRound className="h-10 w-10" />
                      </div>
                    }
                  />
                </div>
                <div>
                  <input
                    ref={props.fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={props.onPickAvatar}
                  />
                  <button
                    type="button"
                    onClick={() => props.fileRef.current?.click()}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 font-black ${theme.buttonOutline}`}
                  >
                    <ImagePlus className="h-5 w-5" />
                    تغيير الصورة
                  </button>
                </div>
              </div>
              <ThemedFormField experience={experience} label="الاسم">
                <ThemedInput
                  experience={experience}
                  value={props.editName}
                  onChange={(e) => props.onEditName(e.target.value)}
                />
              </ThemedFormField>
              <ThemedFormField experience={experience} label="البريد">
                <ThemedInput
                  experience={experience}
                  value={props.editEmail}
                  onChange={(e) => props.onEditEmail(e.target.value)}
                  placeholder="example@email.com"
                />
              </ThemedFormField>
              <p className={`text-sm font-bold ${theme.muted}`}>
                الجوال: {customer.phone}
              </p>
              {props.passwordSlot ? (
                <div className="border-t border-inherit pt-5">
                  {props.passwordSlot}
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-inherit pt-4">
              <button
                type="button"
                onClick={props.onCloseSettings}
                className={`rounded-2xl px-6 py-3 font-black ${theme.buttonOutline}`}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={props.onSaveSettings}
                className={`inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black ${theme.button}`}
              >
                <Save className="h-5 w-5" />
                حفظ
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ThemedFormField({
  experience,
  label,
  children,
}: {
  experience: ThemeExperience;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={`text-xs font-black ${experience.theme.muted}`}>
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function AccountAdPanel({
  experience,
  cafeName,
}: {
  experience: ThemeExperience;
  cafeName: string;
}) {
  const { theme } = experience;
  return (
    <section className={`barndaksa-premium-card overflow-hidden rounded-[32px] p-5 shadow-[0_22px_70px_rgba(49,25,18,0.12)] sm:p-6 ${theme.hero}`}>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className={`inline-flex items-center gap-2 text-sm font-black ${theme.accent}`}>
            <Sparkles className="h-4 w-4" />
            مساحة داخل الحساب
          </p>
          <h2 className="mt-2 text-2xl font-black">
            {cafeName} أقرب لحسابك الآن
          </h2>
          <p className={`mt-2 max-w-2xl text-sm font-bold leading-7 ${theme.muted}`}>
            اختصارات الطلبات والحجوزات والولاء مجمعة هنا حتى يعود العميل لما يهمه بسرعة.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["طلب", ClipboardList],
            ["حجز", CalendarDays],
            ["ولاء", WalletCards],
          ].map(([label, Icon]) => {
            const ItemIcon = Icon as ElementType;
            return (
              <span key={label as string} className={`rounded-2xl px-4 py-3 text-xs font-black ${theme.card}`}>
                <ItemIcon className={`mx-auto mb-1 h-4 w-4 ${theme.accent}`} />
                {label as string}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatCard({
  experience,
  icon: Icon,
  title,
  value,
  highlight,
}: {
  experience: ThemeExperience;
  icon: ElementType;
  title: string;
  value: string | number;
  highlight?: boolean;
}) {
  const { theme } = experience;
  return (
    <div className={`barndaksa-premium-card rounded-[28px] border border-black/5 p-5 shadow-[0_18px_55px_rgba(49,25,18,0.09)] ${highlight ? theme.hero : theme.card}`}>
      <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${theme.badge}`}>
        <Icon className={`h-6 w-6 ${theme.accent}`} />
      </span>
      <p className={`text-sm font-black ${theme.muted}`}>{title}</p>
      <h2 className="mt-2 break-words text-3xl font-black md:text-4xl">{value}</h2>
    </div>
  );
}

function TabSection({
  experience,
  title,
  children,
}: {
  experience: ThemeExperience;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className={`mb-5 text-2xl font-black ${experience.headingTracking}`}>
        {title}
      </h2>
      <div className="relative space-y-3 border-r border-[var(--ci-border,var(--barndaksa-border-sand))] pr-4">
        {children}
      </div>
    </section>
  );
}

function InfoCard({
  experience,
  title,
  desc,
  badge,
  value,
  footer,
  extra,
}: {
  experience: ThemeExperience;
  title: string;
  desc: string;
  badge?: string;
  value?: string;
  footer?: string;
  extra?: ReactNode;
}) {
  const { theme } = experience;
  return (
    <article className={`barndaksa-premium-card relative rounded-[26px] border border-black/5 p-4 shadow-[0_16px_45px_rgba(49,25,18,0.08)] sm:p-5 ${theme.card}`}>
      <span className={`absolute -right-[25px] top-6 h-3 w-3 rounded-full ring-4 ${theme.button}`} />
      <div className="flex flex-col gap-3 md:flex-row md:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-black">{title}</h3>
          <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {value ? (
            <span className={`rounded-xl px-4 py-2 font-black ${theme.badge}`}>
              {value}
            </span>
          ) : null}
          {badge ? (
            <span
              className={`rounded-xl px-4 py-2 text-sm font-black ${theme.buttonOutline}`}
            >
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      {footer ? (
        <p className={`mt-4 rounded-xl p-3 text-sm font-bold ${theme.muted}`}>
          {footer}
        </p>
      ) : null}
      {extra}
    </article>
  );
}

function EmptyState({
  experience,
  title,
  desc,
}: {
  experience: ThemeExperience;
  title: string;
  desc: string;
}) {
  const { theme } = experience;
  return (
    <div className={`rounded-[28px] border border-dashed p-8 text-center ${theme.card}`}>
      <span className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${theme.badge}`}>
        <UserRound className={`h-8 w-8 ${theme.muted}`} />
      </span>
      <h3 className="text-xl font-black">{title}</h3>
      <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{desc}</p>
    </div>
  );
}
