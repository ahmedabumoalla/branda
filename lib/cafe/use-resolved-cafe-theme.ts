"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  CAFE_THEME_KEY,
  getThemeClasses,
  isValidCafeThemeId,
  normalizeThemeId,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";

export function readSavedCafeThemeId(): CafeThemeId | null {
  if (typeof window === "undefined") return null;
  return normalizeThemeId(localStorage.getItem(CAFE_THEME_KEY));
}

export function useResolvedCafeTheme() {
  const searchParams = useSearchParams();
  const previewParam = searchParams.get("previewTheme");

  const themeId = useMemo(() => {
    if (previewParam && isValidCafeThemeId(previewParam)) {
      return previewParam;
    }
    if (typeof window === "undefined") return normalizeThemeId(null);
    return normalizeThemeId(localStorage.getItem(CAFE_THEME_KEY));
  }, [previewParam]);

  const isPreview = Boolean(
    previewParam && isValidCafeThemeId(previewParam) && previewParam !== readSavedCafeThemeId()
  );

  return {
    themeId,
    theme: getThemeClasses(themeId),
    isPreview: Boolean(previewParam && isValidCafeThemeId(previewParam)),
    previewThemeId: previewParam && isValidCafeThemeId(previewParam) ? previewParam : null,
  };
}
