"use client";

import { useEffect, useState } from "react";
import { appendPreviewToNextPath, getCafePath } from "@/lib/cafe/theme-links";
import { getThemeExperience } from "@/lib/cafe/theme-experience";
import { DEFAULT_CAFE_THEME_ID } from "@/lib/mock/cafe-theme";
import { mockCafeSettings, type CafeSettings } from "@/lib/mock/cafe-settings";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { cachedRequest } from "@/lib/performance/browser-cache";

type CafeThemePageData = {
  settings: CafeSettings;
  customIdentity: CustomIdentityTheme | null;
  cachedAt: number;
};

const CAFE_THEME_PAGE_CACHE_TTL_MS = 5 * 60_000;
const cafeThemePageCache = new Map<string, CafeThemePageData>();
const cafeThemePageRequests = new Map<string, Promise<CafeThemePageData>>();

function fallbackSettings(slug: string): CafeSettings {
  return {
    ...mockCafeSettings,
    cafeSlug: slug,
    cafeName: slug,
  };
}

async function loadCafeThemePageData(slug: string): Promise<CafeThemePageData> {
  const cached = cafeThemePageCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < CAFE_THEME_PAGE_CACHE_TTL_MS) {
    return cached;
  }

  const pending = cafeThemePageRequests.get(slug);
  if (pending) return pending;

  const request = cachedRequest(`public-cafe-theme:${slug}`, CAFE_THEME_PAGE_CACHE_TTL_MS, async () => {
    const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}`, {
      cache: "force-cache",
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      throw new Error(res.status === 404 ? "المقهى غير موجود" : "تعذر تحميل بيانات المقهى");
    }

    const data = await res.json();
    const value: CafeThemePageData = {
      settings: data.settings ?? fallbackSettings(slug),
      customIdentity: data.customIdentity ?? null,
      cachedAt: Date.now(),
    };
    cafeThemePageCache.set(slug, value);
    return value;
  }).finally(() => {
    cafeThemePageRequests.delete(slug);
  });

  cafeThemePageRequests.set(slug, request);
  return request;
}

export function useCafeThemePage(slug: string) {
  const [customIdentity, setCustomIdentity] = useState<CustomIdentityTheme | null>(null);
  const [settings, setSettings] = useState<CafeSettings>(() => fallbackSettings(slug));
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

      const cached = cafeThemePageCache.get(slug);
      if (cached && Date.now() - cached.cachedAt < CAFE_THEME_PAGE_CACHE_TTL_MS) {
        setSettings(cached.settings);
        setCustomIdentity(cached.customIdentity);
        setLoadError(null);
        setHydrated(true);
        return;
      }

      try {
        const data = await loadCafeThemePageData(slug);
        if (cancelled) return;
        setSettings(data.settings);
        setCustomIdentity(data.customIdentity);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "تعذر الاتصال بالخادم");
        }
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
