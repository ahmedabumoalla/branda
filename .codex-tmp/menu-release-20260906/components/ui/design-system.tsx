"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/* ─── Bento ─── */

type BentoSpan = "1" | "2" | "3" | "4" | "row2";

const spanClasses: Record<BentoSpan, string> = {
  "1": "md:col-span-1",
  "2": "md:col-span-2",
  "3": "md:col-span-3",
  "4": "md:col-span-4",
  row2: "md:col-span-2 md:row-span-2",
};

type BentoVariant = "white" | "gold" | "cyber" | "dark";

const bentoVariants: Record<BentoVariant, string> = {
  white:
    "bg-[#FCF8F3] border-[#E7D7C6] text-[#311912] shadow-[8px_8px_24px_rgba(49,25,18,0.06),-6px_-6px_20px_rgba(255,255,255,0.9)]",
  gold:
    "bg-gradient-to-br from-[#4A281D] via-[#6B3A25] to-[#311912] border-[#D9A33F]/25 text-[#FCF8F3] shadow-[0_0_40px_rgba(217,163,63,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]",
  cyber:
    "bg-[#1a1210]/90 border-white/10 text-[#F8F4EF] shadow-[0_0_32px_rgba(217,163,63,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm",
  dark:
    "bg-[#0f0c0a] border-white/10 text-[#F8F4EF] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),4px_8px_28px_rgba(0,0,0,0.45)]",
};

export function BentoGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  children,
  variant = "white",
  span = "1",
  className = "",
}: {
  children: ReactNode;
  variant?: BentoVariant;
  span?: BentoSpan;
  className?: string;
}) {
  return (
    <article
      className={`min-w-0 rounded-[16px] border p-4 transition ${bentoVariants[variant]} ${spanClasses[span]} ${className}`}
    >
      {children}
    </article>
  );
}

/* ─── Shells ─── */

export function DashboardPageShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">لوحة برندة</p>
          <h1 className="mt-1.5 break-words text-2xl font-black text-[#311912] lg:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm font-bold text-[#806A5E]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function AdminPageShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#D9A33F]">Barndaksa Admin</p>
          <h1 className="mt-1.5 break-words text-2xl font-black text-[#F8F4EF] lg:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-sm font-bold text-[#CBB29C]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

/* ─── Stats & badges ─── */

export function StatPill({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs font-black text-[#806A5E]">{label}</p>
      <p className="mt-1.5 text-2xl font-black text-[#311912]">{value}</p>
      {hint ? <p className="mt-1 text-xs font-bold text-[#806A5E]">{hint}</p> : null}
    </div>
  );
}

export function AdminStatPill({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs font-black text-[#CBB29C]">{label}</p>
      <p className="mt-1.5 text-2xl font-black text-[#F8F4EF]">{value}</p>
      {hint ? <p className="mt-1 text-xs font-bold text-[#7A6255]">{hint}</p> : null}
    </div>
  );
}

type BadgeTone = "gold" | "success" | "danger" | "muted" | "warning" | "neutral";

const badgeTones: Record<BadgeTone, string> = {
  gold: "bg-[#D9A33F]/20 text-[#D9A33F] border-[#D9A33F]/30",
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  danger: "bg-red-500/15 text-red-300 border-red-500/25",
  muted: "bg-white/10 text-[#CBB29C] border-white/15",
  warning: "bg-amber-500/15 text-amber-200 border-amber-500/25",
  neutral: "bg-white/10 text-[#CBB29C] border-white/15",
};

export function StatusBadge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex rounded-xl border px-3 py-1 text-xs font-black ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ─── Soft UI cards ─── */

export function SoftCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4 shadow-[inset_2px_2px_6px_rgba(255,255,255,0.9),6px_8px_20px_rgba(49,25,18,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function FilterBar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-5 flex min-w-0 flex-col gap-3 rounded-[16px] border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)] lg:flex-row lg:items-center ${className}`}
    >
      {children}
    </div>
  );
}

export function AdminFilterBar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-5 flex min-w-0 flex-col gap-3 rounded-[16px] border border-white/10 bg-[#1a1210]/80 p-4 shadow-[0_0_24px_rgba(217,163,63,0.06)] lg:flex-row lg:items-center ${className}`}
    >
      {children}
    </div>
  );
}

/* ─── Inputs (unified light / dark) ─── */

