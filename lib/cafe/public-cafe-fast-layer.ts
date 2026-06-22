"use client";

import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import type { CafeBranch } from "@/lib/mock/branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { CafeInfoPage } from "@/lib/mock/cafe-pages";
import type { ReservationService } from "@/lib/data/platform-upgrade";
import type { ExperienceCampaign } from "@/lib/mock/experience-campaigns";

export type PublicCafeFastMenuPayload = {
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

export type PublicCafeFastPayload = {
  cafe: {
    settings: CafeSettings;
    themeId: string | null;
    customIdentity: CustomIdentityTheme | null;
    features: string[];
  };
  menu: PublicCafeFastMenuPayload;
  fetchedAt: number;
  staleAt: number;
  expiresAt: number;
  source: "network" | "cache";
};

const FRESH_TTL_MS = 90_000;
const STALE_TTL_MS = 12 * 60 * 60_000;
const memoryCache = new Map<string, PublicCafeFastPayload>();
const pendingRequests = new Map<string, Promise<PublicCafeFastPayload>>();

const emptyLoyaltySettings: LoyaltySettings = {
  pointsPerSar: 0,
  welcomePoints: 0,
  enabled: false,
  earnRules: [],
  redemptionRules: [],
};

const emptyMenu: PublicCafeFastMenuPayload = {
  products: [],
  categories: [],
  offers: [],
  branches: [],
  loyaltySettings: emptyLoyaltySettings,
  loyaltyRewards: [],
  pages: [],
  reservationServices: [],
  experienceCampaigns: [],
};

function normalizedSlug(slug: string) {
  return slug.trim().toLowerCase();
}

function cacheKey(slug: string) {
  return `barndaksa_public_cafe_fast_${normalizedSlug(slug)}`;
}

function eventName(slug: string) {
  return `barndaksa:public-cafe-fast:${normalizedSlug(slug)}`;
}

function arrayOfString(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeMenu(value: Partial<PublicCafeFastMenuPayload> | null | undefined): PublicCafeFastMenuPayload {
  return {
    products: Array.isArray(value?.products) ? value.products : [],
    categories: Array.isArray(value?.categories) ? value.categories : [],
    offers: Array.isArray(value?.offers) ? value.offers : [],
    branches: Array.isArray(value?.branches) ? value.branches : [],
    loyaltySettings: value?.loyaltySettings ?? emptyLoyaltySettings,
    loyaltyRewards: Array.isArray(value?.loyaltyRewards) ? value.loyaltyRewards : [],
    pages: Array.isArray(value?.pages) ? value.pages : [],
    reservationServices: Array.isArray(value?.reservationServices) ? value.reservationServices : [],
    experienceCampaigns: Array.isArray(value?.experienceCampaigns) ? value.experienceCampaigns : [],
  };
}

function normalizePayload(raw: Partial<PublicCafeFastPayload>): PublicCafeFastPayload | null {
  const settings = raw.cafe?.settings;
  if (!settings) return null;

  const now = Date.now();
  const fetchedAt = Number(raw.fetchedAt || now);
  const staleAt = Number(raw.staleAt || fetchedAt + FRESH_TTL_MS);
  const expiresAt = Number(raw.expiresAt || fetchedAt + STALE_TTL_MS);

  return {
    cafe: {
      settings,
      themeId: raw.cafe?.themeId ?? null,
      customIdentity: raw.cafe?.customIdentity ?? null,
      features: arrayOfString(raw.cafe?.features),
    },
    menu: normalizeMenu(raw.menu),
    fetchedAt,
    staleAt,
    expiresAt,
    source: "cache",
  };
}

function readLocalPayload(slug: string): PublicCafeFastPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(slug));
    if (!raw) return null;
    const parsed = normalizePayload(JSON.parse(raw) as Partial<PublicCafeFastPayload>);
    if (!parsed) return null;
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(cacheKey(slug));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePayload(slug: string, payload: PublicCafeFastPayload) {
  const key = cacheKey(slug);
  memoryCache.set(key, payload);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Local storage can fail in private modes. Memory cache remains active.
  }
}

export function readPublicCafeFastCache(slug: string, options?: { freshOnly?: boolean }) {
  const key = cacheKey(slug);
  const cached = memoryCache.get(key) ?? readLocalPayload(slug);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) return null;
  if (options?.freshOnly && Date.now() > cached.staleAt) return null;
  return cached;
}

export function isPublicCafeFastCacheFresh(slug: string) {
  return Boolean(readPublicCafeFastCache(slug, { freshOnly: true }));
}

export async function refreshPublicCafeFastLayer(slug: string, options?: { force?: boolean }) {
  const normalized = normalizedSlug(slug);
  const pendingKey = `${normalized}:${options?.force ? "force" : "normal"}`;
  const pending = pendingRequests.get(pendingKey);
  if (pending) return pending;

  const request = (async () => {
    const query = options?.force ? "?fresh=1" : "";
    const response = await fetch(`/api/public/cafe/${encodeURIComponent(normalized)}/fast${query}`, {
      cache: "no-store",
      headers: { "x-barndaksa-fast-layer": "1" },
    });
    if (!response.ok) {
      throw new Error(response.status === 404 ? "الفرع غير موجود" : "تعذر تحميل بيانات الفرع السريعة");
    }
    const payload = normalizePayload((await response.json()) as Partial<PublicCafeFastPayload>);
    if (!payload) throw new Error("تعذر قراءة بيانات الفرع");
    const networkPayload: PublicCafeFastPayload = { ...payload, source: "network" };
    writePayload(normalized, networkPayload);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(eventName(normalized), { detail: networkPayload }));
    }
    return networkPayload;
  })().finally(() => pendingRequests.delete(pendingKey));

  pendingRequests.set(pendingKey, request);
  return request;
}

export function warmPublicCafeFastLayer(slug: string) {
  const cached = readPublicCafeFastCache(slug, { freshOnly: true });
  if (cached) return;
  void refreshPublicCafeFastLayer(slug).catch(() => undefined);
}

export function subscribePublicCafeFastLayer(slug: string, listener: (payload: PublicCafeFastPayload) => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<PublicCafeFastPayload>;
    if (customEvent.detail) listener(customEvent.detail);
  };
  window.addEventListener(eventName(slug), handler);
  return () => window.removeEventListener(eventName(slug), handler);
}
