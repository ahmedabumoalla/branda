"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_CAFE_THEME_ID,
  getThemeClasses,
  isValidCafeThemeId,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import { subscribeBrandaStorageEvents } from "@/lib/cafe/theme-storage-sync";
import { isSupabaseConfigured } from "@/lib/branda/env";

export function readSavedCafeThemeId(): CafeThemeId | null {
  return null;
}

export function useResolvedCafeTheme(slug = "qatrah") {
  const searchParams = useSearchParams();
  const previewParam = searchParams.get("previewTheme");

  const [savedThemeId, setSavedThemeId] = useState<CafeThemeId>(DEFAULT_CAFE_THEME_ID);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured()) {
        setHydrated(true);
        return;
      }

      try {
        const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          setHydrated(true);
          return;
        }
        const data = await res.json();
        if (!cancelled && data.themeId) {
          setSavedThemeId(data.themeId as CafeThemeId);
        }
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void load();
    return subscribeBrandaStorageEvents({
      onThemeUpdated: () => {
        void load();
      },
    });
  }, [slug]);

  const previewThemeId =
    previewParam && isValidCafeThemeId(previewParam) ? previewParam : null;

  const themeId: CafeThemeId = previewThemeId ?? savedThemeId;

  const savedId = hydrated ? savedThemeId : DEFAULT_CAFE_THEME_ID;
  const isPreview = Boolean(previewThemeId && previewThemeId !== savedId);

  return {
    themeId,
    theme: getThemeClasses(themeId),
    isPreview,
    previewThemeId,
    hydrated,
  };
}
