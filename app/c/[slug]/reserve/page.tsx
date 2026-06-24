"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  ImageIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  TicketCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import { createReservationFlowAction } from "@/app/actions/reservations";
import { fetchCustomerReservationsAction } from "@/app/actions/customer";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  CustomerBottomDock,
  defaultCustomerDockItems,
} from "@/components/cafe/themes/customer-mobile-experience";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import { useLocalAssetUrl } from "@/lib/cafe/use-local-asset-url";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import {
  getCustomerSession,
  type BarndaksaCustomerSession,
} from "@/lib/customer/session";
import { buildGoogleMapsUrl, type CafeBranch } from "@/lib/mock/branches";
import type { ReservationEventType } from "@/lib/mock/reservations";
import type { ReservationService } from "@/lib/data/platform-upgrade";
import { appendPreviewToNextPath, getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { formatSar } from "@/lib/format";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type ReservationRecord = {
  id: string;
  customerId?: string;
  customerName: string;
  phone: string;
  type: string;
  serviceId?: string;
  serviceName?: string;
  reservationPrice?: number;
  guests: number;
  date: string;
  time: string;
  durationMinutes?: number;
  branchName?: string;
  notes?: string;
  status: string;
  reservationCode?: string;
  reservationCodeUsedAt?: string;
  cashierConfirmedAt?: string;
  rejectionReason?: string;
  cafeMessage?: string;
  createdAt: string;
};

type ReservationStatusFilter = "all" | "accepted" | "pending" | "rejected" | "past";
type ViewMode = "services" | "my-reservations";

const STATUS_FILTERS: Array<{ value: ReservationStatusFilter; label: string }> = [
  { value: "accepted", label: "حجوزات مؤكدة" },
  { value: "all", label: "حجوزات" },
  { value: "pending", label: "حجوزات تحت المراجعة" },
  { value: "rejected", label: "حجوزات مرفوضة" },
  { value: "past", label: "حجوزات سابقة" },
];

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

function reservationDurationLabel(minutes?: number) {
  if (!minutes) return "";
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} يوم`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} ساعة`;
  return `${minutes} دقيقة`;
}

function normalizeBranch(branch: CafeBranch): CafeBranch {
  return {
    ...branch,
    name: branch.name?.trim() || "الفرع الرئيسي",
    address: branch.address ?? "",
    city: branch.city ?? "",
    workingHours: branch.workingHours ?? "",
    active: branch.active !== false,
  };
}

function createPrimaryFallbackBranch(cafeName: string, slug: string): CafeBranch {
  const name = "الفرع الرئيسي";
  const query = encodeURIComponent(`${cafeName || slug} ${name}`);
  return {
    id: "__barndaksa_primary_branch__",
    name,
    address: cafeName || slug,
    city: "",
    workingHours: "",
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${query}`,
    active: true,
  };
}

function branchGoogleMapsUrl(branch: CafeBranch, cafeName: string, slug: string) {
  const query = encodeURIComponent(
    [branch.name, branch.address, branch.city, cafeName || slug]
      .filter(Boolean)
      .join(" "),
  );
  return buildGoogleMapsUrl(
    branch.lat,
    branch.lng,
    branch.mapUrl || `https://www.google.com/maps/search/?api=1&query=${query}`,
  );
}

function isAcceptedStatus(status: string) {
  return status === "مقبول" || status.includes("مقبول") || status.includes("مؤكد");
}

function isRejectedStatus(status: string) {
  return status === "مرفوض" || status.includes("مرفوض");
}

function isPendingStatus(status: string) {
  return status.includes("انتظار") || status.includes("مراجعة") || status.includes("تعديل");
}

function isPastReservation(reservation: ReservationRecord) {
  const value = `${reservation.date || ""}T${reservation.time || "00:00"}`;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() < Date.now();
}

