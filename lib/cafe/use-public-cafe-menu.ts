"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/branda/env";
import type { CafeBranch } from "@/lib/mock/branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";

type PublicMenuPayload = {
  products: MenuProduct[];
  categories: MenuCategoryRecord[];
  offers: CafeOffer[];
  branches: CafeBranch[];
  loyaltySettings: LoyaltySettings;
  loyaltyRewards: LoyaltyReward[];
};

const emptyPayload: PublicMenuPayload = {
  products: [],
  categories: [],
  offers: [],
  branches: [],
  loyaltySettings: { pointsPerSar: 1, welcomePoints: 0, enabled: true, earnRules: [], redemptionRules: [] },
  loyaltyRewards: [],
};

export function usePublicCafeMenu(slug: string) {
  const [data, setData] = useState<PublicMenuPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured()) {
        setError("Supabase غير مهيأ");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}/menu`);
        if (!res.ok) {
          setError(res.status === 404 ? "المقهى غير موجود" : "تعذر تحميل المنيو");
          setLoading(false);
          return;
        }

        const json = await res.json();
        if (cancelled) return;

        setData({
          products: json.products ?? [],
          categories: json.categories ?? [],
          offers: json.offers ?? [],
          branches: json.branches ?? [],
          loyaltySettings: json.loyaltySettings ?? emptyPayload.loyaltySettings,
          loyaltyRewards: json.loyaltyRewards ?? [],
        });
        setError(null);
      } catch {
        if (!cancelled) setError("تعذر الاتصال بالخادم");
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
