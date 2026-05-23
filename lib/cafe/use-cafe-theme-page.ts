"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  appendPreviewToNextPath,
  getCafePath,
  readPreviewThemeFromSearch,
} from "@/lib/cafe/theme-links";
import { getThemeExperience, type ThemeExperience } from "@/lib/cafe/theme-experience";
import {
  CAFE_THEME_KEY,
  normalizeThemeId,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import {
  CAFE_SETTINGS_KEY,
  mockCafeSettings,
  type CafeSettings,
} from "@/lib/mock/cafe-settings";

export function useCafeThemePage(slug: string) {
  const searchParams = useSearchParams();
  const previewThemeId = readPreviewThemeFromSearch(searchParams);
  const [savedThemeId, setSavedThemeId] = useState<CafeThemeId>(() =>
    normalizeThemeId(null)
  );
  const [settings, setSettings] = useState<CafeSettings>(mockCafeSettings);

  useEffect(() => {
    setSavedThemeId(normalizeThemeId(localStorage.getItem(CAFE_THEME_KEY)));
    const savedSettings = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (savedSettings) setSettings(JSON.parse(savedSettings));
  }, [slug]);

  const themeId = previewThemeId ?? savedThemeId;
  const experience = getThemeExperience(themeId);
  const isPreview = Boolean(previewThemeId);

  function path(subpath = "") {
    return getCafePath(slug, subpath, previewThemeId);
  }

  function nextPath(subpath: string) {
    return appendPreviewToNextPath(subpath, previewThemeId);
  }

  return {
    slug,
    themeId,
    theme: experience.theme,
    experience,
    settings,
    previewThemeId,
    isPreview,
    path,
    nextPath,
  };
}
