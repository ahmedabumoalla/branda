"use client";

import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, MapPin, PartyPopper, Sparkles, Users } from "lucide-react";
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
      ? `rounded-[34px] p-6 shadow-[0_26px_90px_rgba(49,25,18,0.16)] md:p-10 ${theme.hero}`
      : reserve === "kiosk"
        ? `rounded-2xl p-6 shadow-[0_22px_70px_rgba(49,25,18,0.14)] ${theme.hero}`
        : `rounded-[34px] p-6 shadow-[0_26px_90px_rgba(49,25,18,0.16)] md:p-8 ${theme.hero}`;

  const formWrap =
    reserve === "kiosk"
      ? `barndaksa-premium-card rounded-2xl border-2 p-5 shadow-[0_20px_65px_rgba(49,25,18,0.10)] ${theme.card}`
      : `barndaksa-premium-card rounded-[32px] border border-black/5 p-5 shadow-[0_24px_80px_rgba(49,25,18,0.12)] sm:p-6 ${theme.card}`;

  return (
    <>
      <section className={`barndaksa-premium-hero mb-6 overflow-hidden ${heroClass}`}>
        <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-center">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <CafeLogo
              name={settings.cafeName}
              logoUrl={logoUrl}
              size={reserve === "kiosk" ? "md" : "lg"}
              className="shadow-[0_16px_45px_rgba(49,25,18,0.18)]"
            />
            <div>
              <p className={`inline-flex items-center gap-2 text-sm font-black ${theme.accent}`}>
                <Sparkles className="h-4 w-4" />
              {reserve === "lounge" ? "احجز تجربتك" : "خيارات الحجز"}
              </p>
              <h1
                className={`mt-2 text-balance font-black leading-tight ${reserve === "kiosk" ? "text-4xl" : "text-4xl md:text-5xl"} ${experience.headingTracking}`}
              >
                احجز في {settings.cafeName}
              </h1>
              <p className={`mt-3 max-w-2xl text-sm font-bold leading-7 sm:text-base ${theme.muted}`}>
                اختر الخدمة والفرع والموعد في تجربة هادئة مصممة للجوال، والرد يصلك من العلامة مباشرة.
              </p>
            </div>
          </div>

          <div className={`rounded-[28px] border border-white/20 p-4 backdrop-blur ${theme.card}`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${theme.button}`}>
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div>
                <p className={`text-xs font-black ${theme.muted}`}>خطوة واحدة</p>
                <p className="text-lg font-black">طلب حجز واضح وسريع</p>
              </div>
            </div>
          </div>
        </div>
        <div
          className={`mt-6 grid grid-cols-3 gap-2 sm:gap-3 ${reserve === "kiosk" ? "lg:grid-cols-3" : "lg:grid-cols-3"}`}
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
                className={`barndaksa-premium-card rounded-2xl border border-black/5 p-3 text-center shadow-sm ${theme.card}`}
              >
                <I className={`mx-auto h-5 w-5 ${theme.accent}`} />
                <p className={`mt-1 text-xs font-black ${theme.muted}`}>{label as string}</p>
                <p className="font-black">{val as string | number}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-3">
        {[
          ["01", "اختر التجربة", "بطاقات الخدمات تعرض السعر والمدة والمزايا قبل تعبئة النموذج."],
          ["02", "حدد الموعد", "الفرع والتاريخ والوقت تبقى ضمن نفس المسار بدون تنقل زائد."],
          ["03", "انتظر التأكيد", "طلبك يراجع من العلامة وتظهر حالته داخل حساب العميل."],
        ].map(([step, title, desc]) => (
          <article
            key={step}
            className={`barndaksa-premium-card rounded-[28px] border border-black/5 p-5 shadow-[0_18px_55px_rgba(49,25,18,0.08)] ${theme.card}`}
          >
            <p className={`text-sm font-black ${theme.accent}`}>{step}</p>
            <h3 className="mt-2 text-xl font-black">{title}</h3>
            <p className={`mt-2 text-sm font-bold leading-7 ${theme.muted}`}>{desc}</p>
          </article>
        ))}
      </section>

      <div className={reserve === "lounge" ? "grid gap-6 lg:grid-cols-[1.2fr_320px]" : ""}>
        <div className={formWrap}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className={`text-xs font-black ${theme.muted}`}>أكمل التفاصيل</p>
              <h2 className={`font-black ${reserve === "kiosk" ? "text-2xl" : "text-xl"}`}>
                بيانات الحجز
              </h2>
            </div>
            <span className={`hidden rounded-2xl px-3 py-2 text-xs font-black sm:inline-flex ${theme.badge}`}>
              طلبك يراجع من العلامة
            </span>
          </div>
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
