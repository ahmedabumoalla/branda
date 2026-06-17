"use client";

import type { ReactNode } from "react";
import {
  ThemedCafeShell,
  useCafeThemePage,
} from "@/components/cafe/themes/themed-cafe-shell";

type Props = {
  slug: string;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
};

/** غلاف موحّد لكل صفحات العميل — يطبق الثيم + previewTheme */
export function CafeLayout({ slug, children, className, maxWidth }: Props) {
  return (
    <ThemedCafeShell slug={slug} className={className} maxWidth={maxWidth}>
      {children}
    </ThemedCafeShell>
  );
}

/** سياق الثيم للصفحات الداخلية (داخل CafeLayout / ThemedCafeShell) */
export function useCafePageContext(slug: string) {
  const ctx = useCafeThemePage(slug);
  return {
    settings: ctx.settings,
    themeId: ctx.themeId,
    theme: ctx.theme,
    experience: ctx.experience,
    previewThemeId: ctx.previewThemeId,
    isPreview: ctx.isPreview,
    path: ctx.path,
    nextPath: ctx.nextPath,
  };
}
