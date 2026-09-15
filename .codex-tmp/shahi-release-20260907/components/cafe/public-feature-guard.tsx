"use client";

import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { getCafePath } from "@/lib/cafe/theme-links";
import {
  publicFeatureTitle,
  type PublicFeatureKey,
} from "@/lib/platform/public-feature-access";

type Props = {
  slug: string;
  feature: PublicFeatureKey;
  previewThemeId?: string | null;
  title?: string;
};

export function PublicFeatureUnavailable({
  slug,
  feature,
  previewThemeId,
  title,
}: Props) {
  return (
    <section className="mx-auto flex min-h-[55vh] w-full max-w-md items-center justify-center px-4 py-10">
      <div className="w-full rounded-[28px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-surface-bg,#fff)] p-6 text-center shadow-[0_18px_55px_rgba(49,25,18,0.10)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-[var(--ci-button-bg,#6B3A25)]/10 text-[var(--ci-button-bg,#6B3A25)]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <p className="mt-4 text-xs font-black text-[var(--ci-muted-fg,#806A5E)]">
          الميزة غير مفعلة في باقتك الحالية
        </p>
        <h1 className="mt-2 text-2xl font-black text-[var(--ci-page-fg,#311912)]">
          {title ?? publicFeatureTitle(feature)}
        </h1>
        <p className="mt-3 text-sm font-bold leading-7 text-[var(--ci-muted-fg,#806A5E)]">
          هذا القسم مخفي من التنقل العام لأنه غير متاح ضمن باقة هذه العلامة.
        </p>
        <Link
          href={getCafePath(slug, "", previewThemeId)}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ci-button-bg,#6B3A25)] px-5 py-3 text-sm font-black text-[var(--ci-button-fg,#fff)]"
        >
          العودة للفرع
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
