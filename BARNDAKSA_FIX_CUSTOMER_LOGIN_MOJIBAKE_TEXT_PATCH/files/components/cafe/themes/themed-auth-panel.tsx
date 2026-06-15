"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
      ? `rounded-3xl p-8 md:p-10 ${theme.card}`
      : auth === "kiosk"
        ? `rounded-lg border-2 p-8 ${theme.card}`
        : auth === "boutique"
          ? `rounded-none border border-[#c9a227]/20 p-8 ${theme.card}`
          : auth === "neon"
            ? `rounded-lg border border-[#00e676]/20 p-8 backdrop-blur ${theme.card}`
            : auth === "app"
              ? `rounded-3xl p-6 shadow-xl ${theme.card}`
              : `rounded-[28px] p-8 ${theme.card}`;

  const title = mode === "login" ? "تسجيل دخول العميل" : "إنشاء حساب جديد";
  const description =
    mode === "login"
      ? `أدخل بريدك وكلمة المرور للمتابعة في ${settings.cafeName}`
      : `سجّل في ${settings.cafeName} لمتابعة الطلبات والحجوزات`;

  return (
    <div className={auth === "app" ? "mx-auto max-w-md" : "mx-auto max-w-lg"}>
      <div className="mb-8 flex flex-col items-center text-center">
        <h1
          className={`mt-0 font-black ${auth === "kiosk" ? "text-4xl" : "text-3xl"} ${experience.headingTracking}`}
        >
          {title}
        </h1>
        <p className={`mt-2 font-bold ${theme.muted}`}>{description}</p>
      </div>

      <div className={panelClass}>
        <div className="space-y-4">{children}</div>
        <button
          type="button"
          onClick={onSubmit}
          className={`mt-6 w-full font-black ${auth === "kiosk" ? "h-16 text-lg rounded-lg" : "h-14 rounded-2xl"} ${theme.button}`}
        >
          {submitLabel}
        </button>
        <p className={`mt-6 text-center text-sm font-bold ${theme.muted}`}>
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
      className={`w-full font-bold outline-none focus:ring-2 focus:ring-offset-1 ${experience.formInput} ${props.className ?? ""}`}
    />
  );
}
