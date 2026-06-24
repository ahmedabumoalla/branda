"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { fetchCustomerAccountSnapshotAction } from "@/app/actions/customer-account";
import { ThemedAccountPanel } from "@/components/cafe/themes/themed-account-panel";
import {
  CustomerBottomDock,
  defaultCustomerDockItems,
} from "@/components/cafe/themes/customer-mobile-experience";
import { getCafePath, getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import {
  clearCustomerSession,
  type BarndaksaCustomerSession,
} from "@/lib/customer/session";
import {
  updateCustomerProfileAction,
  uploadCustomerAvatarAction,
} from "@/app/actions/customer-media";
import { changeCustomerPasswordAction } from "@/app/actions/auth";
import {
  type CustomerInvoice,
  type CustomerOrder,
  type CustomerTransaction,
} from "@/lib/mock/customer-activity";
import { formatSar } from "@/lib/format";
import {
  fetchCustomerExperienceRewardsAction,
  submitCustomerExperienceRewardProofAction,
} from "@/app/actions/experience-rewards";
import type { CustomerLoyaltyCardView } from "@/lib/data/loyalty-cards";
import type { CustomerExperienceReward } from "@/lib/data/experience-rewards";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import {
  Bell,
  CalendarDays,
  Coffee,
  Eye,
  EyeOff,
  Gift,
  KeyRound,
  Link as LinkIcon,
  QrCode,
  Send,
  Utensils,
  WalletCards,
  X,
} from "lucide-react";
import { getBusinessCopy } from "@/lib/platform/business-copy";

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

type CustomerAccountSnapshot = Awaited<
  ReturnType<typeof fetchCustomerAccountSnapshotAction>
>;

type AccountNotification = {
  id: string;
  title: string;
  body: string;
};

const accountSnapshotCache = new Map<
  string,
  Promise<CustomerAccountSnapshot> | CustomerAccountSnapshot
>();
const ACCOUNT_SNAPSHOT_TIMEOUT_MS = 5_000;
const AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const AVATAR_MAX_DIMENSION = 1024;
const CUSTOMER_ACCOUNT_LOAD_ERROR =
  "تعذر تحميل بيانات الحساب. سجّل الدخول مرة أخرى أو أعد المحاولة.";

type CompressedAvatar = {
  file: File;
  mimeType: "image/webp" | "image/jpeg";
};

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isHeicLike(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return type.includes("heic") || type.includes("heif") || name.endsWith(".heic") || name.endsWith(".heif");
}

function scaleAvatarDimensions(width: number, height: number) {
  const ratio = Math.min(AVATAR_MAX_DIMENSION / width, AVATAR_MAX_DIMENSION / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function loadAvatarImage(file: File) {
  if (typeof createImageBitmap !== "undefined") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => {
          ctx.drawImage(bitmap, 0, 0, width, height);
        },
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement for browsers without bitmap support for this file.
    }
  }

  return new Promise<{
    width: number;
    height: number;
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
    cleanup: () => void;
  }>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        draw: (ctx, width, height) => ctx.drawImage(image, 0, 0, width, height),
        cleanup: () => {},
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(isHeicLike(file) ? "unsupported_heic" : "decode_failed"));
    };
    image.src = objectUrl;
  });
}

