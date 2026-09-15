"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type ElementType, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Gift, ImagePlus, LogOut, PackageCheck, Pencil, Save, ShieldCheck, UserRound } from "lucide-react";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import { BrandaLogo } from "@/components/ui/branda-logo";
import { formatSar } from "@/lib/format";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import type { CustomerInvoice, CustomerOrder, CustomerTransaction } from "@/lib/mock/customer-activity";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { CustomerLoyaltyCardView } from "@/lib/data/loyalty-cards";
import type { CustomerExperienceReward } from "@/lib/data/experience-rewards";
import { getBusinessCopy } from "@/lib/platform/business-copy";
import { CustomerPageHeader } from "@/components/cafe/themes/customer-mobile-experience";

type TabKey = "orders" | "transactions" | "invoices";
type AccountView = "main" | "security" | "profile" | "orders" | "notifications";


type Activity = {
  id: string;
  title: string;
  desc: string;
  date: string;
  type: string;
};

type AccountNotification = {
  id: string;
  title: string;
  body: string;
};

export type ThemedAccountPanelProps = {
  slug: string;
  experience: ThemeExperience;
  cafeName: string;
  logoUrl?: string | null;
  homeHref: string;
  customer: BarndaksaCustomerSession;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  myOrders: CustomerOrder[];
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
  editPhone: string;
  editAvatarPreview: string;
  avatarAssetId?: string;
  avatarBusy?: boolean;
  avatarMessage?: { type: "success" | "error"; text: string } | null;
  avatarFileRef?: RefObject<HTMLInputElement | null>;
  onPickAvatar?: (event: ChangeEvent<HTMLInputElement>) => void;
  onEditName: (v: string) => void;
  onEditPhone: (v: string) => void;
  onSaveSettings: () => void;
  loyaltyFeatureEnabled?: boolean;
  businessCategory?: string | null;
  pointsEnabled?: boolean;
  loyaltySlot?: ReactNode;
  experienceRewardsSlot?: ReactNode;
  passwordSlot?: ReactNode;
  loyaltyView?: CustomerLoyaltyCardView | null;
  experienceRewards?: CustomerExperienceReward[];
  notifications?: AccountNotification[];
  unreadNotificationCount?: number;
  onOpenNotifications?: () => void;
};

function customerInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function CustomerAvatar({
  customer,
  assetId,
  previewUrl,
  size = "large",
}: {
  customer: BarndaksaCustomerSession;
  assetId?: string;
  previewUrl?: string;
  size?: "large" | "medium";
}) {
  const box = size === "large" ? "h-24 w-24" : "h-20 w-20";
  const icon = size === "large" ? "h-12 w-12" : "h-10 w-10";

  return (
    <div className={`relative mx-auto flex ${box} items-center justify-center overflow-hidden rounded-full border-4 border-[var(--ci-surface-bg,#fff)] bg-[var(--ci-button-bg,#6B3A25)]/[0.08] text-[var(--ci-button-bg,#6B3A25)] shadow-[0_10px_28px_rgba(23,20,18,0.10)] ring-1 ring-[var(--ci-border,#E7D7C6)]`}>
      <LocalAssetImage
        assetId={assetId ?? customer.avatarAssetId}
        fallbackSrc={customer.avatarUrl}
        previewUrl={previewUrl || undefined}
        alt=""
        className="h-full w-full object-cover"
        fallback={
          <div className="flex h-full w-full items-center justify-center">
            {customer.fullName ? (
              <span className="text-2xl font-black">{customerInitials(customer.fullName)}</span>
            ) : (
              <UserRound className={icon} />
            )}
          </div>
        }
      />
    </div>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)] p-4 shadow-[0_10px_30px_rgba(23,20,18,0.07)] ${className}`}>
      {title ? <h2 className="mb-2 px-1 text-sm font-black text-[var(--ci-page-fg,#2b211b)]">{title}</h2> : null}
      {children}
    </section>
  );
}

function IconCircle({ icon: Icon, danger }: { icon: ElementType; danger?: boolean }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-red-50 text-red-600" : "bg-[var(--ci-button-bg,#6B3A25)]/[0.09] text-[var(--ci-button-bg,#6B3A25)]"}`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  href,
  onClick,
  danger,
  section,
}: {
  icon: ElementType;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  section?: "orders" | "loyalty" | "experience_rewards";
}) {
  const content = (
    <>
      <IconCircle icon={icon} danger={danger} />
      <span className="min-w-0 flex-1 text-right">
        <span className={`block text-sm font-black ${danger ? "text-red-600" : "text-[var(--ci-page-fg,#2d231d)]"}`}>
          {title}
        </span>
        {subtitle ? <span className="mt-1 block line-clamp-2 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#8f8177)]">{subtitle}</span> : null}
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ci-page-bg,#faf6f1)] text-[var(--ci-muted-fg,#9b8f86)]">
        <ChevronLeft className="h-4 w-4" />
      </span>
    </>
  );
  const className = "flex min-h-[68px] w-full items-center gap-3 px-1 py-3 text-right transition active:scale-[0.99]";

  if (href) return <Link href={href} className={className} data-account-section={section}>{content}</Link>;
  return <button type="button" onClick={onClick} className={className} data-account-section={section}>{content}</button>;
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[var(--ci-muted-fg,#7d6f66)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className="mt-2 h-12 w-full rounded-[14px] border border-[var(--ci-input-border,#eadfd6)] bg-[var(--ci-input-bg,#fffdfb)] px-4 text-sm font-bold text-[var(--ci-input-fg,#2d231d)] outline-none transition focus:border-[var(--ci-button-bg,#6B3A25)] focus:ring-2 focus:ring-[var(--ci-button-bg,#6B3A25)]/10"
      />
    </label>
  );
}

function isAcceptedStatus(status?: string) {
  const value = String(status ?? "").toLowerCase();
  return (
    value === "accepted" ||
    value.includes("accepted") ||
    value.includes("مقبول") ||
    value.includes("قبول") ||
    value.includes("تمت الموافقة")
  );
}

function summarizeLatestOrder(orders: CustomerOrder[], isEvents = false) {
  const latest = orders[0];
  if (!latest) return isEvents ? "لا توجد تذاكر مسجلة حتى الآن" : "لا توجد طلبات مسجلة حتى الآن";
  return isEvents
    ? `${orders.length} تذكرة - آخر شراء ${formatSar(latest.total)}`
    : `${orders.length} طلب - آخر طلب ${formatSar(latest.total)}`;
}


function summarizeRewards(loyaltyBalance: number, transactions: CustomerTransaction[], pointsEnabled = true) {
  if (!pointsEnabled) return "سجل المكافآت والولاء";
  const latestReward = transactions.find((item) => item.points);
  if (loyaltyBalance > 0) return `${loyaltyBalance} نقطة ولاء`;
  if (latestReward?.description) return latestReward.description;
  return "سجل المكافآت والولاء";
}

function makeNotifications({
  orders,
  loyaltyView,
  experienceRewards,
  businessCategory,
}: {
  orders: CustomerOrder[];
  loyaltyView?: CustomerLoyaltyCardView | null;
  experienceRewards: CustomerExperienceReward[];
  businessCategory?: string;
}) {
  const isEvents = getBusinessCopy(businessCategory).kind === "events";
  const notifications: AccountNotification[] = [];

  orders.filter((order) => isAcceptedStatus(order.status)).forEach((order) => {
    notifications.push({
      id: `order-${order.id}`,
      title: isEvents ? "تمت الموافقة على شراء التذاكر" : "تمت الموافقة على طلب",
      body: `${order.items.join("، ") || (isEvents ? "تذاكر" : "طلب منتجات")} - ${formatSar(order.total)}`,
    });
  });


  experienceRewards
    .filter((reward) => reward.status === "approved" && reward.rewardCode)
    .forEach((reward) => {
      notifications.push({
        id: `experience-${reward.id}`,
        title: "مكافأة توثيق جاهزة",
        body: reward.items.map((item) => `${item.productName} × ${item.quantity}`).join("، ") || "مكافأة جاهزة للصرف",
      });
    });

  const availableRewards = Number(loyaltyView?.card.availableRewards ?? 0);
  if (availableRewards > 0) {
    notifications.push({
      id: "loyalty-ready",
      title: "مكافأة بطاقة الولاء جاهزة",
      body: `${availableRewards} مكافأة متاحة`,
    });
  }

  return notifications;
}

function OrdersView({ orders, isEvents = false }: { orders: CustomerOrder[]; isEvents?: boolean }) {
  if (!orders.length) {
    return (
      <Card className="mt-5 text-center">
        <PackageCheck className="mx-auto h-9 w-9 text-[#8d7666]" />
        <h2 className="mt-3 text-base font-black text-[var(--ci-page-fg,#2d231d)]">
          {isEvents ? "لا توجد تذاكر حتى الآن" : "لا توجد طلبات حتى الآن"}
        </h2>
        <p className="mt-2 text-xs font-bold leading-6 text-[var(--ci-muted-fg,#7d6f66)]">
          {isEvents
            ? "عند شراء التذاكر أو الباقات ستظهر هنا كتذاكرك الخاصة بالفعالية."
            : "عندما تؤكد العلامة طلبات الاستلام ستظهر هنا من بيانات الحساب الحالية."}
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-5 grid gap-3">
      {orders.map((order) => (
        <article key={order.id} className="rounded-[18px] border border-[var(--ci-border,#eee5dc)] bg-[var(--ci-surface-bg,#fff)] p-3 shadow-[0_10px_30px_rgba(23,20,18,0.06)]">
          <div className="flex gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f5efe8] text-[#6f513d]">
              <PackageCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-sm font-black text-[var(--ci-page-fg,#2d231d)]">
                {order.items[0] || (isEvents ? "تذكرة فعالية" : "طلب منتجات")}
              </h3>
              <p className="mt-1 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#7d6f66)]">
                {order.items.join("، ") || "لا توجد تفاصيل عناصر في السناب شوت الحالي"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black text-[#6f6259]">
                <span className="rounded-lg bg-[var(--ci-page-bg,#faf6f1)] px-2.5 py-1">{order.status}</span>
                <span className="rounded-lg bg-[var(--ci-page-bg,#faf6f1)] px-2.5 py-1">{formatSar(order.total)}</span>
                {order.branchName ? <span className="rounded-lg bg-[var(--ci-page-bg,#faf6f1)] px-2.5 py-1">{order.branchName}</span> : null}
                {order.pickupAt ? <span className="rounded-lg bg-[var(--ci-page-bg,#faf6f1)] px-2.5 py-1">{order.pickupAt}</span> : null}
              </div>
              {order.notes ? <p className="mt-2 text-xs font-bold text-[var(--ci-muted-fg,#7d6f66)]">{isEvents ? "تفاصيل التذكرة" : "تفاصيل الطلب"}: {order.notes}</p> : null}
              {order.rejectionReason ? <p className="mt-2 text-xs font-bold text-red-600">رد العلامة: {order.rejectionReason}</p> : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function ThemedAccountPanel(props: ThemedAccountPanelProps) {
  const { customer } = props;
  const [view, setView] = useState<AccountView>("main");
  const copy = getBusinessCopy(props.businessCategory);
  const isEvents = copy.kind === "events";

  const rewardsHref = `/c/${encodeURIComponent(props.slug)}/rewards`;
  const phoneText = customer.phone?.trim() ? customer.phone : "لم يتم إضافة رقم الجوال";

  const notifications = useMemo(
    () =>
      props.notifications ??
      makeNotifications({
        orders: props.myOrders,
        loyaltyView: props.loyaltyView,
        experienceRewards: props.experienceRewards ?? [],
        businessCategory: props.businessCategory ?? undefined,
      }),
    [props.businessCategory, props.experienceRewards, props.loyaltyView, props.myOrders, props.notifications],
  );
  const unreadNotificationCount = props.unreadNotificationCount ?? notifications.length;

  const generalRows = useMemo(
    () => [
      {
        icon: Gift,
        title: "المكافآت",
        subtitle: summarizeRewards(props.loyaltyBalance, props.myTransactions, props.pointsEnabled),
        href: rewardsHref,
        section: "loyalty" as const,
      },
      {
        icon: ClipboardList,
        title: isEvents ? "شراء التذاكر" : "الطلبات",
        subtitle: summarizeLatestOrder(props.myOrders, isEvents),
        onClick: () => setView("orders"),
        section: "orders" as const,
      },
    ],
    [isEvents, props.loyaltyBalance, props.myOrders, props.myTransactions, props.pointsEnabled, rewardsHref],
  );

  function openProfile() {
    props.onOpenSettings();
    setView("profile");
  }

  function goBack() {
    props.onCloseSettings();
    setView("main");
  }

  function openNotifications() {
    props.onOpenNotifications?.();
    setView("notifications");
  }

  if (view === "security") {
    return (
      <main className="min-h-screen px-4 pb-28 pt-3 text-[var(--ci-page-fg,#2d231d)]">
        <div className="mx-auto max-w-xl">
          <button type="button" onClick={goBack} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)] px-4 text-sm font-black text-[var(--ci-button-bg,#5d483b)] shadow-sm">
            <ChevronRight className="h-4 w-4" />
            رجوع للحساب
          </button>
          <div className="text-center">
            <CustomerAvatar customer={customer} size="medium" />
            <p className="mt-3 break-words text-sm font-black text-[var(--ci-page-fg,#2d231d)]">{customer.email || "لا يوجد بريد مسجل"}</p>
          </div>
          <Card className="mt-6">
            {props.passwordSlot ?? <p className="py-4 text-center text-sm font-bold text-[var(--ci-muted-fg,#7d6f66)]">تغيير كلمة المرور غير متاح حاليًا.</p>}
          </Card>
        </div>
      </main>
    );
  }

  if (view === "profile") {
    return (
      <main className="min-h-screen px-4 pb-28 pt-3 text-[var(--ci-page-fg,#2d231d)]">
        <div className="mx-auto max-w-xl">
          <button type="button" onClick={goBack} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)] px-4 text-sm font-black text-[var(--ci-button-bg,#5d483b)] shadow-sm">
            <ChevronRight className="h-4 w-4" />
            رجوع
          </button>
          <Card title="تعديل معلوماتك الشخصية">
            <div className="space-y-5">
              <div className="text-center">
                <CustomerAvatar customer={customer} assetId={props.avatarAssetId} previewUrl={props.editAvatarPreview} size="medium" />
                <input
                  ref={props.avatarFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="hidden"
                  onChange={props.onPickAvatar}
                />
                <button
                  type="button"
                  onClick={() => props.avatarFileRef?.current?.click()}
                  disabled={props.avatarBusy}
                  className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ci-button-bg,#4b3428)] px-5 text-xs font-black text-[var(--ci-button-fg,#fff)] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ImagePlus className="h-4 w-4" />
                  {props.avatarBusy ? "جاري رفع الصورة" : "تغيير الصورة"}
                </button>
                {props.avatarMessage ? (
                  <p className={`mt-3 rounded-2xl px-4 py-3 text-xs font-bold leading-6 ${props.avatarMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {props.avatarMessage.text}
                  </p>
                ) : null}
              </div>
              <Field label="الاسم" value={props.editName} onChange={props.onEditName} autoComplete="name" />
              <Field label="رقم الجوال" value={props.editPhone} onChange={props.onEditPhone} inputMode="tel" autoComplete="tel" />
              <p className="rounded-[14px] bg-[var(--ci-page-bg,#faf6f1)] px-4 py-3 text-xs font-bold leading-6 text-[var(--ci-muted-fg,#7d6f66)]">
                البريد يعرض من الحساب الحالي ولا يتم تعديله من هذه الصفحة.
              </p>
              <button type="button" onClick={props.onSaveSettings} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--ci-button-bg,#4b3428)] px-5 text-sm font-black text-[var(--ci-button-fg,#fff)] shadow-sm">
                <Save className="h-4 w-4" />
                حفظ
              </button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  if (view === "orders" || view === "notifications") {
    return (
      <main className="min-h-screen px-4 pb-28 pt-3 text-[var(--ci-page-fg,#2d231d)]">
        <div className="mx-auto max-w-xl">
          <button type="button" onClick={goBack} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)] px-4 text-sm font-black text-[var(--ci-button-bg,#5d483b)] shadow-sm">
            <ChevronRight className="h-4 w-4" />
            رجوع للحساب
          </button>
          {view === "orders" ? (
            <>
              <h1 className="text-lg font-black">{isEvents ? "تذاكري" : "طلباتك"}</h1>
              <OrdersView orders={props.myOrders} isEvents={isEvents} />
            </>
          ) : (
            <>
              <h1 className="text-lg font-black">التنبيهات</h1>
              <div className="mt-5 grid gap-3">
                {notifications.length ? notifications.map((item) => (
                  <article key={item.id} className="rounded-[18px] border border-[var(--ci-border,#eee5dc)] bg-[var(--ci-surface-bg,#fff)] p-4 shadow-[0_10px_30px_rgba(23,20,18,0.06)]">
                    <p className="text-sm font-black text-[var(--ci-page-fg,#2d231d)]">{item.title}</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-[var(--ci-muted-fg,#7d6f66)]">{item.body}</p>
                  </article>
                )) : (
                  <Card className="text-center">
                    <Bell className="mx-auto h-8 w-8 text-[#8d7666]" />
                    <p className="mt-3 text-sm font-black text-[var(--ci-page-fg,#2d231d)]">لا توجد تنبيهات جديدة حاليًا</p>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-28 pt-1 text-[var(--ci-page-fg,#2d231d)] sm:px-6 sm:pt-3">
      <div className="mx-auto max-w-xl">
        <CustomerPageHeader
          cafeName={props.cafeName}
          logoUrl={props.logoUrl}
          title="الحساب"
          subtitle="بياناتك، طلباتك، وإعدادات الأمان"
          action={
            <button
              type="button"
              onClick={openNotifications}
              className="relative flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)] text-[var(--ci-button-bg,#6B3A25)] shadow-sm"
              aria-label="التنبيهات"
            >
              <Bell className="h-5 w-5" />
              {unreadNotificationCount ? (
                <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
                  {unreadNotificationCount}
                </span>
              ) : null}
            </button>
          }
        />

        <section className="mt-5 flex items-center gap-4 rounded-[18px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)] p-4 shadow-[0_10px_30px_rgba(23,20,18,0.07)]">
          <div className="shrink-0 [&>div]:!mx-0">
            <CustomerAvatar customer={customer} size="medium" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[11px] font-bold text-[var(--ci-muted-fg,#806A5E)]">مرحبًا بك</p>
            <h2 className="mt-0.5 truncate text-xl font-black text-[var(--ci-page-fg,#2d231d)]">
              {customer.fullName || "عميل العلامة"}
            </h2>
            <p className="mt-1 truncate text-xs font-bold text-[var(--ci-muted-fg,#9a8d84)]">
              {customer.email || phoneText}
            </p>
          </div>
          <button
            type="button"
            onClick={openProfile}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ci-button-bg,#6B3A25)]/[0.09] px-3 text-xs font-black text-[var(--ci-button-bg,#6B3A25)]"
          >
            تعديل
          </button>
        </section>

        <div className="mt-5 space-y-4">
          <Card title="نشاطك">
            <div className="divide-y divide-[var(--ci-border,#E7D7C6)]/70">
              {generalRows.map((row) => (
                <MenuRow key={row.title} icon={row.icon} title={row.title} subtitle={row.subtitle} href={row.href} onClick={row.onClick} section={row.section} />
              ))}
            </div>
          </Card>

          <Card title="إعدادات الحساب">
            <div className="divide-y divide-[var(--ci-border,#E7D7C6)]/70">
              <MenuRow icon={ShieldCheck} title="الأمان" subtitle="تغيير كلمة المرور" onClick={() => setView("security")} />
              <MenuRow icon={Pencil} title="تعديل معلوماتك الشخصية" subtitle="الاسم ورقم الجوال" onClick={openProfile} />
              <MenuRow icon={LogOut} title="تسجيل الخروج" subtitle="إنهاء جلسة العميل الحالية" danger onClick={props.onLogout} />
            </div>
          </Card>

          <a href="https://barndaksa.com" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-1 pt-2 text-center text-[10px] font-bold text-[var(--ci-muted-fg,#7d6f66)]">
            <span>هذه التجربة مقدمة بواسطة برندة</span>
            <BrandaLogo width={54} height={22} className="max-h-[18px]" />
            <span dir="ltr">https://barndaksa.com</span>
          </a>
        </div>
      </div>
    </main>
  );
}
