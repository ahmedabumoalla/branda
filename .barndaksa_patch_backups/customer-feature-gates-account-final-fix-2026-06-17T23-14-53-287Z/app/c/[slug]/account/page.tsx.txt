"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
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
  type BarndaksaCustomerSession,
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
import { fetchCustomerLoyaltyCardAction } from "@/app/actions/loyalty-cards";
import {
  fetchCustomerExperienceRewardsAction,
  submitCustomerExperienceRewardProofAction,
} from "@/app/actions/experience-rewards";
import type { CustomerLoyaltyCardView } from "@/lib/data/loyalty-cards";
import type { CustomerExperienceReward } from "@/lib/data/experience-rewards";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import {
  Bell,
  Coffee,
  Gift,
  Link as LinkIcon,
  QrCode,
  Send,
  WalletCards,
  X,
} from "lucide-react";

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
  reservationCode?: string;
  reservationCodeUsedAt?: string;
  cashierConfirmedAt?: string;
  notes?: string;
  createdAt: string;
};

type TabKey = "orders" | "reservations" | "transactions" | "invoices";

function CustomerCoffeeLoyaltyCard({
  view,
  homeHref,
  onOpenCard,
  loading,
}: {
  view: CustomerLoyaltyCardView | null;
  homeHref: string;
  onOpenCard: () => void;
  loading: boolean;
}) {
  const program = view?.program;
  const card = view?.card;
  const required = Math.max(1, Number(program?.purchasesRequired ?? 7));
  const lit = Math.min(required, Number(card?.stampsInCycle ?? 0));
  const cups = Array.from({ length: required });

  return (
    <section className="mb-6 overflow-hidden rounded-[34px] border border-[#E7D7C6] bg-[#F1D7C6] p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="rounded-[28px] bg-[#4A281D] p-5 text-[#FCF8F3] shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-serif text-2xl font-black uppercase tracking-[0.18em]">
                Loyalty Card
              </p>
              <p className="mt-1 text-xs font-bold text-[#E7D7C6]">
                اشتر {required} مرات واحصل على{" "}
                {program?.rewardName || "كوب مجاني"}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D9A33F] text-[#311912]">
              <WalletCards className="h-6 w-6" />
            </span>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-4 sm:grid-cols-7">
            {cups.map((_, index) => {
              const active = index < lit;
              return (
                <div key={index} className="flex flex-col items-center gap-2">
                  <div
                    className={`relative flex h-16 w-14 items-center justify-center rounded-b-2xl rounded-t-md border-2 transition-all ${
                      active
                        ? "border-[#FFD36B] bg-[#FFD36B] text-[#4A281D] shadow-[0_0_24px_rgba(255,211,107,0.75)]"
                        : "border-[#8A6B5E] bg-[#6B4A3B] text-[#D8BDAF]"
                    }`}
                  >
                    <Coffee className="h-7 w-7" />
                    <span
                      className={`absolute -top-2 h-2 w-10 rounded-t-xl ${
                        active ? "bg-[#FFF3C4]" : "bg-[#8A6B5E]"
                      }`}
                    />
                  </div>
                  <p className="text-[10px] font-black">
                    {active ? "مضيء" : `${index + 1}`}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl bg-white p-4 text-center text-[#17100d]">
            <p className="font-mono text-sm font-black tracking-[0.2em]">
              {card?.cardCode || "BARNDAKSA LOYALTY"}
            </p>
            {card?.cardCode ? (
              <SecureQrCode
                kind="loyalty-card"
                value={card.cardCode}
                title={`QR بطاقة الولاء ${card.cardCode}`}
                size={160}
                className="mt-3"
              />
            ) : (
              <div className="mt-3 flex h-36 items-center justify-center rounded-2xl bg-[#FCF8F3] px-4 text-center text-xs font-black leading-6 text-[#806A5E]">
                {loading
                  ? "جاري تجهيز QR بطاقة الولاء..."
                  : "تعذر تحميل QR البطاقة، حدّث الصفحة أو تأكد من تفعيل برنامج الولاء"}
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-black text-[#D9A33F]">
            بطاقة الولاء الخاصة بالعلامة التجارية
          </p>
          <h2 className="mt-2 text-3xl font-black text-[#311912]">
            {program?.cardTitle || "بطاقة الولاء"}
          </h2>
          <p className="mt-3 text-sm font-bold leading-7 text-[#806A5E]">
            كل مرة يقرأ الكاشير QR البطاقة مع QR الفاتورة يضيء كوب جديد حتى
            تكتمل الأكواب وتظهر مكافأة {program?.rewardName || "كوب مجاني"}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 text-center">
              <p className="text-2xl font-black text-[#311912]">{lit}</p>
              <p className="text-xs font-bold text-[#806A5E]">أكواب مضيئة</p>
            </div>
            <div className="rounded-2xl bg-white p-4 text-center">
              <p className="text-2xl font-black text-[#311912]">{required}</p>
              <p className="text-xs font-bold text-[#806A5E]">المطلوب</p>
            </div>
            <div className="rounded-2xl bg-white p-4 text-center">
              <p className="text-2xl font-black text-[#311912]">
                {card?.availableRewards ?? 0}
              </p>
              <p className="text-xs font-bold text-[#806A5E]">مكافآت جاهزة</p>
            </div>
          </div>

          {(card?.availableRewards ?? 0) > 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#D9A33F] p-4 font-black text-[#311912]">
              <Gift className="h-5 w-5" />
              لديك مكافأة جاهزة للصرف
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onOpenCard}
              disabled={!card?.cardCode}
              className="rounded-2xl bg-[#6B3A25] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              فتح البطاقة والـ QR
            </button>
            <a
              href={homeHref}
              className="rounded-2xl border border-[#6B3A25] px-5 py-3 font-black text-[#6B3A25]"
            >
              رجوع للصفحة الرئيسية
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatRewardDate(value?: string) {
  if (!value) return "غير محدد";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function ExperienceRewardQrCode({ code }: { code: string }) {
  return (
    <div className="rounded-[24px] border border-[#E7D7C6] bg-white p-4">
      <SecureQrCode
        kind="experience-reward"
        value={code}
        title={`QR مكافأة توثيق التجربة ${code}`}
        size={172}
      />
      <p className="mt-3 select-all rounded-2xl bg-[#FCF8F3] px-3 py-2 text-center font-mono text-sm font-black tracking-[0.18em] text-[#311912]">
        {code}
      </p>
      <p className="mt-2 text-center text-[11px] font-black text-[#806A5E]">
        QR آمن للصرف من الكاشير أو لوحة العلامة فقط
      </p>
    </div>
  );
}
function ExperienceProofPanel({
  rewards,
  open,
  onOpen,
  onClose,
  experienceUrl,
  views,
  comments,
  notes,
  busy,
  onExperienceUrl,
  onViews,
  onComments,
  onNotes,
  onSubmit,
}: {
  rewards: CustomerExperienceReward[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  experienceUrl: string;
  views: string;
  comments: string;
  notes: string;
  busy: boolean;
  onExperienceUrl: (value: string) => void;
  onViews: (value: string) => void;
  onComments: (value: string) => void;
  onNotes: (value: string) => void;
  onSubmit: () => void;
}) {
  const rewardNotifications = rewards.slice(0, 8);
  const readyRewards = rewards.filter(
    (reward) => reward.status === "approved" && reward.rewardCode,
  );
  const pendingRewards = rewards.filter(
    (reward) => reward.status === "pending",
  ).length;

  return (
    <section className="mb-6 space-y-5">
      <div className="rounded-[34px] border border-[#E7D7C6] bg-white p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-[#D9A33F]">
              <Bell className="h-4 w-4" />
              التنبيهات والمكافآت
            </p>
            <h2 className="mt-1 text-2xl font-black text-[#311912]">
              مكافآت توثيق التجربة
            </h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
              هنا تظهر مكافآت العلامة بعد اعتماد توثيق تجربتك، ويتم تحديثها
              تلقائيًا، ومع كل مكافأة QR خاص يستخدم مرة واحدة فقط عند الكاشير أو
              لوحة العلامة
            </p>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-3 font-black text-white"
          >
            <LinkIcon className="h-4 w-4" />
            توثيق تجربة جديدة
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl bg-[#FCF8F3] p-4">
            <p className="text-xs font-black text-[#806A5E]">مكافآت جاهزة</p>
            <p className="mt-1 text-3xl font-black text-[#311912]">
              {readyRewards.length}
            </p>
          </div>
          <div className="rounded-3xl bg-[#FCF8F3] p-4">
            <p className="text-xs font-black text-[#806A5E]">
              بانتظار المراجعة
            </p>
            <p className="mt-1 text-3xl font-black text-[#311912]">
              {pendingRewards}
            </p>
          </div>
          <div className="rounded-3xl bg-[#FCF8F3] p-4">
            <p className="text-xs font-black text-[#806A5E]">كل التوثيقات</p>
            <p className="mt-1 text-3xl font-black text-[#311912]">
              {rewards.length}
            </p>
          </div>
        </div>
      </div>

      {rewardNotifications.length ? (
        <div className="grid gap-4">
          {rewardNotifications.map((reward, index) => {
            const isReady =
              reward.status === "approved" && Boolean(reward.rewardCode);
            const isRedeemed = reward.status === "redeemed";
            const statusText = isReady
              ? "لديكم مكافأة جاهزة"
              : isRedeemed
                ? "تم صرف المكافأة"
                : reward.status === "rejected"
                  ? "تم رفض التوثيق"
                  : "بانتظار مراجعة العلامة";

            return (
              <article
                key={reward.id}
                className={`rounded-[34px] border p-5 shadow-[0_16px_40px_rgba(49,25,18,0.07)] ${
                  isReady
                    ? "border-[#D9A33F] bg-[#FFF8E8]"
                    : "border-[#E7D7C6] bg-white"
                }`}
              >
                <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-2xl bg-[#6B3A25] px-3 py-1 text-xs font-black text-white">
                        {statusText}
                      </span>
                      <span className="rounded-2xl bg-white px-3 py-1 text-xs font-black text-[#806A5E]">
                        توثيق رقم {reward.id.slice(0, 8)}
                      </span>
                    </div>

                    <h3 className="mt-4 text-xl font-black text-[#311912]">
                      {isReady
                        ? `مكافأة مقابل توثيق التجربة رقم ${reward.id.slice(0, 8)}`
                        : `توثيق تجربة رقم ${reward.id.slice(0, 8)}`}
                    </h3>

                    <div className="mt-4 grid gap-3 text-sm font-bold text-[#806A5E] sm:grid-cols-2">
                      <p>
                        رابط التوثيق:{" "}
                        <a
                          className="font-black text-[#6B3A25] underline"
                          href={reward.experienceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          فتح الرابط
                        </a>
                      </p>
                      <p>
                        المشاهدات: {reward.currentViews.toLocaleString("ar-SA")}
                      </p>
                      <p>
                        التعليقات:{" "}
                        {reward.currentComments.toLocaleString("ar-SA")}
                      </p>
                      <p>تاريخ الإرسال: {formatRewardDate(reward.createdAt)}</p>
                      {reward.rewardExpiresAt ? (
                        <p className="sm:col-span-2">
                          صلاحية المكافأة: حتى{" "}
                          {formatRewardDate(reward.rewardExpiresAt)}
                        </p>
                      ) : null}
                    </div>

                    {reward.customerNotes ? (
                      <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold leading-7 text-[#806A5E]">
                        ملاحظاتك: {reward.customerNotes}
                      </p>
                    ) : null}

                    {reward.reviewNotes ? (
                      <p className="mt-3 rounded-2xl bg-[#FCF8F3] px-4 py-3 text-sm font-bold leading-7 text-[#806A5E]">
                        ملاحظات العلامة: {reward.reviewNotes}
                      </p>
                    ) : null}

                    {reward.items.length ? (
                      <div className="mt-4">
                        <p className="text-sm font-black text-[#311912]">
                          تفاصيل المكافأة
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {reward.items.map((item) => (
                            <span
                              key={item.id || `${reward.id}-${item.productId}`}
                              className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#6B3A25]"
                            >
                              {item.productName} × {item.quantity}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {isReady ? (
                    <ExperienceRewardQrCode code={reward.rewardCode} />
                  ) : isRedeemed ? (
                    <div className="rounded-[24px] border border-[#E7D7C6] bg-[#F8F4EF] p-5 text-center">
                      <QrCode className="mx-auto h-9 w-9 text-[#806A5E]" />
                      <p className="mt-3 font-black text-[#311912]">
                        تم استخدام QR
                      </p>
                      <p className="mt-2 text-xs font-bold text-[#806A5E]">
                        توقف هذا QR ولا يمكن صرفه مرة أخرى
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-[#E7D7C6] bg-[#FCF8F3] p-5 text-center">
                      <QrCode className="mx-auto h-9 w-9 text-[#806A5E]" />
                      <p className="mt-3 font-black text-[#311912]">
                        QR يظهر بعد اعتماد العلامة
                      </p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[34px] border border-dashed border-[#E7D7C6] bg-white p-8 text-center shadow-sm">
          <Gift className="mx-auto h-10 w-10 text-[#D9A33F]" />
          <h3 className="mt-3 text-xl font-black text-[#311912]">
            لا توجد تنبيهات مكافآت حتى الآن
          </h3>
          <p className="mt-2 text-sm font-bold text-[#806A5E]">
            وثّق تجربتك، وبعد اعتماد العلامة ستظهر المكافأة هنا مع QR الخاص بها
          </p>
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-5 text-[#311912] shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-2xl font-black">إرسال توثيق تجربة</h3>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FCF8F3]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-black text-[#806A5E]">
                  رابط التجربة
                </span>
                <input
                  value={experienceUrl}
                  onChange={(event) => onExperienceUrl(event.target.value)}
                  placeholder="https://..."
                  className="h-12 rounded-2xl border border-[#E7D7C6] px-4 font-bold outline-none"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#806A5E]">
                    عدد المشاهدات الحالية
                  </span>
                  <input
                    value={views}
                    onChange={(event) => onViews(event.target.value)}
                    inputMode="numeric"
                    className="h-12 rounded-2xl border border-[#E7D7C6] px-4 font-bold outline-none"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#806A5E]">
                    عدد التعليقات الحالية
                  </span>
                  <input
                    value={comments}
                    onChange={(event) => onComments(event.target.value)}
                    inputMode="numeric"
                    className="h-12 rounded-2xl border border-[#E7D7C6] px-4 font-bold outline-none"
                  />
                </label>
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-black text-[#806A5E]">
                  ملاحظات العميل
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => onNotes(event.target.value)}
                  rows={4}
                  className="rounded-2xl border border-[#E7D7C6] px-4 py-3 font-bold outline-none"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={onSubmit}
              disabled={busy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-4 font-black text-white disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              إرسال للعلامة للمراجعة
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { experience, settings, path, previewThemeId } =
    useCafePageContext(slug);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialLoadKeyRef = useRef<string | null>(null);

  const defaultTab: TabKey = "orders";

  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState("");
  const [pendingAvatar, setPendingAvatar] =
    useState<OptimizedImageResult | null>(null);
  const [avatarAssetId, setAvatarAssetId] = useState<string | undefined>();
  const [optimizingAvatar, setOptimizingAvatar] = useState(false);
  const [loyaltyView, setLoyaltyView] =
    useState<CustomerLoyaltyCardView | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [experienceRewards, setExperienceRewards] = useState<
    CustomerExperienceReward[]
  >([]);
  const [experienceProofOpen, setExperienceProofOpen] = useState(false);
  const [experienceUrl, setExperienceUrl] = useState("");
  const [experienceViews, setExperienceViews] = useState("");
  const [experienceComments, setExperienceComments] = useState("");
  const [experienceNotes, setExperienceNotes] = useState("");
  const [submittingExperienceProof, setSubmittingExperienceProof] =
    useState(false);

  useEffect(() => {
    const loadKey = `${slug}:${previewThemeId ?? "live"}`;
    if (initialLoadKeyRef.current === loadKey) return;
    initialLoadKeyRef.current = loadKey;

    let cancelled = false;

    async function load() {
      setLoyaltyLoading(true);

      const session = await getCustomerSession(slug);
      if (cancelled) return;

      if (!session) {
        const next = appendPreviewToNextPath(
          `/c/${slug}/account`,
          previewThemeId,
        );
        router.push(`${path("login")}?next=${encodeURIComponent(next)}`);
        return;
      }

      setCustomer(session);
      setEditName(session.fullName);
      setEditEmail(session.email || "");
      setEditAvatarPreview(session.avatarUrl || "");
      setAvatarAssetId(session.avatarAssetId);

      const { fetchCustomerOrdersAction, fetchCustomerReservationsAction } =
        await import("@/app/actions/customer");

      const [ordersResult, reservationsResult, loyaltyResult, rewardsResult] =
        await Promise.allSettled([
          fetchCustomerOrdersAction(slug),
          fetchCustomerReservationsAction(slug),
          fetchCustomerLoyaltyCardAction(slug),
          fetchCustomerExperienceRewardsAction(slug),
        ]);

      if (cancelled) return;

      const cafeOrders =
        ordersResult.status === "fulfilled" ? ordersResult.value : [];
      const cafeReservations =
        reservationsResult.status === "fulfilled"
          ? reservationsResult.value
          : [];

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
        })),
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
          reservationCode: r.reservationCode,
          reservationCodeUsedAt: r.reservationCodeUsedAt,
          cashierConfirmedAt: r.cashierConfirmedAt,
          notes: r.notes,
          createdAt: r.createdAt,
        })),
      );

      setLoyaltyView(
        loyaltyResult.status === "fulfilled" ? loyaltyResult.value : null,
      );
      setExperienceRewards(
        rewardsResult.status === "fulfilled" ? rewardsResult.value : [],
      );
      setLoyaltyLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router, slug, previewThemeId]);

  const myOrders = useMemo(
    () => orders.filter((order) => order.customerId === customer?.id),
    [orders, customer],
  );

  const myInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.customerId === customer?.id),
    [invoices, customer],
  );

  const myTransactions = useMemo(
    () => transactions.filter((item) => item.customerId === customer?.id),
    [transactions, customer],
  );

  const myReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) =>
          reservation.customerId === customer?.id ||
          reservation.phone === customer?.phone,
      ),
    [reservations, customer],
  );

  const loyaltyBalance = useMemo(
    () => myTransactions.reduce((sum, item) => sum + (item.points || 0), 0),
    [myTransactions],
  );

  const totalInvoices = useMemo(
    () => myInvoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    [myInvoices],
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

    return [
      ...orderActivities,
      ...reservationActivities,
      ...transactionActivities,
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);
  }, [myOrders, myReservations, myTransactions]);

  function openLoyaltyCard() {
    if (loyaltyView?.card.cardCode) {
      router.push(
        `/loyalty-card/${loyaltyView.card.cardCode}?back=${encodeURIComponent(path("account"))}`,
      );
    }
  }

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
      if (editAvatarPreview.startsWith("blob:"))
        revokeObjectUrl(editAvatarPreview);
      setEditAvatarPreview(URL.createObjectURL(optimized.blob));
      setPendingAvatar(optimized);
    } catch (err) {
      alert(
        err instanceof ImagePipelineError
          ? err.message
          : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP",
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

  async function submitExperienceProof() {
    if (!experienceUrl.trim()) {
      alert("أدخل رابط التجربة");
      return;
    }

    setSubmittingExperienceProof(true);
    try {
      await submitCustomerExperienceRewardProofAction({
        cafeSlug: slug,
        experienceUrl: experienceUrl.trim(),
        currentViews: Number(experienceViews || 0),
        currentComments: Number(experienceComments || 0),
        customerNotes: experienceNotes.trim() || undefined,
      });

      const items = await fetchCustomerExperienceRewardsAction(slug);
      setExperienceRewards(items);
      setExperienceUrl("");
      setExperienceViews("");
      setExperienceComments("");
      setExperienceNotes("");
      setExperienceProofOpen(false);
      alert("تم إرسال التوثيق للعلامة التجارية للمراجعة");
    } catch {
      alert("تعذر إرسال التوثيق، تأكد من الرابط وحاول مرة أخرى");
    } finally {
      setSubmittingExperienceProof(false);
    }
  }

  if (!customer) return null;

  return (
    <>
      <CustomerCoffeeLoyaltyCard
        view={loyaltyView}
        homeHref={path()}
        onOpenCard={openLoyaltyCard}
        loading={loyaltyLoading}
      />

      <ExperienceProofPanel
        rewards={experienceRewards}
        open={experienceProofOpen}
        onOpen={() => setExperienceProofOpen(true)}
        onClose={() => setExperienceProofOpen(false)}
        experienceUrl={experienceUrl}
        views={experienceViews}
        comments={experienceComments}
        notes={experienceNotes}
        busy={submittingExperienceProof}
        onExperienceUrl={setExperienceUrl}
        onViews={setExperienceViews}
        onComments={setExperienceComments}
        onNotes={setExperienceNotes}
        onSubmit={() => void submitExperienceProof()}
      />

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
          if (editAvatarPreview.startsWith("blob:"))
            revokeObjectUrl(editAvatarPreview);
          setEditAvatarPreview("");
          setPendingAvatar(null);
          setAvatarAssetId(undefined);
        }}
        onSaveSettings={() => void saveSettings()}
        fileRef={fileRef}
      />
    </>
  );
}

export default function CafeCustomerAccountPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout
      slug={params.slug}
      className="!px-0 !py-0"
      maxWidth="max-w-[100%]"
    >
      <Suspense
        fallback={<p className="p-8 text-center font-black">جاري التحميل...</p>}
      >
        <AccountPageInner />
      </Suspense>
    </CafeLayout>
  );
}
