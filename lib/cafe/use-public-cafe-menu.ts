"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import type { CafeBranch } from "@/lib/mock/branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { CafeInfoPage } from "@/lib/mock/cafe-pages";
import type { ReservationService } from "@/lib/data/platform-upgrade";
import type { ExperienceCampaign } from "@/lib/mock/experience-campaigns";
import { cachedRequest, readSessionCache, writeSessionCache } from "@/lib/performance/browser-cache";
import {
  readPublicCafeFastCache,
  refreshPublicCafeFastLayer,
  subscribePublicCafeFastLayer,
  type PublicCafeFastMenuPayload,
  type PublicCafeFastPayload,
} from "@/lib/cafe/public-cafe-fast-layer";

type PublicMenuPayload = {
  products: MenuProduct[];
  categories: MenuCategoryRecord[];
  offers: CafeOffer[];
  branches: CafeBranch[];
  loyaltySettings: LoyaltySettings;
  loyaltyRewards: LoyaltyReward[];
  pages: CafeInfoPage[];
  reservationServices: ReservationService[];
  experienceCampaigns: ExperienceCampaign[];
};

const emptyPayload: PublicMenuPayload = {
  products: [],
  categories: [],
  offers: [],
  branches: [],
  loyaltySettings: { pointsPerSar: 0, welcomePoints: 0, enabled: false, earnRules: [], redemptionRules: [] },
  loyaltyRewards: [],
  pages: [],
  reservationServices: [],
  experienceCampaigns: [],
};

const TTL_MS = 5 * 60_000;
const menuCache = new Map<string, { value: PublicMenuPayload; cachedAt: number }>();
const menuRequests = new Map<string, Promise<PublicMenuPayload>>();

function normalizePayload(json: Partial<PublicMenuPayload> | PublicCafeFastMenuPayload | null | undefined): PublicMenuPayload {
  return {
    products: Array.isArray(json?.products) ? json.products : [],
    categories: Array.isArray(json?.categories) ? json.categories : [],
    offers: Array.isArray(json?.offers) ? json.offers : [],
    branches: Array.isArray(json?.branches) ? json.branches : [],
    loyaltySettings: json?.loyaltySettings ?? emptyPayload.loyaltySettings,
    loyaltyRewards: Array.isArray(json?.loyaltyRewards) ? json.loyaltyRewards : [],
    pages: Array.isArray(json?.pages) ? json.pages : [],
    reservationServices: Array.isArray(json?.reservationServices) ? json.reservationServices : [],
    experienceCampaigns: Array.isArray(json?.experienceCampaigns) ? json.experienceCampaigns : [],
  };
}

function cacheMenu(slug: string, payload: PublicMenuPayload) {
  menuCache.set(slug, { value: payload, cachedAt: Date.now() });
  writeSessionCache(`barndaksa_public_menu_${slug}`, payload);
  return payload;
}

function menuFromFastPayload(slug: string, payload: PublicCafeFastPayload) {
  return cacheMenu(slug, normalizePayload(payload.menu));
}

async function loadLegacyPublicMenu(slug: string) {
  return cachedRequest(`public-menu-legacy:${slug}`, TTL_MS, async () => {
    const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}/menu`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status === 404 ? "المقهى غير موجود" : "تعذر تحميل المنيو");
    return cacheMenu(slug, normalizePayload(await res.json()));
  });
}

async function loadPublicMenu(slug: string) {
  const cached = menuCache.get(slug);
  if (cached && Date.now() - cached.cachedAt < TTL_MS) return cached.value;

  const fastCached = readPublicCafeFastCache(slug);
  if (fastCached) return menuFromFastPayload(slug, fastCached);

  const pending = menuRequests.get(slug);
  if (pending) return pending;

  const request = refreshPublicCafeFastLayer(slug)
    .then((payload) => menuFromFastPayload(slug, payload))
    .catch(() => loadLegacyPublicMenu(slug))
    .finally(() => menuRequests.delete(slug));

  menuRequests.set(slug, request);
  return request;
}

export function usePublicCafeMenu(slug: string) {
  const initialFast = readPublicCafeFastCache(slug);
  const initialSession = initialFast
    ? normalizePayload(initialFast.menu)
    : readSessionCache<PublicMenuPayload>(`barndaksa_public_menu_${slug}`, TTL_MS);

  const hadInitialData = Boolean(initialSession);
  const [data, setData] = useState<PublicMenuPayload>(() => initialSession ?? emptyPayload);
  const [loading, setLoading] = useState(!initialSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const apply = (payload: PublicMenuPayload) => {
      if (cancelled) return;
      setData(payload);
      setError(null);
      setLoading(false);
    };

    const unsubscribe = subscribePublicCafeFastLayer(slug, (payload) => {
      apply(menuFromFastPayload(slug, payload));
    });

    const cached = menuCache.get(slug);
    if (cached && Date.now() - cached.cachedAt < TTL_MS) {
      apply(cached.value);
      void refreshPublicCafeFastLayer(slug).catch(() => undefined);
    } else {
      const fastCached = readPublicCafeFastCache(slug);
      const sessionCached = readSessionCache<PublicMenuPayload>(`barndaksa_public_menu_${slug}`, TTL_MS);
      if (fastCached) {
        apply(menuFromFastPayload(slug, fastCached));
        void refreshPublicCafeFastLayer(slug).catch(() => undefined);
      } else if (sessionCached) {
        apply(sessionCached);
        void refreshPublicCafeFastLayer(slug).catch(() => undefined);
      } else {
        setLoading(true);
      }
    }

    async function load() {
      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setError("Supabase غير مهيأ");
          setLoading(false);
        }
        return;
      }

      try {
        const payload = await loadPublicMenu(slug);
        apply(payload);
      } catch (err) {
        if (!cancelled && !hadInitialData) {
          setError(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [slug]);

  return { ...data, loading, error };
}
