"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createReservationFlowAction } from "@/app/actions/reservations";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedInput } from "@/components/cafe/themes/themed-auth-panel";
import {
  ReservationEventFields,
  ThemedReservationPanel,
  ThemedSelect,
  ThemedTextarea,
} from "@/components/cafe/themes/themed-reservation-panel";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { getCustomerSession, type BrandaCustomerSession } from "@/lib/customer/session";
import type { CafeBranch } from "@/lib/mock/branches";
import {
  RESERVATION_EVENT_TYPES,
  type ReservationEventType,
} from "@/lib/mock/reservations";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";

function ReserveForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { settings, experience, path, previewThemeId, theme } = useCafePageContext(slug);
  const { branches, reservationServices, loading, error } = usePublicCafeMenu(slug);

  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [branchId, setBranchId] = useState("");
  const [reservationType, setReservationType] =
    useState<ReservationEventType>("طاولة عادية");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [guests, setGuests] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [spaceType, setSpaceType] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [needsDecoration, setNeedsDecoration] = useState(false);
  const [needsCatering, setNeedsCatering] = useState(false);
  const [budgetEstimate, setBudgetEstimate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  useEffect(() => {
    const active = branches.filter((b: CafeBranch) => b.active);
    if (active[0] && !branchId) setBranchId(active[0].id);
  }, [branches, branchId]);

  const activeBranches = branches.filter((b) => b.active);
  const selectedBranch = activeBranches.find((b) => b.id === branchId);

  const isSpecialEvent = useMemo(
    () =>
      reservationType !== "طاولة عادية" && reservationType !== "اجتماع",
    [reservationType]
  );

  async function submitReservation() {
    if (!customer) {
      router.push(
        `${path("login")}?next=${encodeURIComponent(appendPreviewToNextPath(`/c/${slug}/reserve`, previewThemeId))}`
      );
      return;
    }
    if (!branchId || !guests || !date || !time) {
      alert("اختر الفرع والتاريخ والوقت وعدد الأشخاص");
      return;
    }
    if (!selectedBranch) return;

    setSubmitting(true);
    try {
      await createReservationFlowAction({
        slug,
        customer,
        branch: selectedBranch,
        reservationType,
        guests: Number(guests) || 1,
        date,
        time,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        spaceType,
        eventTitle: isSpecialEvent ? eventTitle : undefined,
        needsDecoration: isSpecialEvent ? needsDecoration : undefined,
        needsCatering: isSpecialEvent ? needsCatering : undefined,
        budgetEstimate: budgetEstimate ? Number(budgetEstimate) : undefined,
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

  if (loading) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">جاري التحميل...</p>
        </div>
      </CafeLayout>
    );
  }

  if (error) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">{error}</p>
        </div>
      </CafeLayout>
    );
  }

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
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <ThemedSelect experience={experience} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
        <option value="">اختر الفرع</option>
        {activeBranches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </ThemedSelect>

      <ThemedSelect
        experience={experience}
        value={reservationType}
        onChange={(e) => setReservationType(e.target.value as ReservationEventType)}
      >
        {RESERVATION_EVENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </ThemedSelect>

      <ThemedInput
        experience={experience}
        value={guests}
        onChange={(e) => setGuests(e.target.value)}
        placeholder="عدد الأشخاص"
        type="number"
        min={1}
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
      <ThemedInput
        experience={experience}
        value={durationMinutes}
        onChange={(e) => setDurationMinutes(e.target.value)}
        placeholder="مدة الجلسة (دقيقة) — اختياري"
        type="number"
        min={30}
      />

      {reservationType === "اجتماع" ? (
        <ThemedInput
          experience={experience}
          value={spaceType}
          onChange={(e) => setSpaceType(e.target.value)}
          placeholder="نوع المساحة (قاعة، طاولة طويلة...)"
          className="md:col-span-2"
        />
      ) : null}

      <ReservationEventFields
        experience={experience}
        theme={theme}
        reservationType={reservationType}
        eventTitle={eventTitle}
        onEventTitleChange={setEventTitle}
        needsDecoration={needsDecoration}
        onNeedsDecorationChange={setNeedsDecoration}
        needsCatering={needsCatering}
        onNeedsCateringChange={setNeedsCatering}
        budgetEstimate={budgetEstimate}
        onBudgetEstimateChange={setBudgetEstimate}
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
        disabled={submitting}
        className={`md:col-span-2 w-full font-black disabled:opacity-60 h-14 rounded-2xl ${theme.button}`}
      >
        {submitting ? "جاري الإرسال..." : "إرسال طلب الحجز"}
      </button>
    </div>
  ) : null;

  return (
    <ThemedReservationPanel
      settings={settings}
      experience={experience}
      branchCount={activeBranches.length}
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
