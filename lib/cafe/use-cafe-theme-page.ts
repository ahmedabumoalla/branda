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
  DEFAULT_CAFE_THEME_ID,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import { mockCafeSettings, type CafeSettings } from "@/lib/mock/cafe-settings";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { isSupabaseConfigured } from "@/lib/branda/env";

export function useCafeThemePage(slug: string) {
  const searchParams = useSearchParams();
  const previewThemeId = readPreviewThemeFromSearch(searchParams);
  const [savedThemeId, setSavedThemeId] = useState<CafeThemeId>(DEFAULT_CAFE_THEME_ID);
  const [customIdentity, setCustomIdentity] = useState<CustomIdentityTheme | null>(null);
  const [settings, setSettings] = useState<CafeSettings>({
    ...mockCafeSettings,
    cafeSlug: slug,
    cafeName: slug,
  });
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured()) {
        setLoadError("Supabase غير مهيأ — راجع .env.local");
        setHydrated(true);
        return;
      }

      try {
        const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setLoadError("المقهى غير موجود");
          } else {
            setLoadError("تعذر تحميل بيانات المقهى");
          }
          setHydrated(true);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (data.settings) setSettings(data.settings);
        if (data.themeId) setSavedThemeId(data.themeId);
        if (data.customIdentity) setCustomIdentity(data.customIdentity);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("تعذر الاتصال بالخادم");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
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
    customIdentity,
    previewThemeId,
    isPreview,
    path,
    nextPath,
    hydrated,
    loadError,
  };
}
