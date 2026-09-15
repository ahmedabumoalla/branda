"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CafeLogo } from "@/components/cafe/cafe-logo";
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
  const title = mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد";
  const switchHref = mode === "login" ? registerHref : loginHref;
  const switchText = mode === "login" ? "إنشاء حساب جديد" : "تسجيل الدخول";

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-sm flex-col justify-center px-4 py-8 text-right">
      <section className="w-full">
        <div className="flex flex-col items-center text-center">
          <CafeLogo name={settings.cafeName} logoUrl={settings.logoDataUrl} size="lg" />
          <h1 className="mt-3 max-w-full truncate text-xl font-black text-[var(--ci-page-fg,#171412)]">
            {settings.cafeName}
          </h1>
        </div>

        <div className="mt-6 rounded-[22px] border border-[var(--ci-border,#E7D7C6)] bg-white p-4 shadow-[0_16px_42px_rgba(23,20,18,0.08)]">
          <h2 className="text-center text-lg font-black text-[var(--ci-page-fg,#171412)]">
            {title}
          </h2>
          <div className="mt-4 space-y-3">{children}</div>

          <button
            type="button"
            onClick={onSubmit}
            className={`barndaksa-cta-motion mt-4 w-full font-black shadow-lg transition active:scale-[0.985] ${auth === "kiosk" ? "h-14 rounded-2xl text-base" : "h-12 rounded-2xl text-sm"} ${theme.button}`}
          >
            {submitLabel}
          </button>
        </div>

        <p className={`mt-4 text-center text-xs font-bold ${theme.muted}`}>
          <Link href={switchHref} className={`font-black underline ${theme.link}`}>
            {switchText}
          </Link>
        </p>
      </section>
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
      className={`w-full min-h-11 font-bold outline-none transition focus:ring-2 focus:ring-offset-1 ${experience.formInput} ${props.className ?? ""}`}
    />
  );
}
