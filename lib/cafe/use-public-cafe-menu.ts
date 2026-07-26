"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import type { CafeBranch } from "@/lib/mock/branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { ExperienceCampaign } from "@/lib/mock/experience-campaigns";
import { cachedRequest, readMemoryCache } from "@/lib/performance/browser-cache";

export type PublicMenuPayload = {
  products: MenuProduct[];
  categories: MenuCategoryRecord[];
  offers: CafeOffer[];
  branches: CafeBranch[];
  loyaltySettings: LoyaltySettings;
  loyaltyRewards: LoyaltyReward[];
  experienceCampaigns: ExperienceCampaign[];
  nextCursor?: number | null;
};

type Resource = "products" | "offers" | "branches" | "product";
type Options = { resource?: Resource; productId?: string; limit?: number };

const emptyPayload: PublicMenuPayload = {
  products: [],
  categories: [],
  offers: [],
  branches: [],
  loyaltySettings: { pointsPerSar: 0, welcomePoints: 0, enabled: false, earnRules: [], redemptionRules: [] },
  loyaltyRewards: [],
  experienceCampaigns: [],
  nextCursor: null,
};

const TTL_MS = 5 * 60_000;

function normalizePayload(json: Partial<PublicMenuPayload> | null | undefined): PublicMenuPayload {
  return {
    products: Array.isArray(json?.products) ? json.products : [],
    categories: Array.isArray(json?.categories) ? json.categories : [],
    offers: Array.isArray(json?.offers) ? json.offers : [],
    branches: Array.isArray(json?.branches) ? json.branches : [],
    loyaltySettings: json?.loyaltySettings ?? emptyPayload.loyaltySettings,
    loyaltyRewards: Array.isArray(json?.loyaltyRewards) ? json.loyaltyRewards : [],
    experienceCampaigns: Array.isArray(json?.experienceCampaigns) ? json.experienceCampaigns : [],
    nextCursor: typeof json?.nextCursor === "number" ? json.nextCursor : null,
  };
}

function resourceUrl(slug: string, options: Options) {
  const base = `/api/public/cafe/${encodeURIComponent(slug)}`;
  if (options.resource === "offers") return `${base}/offers?limit=${options.limit ?? 12}`;
  if (options.resource === "branches") return `${base}/branches`;
  if (options.resource === "product" && options.productId) {
    return `${base}/products/${encodeURIComponent(options.productId)}`;
  }
  return `${base}/menu?limit=${options.limit ?? 16}`;
}

function resourceKey(slug: string, options: Options) {
  return `public-cafe-resource:${slug.trim().toLowerCase()}:${options.resource ?? "products"}:${options.productId ?? ""}:${options.limit ?? ""}`;
}

async function loadResource(slug: string, options: Options) {
  const response = await fetch(resourceUrl(slug, options), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "الفرع أو المورد غير موجود" : "تعذر تحميل بيانات الصفحة");
  }
  return normalizePayload(await response.json());
}

export function prefetchPublicCafeResource(slug: string, options: Options = {}) {
  if (!isSupabaseConfigured()) return Promise.resolve(emptyPayload);
  return cachedRequest(resourceKey(slug, options), TTL_MS, () => loadResource(slug, options));
}

export function usePublicCafeMenu(slug: string, options: Options = {}) {
  const key = resourceKey(slug, options);
  const initial = readMemoryCache<PublicMenuPayload>(key);
  const [data, setData] = useState<PublicMenuPayload>(initial ?? emptyPayload);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);
  const resource = options.resource ?? "products";
  const productId = options.productId ?? "";
  const limit = options.limit ?? (resource === "products" ? 16 : 12);

  useEffect(() => {
    let cancelled = false;
    const resolvedOptions: Options = { resource, productId: productId || undefined, limit };
    const cached = readMemoryCache<PublicMenuPayload>(resourceKey(slug, resolvedOptions));
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void prefetchPublicCafeResource(slug, resolvedOptions)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setError(null);
        setLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "تعذر الاتصال بالخادم");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, resource, productId, limit]);

  return { ...data, loading, error };
}
