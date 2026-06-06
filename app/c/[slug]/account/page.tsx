"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ExperienceCampaignSection } from "@/components/cafe/experience-campaign-section";
import { ThemedAccountPanel } from "@/components/cafe/themes/themed-account-panel";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import {
  ImagePipelineError,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import { revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import {
  clearCustomerSession,
  getCustomerSession,
  type BrandaCustomerSession,
} from "@/lib/customer/session";
import {
  updateCustomerProfileAction,
  uploadCustomerAvatarAction,
} from "@/app/actions/customer-media";
import {
  type CustomerInvoice,
  type CustomerOrder,
  type CustomerTransaction,
} from "@/lib/mock/customer-activity";
import { formatSar } from "@/lib/format";
import { getThemeExperience } from "@/lib/cafe/theme-experience";

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
  const [editAvatarPreview, setEditAvatarPreview] = useState("");
  const [pendingAvatar, setPendingAvatar] = useState<OptimizedImageResult | null>(null);
  const [avatarAssetId, setAvatarAssetId] = useState<string | undefined>();
  const [optimizingAvatar, setOptimizingAvatar] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const session = await getCustomerSession(slug);
      if (cancelled) return;

      if (!session) {
        const next = appendPreviewToNextPath(`/c/${slug}/account`, previewThemeId);
        router.push(`${path("login")}?next=${encodeURIComponent(next)}`);
        return;
      }

      setCustomer(session);
      setEditName(session.fullName);
      setEditEmail(session.email || "");
      setEditAvatarPreview(session.avatarUrl || "");
      setAvatarAssetId(session.avatarAssetId);

      const { fetchCustomerOrdersAction, fetchCustomerReservationsAction } = await import(
        "@/app/actions/customer"
      );
      const [cafeOrders, cafeReservations] = await Promise.all([
        fetchCustomerOrdersAction(slug),
        fetchCustomerReservationsAction(slug),
      ]);

      if (cancelled) return;

      setOrders(
        cafeOrders.map((o) => ({
          id: o.id,
          cafeSlug: slug,
          customerId: o.customerId,
          customerName: o.customerName,
          status: o.status,
          items: o.items.map((item) => `${item.name} × ${item.quantity}`),
          total: o.total,
          createdAt: o.createdAt,
          branchName: o.branchName,
          pickupAt: o.pickupAt,
          notes: o.notes,
        }))
      );
      setReservations(
        cafeReservations.map((r) => ({
          id: r.id,
          customerName: r.customerName,
          phone: r.phone,
          customerId: r.customerId,
          type: r.type,
          guests: r.guests,
          date: r.date,
          time: r.time,
          status: r.status,
          notes: r.notes,
          createdAt: r.createdAt,
        }))
      );
    }

    void load();
    return () => {
      cancelled = true;
    };
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

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOptimizingAvatar(true);
    try {
      const optimized = await optimizeImageForStorage(file, "customer-avatar");
      if (editAvatarPreview.startsWith("blob:")) revokeObjectUrl(editAvatarPreview);
      setEditAvatarPreview(URL.createObjectURL(optimized.blob));
      setPendingAvatar(optimized);
    } catch (err) {
      alert(
        err instanceof ImagePipelineError
          ? err.message
          : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP"
      );
    } finally {
      setOptimizingAvatar(false);
    }
  }

  async function saveSettings() {
    if (!editName.trim()) {
      alert("اكتب الاسم");
      return;
    }
    if (!customer) return;

    try {
      let session = customer;

      if (pendingAvatar) {
        const formData = new FormData();
        formData.append("file", pendingAvatar.blob, "avatar.webp");
        session = await uploadCustomerAvatarAction(slug, formData);
      }

      session = await updateCustomerProfileAction(slug, {
        fullName: editName.trim(),
        email: editEmail.trim() || undefined,
      });

      setCustomer(session);
      setPendingAvatar(null);
      setSettingsOpen(false);
      alert("تم حفظ بيانات الحساب");
    } catch {
      alert("تعذر حفظ بيانات الحساب");
    }
  }

  if (!customer) return null;

  return (
    <>
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
          setEditAvatarPreview("");
          setAvatarAssetId(customer.avatarAssetId);
          setPendingAvatar(null);
          setSettingsOpen(true);
        }}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        editName={editName}
        editEmail={editEmail}
        editAvatarPreview={editAvatarPreview}
        avatarAssetId={avatarAssetId}
        onEditName={setEditName}
        onEditEmail={setEditEmail}
        onPickAvatar={pickAvatar}
        onClearAvatar={() => {
          if (editAvatarPreview.startsWith("blob:")) revokeObjectUrl(editAvatarPreview);
          setEditAvatarPreview("");
          setPendingAvatar(null);
          setAvatarAssetId(undefined);
        }}
        onSaveSettings={() => void saveSettings()}
        fileRef={fileRef}
      />
      <ExperienceCampaignSection slug={slug} compact />
    </>
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
