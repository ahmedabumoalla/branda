"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedAccountPanel } from "@/components/cafe/themes/themed-account-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
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
import { getThemeExperience } from "@/lib/cafe/theme-experience";

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

function AccountPageInner() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { experience, settings, path, previewThemeId, themeId } = useCafePageContext(slug);
  const fileRef = useRef<HTMLInputElement>(null);

  const defaultTab: TabKey =
    getThemeExperience(themeId).account === "lounge-reservations"
      ? "reservations"
      : "orders";

  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAvatar, setEditAvatar] = useState("");

  useEffect(() => {
    const session = getCustomerSession(slug);

    if (!session) {
      const next = appendPreviewToNextPath(`/c/${slug}/account`, previewThemeId);
      router.push(`${path("login")}?next=${encodeURIComponent(next)}`);
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
  }, [router, slug, path, previewThemeId]);

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

  const loyaltyBalance = useMemo(
    () => myTransactions.reduce((sum, item) => sum + (item.points || 0), 0),
    [myTransactions]
  );

  const totalInvoices = useMemo(
    () => myInvoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    [myInvoices]
  );

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
    router.push(path());
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
    <ThemedAccountPanel
      slug={slug}
      experience={experience}
      cafeName={settings.cafeName}
      homeHref={path()}
      customer={customer}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      myOrders={myOrders}
      myReservations={myReservations}
      myTransactions={myTransactions}
      myInvoices={myInvoices}
      loyaltyBalance={loyaltyBalance}
      totalInvoices={totalInvoices}
      latestActivity={latestActivity}
      onLogout={logout}
      onOpenSettings={() => {
        setEditName(customer.fullName);
        setEditEmail(customer.email || "");
        setEditAvatar(customer.avatarUrl || "");
        setSettingsOpen(true);
      }}
      settingsOpen={settingsOpen}
      onCloseSettings={() => setSettingsOpen(false)}
      editName={editName}
      editEmail={editEmail}
      editAvatar={editAvatar}
      onEditName={setEditName}
      onEditEmail={setEditEmail}
      onPickAvatar={pickAvatar}
      onClearAvatar={() => setEditAvatar("")}
      onSaveSettings={saveSettings}
      fileRef={fileRef}
    />
  );
}

export default function CafeCustomerAccountPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug} className="!px-0 !py-0" maxWidth="max-w-[100%]">
      <Suspense fallback={<p className="p-8 text-center font-black">جاري التحميل...</p>}>
        <AccountPageInner />
      </Suspense>
    </CafeLayout>
  );
}
