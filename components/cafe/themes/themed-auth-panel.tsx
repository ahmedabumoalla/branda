"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LockKeyhole, Sparkles, UserRound } from "lucide-react";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

type Props = {
  mode: "login" | "register";
  settings: CafeSettings;
  experience: ThemeExperience;
  registerHref: string;
  loginHref: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel: string;
};

export function ThemedAuthPanel({
  mode,
  settings,
  experience,
  registerHref,
  loginHref,
  children,
  onSubmit,
  submitLabel,
}: Props) {
  const { theme, auth } = experience;

  const panelClass =
    auth === "minimal"
      ? `rounded-[32px] p-6 shadow-[0_22px_75px_rgba(49,25,18,0.12)] md:p-8 ${theme.card}`
      : auth === "kiosk"
        ? `rounded-2xl border-2 p-6 shadow-[0_22px_75px_rgba(49,25,18,0.12)] ${theme.card}`
        : auth === "boutique"
          ? `rounded-[28px] border border-[var(--ci-accent-bg,var(--barndaksa-gold-accent))]/20 p-6 shadow-[0_22px_75px_rgba(49,25,18,0.12)] ${theme.card}`
          : auth === "neon"
            ? `rounded-2xl border border-[#00e676]/20 p-6 shadow-[0_22px_75px_rgba(49,25,18,0.12)] backdrop-blur ${theme.card}`
            : auth === "app"
              ? `rounded-[32px] p-6 shadow-[0_24px_80px_rgba(49,25,18,0.14)] ${theme.card}`
              : `rounded-[32px] p-6 shadow-[0_24px_80px_rgba(49,25,18,0.14)] sm:p-8 ${theme.card}`;

  const title = mode === "login" ? "تسجيل دخول العميل" : "إنشاء حساب جديد";
  const description =
    mode === "login"
      ? `أدخل بريدك وكلمة المرور للمتابعة في ${settings.cafeName}`
      : `سجّل في ${settings.cafeName} لمتابعة الطلبات والحجوزات`;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[0.88fr_1fr] lg:items-stretch">
      <aside className={`barndaksa-premium-hero rounded-[36px] p-6 shadow-[0_24px_80px_rgba(49,25,18,0.14)] ${theme.hero}`}>
        <span className={`flex h-16 w-16 items-center justify-center rounded-[24px] shadow-lg ${theme.button}`}>
          {mode === "login" ? <LockKeyhole className="h-7 w-7" /> : <UserRound className="h-7 w-7" />}
        </span>
        <p className={`mt-6 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>
          <Sparkles className="h-3.5 w-3.5" />
          حساب العميل
        </p>
        <h1
          className={`mt-3 text-balance font-black leading-tight ${auth === "kiosk" ? "text-4xl" : "text-3xl sm:text-4xl"} ${experience.headingTracking}`}
        >
          {title}
        </h1>
        <p className={`mt-3 text-sm font-bold leading-7 ${theme.muted}`}>{description}</p>

        <div className="mt-7 grid gap-3">
          {[
            ["الطلبات", "تابع حالة الاستلام من حسابك"],
            ["الحجوزات", "كل موعد يظهر في سجل واحد"],
            ["الولاء", "بطاقتك ومكافآتك بعد الدخول"],
          ].map(([label, desc]) => (
            <div key={label} className={`rounded-2xl border border-black/5 p-4 ${theme.card}`}>
              <p className="font-black">{label}</p>
              <p className={`mt-1 text-xs font-bold leading-5 ${theme.muted}`}>{desc}</p>
            </div>
          ))}
        </div>
      </aside>

      <div className={`barndaksa-premium-card border border-black/5 ${panelClass}`}>
        <div className="mb-5">
          <p className={`text-xs font-black ${theme.accent}`}>دخول آمن ومباشر</p>
          <h2 className="mt-1 text-2xl font-black">
            {mode === "login" ? "أكمل بيانات الدخول" : "أنشئ حسابك"}
          </h2>
        </div>
        <div className="space-y-4">{children}</div>
        <button
          type="button"
          onClick={onSubmit}
          className={`barndaksa-cta-motion mt-6 w-full font-black shadow-lg transition active:scale-[0.985] ${auth === "kiosk" ? "h-16 rounded-2xl text-lg" : "h-14 rounded-2xl"} ${theme.button}`}
        >
          {submitLabel}
        </button>
        <p className={`mt-6 rounded-2xl px-4 py-3 text-center text-sm font-bold ${theme.badge}`}>
          {mode === "login" ? (
            <>
              ما عندك حساب؟{" "}
              <Link href={registerHref} className={`font-black ${theme.link}`}>
                إنشاء حساب جديد
              </Link>
            </>
          ) : (
            <>
              عندك حساب؟{" "}
              <Link href={loginHref} className={`font-black ${theme.link}`}>
                تسجيل الدخول
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function ThemedFormField({
  label,
  experience,
  children,
}: {
  label: string;
  experience: ThemeExperience;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={`text-xs font-black ${experience.theme.muted}`}>{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export function ThemedInput({
  experience,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { experience: ThemeExperience }) {
  return (
    <input
      {...props}
      className={`w-full min-h-12 font-bold outline-none transition focus:ring-2 focus:ring-offset-1 ${experience.formInput} ${props.className ?? ""}`}
    />
  );
}
