"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { cachedRequest, readSessionCache, writeSessionCache } from "@/lib/performance/browser-cache";
import type { CafeBranch } from "@/lib/mock/branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { CafeInfoPage } from "@/lib/mock/cafe-pages";
import type { ReservationService } from "@/lib/data/platform-upgrade";

type PublicMenuPayload = {
  products: MenuProduct[];
  categories: MenuCategoryRecord[];
  offers: CafeOffer[];
  branches: CafeBranch[];
  loyaltySettings: LoyaltySettings;
  loyaltyRewards: LoyaltyReward[];
  pages: CafeInfoPage[];
  reservationServices: ReservationService[];
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
};

const TTL_MS = 5 * 60_000;

function normalizePayload(json: Partial<PublicMenuPayload>): PublicMenuPayload {
  return {
    products: json.products ?? [],
    categories: json.categories ?? [],
    offers: json.offers ?? [],
    branches: json.branches ?? [],
    loyaltySettings: json.loyaltySettings ?? emptyPayload.loyaltySettings,
    loyaltyRewards: json.loyaltyRewards ?? [],
    pages: json.pages ?? [],
    reservationServices: json.reservationServices ?? [],
  };
}

async function loadPublicMenu(slug: string) {
  return cachedRequest(`public-menu:${slug}`, TTL_MS, async () => {
    const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}/menu`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(res.status === 404 ? "المقهى غير موجود" : "تعذر تحميل المنيو");
    const payload = normalizePayload(await res.json());
    writeSessionCache(`barndaksa_public_menu_${slug}`, payload);
    return payload;
  });
}

export function usePublicCafeMenu(slug: string) {
  const [data, setData] = useState<PublicMenuPayload>(() => emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = readSessionCache<PublicMenuPayload>(`barndaksa_public_menu_${slug}`, TTL_MS);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
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
        if (cancelled) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (!cancelled && !cached) {
          setError(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { ...data, loading, error };
}
