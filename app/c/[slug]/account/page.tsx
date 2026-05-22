"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  clearCustomerSession,
  getCustomerSession,
  updateCustomerSession,
  type BrandaCustomerSession,
} from "@/lib/customer/session";
import {
  INVOICES_KEY,
  ORDERS_KEY,
  TRANSACTIONS_KEY,
  type CustomerInvoice,
  type CustomerOrder,
  type CustomerTransaction,
} from "@/lib/mock/customer-activity";
import { formatSar } from "@/lib/format";

const RESERVATIONS_KEY = "branda_qatrah_reservations";

type Reservation = {
  id: string;
  customerName: string;
  phone: string;
  customerId?: string;
  type: string;
  guests: number;
  date: string;
  time: string;
  status: string;
  notes?: string;
  createdAt: string;
};

type TabKey = "orders" | "reservations" | "transactions" | "invoices";

const tabs: { key: TabKey; title: string; icon: React.ElementType }[] = [
  { key: "orders", title: "طلباتي", icon: ClipboardList },
  { key: "reservations", title: "حجوزاتي", icon: CalendarDays },
  { key: "transactions", title: "سجل العمليات", icon: WalletCards },
  { key: "invoices", title: "الفواتير", icon: Receipt },
];

export default function CafeCustomerAccountPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const fileRef = useRef<HTMLInputElement>(null);

  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("reservations");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAvatar, setEditAvatar] = useState("");

  useEffect(() => {
    const session = getCustomerSession(slug);

    if (!session) {
      router.push(`/c/${slug}/login?next=/c/${slug}/account`);
      return;
    }

    setCustomer(session);
    setEditName(session.fullName);
    setEditEmail(session.email || "");
    setEditAvatar(session.avatarUrl || "");

    const savedOrders = localStorage.getItem(ORDERS_KEY);
    const savedInvoices = localStorage.getItem(INVOICES_KEY);
    const savedTransactions = localStorage.getItem(TRANSACTIONS_KEY);
    const savedReservations = localStorage.getItem(RESERVATIONS_KEY);

    if (savedOrders) setOrders(JSON.parse(savedOrders));
    if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
    if (savedReservations) setReservations(JSON.parse(savedReservations));
  }, [router, slug]);

  const myOrders = useMemo(
    () => orders.filter((order) => order.customerId === customer?.id),
    [orders, customer]
  );

  const myInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.customerId === customer?.id),
    [invoices, customer]
  );

  const myTransactions = useMemo(
    () => transactions.filter((item) => item.customerId === customer?.id),
    [transactions, customer]
  );

  const myReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.customerId === customer?.id ||
          reservation.phone === customer?.phone
      ),
    [reservations, customer]
  );

  const loyaltyBalance = useMemo(() => {
    return myTransactions.reduce((sum, item) => sum + (item.points || 0), 0);
  }, [myTransactions]);

  const totalInvoices = useMemo(() => {
    return myInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  }, [myInvoices]);

  const latestActivity = useMemo(() => {
    const orderActivities = myOrders.map((order) => ({
      id: order.id,
      title: `طلب: ${order.items.join("، ")}`,
      desc: `${order.status} • ${formatSar(order.total)}`,
      date: order.createdAt,
      type: "طلب",
    }));

    const reservationActivities = myReservations.map((reservation) => ({
      id: reservation.id,
      title: `حجز ${reservation.type}`,
      desc: `${reservation.status} • ${reservation.date} • ${reservation.time}`,
      date: reservation.createdAt,
      type: "حجز",
    }));

    const transactionActivities = myTransactions.map((transaction) => ({
      id: transaction.id,
      title: transaction.title,
      desc: transaction.description,
      date: transaction.createdAt,
      type: transaction.type,
    }));

    return [...orderActivities, ...reservationActivities, ...transactionActivities]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);
  }, [myOrders, myReservations, myTransactions]);

  function logout() {
    clearCustomerSession(slug);
    router.push(`/c/${slug}`);
  }

  function openSettings() {
    if (!customer) return;
    setEditName(customer.fullName);
    setEditEmail(customer.email || "");
    setEditAvatar(customer.avatarUrl || "");
    setSettingsOpen(true);
  }

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setEditAvatar(reader.result);
    };

    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function saveSettings() {
    if (!editName.trim()) {
      alert("اكتب الاسم");
      return;
    }

    const next = updateCustomerSession(slug, {
      fullName: editName.trim(),
      email: editEmail.trim() || undefined,
      avatarUrl: editAvatar || undefined,
    });

    if (next) {
      setCustomer(next);
      setSettingsOpen(false);
      alert("تم حفظ بيانات الحساب");
    }
  }

  if (!customer) return null;

  return (
    <main dir="rtl" className="min-h-screen bg-[#F8F4EF] text-[#2B1710]">
      <section className="relative overflow-hidden border-b border-[#E5D8CD] bg-[#EFE2D3]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(255,255,255,0.65),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(107,58,37,0.18),transparent_35%)]" />

        <div className="relative mx-auto max-w-7xl px-6 py-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/c/${slug}`}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117] shadow-sm"
            >
              <ArrowRight className="h-5 w-5" />
              رجوع للكوفي
            </Link>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={openSettings}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117] shadow-sm"
              >
                <Settings className="h-5 w-5" />
                إعدادات الحساب
              </button>

              <button
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700 shadow-sm"
              >
                <LogOut className="h-5 w-5" />
                تسجيل خروج
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-black text-[#6B3A25]">
                <Sparkles className="h-4 w-4" />
                حساب العميل
              </div>

              <h1 className="text-5xl font-black leading-tight text-[#3A2117]">
                أهلًا {customer.fullName}
              </h1>

              <p className="mt-4 max-w-2xl text-lg font-bold leading-8 text-[#6B4A3A]">
                تابع طلباتك، حجوزاتك، نقاط الولاء، الفواتير، وسجل العمليات من مكان واحد.
              </p>
            </div>

            <div className="rounded-[30px] border border-white/70 bg-white/70 p-6 shadow-xl backdrop-blur">
              <div className="flex items-center gap-4">
                <div className="flex h-24 w-24 overflow-hidden rounded-3xl bg-[#3A2117] text-[#F8E8D2]">
                  {customer.avatarUrl ? (
                    <img
                      src={customer.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UserRound className="h-11 w-11" />
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-black text-[#8B5E3C]">بيانات الحساب</p>
                  <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                    {customer.fullName}
                  </h2>
                  <p className="mt-1 font-bold text-[#7A6255]">{customer.phone}</p>
                </div>
              </div>

              {customer.email ? (
                <p className="mt-5 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-bold text-[#7A6255]">
                  {customer.email}
                </p>
              ) : (
                <p className="mt-5 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-bold text-[#7A6255]">
                  لا يوجد بريد إلكتروني
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ClipboardList} title="متابعة الطلبات" value={myOrders.length} />
          <StatCard icon={CalendarDays} title="الحجوزات" value={myReservations.length} />
          <StatCard icon={Star} title="رصيد نقاط الولاء" value={loyaltyBalance} />
          <StatCard icon={CreditCard} title="إجمالي الفواتير" value={formatSar(totalInvoices)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-[32px] border border-[#E5D8CD] bg-white p-5 shadow-sm">
            <div className="mb-6 flex flex-wrap gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition ${
                      active
                        ? "bg-[#3A2117] text-[#F8E8D2]"
                        : "bg-[#F8F4EF] text-[#3A2117]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {tab.title}
                  </button>
                );
              })}
            </div>

            {activeTab === "orders" ? (
              <SectionShell title="متابعة الطلبات">
                {myOrders.length ? (
                  myOrders.map((order) => (
                    <InfoCard
                      key={order.id}
                      title={order.items.join("، ")}
                      badge={order.status}
                      desc={`${formatSar(order.total)} • ${order.createdAt}`}
                    />
                  ))
                ) : (
                  <EmptyState title="لا توجد طلبات حتى الآن" desc="أي طلب قادم من صفحة الكوفي سيظهر هنا." />
                )}
              </SectionShell>
            ) : null}

            {activeTab === "reservations" ? (
              <SectionShell title="حجوزاتي">
                {myReservations.length ? (
                  myReservations.map((reservation) => (
                    <InfoCard
                      key={reservation.id}
                      title={reservation.type}
                      badge={reservation.status}
                      desc={`${reservation.date} • ${reservation.time} • ${reservation.guests} أشخاص`}
                      footer={reservation.notes ? `ملاحظة: ${reservation.notes}` : undefined}
                    />
                  ))
                ) : (
                  <EmptyState title="لا توجد حجوزات حتى الآن" desc="احجز طاولة من صفحة الكوفي وسيظهر الطلب هنا." />
                )}
              </SectionShell>
            ) : null}

            {activeTab === "transactions" ? (
              <SectionShell title="سجل العمليات">
                {myTransactions.length ? (
                  myTransactions.map((transaction) => (
                    <InfoCard
                      key={transaction.id}
                      title={transaction.title}
                      badge={transaction.type}
                      desc={`${transaction.description} • ${transaction.createdAt}`}
                      value={
                        transaction.points
                          ? `+${transaction.points} نقطة`
                          : transaction.amount
                          ? formatSar(transaction.amount)
                          : undefined
                      }
                    />
                  ))
                ) : (
                  <EmptyState title="لا توجد عمليات حتى الآن" desc="الطلبات والحجوزات والنقاط ستظهر في هذا السجل." />
                )}
              </SectionShell>
            ) : null}

            {activeTab === "invoices" ? (
              <SectionShell title="الفواتير">
                {myInvoices.length ? (
                  myInvoices.map((invoice) => (
                    <InfoCard
                      key={invoice.id}
                      title={invoice.title}
                      badge={invoice.status}
                      desc={invoice.createdAt}
                      value={formatSar(invoice.amount)}
                    />
                  ))
                ) : (
                  <EmptyState title="لا توجد فواتير حتى الآن" desc="أي فاتورة مرتبطة بحسابك ستظهر هنا." />
                )}
              </SectionShell>
            ) : null}
          </div>

          <aside className="space-y-6">
            <div className="rounded-[32px] bg-[#3A2117] p-6 text-[#F8E8D2] shadow-sm">
              <p className="text-sm font-bold text-[#CBB29C]">رصيد الولاء</p>
              <h2 className="mt-2 text-5xl font-black">{loyaltyBalance}</h2>
              <p className="mt-3 text-sm leading-7 text-[#CBB29C]">
                يتم احتساب النقاط تلقائيًا حسب العمليات المسجلة في حسابك.
              </p>
            </div>

            <div className="rounded-[32px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-2xl font-black text-[#3A2117]">
                آخر النشاطات
              </h2>

              {latestActivity.length ? (
                <div className="space-y-3">
                  {latestActivity.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="rounded-2xl bg-[#F8F4EF] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-black text-[#3A2117]">{item.title}</h3>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#6B3A25]">
                          {item.type}
                        </span>
                      </div>

                      <p className="mt-2 text-sm font-bold leading-6 text-[#7A6255]">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="لا يوجد نشاط" desc="ابدأ بحجز أو طلب من صفحة الكوفي." />
              )}
            </div>
          </aside>
        </div>
      </section>

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between border-b border-[#EFE8DF] pb-4">
              <div>
                <p className="font-black text-[#8B5E3C]">إعدادات الحساب</p>
                <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                  تعديل بيانات العميل
                </h2>
              </div>

              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-2xl bg-[#F8F4EF] p-3 text-[#3A2117]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-4 rounded-3xl bg-[#F8F4EF] p-4">
                <div className="h-24 w-24 overflow-hidden rounded-3xl bg-[#3A2117] text-[#F8E8D2]">
                  {editAvatar ? (
                    <img src={editAvatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UserRound className="h-10 w-10" />
                    </div>
                  )}
                </div>

                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={pickAvatar}
                  />

                  <button
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117]"
                  >
                    <ImagePlus className="h-5 w-5" />
                    تغيير الصورة
                  </button>

                  {editAvatar ? (
                    <button
                      onClick={() => setEditAvatar("")}
                      className="mr-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700"
                    >
                      حذف الصورة
                    </button>
                  ) : null}
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">الاسم</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-2 h-14 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right font-bold outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-black text-[#7A6255]">
                  البريد الإلكتروني
                </span>
                <input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="mt-2 h-14 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right font-bold outline-none"
                />
              </label>

              <div className="rounded-2xl bg-[#F8F4EF] px-4 py-3">
                <p className="text-xs font-black text-[#7A6255]">رقم الجوال</p>
                <p className="mt-1 font-black text-[#3A2117]">{customer.phone}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[#EFE8DF] pt-4">
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-2xl border border-[#E5D8CD] px-6 py-3 font-black text-[#3A2117]"
              >
                إلغاء
              </button>

              <button
                onClick={saveSettings}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-6 py-3 font-black text-[#F8E8D2]"
              >
                <Save className="h-5 w-5" />
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[28px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-black text-[#7A6255]">{title}</p>
      <h2 className="mt-2 text-4xl font-black text-[#3A2117]">{value}</h2>
    </div>
  );
}

function SectionShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-5 text-2xl font-black text-[#3A2117]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InfoCard({
  title,
  desc,
  badge,
  value,
  footer,
}: {
  title: string;
  desc: string;
  badge?: string;
  value?: string;
  footer?: string;
}) {
  return (
    <article className="rounded-3xl border border-[#EFE8DF] bg-[#F8F4EF] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-black text-[#3A2117]">{title}</h3>
          <p className="mt-2 text-sm font-bold leading-7 text-[#7A6255]">{desc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {value ? (
            <span className="rounded-2xl bg-white px-4 py-2 font-black text-[#6B3A25]">
              {value}
            </span>
          ) : null}

          {badge ? (
            <span className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#3A2117]">
              {badge}
            </span>
          ) : null}
        </div>
      </div>

      {footer ? (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#7A6255]">
          {footer}
        </p>
      ) : null}
    </article>
  );
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[#E5D8CD] bg-white p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F8F4EF] text-[#8B5E3C]">
        <UserRound className="h-7 w-7" />
      </div>
      <h3 className="text-xl font-black text-[#3A2117]">{title}</h3>
      <p className="mt-2 text-sm font-bold text-[#7A6255]">{desc}</p>
    </div>
  );
}