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
    "bg-[#FDFBF8] border-[#E5D8CD] text-[#3A2117] shadow-[8px_8px_24px_rgba(58,33,23,0.06),-6px_-6px_20px_rgba(255,255,255,0.9)]",
  gold:
    "bg-gradient-to-br from-[#3A2117] via-[#6B3A25] to-[#241610] border-[#F6C35B]/25 text-[#F8F4EF] shadow-[0_0_40px_rgba(246,195,91,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]",
  cyber:
    "bg-[#1a1210]/90 border-white/10 text-[#F8F4EF] shadow-[0_0_32px_rgba(246,195,91,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm",
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
      className={`grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 ${className}`}
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
      className={`rounded-[32px] border p-6 transition ${bentoVariants[variant]} ${spanClasses[span]} ${className}`}
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
    <div className="min-h-screen px-6 py-8 lg:px-8">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
          <h1 className="mt-2 text-4xl font-black text-[#3A2117]">{title}</h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl font-bold text-[#7A6255]">{subtitle}</p>
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
    <div className="min-h-screen px-6 py-8 lg:px-8">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-black text-[#F6C35B]">Branda Admin</p>
          <h1 className="mt-2 text-4xl font-black text-[#F8F4EF]">{title}</h1>
          {subtitle ? (
            <p className="mt-2 max-w-2xl font-bold text-[#CBB29C]">{subtitle}</p>
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
      <p className="text-sm font-black text-[#7A6255]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#3A2117]">{value}</p>
      {hint ? <p className="mt-1 text-xs font-bold text-[#8A7062]">{hint}</p> : null}
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
      <p className="text-sm font-black text-[#CBB29C]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#F8F4EF]">{value}</p>
      {hint ? <p className="mt-1 text-xs font-bold text-[#7A6255]">{hint}</p> : null}
    </div>
  );
}

type BadgeTone = "gold" | "success" | "danger" | "muted" | "warning" | "neutral";

const badgeTones: Record<BadgeTone, string> = {
  gold: "bg-[#F6C35B]/20 text-[#F6C35B] border-[#F6C35B]/30",
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
      className={`rounded-[24px] border border-[#E5D8CD] bg-[#F8F4EF] p-5 shadow-[inset_2px_2px_6px_rgba(255,255,255,0.9),6px_8px_20px_rgba(58,33,23,0.06)] ${className}`}
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
      className={`mb-6 flex flex-col gap-4 rounded-[28px] border border-[#E5D8CD] bg-white p-5 shadow-[8px_8px_24px_rgba(58,33,23,0.05)] lg:flex-row lg:items-center ${className}`}
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
      className={`mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-[#1a1210]/80 p-5 shadow-[0_0_24px_rgba(246,195,91,0.06)] lg:flex-row lg:items-center ${className}`}
    >
      {children}
    </div>
  );
}

/* ─── Inputs (unified light / dark) ─── */

export const inputLightClass =
  "h-14 w-full rounded-2xl border border-[#E5D8CD] bg-[#FDFBF8] px-4 text-right font-bold text-[#241610] outline-none placeholder:text-[#9B8173] shadow-[inset_3px_3px_8px_rgba(58,33,23,0.06),inset_-2px_-2px_6px_rgba(255,255,255,0.95)] focus:border-[#6B3A25]/50 focus:ring-2 focus:ring-[#6B3A25]/15";

export const inputDarkClass =
  "h-14 w-full rounded-2xl border border-[#F6C35B]/25 bg-[#211711] px-4 text-right font-bold text-[#F8E8D2] outline-none placeholder:text-[#CBB29C]/80 shadow-[inset_2px_2px_8px_rgba(0,0,0,0.4)] focus:border-[#F6C35B]/55 focus:ring-2 focus:ring-[#F6C35B]/25 [&_option]:bg-[#211711] [&_option]:text-[#F8E8D2]";

export const textareaLightClass =
  "min-h-28 w-full resize-none rounded-2xl border border-[#E5D8CD] bg-[#FDFBF8] px-4 py-3 text-right font-bold text-[#241610] outline-none placeholder:text-[#9B8173] shadow-[inset_3px_3px_8px_rgba(58,33,23,0.06)] focus:border-[#6B3A25]/50 focus:ring-2 focus:ring-[#6B3A25]/15";

export const textareaDarkClass =
  "min-h-28 w-full resize-none rounded-2xl border border-[#F6C35B]/25 bg-[#211711] px-4 py-3 text-right font-bold text-[#F8E8D2] outline-none placeholder:text-[#CBB29C]/80 shadow-[inset_2px_2px_8px_rgba(0,0,0,0.4)] focus:border-[#F6C35B]/55 focus:ring-2 focus:ring-[#F6C35B]/25";

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
      className={`rounded-2xl bg-[#3A2117] px-6 py-4 font-black text-[#F8E8D2] shadow-[6px_8px_20px_rgba(58,33,23,0.25),inset_0_1px_0_rgba(255,255,255,0.1)] transition hover:bg-[#241610] disabled:opacity-50 ${className}`}
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
      className={`rounded-2xl bg-gradient-to-l from-[#F6C35B] to-[#d4a84a] px-6 py-4 font-black text-[#241610] shadow-[0_0_24px_rgba(246,195,91,0.35)] transition hover:brightness-105 disabled:opacity-50 ${className}`}
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
      ? "border border-[#E5D8CD] bg-white text-[#3A2117] shadow-[4px_6px_16px_rgba(58,33,23,0.06)]"
      : "bg-[#3A2117] text-[#F8E8D2] shadow-[6px_8px_20px_rgba(58,33,23,0.2)]";

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
