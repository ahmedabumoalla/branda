"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import {
  type PublicProductCatalogPayload,
} from "@/lib/cafe/public-product-summary";
import {
  cachedRequest,
  readMemoryCache,
} from "@/lib/performance/browser-cache";

const TTL_MS = 5 * 60_000;
const emptyCatalog: PublicProductCatalogPayload = {
  products: [],
  categories: [],
  totalCount: 0,
};

function catalogKey(slug: string) {
  return `public-product-catalog-summary:${slug.trim().toLowerCase()}`;
}

function normalizeCatalog(
  value: Partial<PublicProductCatalogPayload> | null | undefined,
): PublicProductCatalogPayload {
  const products = Array.isArray(value?.products) ? value.products : [];
  return {
    products,
    categories: Array.isArray(value?.categories) ? value.categories : [],
    totalCount:
      typeof value?.totalCount === "number"
        ? value.totalCount
        : products.length,
  };
}

async function loadCatalog(slug: string) {
  const response = await fetch(
    `/api/public/cafe/${encodeURIComponent(slug)}/catalog`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "الفرع غير موجود"
        : "تعذر تحميل كتالوج المنتجات",
    );
  }
  return normalizeCatalog(await response.json());
}

export function prefetchPublicProductCatalog(slug: string) {
  if (!isSupabaseConfigured()) return Promise.resolve(emptyCatalog);
  return cachedRequest(catalogKey(slug), TTL_MS, () => loadCatalog(slug));
}

export function usePublicProductCatalog(
  slug: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false;
  const key = catalogKey(slug);
  const initial = enabled
    ? readMemoryCache<PublicProductCatalogPayload>(key)
    : null;
  const [catalog, setCatalog] = useState(initial ?? emptyCatalog);
  const [loading, setLoading] = useState(enabled && !initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setCatalog(emptyCatalog);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = readMemoryCache<PublicProductCatalogPayload>(
      catalogKey(slug),
    );
    if (cached) {
      setCatalog(cached);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setCatalog(emptyCatalog);
    setLoading(true);
    void prefetchPublicProductCatalog(slug)
      .then((payload) => {
        if (cancelled) return;
        setCatalog(payload);
        setError(null);
        setLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(
          reason instanceof Error ? reason.message : "تعذر الاتصال بالخادم",
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, enabled]);

  return { ...catalog, loading, error };
}
