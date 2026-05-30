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
  readSavedCafeThemeIdFromStorage,
  runCustomIdentityMigrationOnce,
  subscribeBrandaStorageEvents,
} from "@/lib/cafe/theme-storage-sync";
import {
  DEFAULT_CAFE_THEME_ID,
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
  const [savedThemeId, setSavedThemeId] = useState<CafeThemeId>(DEFAULT_CAFE_THEME_ID);
  const [settings, setSettings] = useState<CafeSettings>(mockCafeSettings);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void runCustomIdentityMigrationOnce();
    setSavedThemeId(readSavedCafeThemeIdFromStorage());
    const savedSettings = localStorage.getItem(CAFE_SETTINGS_KEY);
    if (savedSettings) setSettings(JSON.parse(savedSettings));
    setHydrated(true);

    return subscribeBrandaStorageEvents({
      onThemeUpdated: () => {
        setSavedThemeId(readSavedCafeThemeIdFromStorage());
      },
    });
  }, [slug]);

  const themeId = previewThemeId ?? savedThemeId;
  const experience = getThemeExperience(themeId);
  const isPreview = Boolean(
    previewThemeId && previewThemeId !== (hydrated ? savedThemeId : DEFAULT_CAFE_THEME_ID)
  );

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
    hydrated,
  };
}
