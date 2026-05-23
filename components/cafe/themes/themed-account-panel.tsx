"use client";

import Link from "next/link";
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
import type { BrandaCustomerSession } from "@/lib/customer/session";
import type {
  CustomerInvoice,
  CustomerOrder,
  CustomerTransaction,
} from "@/lib/mock/customer-activity";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import { ThemedInput } from "./themed-auth-panel";

type TabKey = "orders" | "reservations" | "transactions" | "invoices";

type Reservation = {
  id: string;
  type: string;
  date: string;
  time: string;
  guests: number;
  status: string;
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
  customer: BrandaCustomerSession;
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
  editAvatar: string;
  onEditName: (v: string) => void;
  onEditEmail: (v: string) => void;
  onPickAvatar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAvatar: () => void;
  onSaveSettings: () => void;
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

  const heroClass =
    account === "boutique" || account === "lounge-reservations"
      ? `relative overflow-hidden ${theme.hero} py-10`
      : account === "glow-panels"
        ? `relative overflow-hidden border border-[#00e676]/15 ${theme.hero} py-8`
        : account === "minimal"
          ? `py-12 ${theme.page}`
          : `relative overflow-hidden border-b ${theme.hero} py-8`;

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
              className={`inline-flex items-center gap-2 px-5 py-3 font-black ${theme.buttonOutline}`}
            >
              <ArrowRight className="h-5 w-5" />
              رجوع للكوفي
            </Link>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={props.onOpenSettings}
                className={`inline-flex items-center gap-2 px-5 py-3 font-black ${theme.buttonOutline}`}
              >
                <Settings className="h-5 w-5" />
                إعدادات الحساب
              </button>
              <button
                type="button"
                onClick={props.onLogout}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-500/15 px-5 py-3 font-black text-red-600"
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
              <p className={`mt-4 max-w-2xl font-bold leading-8 ${theme.muted}`}>
                تابع طلباتك، حجوزاتك، نقاط الولاء، الفواتير، وسجل العمليات.
              </p>
            </div>

            <div className={`p-6 ${theme.card}`}>
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-24 w-24 overflow-hidden ${account === "boutique" ? "rounded-none" : "rounded-3xl"} ${theme.button}`}
                >
                  {customer.avatarUrl ? (
                    <img src={customer.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UserRound className="h-11 w-11" />
                    </div>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-black ${theme.accent}`}>بيانات الحساب</p>
                  <h2 className="mt-1 text-2xl font-black">{customer.fullName}</h2>
                  <p className={`mt-1 font-bold ${theme.muted}`}>{customer.phone}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div
          className={`mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 ${account === "kiosk-big" ? "lg:grid-cols-2" : "xl:grid-cols-4"}`}
        >
          <StatCard experience={experience} icon={ClipboardList} title="الطلبات" value={props.myOrders.length} />
          <StatCard experience={experience} icon={CalendarDays} title="الحجوزات" value={props.myReservations.length} highlight={account === "lounge-reservations"} />
          <StatCard experience={experience} icon={Star} title="نقاط الولاء" value={props.loyaltyBalance} />
          <StatCard experience={experience} icon={CreditCard} title="الفواتير" value={formatSar(props.totalInvoices)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className={`p-5 ${theme.card}`}>
            <div
              className={`mb-6 flex flex-wrap gap-2 ${
                account === "editorial-timeline" ? "border-b-2 border-inherit pb-4" : ""
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
                    className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-black transition ${
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
                  <EmptyState experience={experience} title="لا توجد طلبات" desc="أي طلب من صفحة الكوفي سيظهر هنا." />
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
                    />
                  ))
                ) : (
                  <EmptyState experience={experience} title="لا توجد حجوزات" desc="احجز من صفحة الكوفي." />
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
                  <EmptyState experience={experience} title="لا توجد عمليات" desc="ستظهر الطلبات والنقاط هنا." />
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
                  <EmptyState experience={experience} title="لا توجد فواتير" desc="الفواتير المرتبطة بحسابك تظهر هنا." />
                )}
              </TabSection>
            )}
          </div>

          <aside className="space-y-6">
            <div className={`p-6 ${theme.hero}`}>
              <p className={`text-sm font-bold opacity-80`}>رصيد الولاء</p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl lg:text-5xl">
                {props.loyaltyBalance}
              </h2>
              <p className={`mt-3 text-sm leading-7 opacity-80`}>
                يُحتسب تلقائيًا من عملياتك المسجلة.
              </p>
            </div>
            <div className={`p-6 ${theme.card}`}>
              <h2 className="mb-4 text-xl font-black">آخر النشاطات</h2>
              {props.latestActivity.length ? (
                <div className="space-y-3">
                  {props.latestActivity.map((item) => (
                    <div key={`${item.type}-${item.id}`} className={`rounded-2xl p-4 ${theme.buttonOutline}`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-black">{item.title}</h3>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>
                          {item.type}
                        </span>
                      </div>
                      <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState experience={experience} title="لا يوجد نشاط" desc="ابدأ بطلب أو حجز." />
              )}
            </div>
          </aside>
        </div>
      </section>

      {props.settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-2xl p-6 ${theme.card}`}>
            <div className="mb-6 flex items-center justify-between border-b border-inherit pb-4">
              <h2 className="text-2xl font-black">تعديل بيانات العميل</h2>
              <button type="button" onClick={props.onCloseSettings} className={`p-3 ${theme.buttonOutline}`}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5">
              <div className={`flex items-center gap-4 p-4 ${theme.buttonOutline}`}>
                <div className={`h-24 w-24 overflow-hidden ${theme.button}`}>
                  {props.editAvatar ? (
                    <img src={props.editAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UserRound className="h-10 w-10" />
                    </div>
                  )}
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
                    className={`inline-flex items-center gap-2 px-5 py-3 font-black ${theme.buttonOutline}`}
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
              <p className={`text-sm font-bold ${theme.muted}`}>الجوال: {customer.phone}</p>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-inherit pt-4">
              <button type="button" onClick={props.onCloseSettings} className={`px-6 py-3 font-black ${theme.buttonOutline}`}>
                إلغاء
              </button>
              <button type="button" onClick={props.onSaveSettings} className={`inline-flex items-center gap-2 px-6 py-3 font-black ${theme.button}`}>
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
      <span className={`text-xs font-black ${experience.theme.muted}`}>{label}</span>
      <div className="mt-2">{children}</div>
    </label>
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
    <div className={`p-6 ${highlight ? theme.hero : theme.card}`}>
      <Icon className={`mb-4 h-7 w-7 ${theme.accent}`} />
      <p className={`text-sm font-black ${theme.muted}`}>{title}</p>
      <h2 className="mt-2 text-3xl font-black md:text-4xl">{value}</h2>
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
      <h2 className={`mb-5 text-2xl font-black ${experience.headingTracking}`}>{title}</h2>
      <div className="space-y-3">{children}</div>
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
}: {
  experience: ThemeExperience;
  title: string;
  desc: string;
  badge?: string;
  value?: string;
  footer?: string;
}) {
  const { theme } = experience;
  return (
    <article className={`p-5 ${theme.card}`}>
      <div className="flex flex-col gap-3 md:flex-row md:justify-between">
        <div>
          <h3 className="text-lg font-black">{title}</h3>
          <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{desc}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {value ? <span className={`rounded-xl px-4 py-2 font-black ${theme.badge}`}>{value}</span> : null}
          {badge ? <span className={`rounded-xl px-4 py-2 text-sm font-black ${theme.buttonOutline}`}>{badge}</span> : null}
        </div>
      </div>
      {footer ? <p className={`mt-4 rounded-xl p-3 text-sm font-bold ${theme.muted}`}>{footer}</p> : null}
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
    <div className={`border border-dashed p-8 text-center ${theme.card}`}>
      <UserRound className={`mx-auto mb-4 h-10 w-10 ${theme.muted}`} />
      <h3 className="text-xl font-black">{title}</h3>
      <p className={`mt-2 text-sm font-bold ${theme.muted}`}>{desc}</p>
    </div>
  );
}
