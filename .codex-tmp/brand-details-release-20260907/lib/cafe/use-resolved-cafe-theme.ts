"use client";

import { useSearchParams } from "next/navigation";
import {
  DEFAULT_CAFE_THEME_ID,
  getThemeClasses,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";

export function readSavedCafeThemeId(): CafeThemeId | null {
  return DEFAULT_CAFE_THEME_ID;
}

export function useResolvedCafeTheme(_slug = "qatrah") {
  useSearchParams();
  return {
    themeId: DEFAULT_CAFE_THEME_ID,
    theme: getThemeClasses(DEFAULT_CAFE_THEME_ID),
    isPreview: false,
    previewThemeId: null,
    hydrated: true,
  };
}
