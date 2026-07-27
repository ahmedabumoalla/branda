"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import type { CafeBranch } from "@/lib/mock/branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { ExperienceCampaign } from "@/lib/mock/experience-campaigns";
import {
  cachedRequest,
  readMemoryCache,
  writeMemoryCache,
} from "@/lib/performance/browser-cache";

export type PublicMenuPayload = {
  products: MenuProduct[];
  categories: MenuCategoryRecord[];
  offers: CafeOffer[];
  branches: CafeBranch[];
  loyaltySettings: LoyaltySettings;
  loyaltyRewards: LoyaltyReward[];
  experienceCampaigns: ExperienceCampaign[];
  nextCursor?: number | null;
  totalCount?: number;
};

type Resource = "products" | "offers" | "branches" | "product";
type Options = {
  resource?: Resource;
  productId?: string;
  cursor?: number;
  limit?: number;
};

const emptyPayload: PublicMenuPayload = {
  products: [],
  categories: [],
  offers: [],
  branches: [],
  loyaltySettings: { pointsPerSar: 0, welcomePoints: 0, enabled: false, earnRules: [], redemptionRules: [] },
  loyaltyRewards: [],
  experienceCampaigns: [],
  nextCursor: null,
  totalCount: 0,
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
    totalCount:
      typeof json?.totalCount === "number"
        ? json.totalCount
        : Array.isArray(json?.products)
          ? json.products.length
          : 0,
  };
}

function resourceUrl(slug: string, options: Options) {
  const base = `/api/public/cafe/${encodeURIComponent(slug)}`;
  if (options.resource === "offers") return `${base}/offers?limit=${options.limit ?? 12}`;
  if (options.resource === "branches") return `${base}/branches`;
  if (options.resource === "product" && options.productId) {
    return `${base}/products/${encodeURIComponent(options.productId)}`;
  }
  return `${base}/menu?cursor=${options.cursor ?? 0}&limit=${options.limit ?? 16}`;
}

function resourceKey(slug: string, options: Options) {
  return `public-cafe-resource:${slug.trim().toLowerCase()}:${options.resource ?? "products"}:${options.productId ?? ""}:${options.cursor ?? 0}:${options.limit ?? ""}`;
}

function aggregateKey(slug: string, options: Options) {
  return `${resourceKey(slug, { ...options, cursor: 0 })}:aggregate`;
}

export function mergePublicMenuPages(
  current: PublicMenuPayload,
  incoming: PublicMenuPayload,
): PublicMenuPayload {
  const products = new Map(current.products.map((product) => [product.id, product]));
  for (const product of incoming.products) products.set(product.id, product);
  return {
    ...current,
    ...incoming,
    products: Array.from(products.values()),
    categories: incoming.categories.length ? incoming.categories : current.categories,
    offers: incoming.offers.length ? incoming.offers : current.offers,
    branches: incoming.branches.length ? incoming.branches : current.branches,
    totalCount: Math.max(
      current.totalCount ?? 0,
      incoming.totalCount ?? 0,
      products.size,
    ),
  };
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
  const resource = options.resource ?? "products";
  const productId = options.productId ?? "";
  const cursor = options.cursor ?? 0;
  const limit = options.limit ?? (resource === "products" ? 16 : 12);
  const resolvedOptions: Options = {
    resource,
    productId: productId || undefined,
    cursor,
    limit,
  };
  const storedAggregate =
    resource === "products"
      ? readMemoryCache<PublicMenuPayload>(aggregateKey(slug, resolvedOptions))
      : null;
  const initial =
    storedAggregate ??
    readMemoryCache<PublicMenuPayload>(resourceKey(slug, resolvedOptions));
  const [data, setData] = useState<PublicMenuPayload>(initial ?? emptyPayload);
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  const loadingCursorRef = useRef<number | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    const firstPageOptions: Options = {
      resource,
      productId: productId || undefined,
      cursor,
      limit,
    };
    const aggregate =
      resource === "products"
        ? readMemoryCache<PublicMenuPayload>(aggregateKey(slug, firstPageOptions))
        : null;
    const cached =
      aggregate ??
      readMemoryCache<PublicMenuPayload>(resourceKey(slug, firstPageOptions));
    if (cached) {
      setData(cached);
      dataRef.current = cached;
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setData(emptyPayload);
    dataRef.current = emptyPayload;
    loadingCursorRef.current = null;
    setLoading(true);
    void prefetchPublicCafeResource(slug, firstPageOptions)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        dataRef.current = payload;
        if (resource === "products") {
          writeMemoryCache(aggregateKey(slug, firstPageOptions), payload, TTL_MS);
        }
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
  }, [slug, resource, productId, cursor, limit]);

  const loadMore = useCallback(async () => {
    if (resource !== "products") return;
    const nextCursor = dataRef.current.nextCursor;
    if (typeof nextCursor !== "number" || loadingCursorRef.current === nextCursor) return;

    loadingCursorRef.current = nextCursor;
    setLoadingMore(true);
    try {
      const pageOptions: Options = { resource, cursor: nextCursor, limit };
      const incoming = await prefetchPublicCafeResource(slug, pageOptions);
      const merged = mergePublicMenuPages(dataRef.current, incoming);
      dataRef.current = merged;
      setData(merged);
      writeMemoryCache(
        aggregateKey(slug, { resource, cursor: 0, limit }),
        merged,
        TTL_MS,
      );
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "تعذر تحميل المزيد من المنتجات",
      );
    } finally {
      loadingCursorRef.current = null;
      setLoadingMore(false);
    }
  }, [slug, resource, limit]);

  return {
    ...data,
    loading,
    loadingMore,
    loadMore,
    hasMore: typeof data.nextCursor === "number",
    error,
  };
}
