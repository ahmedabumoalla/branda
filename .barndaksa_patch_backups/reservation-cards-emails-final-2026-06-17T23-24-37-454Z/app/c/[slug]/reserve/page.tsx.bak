"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, ImageIcon, Users, Video } from "lucide-react";
import { createReservationFlowAction } from "@/app/actions/reservations";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedInput } from "@/components/cafe/themes/themed-auth-panel";
import {
  ThemedReservationPanel,
  ThemedTextarea,
} from "@/components/cafe/themes/themed-reservation-panel";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import { useLocalAssetUrl } from "@/lib/cafe/use-local-asset-url";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import {
  getCustomerSession,
  type BarndaksaCustomerSession,
} from "@/lib/customer/session";
import type { CafeBranch } from "@/lib/mock/branches";
import type { ReservationEventType } from "@/lib/mock/reservations";
import type { ReservationService } from "@/lib/data/platform-upgrade";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";
import { formatSar } from "@/lib/format";

function durationLabel(service: ReservationService) {
  if (!service.durationValue || !service.durationUnit) return "مدة مرنة";
  const unit =
    service.durationUnit === "day"
      ? "يوم"
      : service.durationUnit === "hour"
        ? "ساعة"
        : "دقيقة";
  return `${service.durationValue} ${unit}`;
}

function ReservationServiceMedia({
  service,
  theme,
}: {
  service: ReservationService;
  theme: { accent: string };
}) {
  const videoUrl = useLocalAssetUrl(
    service.videoAssetId,
    undefined,
    undefined,
    "marketing-assets",
  );

  if (videoUrl) {
    return (
      <video
        src={videoUrl}
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        controls
      />
    );
  }

  return (
    <LocalAssetImage
      assetId={service.imageAssetId}
      alt={service.name}
      publicBucket="marketing-assets"
      className="h-full w-full object-cover"
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className={`h-12 w-12 ${theme.accent}`} />
        </div>
      }
    />
  );
}

function ReserveForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { settings, experience, path, previewThemeId, theme } =
    useCafePageContext(slug);
  const { branches, reservationServices, loading, error } =
    usePublicCafeMenu(slug);

  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);
  const [branchId, setBranchId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [guests, setGuests] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  useEffect(() => {
    const active = branches.filter((b: CafeBranch) => b.active);
    if (active[0] && !branchId) setBranchId(active[0].id);
  }, [branches, branchId]);

  useEffect(() => {
    if (!selectedServiceId && reservationServices[0])
      setSelectedServiceId(reservationServices[0].id);
  }, [reservationServices, selectedServiceId]);

  const activeBranches = branches.filter((b) => b.active);
  const selectedBranch = activeBranches.find((b) => b.id === branchId);
  const selectedService = reservationServices.find(
    (service) => service.id === selectedServiceId,
  );
  const maxGuests = selectedService?.maxGuests ?? 500;

  const serviceCards = useMemo(
    () =>
      reservationServices.map((service) => {
        const selected = service.id === selectedServiceId;
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => {
              setSelectedServiceId(service.id);
              setGuests((current) =>
                current &&
                service.maxGuests &&
                Number(current) > service.maxGuests
                  ? String(service.maxGuests)
                  : current,
              );
            }}
            aria-pressed={selected}
            data-selected={selected ? "true" : "false"}
            className={`barndaksa-premium-card barndaksa-reservation-motion overflow-hidden rounded-[28px] border text-right transition ${selected ? "scale-[1.01] border-[#D9A33F] shadow-xl" : "border-black/10 hover:-translate-y-0.5"} ${theme.card}`}
          >
            <div className="relative h-44 overflow-hidden bg-black/10">
              <ReservationServiceMedia service={service} theme={theme} />
              {service.videoAssetId ? (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-xs font-black text-white">
                  <Video className="h-3.5 w-3.5" /> فيديو
                </span>
              ) : null}
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl font-black">{service.name}</h3>
                <span
                  className={`rounded-xl px-3 py-1 text-sm font-black ${theme.button}`}
                >
                  {service.isFree ? "بدون رسوم" : formatSar(service.price ?? 0)}
                </span>
              </div>
              <p
                className={`mt-2 line-clamp-2 text-sm font-bold ${theme.muted}`}
              >
                {service.description || "حجز مخصص من العلامة التجارية"}
              </p>
              <div className="mt-4 grid gap-2 text-sm font-black sm:grid-cols-2">
                <span
                  className={`inline-flex items-center gap-2 ${theme.muted}`}
                >
                  <Users className="h-4 w-4" /> حتى{" "}
                  {service.maxGuests ?? "غير محدد"}
                </span>
                <span
                  className={`inline-flex items-center gap-2 ${theme.muted}`}
                >
                  <Clock className="h-4 w-4" /> {durationLabel(service)}
                </span>
              </div>
              {service.amenities.length ? (
                <p className={`mt-3 text-xs font-bold ${theme.muted}`}>
                  الخدمات: {service.amenities.slice(0, 4).join("، ")}
                </p>
              ) : null}
              {service.includedProducts.length ? (
                <p className={`mt-1 text-xs font-bold ${theme.muted}`}>
                  منتجات مجانية:{" "}
                  {service.includedProducts.slice(0, 3).join("، ")}
                </p>
              ) : null}
            </div>
          </button>
        );
      }),
    [reservationServices, selectedServiceId, theme],
  );

  async function submitReservation() {
    if (!customer) {
      router.push(
        `${path("login")}?next=${encodeURIComponent(appendPreviewToNextPath(`/c/${slug}/reserve`, previewThemeId))}`,
      );
      return;
    }
    if (!selectedService || !branchId || !guests || !date || !time) {
      alert("اختر نوع الحجز والفرع والتاريخ والوقت وعدد الأشخاص");
      return;
    }
    if (!selectedBranch) return;
    const guestsCount = Number(guests) || 1;
    if (guestsCount > maxGuests) {
      alert(`العدد الاستيعابي الأقصى لهذا الحجز ${maxGuests}`);
      return;
    }

    setSubmitting(true);
    try {
      await createReservationFlowAction({
        slug,
        customer,
        branch: selectedBranch,
        reservationType: selectedService.name as ReservationEventType,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        reservationPrice: selectedService.price ?? 0,
        guests: guestsCount,
        date,
        time,
        durationMinutes:
          selectedService.durationUnit === "day"
            ? (selectedService.durationValue ?? 1) * 1440
            : selectedService.durationUnit === "hour"
              ? (selectedService.durationValue ?? 1) * 60
              : selectedService.durationUnit === "minute"
                ? (selectedService.durationValue ?? undefined)
                : undefined,
        spaceType: selectedService.name,
        eventTitle: selectedService.name,
        notes,
      });
      alert("تم إرسال طلب الحجز بنجاح");
      router.push(appendPreviewToNextPath(path("account"), previewThemeId));
    } catch {
      alert("تعذر إرسال الحجز. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
        <p className="font-black">جاري التحميل...</p>
      </div>
    );
  if (error)
    return (
      <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
        <p className="font-black">{error}</p>
      </div>
    );

  const loginPrompt = !customer ? (
    <div className={`mt-4 rounded-2xl p-5 ${theme.card}`}>
      <p className="font-black">سجّل دخولك لإتمام الحجز.</p>
      <Link
        href={`${path("login")}?next=${encodeURIComponent(appendPreviewToNextPath(`/c/${slug}/reserve`, previewThemeId))}`}
        className={`mt-4 inline-flex rounded-2xl px-6 py-3 font-black ${theme.button}`}
      >
        تسجيل الدخول
      </Link>
    </div>
  ) : null;

  const form = customer ? (
    <div className="mt-6 space-y-6">
      <div className="barndaksa-stagger-grid grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {serviceCards}
      </div>
      {!reservationServices.length ? (
        <div className={`rounded-2xl p-5 text-center font-black ${theme.card}`}>
          لا توجد خيارات حجز متاحة حاليًا
        </div>
      ) : null}
      <div
        className={`barndaksa-premium-card grid gap-4 rounded-[28px] p-5 md:grid-cols-2 ${theme.card}`}
      >
        <select
          className={`w-full font-bold ${experience.formInput}`}
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          <option value="">اختر الفرع</option>
          {activeBranches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <ThemedInput
          experience={experience}
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
          placeholder={`عدد الأشخاص${selectedService?.maxGuests ? ` — أقصى حد ${selectedService.maxGuests}` : ""}`}
          type="number"
          min={1}
          max={maxGuests}
        />
        <ThemedInput
          experience={experience}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <ThemedInput
          experience={experience}
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <ThemedTextarea
          experience={experience}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات إضافية"
          className="md:col-span-2 min-h-24"
        />
        <button
          type="button"
          onClick={() => void submitReservation()}
          disabled={submitting || !reservationServices.length}
          className={`md:col-span-2 w-full rounded-2xl h-14 font-black disabled:opacity-60 ${theme.button}`}
        >
          {submitting ? "جاري الإرسال..." : "إرسال طلب الحجز"}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <ThemedReservationPanel
      settings={settings}
      experience={experience}
      branchCount={activeBranches.length}
      serviceCount={reservationServices.length}
      loginPromptSlot={loginPrompt}
      formSlot={form}
    />
  );
}

export default function ReservePage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug}>
      <Suspense fallback={<p className="font-black">جاري التحميل...</p>}>
        <ReserveForm />
      </Suspense>
    </CafeLayout>
  );
}