export const inputLightClass =
  "h-12 w-full rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] px-3 text-right text-sm font-bold text-[#311912] outline-none placeholder:text-[#806A5E] shadow-[inset_3px_3px_8px_rgba(49,25,18,0.06),inset_-2px_-2px_6px_rgba(255,255,255,0.95)] focus:border-[#6B3A25]/50 focus:ring-2 focus:ring-[#6B3A25]/15";

export const inputDarkClass =
  "h-12 w-full rounded-xl border border-[#D9A33F]/25 bg-[#211711] px-3 text-right text-sm font-bold text-[#FCF8F3] outline-none placeholder:text-[#F2E7D9]/80 shadow-[inset_2px_2px_8px_rgba(0,0,0,0.4)] focus:border-[#D9A33F]/55 focus:ring-2 focus:ring-[#D9A33F]/25 [&_option]:bg-[#211711] [&_option]:text-[#FCF8F3]";

export const textareaLightClass =
  "min-h-24 w-full resize-none rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] px-3 py-3 text-right text-sm font-bold text-[#311912] outline-none placeholder:text-[#806A5E] shadow-[inset_3px_3px_8px_rgba(49,25,18,0.06)] focus:border-[#6B3A25]/50 focus:ring-2 focus:ring-[#6B3A25]/15";

export const textareaDarkClass =
  "min-h-24 w-full resize-none rounded-xl border border-[#D9A33F]/25 bg-[#211711] px-3 py-3 text-right text-sm font-bold text-[#FCF8F3] outline-none placeholder:text-[#F2E7D9]/80 shadow-[inset_2px_2px_8px_rgba(0,0,0,0.4)] focus:border-[#D9A33F]/55 focus:ring-2 focus:ring-[#D9A33F]/25";

type FieldTone = "light" | "dark";

function resolveTone(dark?: boolean, tone?: FieldTone): FieldTone {
  if (tone) return tone;
  return dark ? "dark" : "light";
}

export function NeumoInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    dark?: boolean;
    tone?: FieldTone;
  }
) {
  const { dark, tone, className = "", ...rest } = props;
  const t = resolveTone(dark, tone);
  return (
    <input
      {...rest}
      className={`${t === "dark" ? inputDarkClass : inputLightClass} ${className}`}
    />
  );
}

export function NeumoTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    dark?: boolean;
    tone?: FieldTone;
  }
) {
  const { dark, tone, className = "", ...rest } = props;
  const t = resolveTone(dark, tone);
  return (
    <textarea
      {...rest}
      className={`${t === "dark" ? textareaDarkClass : textareaLightClass} ${className}`}
    />
  );
}

export function NeumoSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    dark?: boolean;
    tone?: FieldTone;
  }
) {
  const { dark, tone, className = "", children, ...rest } = props;
  const t = resolveTone(dark, tone);
  return (
    <select
      {...rest}
      className={`${t === "dark" ? inputDarkClass : inputLightClass} ${className}`}
    >
      {children}
    </select>
  );
}

/** حقول داخل لوحة الأدمن — استخدمها بدل تكرار dark */
export function AdminInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  return <NeumoInput tone="dark" {...props} />;
}

export function AdminTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return <NeumoTextarea tone="dark" {...props} />;
}

export function AdminSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement>
) {
  return <NeumoSelect tone="dark" {...props} />;
}

/* ─── Buttons ─── */

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-[#4A281D] px-5 py-3 text-sm font-black text-[#FCF8F3] shadow-[6px_8px_20px_rgba(49,25,18,0.20),inset_0_1px_0_rgba(255,255,255,0.1)] transition hover:bg-[#311912] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GoldButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-gradient-to-l from-[#D9A33F] to-[#F0C568] px-5 py-3 text-sm font-black text-[#311912] shadow-[0_0_20px_rgba(217,163,63,0.28)] transition hover:brightness-105 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
  target,
  rel,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline";
  className?: string;
  target?: string;
  rel?: string;
}) {
  const styles =
    variant === "outline"
      ? "border border-[#E7D7C6] bg-white text-[#311912] shadow-[4px_6px_16px_rgba(49,25,18,0.06)]"
      : "bg-[#4A281D] text-[#FCF8F3] shadow-[6px_8px_20px_rgba(49,25,18,0.2)]";

  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className={`inline-flex items-center justify-center rounded-2xl px-6 py-4 font-black transition hover:opacity-90 ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}