async function compressAvatarForUpload(file: File): Promise<CompressedAvatar> {
  if (isHeicLike(file)) {
    throw new Error("unsupported_heic");
  }

  const source = await loadAvatarImage(file);
  const dimensions = scaleAvatarDimensions(source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    source.cleanup();
    throw new Error("decode_failed");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  source.draw(ctx, dimensions.width, dimensions.height);
  source.cleanup();

  const candidates: Array<{ mimeType: "image/webp" | "image/jpeg"; quality: number; fileName: string }> = [
    { mimeType: "image/webp", quality: 0.84, fileName: "avatar.webp" },
    { mimeType: "image/webp", quality: 0.8, fileName: "avatar.webp" },
    { mimeType: "image/jpeg", quality: 0.84, fileName: "avatar.jpg" },
    { mimeType: "image/jpeg", quality: 0.8, fileName: "avatar.jpg" },
  ];

  let best: CompressedAvatar | null = null;

  for (const candidate of candidates) {
    const blob = await canvasToBlob(canvas, candidate.mimeType, candidate.quality);
    if (!blob) continue;

    const compressed = new File([blob], candidate.fileName, { type: candidate.mimeType });
    if (!best || compressed.size < best.file.size) {
      best = { file: compressed, mimeType: candidate.mimeType };
    }
    if (compressed.size <= AVATAR_MAX_UPLOAD_BYTES) {
      return { file: compressed, mimeType: candidate.mimeType };
    }
  }

  if (!best) {
    throw new Error("decode_failed");
  }

  return best;
}

function isAcceptedAccountStatus(status?: string) {
  const value = String(status ?? "").toLowerCase();
  return (
    value === "accepted" ||
    value.includes("accepted") ||
    value.includes("مقبول") ||
    value.includes("قبول") ||
    value.includes("تمت الموافقة")
  );
}

function buildAccountNotifications({
  orders,
  reservations,
  loyaltyView,
  experienceRewards,
  businessCategory,
}: {
  orders: CustomerOrder[];
  reservations: Reservation[];
  loyaltyView: CustomerLoyaltyCardView | null;
  experienceRewards: CustomerExperienceReward[];
  businessCategory?: string;
}) {
  const isEvents = getBusinessCopy(businessCategory).kind === "events";
  const notifications: AccountNotification[] = [];

  orders.filter((order) => isAcceptedAccountStatus(order.status)).forEach((order) => {
    const statusMarker =
      (order as CustomerOrder & { statusUpdatedAt?: string; updatedAt?: string }).statusUpdatedAt ??
      (order as CustomerOrder & { updatedAt?: string }).updatedAt ??
      order.status;
    notifications.push({
      id: `order:${order.id}:${statusMarker}`,
      title: isEvents ? "تمت الموافقة على شراء التذاكر" : "تمت الموافقة على طلب",
      body: `${order.items.join("، ") || (isEvents ? "تذاكر" : "طلب منتجات")} - ${formatSar(order.total)}`,
    });
  });

  reservations.filter((reservation) => isAcceptedAccountStatus(reservation.status)).forEach((reservation) => {
    const statusMarker =
      (reservation as Reservation & { statusUpdatedAt?: string; updatedAt?: string }).statusUpdatedAt ??
      (reservation as Reservation & { updatedAt?: string }).updatedAt ??
      reservation.status;
    notifications.push({
      id: `reservation:${reservation.id}:${statusMarker}`,
      title: "تمت الموافقة على حجز",
      body: `${reservation.type || "حجز"} - ${reservation.date || "-"} ${reservation.time || ""}`.trim(),
    });
  });

  experienceRewards
    .filter((reward) => reward.status === "approved" && reward.rewardCode)
    .forEach((reward) => {
      const statusMarker =
        (reward as CustomerExperienceReward & { statusUpdatedAt?: string; updatedAt?: string }).statusUpdatedAt ??
        (reward as CustomerExperienceReward & { updatedAt?: string }).updatedAt ??
        reward.status;
      notifications.push({
        id: `experience-reward:${reward.id}:${statusMarker}`,
        title: "مكافأة توثيق جاهزة",
        body: reward.items.map((item) => `${item.productName} × ${item.quantity}`).join("، ") || "مكافأة جاهزة للصرف",
      });
    });

  const availableRewards = Number(loyaltyView?.card.availableRewards ?? 0);
  if (availableRewards > 0) {
    notifications.push({
      id: `loyalty-reward:${loyaltyView?.card.cardCode ?? "card"}:${availableRewards}`,
      title: "مكافأة بطاقة الولاء جاهزة",
      body: `${availableRewards} مكافأة متاحة`,
    });
  }

  return notifications;
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);

    task.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function fetchCustomerAccountSnapshotOnce(slug: string, cacheKey: string) {
  const cached = accountSnapshotCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  const promise = fetchCustomerAccountSnapshotAction(slug).then(
    (snapshot) => {
      if (accountSnapshotCache.get(cacheKey) === promise) {
        accountSnapshotCache.set(cacheKey, snapshot);
      }
      return snapshot;
    },
    (error) => {
      accountSnapshotCache.delete(cacheKey);
      throw error;
    },
  );

  accountSnapshotCache.set(cacheKey, promise);
  return promise;
}

function CustomerCoffeeLoyaltyCard({
  view,
  homeHref,
  onOpenCard,
  loading,
  businessCategory,
}: {
  view: CustomerLoyaltyCardView | null;
  homeHref: string;
  onOpenCard: () => void;
  loading: boolean;
  businessCategory?: string;
}) {
  const copy = getBusinessCopy(businessCategory);
  const StampIcon = copy.kind === "events" ? CalendarDays : copy.kind === "restaurant" ? Utensils : Coffee;
  const program = view?.program;
  const card = view?.card;
  const required = Math.max(1, Number(program?.purchasesRequired ?? 7));
  const lit = Math.min(required, Number(card?.stampsInCycle ?? 0));
  const cups = Array.from({ length: required });

  return (
    <section className="barndaksa-premium-card mb-6 overflow-hidden rounded-[36px] border border-[var(--ci-border,var(--barndaksa-border-sand))] bg-[var(--ci-surface-bg,#fff)] p-4 shadow-[0_24px_80px_rgba(49,25,18,0.12)] sm:p-5">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[var(--ci-primary-bg,var(--barndaksa-coffee-brown))] to-[var(--ci-secondary-bg,var(--barndaksa-brand-brown))] p-5 text-[var(--ci-button-fg,#FCF8F3)] shadow-2xl">
          <div aria-hidden className="absolute inset-x-0 top-0 h-24 bg-white/10" />
          <div aria-hidden className="absolute -left-16 bottom-8 h-32 w-52 rotate-[-18deg] border-y border-white/15" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-serif text-2xl font-black uppercase tracking-[0.18em]">
                Loyalty Card
              </p>
              <p className="mt-1 text-xs font-bold text-white/75">
                اشتر {required} مرات واحصل على{" "}
                {program?.rewardName || copy.freeRewardName}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] text-[var(--ci-accent-fg,#311912)]">
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
                        ? "border-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] bg-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] text-[var(--ci-accent-fg,#311912)] shadow-[0_0_24px_rgba(255,211,107,0.55)]"
                        : "border-[#8A6B5E] bg-[#6B4A3B] text-[#D8BDAF]"
                    }`}
                  >
                    <StampIcon className="h-7 w-7" />
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
          <p className="text-sm font-black text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]">
            بطاقة الولاء الخاصة بالعلامة التجارية
          </p>
          <h2 className="mt-2 text-3xl font-black text-[var(--ci-page-fg,#311912)]">
            {program?.cardTitle || "بطاقة الولاء"}
          </h2>
          <p className="mt-3 text-sm font-bold leading-7 text-[var(--ci-muted-fg,#806A5E)]">
            كل مرة يقرأ الكاشير QR البطاقة مع QR الفاتورة يضيء {copy.loyaltyUnitSingular} جديد حتى
            تكتمل {copy.loyaltyUnitPlural} وتظهر مكافأة {program?.rewardName || copy.freeRewardName}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[var(--ci-page-bg,#FCF8F3)] p-4 text-center">
              <p className="text-2xl font-black text-[var(--ci-page-fg,#311912)]">{lit}</p>
              <p className="text-xs font-bold text-[var(--ci-muted-fg,#806A5E)]">{copy.loyaltyUnitLit}</p>
            </div>
            <div className="rounded-2xl bg-[var(--ci-page-bg,#FCF8F3)] p-4 text-center">
              <p className="text-2xl font-black text-[var(--ci-page-fg,#311912)]">{required}</p>
              <p className="text-xs font-bold text-[var(--ci-muted-fg,#806A5E)]">المطلوب</p>
            </div>
            <div className="rounded-2xl bg-[var(--ci-page-bg,#FCF8F3)] p-4 text-center">
              <p className="text-2xl font-black text-[var(--ci-page-fg,#311912)]">
                {card?.availableRewards ?? 0}
              </p>
              <p className="text-xs font-bold text-[var(--ci-muted-fg,#806A5E)]">مكافآت جاهزة</p>
            </div>
          </div>

          {(card?.availableRewards ?? 0) > 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] p-4 font-black text-[var(--ci-accent-fg,#311912)]">
              <Gift className="h-5 w-5" />
              لديك مكافأة جاهزة للصرف
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onOpenCard}
              disabled={!card?.cardCode}
              className="rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-3 font-black text-[var(--ci-button-fg,#fff)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              فتح البطاقة والـ QR
            </button>
            <a
              href={homeHref}
              className="rounded-2xl border border-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] px-5 py-3 font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))]"
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
      <div className="barndaksa-premium-card rounded-[36px] border border-[var(--ci-border,var(--barndaksa-border-sand))] bg-[var(--ci-surface-bg,#fff)] p-5 shadow-[0_24px_80px_rgba(49,25,18,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-black text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]">
              <Bell className="h-4 w-4" />
              التنبيهات والمكافآت
            </p>
            <h2 className="mt-1 text-2xl font-black text-[var(--ci-page-fg,#311912)]">
              مكافآت توثيق التجربة
            </h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[var(--ci-muted-fg,#806A5E)]">
              هنا تظهر مكافآت العلامة بعد اعتماد توثيق تجربتك، ويتم تحديثها
              تلقائيًا، ومع كل مكافأة QR خاص يستخدم مرة واحدة فقط عند الكاشير أو
              لوحة العلامة
            </p>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-3 font-black text-[var(--ci-button-fg,#fff)] transition active:scale-95"
          >
            <LinkIcon className="h-4 w-4" />
            توثيق تجربة جديدة
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl bg-[var(--ci-page-bg,#FCF8F3)] p-4">
            <p className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">مكافآت جاهزة</p>
            <p className="mt-1 text-3xl font-black text-[var(--ci-page-fg,#311912)]">
              {readyRewards.length}
            </p>
          </div>
          <div className="rounded-3xl bg-[var(--ci-page-bg,#FCF8F3)] p-4">
            <p className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
              بانتظار المراجعة
            </p>
            <p className="mt-1 text-3xl font-black text-[var(--ci-page-fg,#311912)]">
              {pendingRewards}
            </p>
          </div>
          <div className="rounded-3xl bg-[var(--ci-page-bg,#FCF8F3)] p-4">
            <p className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">كل التوثيقات</p>
            <p className="mt-1 text-3xl font-black text-[var(--ci-page-fg,#311912)]">
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
                className={`barndaksa-premium-card rounded-[34px] border p-5 shadow-[0_18px_55px_rgba(49,25,18,0.08)] ${
                  isReady
                    ? "border-[var(--ci-accent-bg,var(--barndaksa-gold-accent))] bg-[var(--ci-surface-bg,#fff)]"
                    : "border-[var(--ci-border,var(--barndaksa-border-sand))] bg-[var(--ci-surface-bg,#fff)]"
                }`}
              >
                <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-3 py-1 text-xs font-black text-[var(--ci-button-fg,#fff)]">
                        {statusText}
                      </span>
                      <span className="rounded-2xl bg-white/80 px-3 py-1 text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
                        توثيق رقم {reward.id.slice(0, 8)}
                      </span>
                    </div>

                    <h3 className="mt-4 text-xl font-black text-[var(--ci-page-fg,#311912)]">
                      {isReady
                        ? `مكافأة مقابل توثيق التجربة رقم ${reward.id.slice(0, 8)}`
                        : `توثيق تجربة رقم ${reward.id.slice(0, 8)}`}
                    </h3>

                    <div className="mt-4 grid gap-3 text-sm font-bold text-[var(--ci-muted-fg,#806A5E)] sm:grid-cols-2">
                      <p>
                        رابط التوثيق:{" "}
                        <a
                          className="font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] underline"
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
                      <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-sm font-bold leading-7 text-[var(--ci-muted-fg,#806A5E)]">
                        ملاحظاتك: {reward.customerNotes}
                      </p>
                    ) : null}

                    {reward.reviewNotes ? (
                      <p className="mt-3 rounded-2xl bg-[var(--ci-page-bg,#FCF8F3)] px-4 py-3 text-sm font-bold leading-7 text-[var(--ci-muted-fg,#806A5E)]">
                        ملاحظات العلامة: {reward.reviewNotes}
                      </p>
                    ) : null}

                    {reward.items.length ? (
                      <div className="mt-4">
                        <p className="text-sm font-black text-[var(--ci-page-fg,#311912)]">
                          تفاصيل المكافأة
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {reward.items.map((item) => (
                            <span
                              key={item.id || `${reward.id}-${item.productId}`}
                              className="rounded-2xl bg-white/80 px-4 py-2 text-sm font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))]"
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
        <div className="rounded-[34px] border border-dashed border-[var(--ci-border,var(--barndaksa-border-sand))] bg-[var(--ci-surface-bg,#fff)] p-8 text-center shadow-sm">
          <Gift className="mx-auto h-10 w-10 text-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]" />
          <h3 className="mt-3 text-xl font-black text-[var(--ci-page-fg,#311912)]">
            لا توجد تنبيهات مكافآت حتى الآن
          </h3>
          <p className="mt-2 text-sm font-bold text-[var(--ci-muted-fg,#806A5E)]">
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

function CustomerPasswordField({
  label,
  value,
  visible,
  autoComplete,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
        {label}
      </span>
      <div className="relative mt-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="h-12 w-full rounded-2xl border border-[#E7D7C6] bg-white px-4 pl-12 font-bold text-[#311912] outline-none"
          required
          minLength={autoComplete === "new-password" ? 8 : undefined}
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B3A25]"
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </label>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { experience, settings, path, previewThemeId } =
    useCafePageContext(slug);
  const fileRef = useRef<HTMLInputElement>(null);
  const accountSnapshotKey = `${slug}:${previewThemeId ?? "live"}`;
  const accountLoginWithNextHref = getCustomerLoginHref(
    slug,
    `/c/${slug}/account`,
    previewThemeId,
  );

  const defaultTab: TabKey = "orders";

  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountError, setAccountError] = useState("");
  const [redirectingToLogin, setRedirectingToLogin] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [accountFeatures, setAccountFeatures] = useState<string[]>([]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAvatarPreview, setEditAvatarPreview] = useState("");
  const [avatarAssetId, setAvatarAssetId] = useState<string | undefined>();
  const [optimizingAvatar, setOptimizingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordVisible, setPasswordVisible] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const loadKey = `${accountSnapshotKey}:${reloadToken}`;

    let cancelled = false;

    function finishLoading() {
      setLoyaltyLoading(false);
      setAccountLoading(false);
    }

    async function load() {
      setAccountLoading(true);
      setAccountError("");
      setRedirectingToLogin(false);
      setLoyaltyLoading(true);
      setAccountFeatures([]);

      const result = await withTimeout(
        fetchCustomerAccountSnapshotOnce(slug, loadKey),
        ACCOUNT_SNAPSHOT_TIMEOUT_MS,
      );
      if (cancelled) return;

      const errorCode = result.code ?? result.errorCode ?? null;
      const errorMessage = result.error ?? result.message ?? CUSTOMER_ACCOUNT_LOAD_ERROR;
      const hasData = Boolean(result.data);

      if (process.env.NODE_ENV === "development") {
        console.info("[customer-account] snapshot result", {
          success: result.success,
          hasData,
          errorCode,
        });
      }

      if (!result.success || !result.data) {
        finishLoading();
        setRedirectingToLogin(errorCode === "invalid_session");
        setAccountError(errorMessage);
        return;
      }

      const snapshot = result.data;
      if (!snapshot.customer) {
        finishLoading();
        setRedirectingToLogin(true);
        setAccountError(CUSTOMER_ACCOUNT_LOAD_ERROR);
        return;
      }

      const session = snapshot.customer;
      setCustomer(session);
      setAccountFeatures(snapshot.features);
      setEditName(session.fullName);
      setEditPhone(session.phone || "");
      setEditAvatarPreview(session.avatarUrl || "");
      setAvatarAssetId(session.avatarAssetId);
      setAvatarMessage(null);

      setOrders(
        snapshot.orders.map((o: any) => ({
          id: o.id,
          cafeSlug: slug,
          customerId: o.customerId,
          customerName: o.customerName,
          status: o.status as CustomerOrder["status"],
          items: Array.isArray(o.items) ? o.items.map((item: any) => typeof item === "string" ? item : `${item.name} × ${item.quantity}`) : [],
          total: o.total,
          createdAt: o.createdAt,
          branchName: o.branchName,
          pickupAt: o.pickupAt,
          notes: o.notes,
        })),
      );

      setReservations(
        snapshot.reservations.map((r: any) => ({
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

      setLoyaltyView(snapshot.loyalty);
      setExperienceRewards(snapshot.experienceRewards);
      finishLoading();
    }

    void load().catch((error) => {
      if (cancelled) return;
      console.error("[CafeCustomerAccountPage:load]", error);
      accountSnapshotCache.delete(loadKey);
      finishLoading();
      setAccountError(
        error instanceof Error && error.message === "timeout"
          ? CUSTOMER_ACCOUNT_LOAD_ERROR
          : CUSTOMER_ACCOUNT_LOAD_ERROR,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [accountSnapshotKey, reloadToken, slug]);

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
    const isEvents = getBusinessCopy(settings.businessCategory).kind === "events";
    const orderActivities = myOrders.map((order) => ({
      id: order.id,
      title: `${isEvents ? "تذكرة" : "طلب"}: ${order.items.join("، ")}`,
      desc: `${order.status} • ${formatSar(order.total)}`,
      date: order.createdAt,
      type: isEvents ? "تذكرة" : "طلب",
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

  const loyaltyEnabled = featureCodesAllow(accountFeatures, "loyalty");
  const experienceRewardsEnabled = featureCodesAllow(accountFeatures, "experience_reviews");
  const notificationStorageKey = customer
    ? `barndaksa_read_notifications_${slug}_${customer.id}`
    : "";
  const accountNotifications = useMemo(
    () =>
      buildAccountNotifications({
        orders: myOrders,
        reservations: myReservations,
        loyaltyView,
        experienceRewards,
        businessCategory: settings.businessCategory,
      }),
    [experienceRewards, loyaltyView, myOrders, myReservations, settings.businessCategory],
  );
  const unreadNotificationCount = useMemo(
    () => accountNotifications.filter((item) => !readNotificationIds.has(item.id)).length,
    [accountNotifications, readNotificationIds],
  );
  const dockProps = useMemo(() => {
    const dock = defaultCustomerDockItems({
      slug,
      previewThemeId,
      active: "account",
      hasProducts: true,
      hasOrders: true,
      hasRewards: loyaltyEnabled,
      isCustomer: true,
      businessCategory: settings.businessCategory,
    });

    return {
      ...dock,
      items: dock.items.map((item) =>
        item.key === "account" ? { ...item, badge: unreadNotificationCount } : item,
      ),
    };
  }, [loyaltyEnabled, previewThemeId, slug, unreadNotificationCount]);

  useEffect(() => {
    if (!notificationStorageKey) {
      setReadNotificationIds(new Set());
      return;
    }

    try {
      const raw = window.localStorage.getItem(notificationStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setReadNotificationIds(new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []));
    } catch {
      setReadNotificationIds(new Set());
    }
  }, [notificationStorageKey]);

  function markCurrentNotificationsRead() {
    if (!notificationStorageKey || !accountNotifications.length) return;

    setReadNotificationIds((previous) => {
      const next = new Set(previous);
      accountNotifications.forEach((item) => next.add(item.id));
      try {
        window.localStorage.setItem(notificationStorageKey, JSON.stringify(Array.from(next)));
      } catch {
        // Keep the in-memory reset even if localStorage is unavailable.
      }
      return next;
    });
  }

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
    if (!customer) return;

    setOptimizingAvatar(true);
    setAvatarMessage({
      type: "success",
      text: `حجم الصورة الأصلي ${formatFileSize(file.size)}، جاري تجهيزها للرفع.`,
    });
    const previousPreview = customer.avatarUrl || "";

    try {
      const compressed = await compressAvatarForUpload(file);

      if (compressed.file.size > AVATAR_MAX_UPLOAD_BYTES) {
        setEditAvatarPreview(previousPreview);
        setAvatarMessage({
          type: "error",
          text: "تعذر ضغط الصورة بما يكفي، جرّب صورة أصغر أو بصيغة JPG/PNG.",
        });
        return;
      }

      if (editAvatarPreview.startsWith("blob:")) {
        revokeObjectUrl(editAvatarPreview);
      }

      const previewUrl = URL.createObjectURL(compressed.file);
      setEditAvatarPreview(previewUrl);

      const formData = new FormData();
      formData.set("file", compressed.file);

      const result = await uploadCustomerAvatarAction(slug, formData);
      if (!result.success) {
        revokeObjectUrl(previewUrl);
        setEditAvatarPreview(previousPreview);
        setAvatarMessage({
          type: "error",
          text: result.error || "تعذر رفع الصورة. تأكد من أن الملف صورة وبحجم أقل من 5MB.",
        });
        return;
      }

      if (result.avatarUrl) {
        revokeObjectUrl(previewUrl);
        setEditAvatarPreview(result.avatarUrl);
      }

      setAvatarAssetId(result.avatarStoragePath);
      setCustomer((current) =>
        current
          ? {
              ...current,
              avatarUrl: result.avatarUrl ?? current.avatarUrl,
              avatarAssetId: result.avatarStoragePath,
            }
          : current,
      );
      setAvatarMessage({
        type: "success",
        text: `تم تحديث صورة الحساب بعد ضغطها إلى ${formatFileSize(compressed.file.size)}.`,
      });
    } catch (err) {
      setEditAvatarPreview(previousPreview);
      setAvatarMessage({
        type: "error",
        text:
          err instanceof Error && err.message === "unsupported_heic"
            ? "هذه الصيغة غير مدعومة حاليًا، فضلاً ارفع JPG أو PNG."
            : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP",
      });
    } finally {
      setOptimizingAvatar(false);
    }
  }

  async function saveSettings() {
    if (!editName.trim()) {
      alert("اكتب الاسم");
      return;
    }
    if (!editPhone.trim()) {
      alert("اكتب رقم الجوال");
      return;
    }
    if (!customer) return;

    try {
      const session = await updateCustomerProfileAction(slug, {
        fullName: editName.trim(),
        phone: editPhone.trim(),
      });

      setCustomer(session);
      setSettingsOpen(false);
      alert("تم حفظ بيانات الحساب");
    } catch {
      alert("تعذر حفظ بيانات الحساب");
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);

    if (!passwordForm.currentPassword) {
      setPasswordMessage({ type: "error", text: "كلمة المرور الحالية مطلوبة." });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage({
        type: "error",
        text: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.",
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({
        type: "error",
        text: "تأكيد كلمة المرور يجب أن يطابق كلمة المرور الجديدة.",
      });
      return;
    }

    setPasswordSaving(true);
    const result = await changeCustomerPasswordAction({
      cafeSlug: slug,
      ...passwordForm,
    });
    setPasswordSaving(false);
    setPasswordMessage({
      type: result.ok ? "success" : "error",
      text: result.message,
    });

    if (result.ok) {
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordVisible({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });
    }
  }

  async function submitExperienceProof() {
    if (!experienceRewardsEnabled) {
      alert("توثيق التجارب غير مفعّل ضمن باقة هذه العلامة");
      return;
    }

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

  if (accountLoading && !customer) {
    return (
      <div className="rounded-3xl p-8 text-center">
        <p className="font-black text-[var(--ci-page-fg,#311912)]">
          جاري تحميل بيانات الحساب...
        </p>
      </div>
    );
  }

  if (accountError && !customer) {
    return (
      <div className="rounded-3xl p-8 text-center">
        <p className="font-black text-[var(--ci-page-fg,#311912)]">
          {accountError}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              accountSnapshotCache.delete(`${accountSnapshotKey}:${reloadToken}`);
              setReloadToken((value) => value + 1);
            }}
            className="rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-3 font-black text-[var(--ci-button-fg,#fff)]"
          >
            إعادة المحاولة
          </button>
          <a
            href={accountLoginWithNextHref}
            className="rounded-2xl border border-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] px-5 py-3 font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))]"
          >
            تسجيل الدخول
          </a>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="rounded-3xl p-8 text-center">
        <p className="font-black text-[var(--ci-page-fg,#311912)]">
          {redirectingToLogin
            ? "تعذر تحميل بيانات الحساب. سجّل الدخول مرة أخرى أو أعد المحاولة."
            : "لم يتم العثور على جلسة عميل نشطة."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              accountSnapshotCache.delete(`${accountSnapshotKey}:${reloadToken}`);
              setReloadToken((value) => value + 1);
            }}
            className="rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-3 font-black text-[var(--ci-button-fg,#fff)]"
          >
            إعادة المحاولة
          </button>
          <a
            href={accountLoginWithNextHref}
            className="rounded-2xl border border-[var(--ci-primary-bg,var(--barndaksa-brand-brown))] px-5 py-3 font-black text-[var(--ci-primary-bg,var(--barndaksa-brand-brown))]"
          >
            تسجيل الدخول
          </a>
        </div>
      </div>
    );
  }

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
          setEditPhone(customer.phone || "");
          setEditAvatarPreview(customer.avatarUrl || "");
          setAvatarAssetId(customer.avatarAssetId);
          setAvatarMessage(null);
          setSettingsOpen(true);
        }}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        editName={editName}
        editPhone={editPhone}
        editAvatarPreview={editAvatarPreview}
        avatarAssetId={avatarAssetId}
        avatarBusy={optimizingAvatar}
        avatarMessage={avatarMessage}
        avatarFileRef={fileRef}
        onPickAvatar={(event) => void pickAvatar(event)}
        onEditName={setEditName}
        onEditPhone={setEditPhone}
        onSaveSettings={() => void saveSettings()}
        businessCategory={settings.businessCategory}
        notifications={accountNotifications}
        unreadNotificationCount={unreadNotificationCount}
        onOpenNotifications={markCurrentNotificationsRead}
        loyaltySlot={
          loyaltyEnabled ? (
            <CustomerCoffeeLoyaltyCard
              view={loyaltyView}
              homeHref={path()}
              onOpenCard={openLoyaltyCard}
              loading={loyaltyLoading}
              businessCategory={settings.businessCategory}
            />
          ) : undefined
        }
        experienceRewardsSlot={
          experienceRewardsEnabled ? (
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
          ) : undefined
        }
        loyaltyView={loyaltyView}
        experienceRewards={experienceRewards}
        passwordSlot={
          <form onSubmit={changePassword} className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              <h3 className="text-lg font-black">تغيير كلمة المرور</h3>
            </div>
            <CustomerPasswordField
              label="كلمة المرور الحالية"
              value={passwordForm.currentPassword}
              visible={passwordVisible.currentPassword}
              autoComplete="current-password"
              onChange={(value) =>
                setPasswordForm((prev) => ({ ...prev, currentPassword: value }))
              }
              onToggle={() =>
                setPasswordVisible((prev) => ({
                  ...prev,
                  currentPassword: !prev.currentPassword,
                }))
              }
            />
            <CustomerPasswordField
              label="كلمة المرور الجديدة"
              value={passwordForm.newPassword}
              visible={passwordVisible.newPassword}
              autoComplete="new-password"
              onChange={(value) =>
                setPasswordForm((prev) => ({ ...prev, newPassword: value }))
              }
              onToggle={() =>
                setPasswordVisible((prev) => ({
                  ...prev,
                  newPassword: !prev.newPassword,
                }))
              }
            />
            <CustomerPasswordField
              label="تأكيد كلمة المرور الجديدة"
              value={passwordForm.confirmPassword}
              visible={passwordVisible.confirmPassword}
              autoComplete="new-password"
              onChange={(value) =>
                setPasswordForm((prev) => ({ ...prev, confirmPassword: value }))
              }
              onToggle={() =>
                setPasswordVisible((prev) => ({
                  ...prev,
                  confirmPassword: !prev.confirmPassword,
                }))
              }
            />
            {passwordMessage ? (
              <p
                className={
                  passwordMessage.type === "success"
                    ? "text-sm font-black text-emerald-700"
                    : "text-sm font-black text-red-600"
                }
              >
                {passwordMessage.text}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={passwordSaving}
              className="w-full rounded-2xl bg-[var(--ci-button-bg,var(--barndaksa-brand-brown))] px-5 py-4 font-black text-[var(--ci-button-fg,#fff)] disabled:opacity-60"
            >
              {passwordSaving ? "جار تغيير كلمة المرور..." : "تغيير كلمة المرور"}
            </button>
          </form>
        }
      />
      <CustomerBottomDock
        {...dockProps}
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
      hideQuickDock
      hideHeader
      hideFooter
    >
      <Suspense
        fallback={<p className="p-8 text-center font-black">جاري التحميل...</p>}
      >
        <AccountPageInner />
      </Suspense>
    </CafeLayout>
  );
}
