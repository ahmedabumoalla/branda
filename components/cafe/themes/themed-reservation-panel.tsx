"use client";

import type { ReactNode } from "react";
import { CalendarDays, MapPin, PartyPopper, Users } from "lucide-react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { CafeSettings } from "@/lib/mock/cafe-settings";
import {
  isSpecialReservationEvent,
  RESERVATION_EVENT_TYPES,
  type ReservationEventType,
} from "@/lib/mock/reservations";
import { ThemedInput } from "./themed-auth-panel";

type Props = {
  settings: CafeSettings;
  experience: ThemeExperience;
  branchCount: number;
  serviceCount?: number;
  formSlot: ReactNode;
  loginPromptSlot?: ReactNode;
};

export function ThemedReservationPanel({
  settings,
  experience,
  branchCount,
  serviceCount = RESERVATION_EVENT_TYPES.length,
  formSlot,
  loginPromptSlot,
}: Props) {
  const { theme, reserve } = experience;
  const logoUrl = useResolvedCafeLogoUrl(settings);

  const heroClass =
    reserve === "lounge"
      ? `rounded-none md:rounded-2xl p-8 md:p-12 ${theme.hero}`
      : reserve === "kiosk"
        ? `rounded-lg p-6 ${theme.hero}`
        : `rounded-[32px] p-6 md:p-8 ${theme.hero}`;

  const formWrap =
    reserve === "kiosk"
      ? `rounded-lg border-2 p-6 ${theme.card}`
      : `rounded-[28px] p-6 ${theme.card}`;

  return (
    <>
      <section className={`mb-8 overflow-hidden ${heroClass}`}>
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <CafeLogo
            name={settings.cafeName}
            logoUrl={logoUrl}
            size={reserve === "kiosk" ? "md" : "lg"}
          />
          <div>
            <p className={`text-sm font-black ${theme.accent}`}>
              {reserve === "lounge" ? "احجز تجربتك" : "خيارات الحجز"}
            </p>
            <h1
              className={`mt-1 font-black ${reserve === "kiosk" ? "text-4xl" : "text-3xl md:text-4xl"} ${experience.headingTracking}`}
            >
              احجز في {settings.cafeName}
            </h1>
            <p className={`mt-2 font-bold ${theme.muted}`}>
              اختر بطاقة الحجز المناسبة، التاريخ، الوقت، والعدد — والرد يصلك من العلامة مباشرة.
            </p>
          </div>
        </div>
        <div
          className={`mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 ${reserve === "kiosk" ? "lg:grid-cols-3" : "lg:grid-cols-3"}`}
        >
          {[
            [MapPin, "فروع", branchCount],
            [CalendarDays, "أنواع", serviceCount],
            [Users, "مناسبات", "خاصة"],
          ].map(([Icon, label, val]) => {
            const I = Icon as React.ElementType;
            return (
              <div
                key={label as string}
                className={`rounded-2xl border p-3 text-center ${theme.card}`}
              >
                <I className={`mx-auto h-5 w-5 ${theme.accent}`} />
                <p className={`mt-1 text-xs font-black ${theme.muted}`}>{label as string}</p>
                <p className="font-black">{val as string | number}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className={reserve === "lounge" ? "grid gap-6 lg:grid-cols-[1.2fr_320px]" : ""}>
        <div className={formWrap}>
          <h2 className={`mb-4 font-black ${reserve === "kiosk" ? "text-2xl" : "text-xl"}`}>
            بيانات الحجز
          </h2>
          {loginPromptSlot}
          {formSlot}
        </div>
      </div>
    </>
  );
}

type EventFieldsProps = {
  experience: ThemeExperience;
  theme: ThemeExperience["theme"];
  reservationType: ReservationEventType;
  eventTitle: string;
  onEventTitleChange: (v: string) => void;
  needsDecoration: boolean;
  onNeedsDecorationChange: (v: boolean) => void;
  needsCatering: boolean;
  onNeedsCateringChange: (v: boolean) => void;
  budgetEstimate: string;
  onBudgetEstimateChange: (v: string) => void;
};

export function ReservationEventFields({
  experience,
  theme,
  reservationType,
  eventTitle,
  onEventTitleChange,
  needsDecoration,
  onNeedsDecorationChange,
  needsCatering,
  onNeedsCateringChange,
  budgetEstimate,
  onBudgetEstimateChange,
}: EventFieldsProps) {
  if (!isSpecialReservationEvent(reservationType)) return null;

  return (
    <div className={`md:col-span-2 rounded-2xl border p-4 ${theme.card}`}>
      <div className="mb-3 flex items-center gap-2">
        <PartyPopper className={`h-5 w-5 ${theme.accent}`} />
        <p className="font-black">تفاصيل المناسبة — {reservationType}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ThemedInput
          experience={experience}
          value={eventTitle}
          onChange={(e) => onEventTitleChange(e.target.value)}
          placeholder="عنوان المناسبة (مثال: عيد ميلاد أحمد)"
          className="md:col-span-2"
        />
        <ThemedInput
          experience={experience}
          value={budgetEstimate}
          onChange={(e) => onBudgetEstimateChange(e.target.value)}
          placeholder="الميزانية التقديرية (ر.س)"
          type="number"
          min={0}
        />
        <label className={`flex items-center gap-2 rounded-2xl px-4 py-3 font-bold ${theme.muted}`}>
          <input
            type="checkbox"
            checked={needsDecoration}
            onChange={(e) => onNeedsDecorationChange(e.target.checked)}
            className="h-4 w-4"
          />
          أحتاج تنسيق/ديكور
        </label>
        <label className={`flex items-center gap-2 rounded-2xl px-4 py-3 font-bold ${theme.muted}`}>
          <input
            type="checkbox"
            checked={needsCatering}
            onChange={(e) => onNeedsCateringChange(e.target.checked)}
            className="h-4 w-4"
          />
          أحتاج ضيافة/تموين
        </label>
      </div>
    </div>
  );
}

export function ThemedSelect({
  experience,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { experience: ThemeExperience }) {
  return (
    <select
      {...props}
      className={`w-full font-bold ${experience.formInput} ${props.className ?? ""}`}
    />
  );
}

export function ThemedTextarea({
  experience,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  experience: ThemeExperience;
}) {
  return (
    <textarea
      {...props}
      className={`w-full font-bold ${experience.formInput} ${props.className ?? ""}`}
    />
  );
}
