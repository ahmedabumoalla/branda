"use client";

import { useEffect, useState } from "react";
import { appendPreviewToNextPath, getCafePath } from "@/lib/cafe/theme-links";
import { getThemeExperience } from "@/lib/cafe/theme-experience";
import { DEFAULT_CAFE_THEME_ID } from "@/lib/mock/cafe-theme";
import { mockCafeSettings, type CafeSettings } from "@/lib/mock/cafe-settings";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import {
  readPublicCafeFastCache,
  refreshPublicCafeFastLayer,
  subscribePublicCafeFastLayer,
  type PublicCafeFastPayload,
} from "@/lib/cafe/public-cafe-fast-layer";
import { cachedRequest } from "@/lib/performance/browser-cache";

type CafeThemePageData = {
  settings: CafeSettings;
  customIdentity: CustomIdentityTheme | null;
  features: string[];
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

function fromFastPayload(payload: PublicCafeFastPayload): CafeThemePageData {
  return {
    settings: payload.cafe.settings,
    customIdentity: payload.cafe.customIdentity,
    features: payload.cafe.features,
    cachedAt: Date.now(),
  };
}

function applyThemeCache(slug: string, data: CafeThemePageData) {
  cafeThemePageCache.set(slug, data);
  return data;
}

async function loadLegacyCafeThemePageData(slug: string): Promise<CafeThemePageData> {
  return cachedRequest(`public-cafe-theme-legacy:${slug}`, CAFE_THEME_PAGE_CACHE_TTL_MS, async () => {
    const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}`, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(res.status === 404 ? "المقهى غير موجود" : "تعذر تحميل بيانات المقهى");
    }

    const data = await res.json();
    return applyThemeCache(slug, {
      settings: data.settings ?? fallbackSettings(slug),
      customIdentity: data.customIdentity ?? null,
      features: Array.isArray(data.features) ? data.features.map(String) : [],
      cachedAt: Date.now(),
    });
  });
}

async function loadCafeThemePageData(slug: string): Promise<CafeThemePageData> {
  const cached = cafeThemePageCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < CAFE_THEME_PAGE_CACHE_TTL_MS) {
    return cached;
  }

  const fastCached = readPublicCafeFastCache(slug);
  if (fastCached) return applyThemeCache(slug, fromFastPayload(fastCached));

  const pending = cafeThemePageRequests.get(slug);
  if (pending) return pending;

  const request = refreshPublicCafeFastLayer(slug)
    .then((payload) => applyThemeCache(slug, fromFastPayload(payload)))
    .catch(() => loadLegacyCafeThemePageData(slug))
    .finally(() => {
      cafeThemePageRequests.delete(slug);
    });

  cafeThemePageRequests.set(slug, request);
  return request;
}

export function useCafeThemePage(slug: string) {
  const [customIdentity, setCustomIdentity] = useState<CustomIdentityTheme | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  const [settings, setSettings] = useState<CafeSettings>(() => fallbackSettings(slug));
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fallback = fallbackSettings(slug);

    // مهم: لا نقرأ localStorage داخل useState قبل hydration.
    // القراءة المبكرة كانت تخلي السيرفر يرندر شعار/ألوان افتراضية، والعميل يرندر بيانات الكوفي مباشرة، فينكسر /account.
    setSettings((current) => (current.cafeSlug === slug ? current : fallback));
    setCustomIdentity(null);
    setFeatures([]);
    setHydrated(false);
    setLoadError(null);

    const apply = (data: CafeThemePageData) => {
      if (cancelled) return;
      setSettings(data.settings);
      setCustomIdentity(data.customIdentity);
      setFeatures(data.features);
      setLoadError(null);
      setHydrated(true);
    };

    const unsubscribe = subscribePublicCafeFastLayer(slug, (payload) => {
      apply(applyThemeCache(slug, fromFastPayload(payload)));
    });

    async function load() {
      if (!isSupabaseConfigured()) {
        setLoadError("Supabase غير مهيأ — راجع .env.local");
        setHydrated(true);
        return;
      }

      const cached = cafeThemePageCache.get(slug);
      if (cached && Date.now() - cached.cachedAt < CAFE_THEME_PAGE_CACHE_TTL_MS) {
        apply(cached);
        void refreshPublicCafeFastLayer(slug).catch(() => undefined);
        return;
      }

      // قراءة كاش المتصفح تتم بعد mount فقط عشان ما يصير Hydration mismatch.
      const fastCached = readPublicCafeFastCache(slug);
      if (fastCached) {
        apply(applyThemeCache(slug, fromFastPayload(fastCached)));
        void refreshPublicCafeFastLayer(slug).catch(() => undefined);
        return;
      }

      try {
        const data = await loadCafeThemePageData(slug);
        apply(data);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "تعذر الاتصال بالخادم");
          setHydrated(true);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      unsubscribe();
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
    features,
    previewThemeId: null,
    isPreview: false,
    path,
    nextPath,
    hydrated,
    loadError,
  };
}