function statusLabel(status: string) {
  if (isAcceptedStatus(status)) return "مقبول";
  if (isRejectedStatus(status)) return "مرفوض";
  if (isPendingStatus(status)) return "تحت المراجعة";
  return status || "تحت المراجعة";
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
        <div className="flex h-full w-full items-center justify-center bg-[var(--ci-page-bg,#FCF8F3)]">
          <ImageIcon className={`h-10 w-10 ${theme.accent}`} />
        </div>
      }
    />
  );
}

function ModalShell({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="إغلاق"
        className="fixed inset-0 z-[9998] cursor-default bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-[9999] max-h-[82vh] overflow-y-auto rounded-t-[28px] border border-[var(--ci-border,#E7D7C6)] bg-white p-4 text-[var(--ci-page-fg,#311912)] shadow-[0_-24px_90px_rgba(23,20,18,0.32)] sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]"
      >
        {children}
      </section>
    </>,
    document.body,
  );
}

function ReserveForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const { settings, experience, path, previewThemeId, theme } =
    useCafePageContext(slug);
  const isEvents = getBusinessCopy(settings.businessCategory).kind === "events";
  const reservationNoun = isEvents ? "مقعد/ورشة/مساحة حضور" : "حجز";
  const reservationPlural = isEvents ? "مقاعد وورش ومساحات" : "حجوزات";
  const myReservationsLabel = isEvents ? "حضوري المؤكد" : "حجوزاتك المؤكدة";
  const guestLabel = isEvents ? "عدد الحضور" : "عدد الأشخاص";
  const statusFilters = STATUS_FILTERS.map((item) => ({
    ...item,
    label: isEvents ? item.label.replaceAll("حجوزات", "تذاكر حضور") : item.label,
  }));
  const logoUrl = useResolvedCafeLogoUrl(settings);
  const { branches, reservationServices, loading, error } =
    usePublicCafeMenu(slug);

  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);
  const [customerReservations, setCustomerReservations] = useState<ReservationRecord[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("services");
  const [branchId, setBranchId] = useState("");
  const [reservationBranches, setReservationBranches] = useState<CafeBranch[] | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [guests, setGuests] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [reservationSearch, setReservationSearch] = useState("");
  const [serviceBranchFilter, setServiceBranchFilter] = useState("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("all");
  const [serviceStatusFilter, setServiceStatusFilter] = useState<ReservationStatusFilter>("all");
  const [myFromDate, setMyFromDate] = useState("");
  const [myToDate, setMyToDate] = useState("");
  const [myBranchFilter, setMyBranchFilter] = useState("all");
  const [myTypeFilter, setMyTypeFilter] = useState("all");
  const [myStatusFilter, setMyStatusFilter] = useState<ReservationStatusFilter>("accepted");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);
  const [myFilterOpen, setMyFilterOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [reservationMessage, setReservationMessage] = useState<string | null>(null);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  useEffect(() => {
    if (searchParams.get("view") === "my-reservations") {
      setViewMode("my-reservations");
      if (searchParams.get("status") === "accepted") {
        setMyStatusFilter("accepted");
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!customer) {
      setCustomerReservations([]);
      return;
    }
    let cancelled = false;
    void fetchCustomerReservationsAction(slug)
      .then((items) => {
        if (!cancelled) setCustomerReservations(items as ReservationRecord[]);
      })
      .catch(() => {
        if (!cancelled) setCustomerReservations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [customer, slug]);

  useEffect(() => {
    let cancelled = false;
    const currentActiveBranches = branches.filter((b: CafeBranch) => b.active !== false);

    if (currentActiveBranches.length) {
      setReservationBranches(null);
      return;
    }

    async function loadReservationBranches() {
      try {
        const response = await fetch(
          `/api/public/cafe/${encodeURIComponent(slug)}/reservation-branches`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const json = (await response.json()) as { branches?: CafeBranch[] };
        const nextBranches = Array.isArray(json.branches)
          ? json.branches.map(normalizeBranch).filter((branch) => branch.active !== false)
          : [];
        if (!cancelled) setReservationBranches(nextBranches);
      } catch {
        if (!cancelled) setReservationBranches([]);
      }
    }

    void loadReservationBranches();
    return () => {
      cancelled = true;
    };
  }, [branches, slug]);

  const primaryFallbackBranch = useMemo(
    () => createPrimaryFallbackBranch(settings.cafeName || slug, slug),
    [settings.cafeName, slug],
  );

  const activeStoredBranches = useMemo(() => {
    const source = reservationBranches ?? branches;
    return source.map(normalizeBranch).filter((branch) => branch.active !== false);
  }, [branches, reservationBranches]);

  const activeBranches = useMemo(
    () => (activeStoredBranches.length ? activeStoredBranches : [primaryFallbackBranch]),
    [activeStoredBranches, primaryFallbackBranch],
  );

  useEffect(() => {
    if (activeBranches[0] && !branchId) setBranchId(activeBranches[0].id);
  }, [activeBranches, branchId]);

  useEffect(() => {
    if (!selectedServiceId && reservationServices[0])
      setSelectedServiceId(reservationServices[0].id);
  }, [reservationServices, selectedServiceId]);

  const selectedBranch =
    activeBranches.find((b) => b.id === branchId) ?? activeBranches[0] ?? primaryFallbackBranch;
  const selectedService = reservationServices.find(
    (service) => service.id === selectedServiceId,
  );
  const maxGuests = selectedService?.maxGuests ?? 500;
  const usingFallbackBranch = activeStoredBranches.length === 0;
  const selectedBranchMapUrl = branchGoogleMapsUrl(
    selectedBranch,
    settings.cafeName || slug,
    slug,
  );

  const confirmedReservations = useMemo(
    () => customerReservations.filter((reservation) => isAcceptedStatus(reservation.status)),
    [customerReservations],
  );

  const serviceTypes = useMemo(
    () => reservationServices.map((service) => service.name),
    [reservationServices],
  );

  const filteredServices = useMemo(
    () =>
      reservationServices.filter((service) => {
        const query = serviceSearch.trim();
        const matchesQuery =
          !query ||
          service.name.includes(query) ||
          service.description.includes(query) ||
          service.amenities.some((item) => item.includes(query)) ||
          service.includedProducts.some((item) => item.includes(query));
        const matchesType = serviceTypeFilter === "all" || service.name === serviceTypeFilter;
        return matchesQuery && matchesType;
      }),
    [reservationServices, serviceSearch, serviceTypeFilter],
  );

  const filteredCustomerReservations = useMemo(
    () =>
      customerReservations.filter((reservation) => {
        const query = reservationSearch.trim();
        const branch = reservation.branchName || "الفرع الرئيسي";
        const type = reservation.serviceName || reservation.type;
        const matchesQuery =
          !query ||
          type.includes(query) ||
          branch.includes(query) ||
          reservation.status.includes(query) ||
          (reservation.notes ?? "").includes(query);
        const matchesBranch = myBranchFilter === "all" || branch === myBranchFilter;
        const matchesType = myTypeFilter === "all" || type === myTypeFilter;
        const matchesFrom = !myFromDate || reservation.date >= myFromDate;
        const matchesTo = !myToDate || reservation.date <= myToDate;
        const matchesStatus =
          myStatusFilter === "all" ||
          (myStatusFilter === "accepted" && isAcceptedStatus(reservation.status)) ||
          (myStatusFilter === "pending" && isPendingStatus(reservation.status)) ||
          (myStatusFilter === "rejected" && isRejectedStatus(reservation.status)) ||
          (myStatusFilter === "past" && isPastReservation(reservation));
        return matchesQuery && matchesBranch && matchesType && matchesFrom && matchesTo && matchesStatus;
      }),
    [customerReservations, myBranchFilter, myFromDate, myStatusFilter, myToDate, myTypeFilter, reservationSearch],
  );

  const reservationBranchesForFilters = useMemo(
    () => Array.from(new Set(customerReservations.map((item) => item.branchName || "الفرع الرئيسي"))),
    [customerReservations],
  );

  const reservationTypesForFilters = useMemo(
    () => Array.from(new Set(customerReservations.map((item) => item.serviceName || item.type))),
    [customerReservations],
  );

  async function submitReservation() {
    const reserveLoginHref = getCustomerLoginHref(slug, `/c/${slug}/reserve`, previewThemeId);
    const activeCustomer = customer ?? (await getCustomerSession(slug));
    if (!activeCustomer) {
      setReservationMessage(isEvents ? "سجّل دخولك بحساب العميل لإتمام طلب الحضور." : "سجّل دخولك بحساب العميل لإتمام الحجز.");
      router.push(reserveLoginHref);
      return;
    }
    if (!customer) setCustomer(activeCustomer);
    if (!selectedService || !selectedBranch || !guests || !date || !time) {
      setReservationMessage(isEvents ? "اختر نوع المقعد أو الورشة أو المساحة والتاريخ والوقت وعدد الحضور." : "اختر نوع الحجز والتاريخ والوقت وعدد الأشخاص.");
      alert(isEvents ? "اختر نوع المقعد أو الورشة أو المساحة والتاريخ والوقت وعدد الحضور" : "اختر نوع الحجز والتاريخ والوقت وعدد الأشخاص");
      return;
    }
    const guestsCount = Number(guests) || 1;
    if (guestsCount > maxGuests) {
      setReservationMessage(`العدد الاستيعابي الأقصى لهذا ${reservationNoun} ${maxGuests}.`);
      alert(`العدد الاستيعابي الأقصى لهذا ${reservationNoun} ${maxGuests}`);
      return;
    }

    setSubmitting(true);
    setReservationMessage(null);
    try {
      const result = await createReservationFlowAction({
        slug,
        customer: activeCustomer,
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
      if (!result.ok) {
        setReservationMessage(result.message);
        if (result.code === "login_required") {
          setCustomer(null);
          router.push(reserveLoginHref);
        }
        return;
      }
      alert(isEvents ? "تم إرسال طلب الحضور بنجاح" : "تم إرسال طلب الحجز بنجاح");
      router.push(appendPreviewToNextPath(path("account"), previewThemeId));
    } catch {
      setReservationMessage(isEvents ? "تعذر إرسال طلب الحضور. حاول مرة أخرى." : "تعذر إرسال الحجز. حاول مرة أخرى.");
      alert(isEvents ? "تعذر إرسال طلب الحضور. حاول مرة أخرى." : "تعذر إرسال الحجز. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  function openBooking(service: ReservationService) {
    setSelectedServiceId(service.id);
    setGuests((current) =>
      current && service.maxGuests && Number(current) > service.maxGuests
        ? String(service.maxGuests)
        : current,
    );
    setBookingOpen(true);
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

  const Header = (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <CafeLogo
          name={settings.cafeName || slug}
          logoUrl={logoUrl}
          size="sm"
          className="rounded-[18px]"
        />
        <div className="min-w-0">
          <p className={`truncate text-xs font-black ${theme.muted}`}>{settings.cafeName || slug}</p>
          <h1 className={`truncate text-2xl font-black leading-tight ${experience.headingTracking}`}>
            {viewMode === "services" ? reservationPlural : myReservationsLabel}
          </h1>
        </div>
      </div>
      {viewMode === "services" ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setServiceFilterOpen(true)}
            aria-label={isEvents ? "فلترة المقاعد والورش" : "فلترة الحجوزات"}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 shadow-sm transition active:scale-95 ${theme.card}`}
          >
            <SlidersHorizontal className={`h-5 w-5 ${theme.accent}`} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("my-reservations")}
            className={`relative flex h-12 items-center justify-center rounded-2xl border border-black/5 px-3 text-xs font-black shadow-sm transition active:scale-95 ${theme.card}`}
          >
            {myReservationsLabel}
            {confirmedReservations.length ? (
              <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />
            ) : null}
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("services")}
            aria-label={isEvents ? "رجوع إلى صفحة الحضور" : "رجوع إلى صفحة الحجز"}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 shadow-sm transition active:scale-95 ${theme.card}`}
          >
            <ArrowRight className={`h-5 w-5 ${theme.accent}`} />
          </button>
          <button
            type="button"
            onClick={() => setMyFilterOpen(true)}
            aria-label={isEvents ? "فلترة حضورك" : "فلترة حجوزاتك"}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 shadow-sm transition active:scale-95 ${theme.card}`}
          >
            <SlidersHorizontal className={`h-5 w-5 ${theme.accent}`} />
          </button>
        </div>
      )}
    </header>
  );

  return (
    <>
      <div className="space-y-5">
        {Header}

        {viewMode === "services" ? (
          <>
            <label className="relative block">
              <Search className={`absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.muted}`} />
              <input
                value={serviceSearch}
                onChange={(event) => setServiceSearch(event.target.value)}
                placeholder={isEvents ? "ابحث عن مقعد أو ورشة أو مساحة..." : "ابحث عن نوع حجز..."}
                className="h-12 w-full rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-white px-11 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30"
              />
            </label>

            {!reservationServices.length ? (
              <div className={`rounded-[28px] border border-dashed p-8 text-center ${theme.card}`}>
                <CalendarDays className={`mx-auto h-8 w-8 ${theme.accent}`} />
                <p className="mt-3 font-black">{isEvents ? "لا توجد مقاعد أو ورش أو مساحات متاحة حاليًا" : "لا توجد أنواع حجوزات متاحة حاليًا"}</p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredServices.map((service) => {
                const branch = selectedBranch;
                const mapUrl = branchGoogleMapsUrl(branch, settings.cafeName || slug, slug);
                return (
                  <article
                    key={service.id}
                    className="overflow-hidden rounded-[22px] bg-white shadow-[0_14px_40px_rgba(23,20,18,0.08)] ring-1 ring-[var(--ci-border,#E7D7C6)]/80"
                  >
                    <div className="relative aspect-[1.45/1] overflow-hidden bg-[var(--ci-page-bg,#FCF8F3)]">
                      <ReservationServiceMedia service={service} theme={theme} />
                      {service.videoAssetId ? (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-xs font-black text-white">
                          <Video className="h-3.5 w-3.5" /> فيديو
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="line-clamp-2 text-lg font-black leading-snug">{service.name}</h2>
                        <span className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-black ${theme.badge}`}>
                          {service.isFree ? "مجاني" : formatSar(service.price ?? 0)}
                        </span>
                      </div>
                      {service.description ? (
                        <p className={`line-clamp-3 text-xs font-bold leading-6 ${theme.muted}`}>
                          {service.description}
                        </p>
                      ) : null}
                      <div className={`grid gap-2 text-xs font-black ${theme.muted}`}>
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {branch.name}
                        </span>
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-2 ${theme.accent}`}
                        >
                          لوكيشن الفرع <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {service.maxGuests ? (
                          <span className="inline-flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            حتى {service.maxGuests} {isEvents ? "حضور" : "أشخاص"}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {durationLabel(service)}
                        </span>
                      </div>
                      {service.amenities.length ? (
                        <p className={`text-xs font-bold leading-6 ${theme.muted}`}>
                          المزايا: {service.amenities.slice(0, 3).join("، ")}
                        </p>
                      ) : null}
                      {service.includedProducts.length ? (
                        <p className={`text-xs font-bold leading-6 ${theme.muted}`}>
                          {isEvents ? "يشمل" : "منتجات مجانية"}: {service.includedProducts.slice(0, 3).join("، ")}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openBooking(service)}
                        className={`h-12 w-full rounded-2xl text-sm font-black ${theme.button}`}
                      >
                        {isEvents ? "اطلب حضورك" : "احجز الآن"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {reservationServices.length > 0 && !filteredServices.length ? (
              <div className={`rounded-[28px] border border-dashed p-8 text-center ${theme.card}`}>
                <p className="font-black">{isEvents ? "لا توجد مقاعد أو ورش مطابقة للبحث أو الفلاتر الحالية" : "لا توجد حجوزات مطابقة للبحث أو الفلاتر الحالية"}</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <label className="relative block">
              <Search className={`absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 ${theme.muted}`} />
              <input
                value={reservationSearch}
                onChange={(event) => setReservationSearch(event.target.value)}
                placeholder={isEvents ? "ابحث في حضورك..." : "ابحث في حجوزاتك..."}
                className="h-12 w-full rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-white px-11 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30"
              />
            </label>

            <div className="-mx-4 overflow-x-auto px-4 pb-1">
              <div className="flex w-max gap-2">
                {statusFilters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setMyStatusFilter(item.value)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition active:scale-95 ${
                      myStatusFilter === item.value ? theme.button : theme.buttonOutline
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {filteredCustomerReservations.map((reservation) => (
                <CustomerReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  branchMapUrl={branchGoogleMapsUrl(
                    activeBranches.find((branch) => branch.name === reservation.branchName) ?? selectedBranch,
                    settings.cafeName || slug,
                    slug,
                  )}
                  theme={theme}
                  isEvents={isEvents}
                />
              ))}
            </div>

            {!filteredCustomerReservations.length ? (
              <div className={`rounded-[28px] border border-dashed p-8 text-center ${theme.card}`}>
                <TicketCheck className={`mx-auto h-8 w-8 ${theme.accent}`} />
                <p className="mt-3 font-black">{isEvents ? "لا يوجد حضور مطابق حاليًا" : "لا توجد حجوزات مطابقة حاليًا"}</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ModalShell
        title={isEvents ? "فلترة المقاعد والورش" : "فلترة الحجوزات"}
        open={serviceFilterOpen}
        onClose={() => setServiceFilterOpen(false)}
      >
        <FilterHeader title={isEvents ? "فلترة المقاعد والورش" : "فلترة الحجوزات"} onClose={() => setServiceFilterOpen(false)} theme={theme} label={isEvents ? "الحضور" : "الحجوزات"} />
        <div className="space-y-4">
          <SelectField
            label="الفرع"
            value={serviceBranchFilter}
            onChange={(value) => {
              setServiceBranchFilter(value);
              if (value !== "all") setBranchId(value);
            }}
            options={[
              { value: "all", label: "كل الفروع" },
              ...activeBranches.map((branch) => ({ value: branch.id, label: branch.name })),
            ]}
          />
          <SelectField
            label={isEvents ? "نوع المقعد/الورشة/المساحة" : "نوع الحجز"}
            value={serviceTypeFilter}
            onChange={setServiceTypeFilter}
            options={[
              { value: "all", label: isEvents ? "كل أنواع الحضور" : "كل أنواع الحجز" },
              ...serviceTypes.map((name) => ({ value: name, label: name })),
            ]}
          />
          <SelectField
            label={isEvents ? "حالة الحضور" : "حالة الحجز"}
            value={serviceStatusFilter}
            onChange={(value) => setServiceStatusFilter(value as ReservationStatusFilter)}
            options={[
              { value: "all", label: "كل الحالات" },
              { value: "accepted", label: "مقبول" },
              { value: "rejected", label: "مرفوض" },
              { value: "pending", label: "تحت المراجعة" },
              { value: "past", label: "سابق" },
            ]}
          />
          <button
            type="button"
            onClick={() => setServiceFilterOpen(false)}
            className={`h-12 w-full rounded-2xl text-sm font-black ${theme.button}`}
          >
            تطبيق
          </button>
        </div>
      </ModalShell>

      <ModalShell
        title={isEvents ? "فلترة حضورك" : "فلترة حجوزاتك"}
        open={myFilterOpen}
        onClose={() => setMyFilterOpen(false)}
      >
        <FilterHeader title={isEvents ? "فلترة حضورك" : "فلترة حجوزاتك"} onClose={() => setMyFilterOpen(false)} theme={theme} label={isEvents ? "الحضور" : "الحجوزات"} />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label="من تاريخ" type="date" value={myFromDate} onChange={setMyFromDate} />
          <InputField label="إلى تاريخ" type="date" value={myToDate} onChange={setMyToDate} />
          <SelectField
            label="الفرع"
            value={myBranchFilter}
            onChange={setMyBranchFilter}
            options={[
              { value: "all", label: "كل الفروع" },
              ...reservationBranchesForFilters.map((name) => ({ value: name, label: name })),
            ]}
          />
          <SelectField
            label={isEvents ? "نوع الحضور" : "نوع الحجز"}
            value={myTypeFilter}
            onChange={setMyTypeFilter}
            options={[
              { value: "all", label: "كل الأنواع" },
              ...reservationTypesForFilters.map((name) => ({ value: name, label: name })),
            ]}
          />
          <SelectField
            label="الحالة"
            value={myStatusFilter}
            onChange={(value) => setMyStatusFilter(value as ReservationStatusFilter)}
            options={[
              { value: "all", label: "كل الحالات" },
              { value: "accepted", label: "مقبول" },
              { value: "rejected", label: "مرفوض" },
              { value: "pending", label: "تحت المراجعة" },
              { value: "past", label: "سابق" },
            ]}
          />
          <button
            type="button"
            onClick={() => setMyFilterOpen(false)}
            className={`h-12 rounded-2xl text-sm font-black sm:self-end ${theme.button}`}
          >
            تطبيق
          </button>
        </div>
      </ModalShell>

      <ModalShell
        title={isEvents ? "اطلب حضورك" : "احجز الآن"}
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
      >
        <FilterHeader title={isEvents ? "اطلب حضورك" : "احجز الآن"} onClose={() => setBookingOpen(false)} theme={theme} label={isEvents ? "الحضور" : "الحجوزات"} />
        {!customer ? (
          <div className={`rounded-2xl p-5 ${theme.card}`}>
            <p className="font-black">{isEvents ? "سجّل دخولك لإتمام طلب الحضور." : "سجّل دخولك لإتمام الحجز."}</p>
            <Link
              href={getCustomerLoginHref(slug, `/c/${slug}/reserve`, previewThemeId)}
              className={`mt-4 inline-flex rounded-2xl px-6 py-3 font-black ${theme.button}`}
            >
              تسجيل الدخول
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            <SelectField
              label="اختيار الفرع"
              value={branchId}
              onChange={setBranchId}
              options={activeBranches.map((branch) => ({ value: branch.id, label: branch.name }))}
            />
            {usingFallbackBranch ? (
              <p className={`rounded-2xl border border-dashed p-3 text-xs font-bold ${theme.muted}`}>
                سيتم اعتماد الفرع الرئيسي تلقائيًا لهذا {reservationNoun}.
              </p>
            ) : null}
            <InputField
              label={`${guestLabel}${selectedService?.maxGuests ? ` - أقصى حد ${selectedService.maxGuests}` : ""}`}
              type="number"
              value={guests}
              onChange={setGuests}
              min={1}
              max={maxGuests}
            />
            <InputField label="التاريخ" type="date" value={date} onChange={setDate} />
            <InputField label="الوقت" type="time" value={time} onChange={setTime} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">الملاحظات</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="ملاحظات إضافية"
                className="min-h-24 w-full rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-white px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30"
              />
            </label>
            <button
              type="button"
              onClick={() => void submitReservation()}
              disabled={submitting || !reservationServices.length}
              className={`h-12 rounded-2xl text-sm font-black disabled:opacity-60 ${theme.button}`}
            >
              {submitting ? "جاري الإرسال..." : isEvents ? "إرسال طلب الحضور" : "إرسال الطلب"}
            </button>
            {reservationMessage ? (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-black leading-6 text-red-700">
                {reservationMessage}
              </p>
            ) : null}
          </div>
        )}
      </ModalShell>
    </>
  );
}

function FilterHeader({
  title,
  onClose,
  theme,
  label = "الحجوزات",
}: {
  title: string;
  onClose: () => void;
  theme: { buttonOutline: string; muted: string };
  label?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <p className={`text-xs font-black ${theme.muted}`}>{label}</p>
        <h2 className="text-lg font-black">{title}</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${theme.buttonOutline}`}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-white px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-[var(--ci-input-border,#E5D8CD)] bg-white px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-[var(--ci-accent-bg,#D9A33F)]/30"
      />
    </label>
  );
}

function CustomerReservationCard({
  reservation,
  branchMapUrl,
  theme,
  isEvents = false,
}: {
  reservation: ReservationRecord;
  branchMapUrl: string;
  isEvents?: boolean;
  theme: {
    accent: string;
    badge: string;
    buttonOutline: string;
    muted: string;
    card: string;
  };
}) {
  const accepted = isAcceptedStatus(reservation.status);
  const used = Boolean(reservation.reservationCodeUsedAt || reservation.cashierConfirmedAt);
  const duration = reservationDurationLabel(reservation.durationMinutes);
  const title = reservation.serviceName || reservation.type || (isEvents ? "حضور" : "حجز");

  return (
    <article className={`rounded-[22px] p-4 shadow-[0_14px_40px_rgba(23,20,18,0.08)] ring-1 ring-[var(--ci-border,#E7D7C6)]/80 ${theme.card}`}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black">{title}</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>
              {used ? "تم الاستخدام" : statusLabel(reservation.status)}
            </span>
          </div>
          <div className={`mt-3 grid gap-2 text-xs font-bold leading-6 ${theme.muted}`}>
            <span>الفرع: {reservation.branchName || "الفرع الرئيسي"}</span>
            <a href={branchMapUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 ${theme.accent}`}>
              لوكيشن الفرع <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <span>التاريخ: {reservation.date || "-"} - {reservation.time || "-"}</span>
            <span>{isEvents ? "عدد الحضور" : "عدد الأشخاص"}: {reservation.guests || "-"}</span>
            {duration ? <span>{isEvents ? "مدة الحضور" : "مدة الحجز"}: {duration}</span> : null}
            {reservation.notes ? <span>الملاحظات: {reservation.notes}</span> : null}
            {reservation.cafeMessage ? <span>رسالة العلامة: {reservation.cafeMessage}</span> : null}
            {reservation.rejectionReason ? <span>سبب الرفض: {reservation.rejectionReason}</span> : null}
          </div>
        </div>
        {accepted && reservation.reservationCode ? (
          <div className="shrink-0 rounded-[22px] border border-[var(--ci-border,#E7D7C6)] bg-white p-4 text-center sm:w-[192px]">
            <div className="mx-auto w-fit">
              <SecureQrCode
                kind="reservation"
                value={reservation.reservationCode}
                title={`${isEvents ? "QR حضور" : "QR حجز"} ${reservation.reservationCode}`}
                size={160}
              />
            </div>
            <p className={`mt-3 break-all font-mono text-xs font-black tracking-[0.12em] ${theme.muted}`}>
              {used ? "تم الاستخدام" : reservation.reservationCode}
            </p>
          </div>
        ) : (
          <div className={`flex min-h-24 shrink-0 items-center justify-center rounded-2xl border border-dashed p-3 text-center text-xs font-black sm:w-[160px] ${theme.muted}`}>
            لا يوجد QR صالح
          </div>
        )}
      </div>
    </article>
  );
}

function ReserveBottomDock() {
  const params = useParams<{ slug: string }>();
  const { settings, previewThemeId } = useCafePageContext(params.slug);

  return (
    <CustomerBottomDock
      {...defaultCustomerDockItems({
        slug: params.slug,
        previewThemeId,
        active: "orders",
        hasProducts: true,
        hasOrders: true,
        hasRewards: true,
        businessCategory: settings.businessCategory,
      })}
    />
  );
}

export default function ReservePage() {
  const params = useParams<{ slug: string }>();
  return (
    <CafeLayout slug={params.slug} hideHeader hideFooter hideQuickDock>
      <Suspense fallback={<p className="font-black">جاري التحميل...</p>}>
        <ReserveForm />
        <ReserveBottomDock />
      </Suspense>
    </CafeLayout>
  );
}
