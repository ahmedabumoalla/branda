"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import {
  ThemedInput,
} from "@/components/cafe/themes/themed-auth-panel";
import {
  ThemedReservationPanel,
  ThemedSelect,
  ThemedTextarea,
} from "@/components/cafe/themes/themed-reservation-panel";
import { getCustomerSession, type BrandaCustomerSession } from "@/lib/customer/session";
import { BRANCHES_KEY, mockBranches, type CafeBranch } from "@/lib/mock/branches";
import type { CafeReservation } from "@/lib/mock/reservations";
import { createReservationFlow } from "@/lib/platform/reservation-flow";
import { appendPreviewToNextPath } from "@/lib/cafe/theme-links";

function ReserveForm() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { settings, experience, path, previewThemeId, theme } = useCafePageContext(slug);

  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [branches, setBranches] = useState<CafeBranch[]>(mockBranches);
  const [branchId, setBranchId] = useState("");
  const [reservationType, setReservationType] = useState<CafeReservation["type"]>("طاولة");
  const [guests, setGuests] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setCustomer(getCustomerSession(slug));
    const savedBranches = localStorage.getItem(BRANCHES_KEY);
    if (savedBranches) setBranches(JSON.parse(savedBranches));
  }, [slug]);

  const activeBranches = branches.filter((b) => b.active);
  const selectedBranch = activeBranches.find((b) => b.id === branchId);

  function submitReservation() {
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
    createReservationFlow({
      slug,
      customer,
      branch: selectedBranch,
      reservationType,
      guests: Number(guests) || 1,
      date,
      time,
      notes,
    });
    alert("تم إرسال طلب الحجز بنجاح");
    router.push(appendPreviewToNextPath(path("account"), previewThemeId));
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
        onChange={(e) => setReservationType(e.target.value as CafeReservation["type"])}
      >
        <option value="طاولة">طاولة</option>
        <option value="جلسة خارجية">جلسة خارجية</option>
        <option value="غرفة خاصة">غرفة خاصة</option>
      </ThemedSelect>
      <ThemedInput
        experience={experience}
        value={guests}
        onChange={(e) => setGuests(e.target.value)}
        placeholder="عدد الأشخاص"
      />
      <ThemedInput experience={experience} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <ThemedInput
        experience={experience}
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="md:col-span-2"
      />
      <ThemedTextarea
        experience={experience}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="ملاحظات"
        className="md:col-span-2 min-h-24"
      />
      <button
        type="button"
        onClick={submitReservation}
        className={`md:col-span-2 w-full font-black ${experience.reserve === "kiosk" ? "h-16 text-lg rounded-lg" : "h-14 rounded-2xl"} ${theme.button}`}
      >
        إرسال طلب الحجز
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
