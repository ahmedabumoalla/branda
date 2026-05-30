"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CAFE_THEME_KEY,
  DEFAULT_CAFE_THEME_ID,
  getThemeClasses,
  isValidCafeThemeId,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import {
  readSavedCafeThemeIdFromStorage,
  subscribeBrandaStorageEvents,
} from "@/lib/cafe/theme-storage-sync";

export function readSavedCafeThemeId(): CafeThemeId | null {
  return readSavedCafeThemeIdFromStorage();
}

export function useResolvedCafeTheme() {
  const searchParams = useSearchParams();
  const previewParam = searchParams.get("previewTheme");

  const [savedThemeId, setSavedThemeId] = useState<CafeThemeId>(DEFAULT_CAFE_THEME_ID);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSavedThemeId(readSavedCafeThemeIdFromStorage());
    setHydrated(true);

    return subscribeBrandaStorageEvents({
      onThemeUpdated: () => {
        setSavedThemeId(readSavedCafeThemeIdFromStorage());
      },
    });
  }, []);

  const previewThemeId =
    previewParam && isValidCafeThemeId(previewParam) ? previewParam : null;

  const themeId: CafeThemeId = previewThemeId ?? savedThemeId;

  const savedId = hydrated ? savedThemeId : DEFAULT_CAFE_THEME_ID;
  const isPreview = Boolean(
    previewThemeId && previewThemeId !== savedId
  );

  return {
    themeId,
    theme: getThemeClasses(themeId),
    isPreview,
    previewThemeId,
    hydrated,
  };
}
