"use client";

import { useEffect, useState } from "react";
import { appendPreviewToNextPath, getCafePath } from "@/lib/cafe/theme-links";
import { getThemeExperience } from "@/lib/cafe/theme-experience";
import { DEFAULT_CAFE_THEME_ID } from "@/lib/mock/cafe-theme";
import { mockCafeSettings, type CafeSettings } from "@/lib/mock/cafe-settings";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { isSupabaseConfigured } from "@/lib/branda/env";

export function useCafeThemePage(slug: string) {
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
          setLoadError(res.status === 404 ? "المقهى غير موجود" : "تعذر تحميل بيانات المقهى");
          setHydrated(true);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        if (data.settings) setSettings(data.settings);
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

  const experience = getThemeExperience(DEFAULT_CAFE_THEME_ID);

  function path(subpath = "") {
    return getCafePath(slug, subpath, null);
  }

  function nextPath(subpath: string) {
    return appendPreviewToNextPath(subpath, null);
  }

  return {
    slug,
    themeId: DEFAULT_CAFE_THEME_ID,
    theme: experience.theme,
    experience,
    settings,
    customIdentity,
    previewThemeId: null,
    isPreview: false,
    path,
    nextPath,
    hydrated,
    loadError,
  };
}
