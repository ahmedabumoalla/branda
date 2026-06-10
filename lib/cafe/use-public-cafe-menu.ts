"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/branda/env";
import type { CafeBranch } from "@/lib/mock/branches";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { CafeOffer } from "@/lib/mock/offers";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";
import type { CafeInfoPage } from "@/lib/mock/cafe-pages";
import type { ReservationService } from "@/lib/data/platform-upgrade";

type PublicMenuPayload = { products: MenuProduct[]; categories: MenuCategoryRecord[]; offers: CafeOffer[]; branches: CafeBranch[]; loyaltySettings: LoyaltySettings; loyaltyRewards: LoyaltyReward[]; pages: CafeInfoPage[]; reservationServices: ReservationService[] };
const emptyPayload: PublicMenuPayload = { products: [], categories: [], offers: [], branches: [], loyaltySettings: { pointsPerSar: 0, welcomePoints: 0, enabled: false, earnRules: [], redemptionRules: [] }, loyaltyRewards: [], pages: [], reservationServices: [] };
const TTL_MS = 5_000;
function readCache(slug: string): PublicMenuPayload | null { try { const raw = sessionStorage.getItem(`branda_public_menu_${slug}`); if (!raw) return null; const parsed = JSON.parse(raw) as { at: number; data: PublicMenuPayload }; return Date.now() - parsed.at > TTL_MS ? null : parsed.data; } catch { return null; } }
function writeCache(slug: string, data: PublicMenuPayload) { try { sessionStorage.setItem(`branda_public_menu_${slug}`, JSON.stringify({ at: Date.now(), data })); } catch {} }

export function usePublicCafeMenu(slug: string) {
  const [data, setData] = useState<PublicMenuPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; const cached = readCache(slug); if (cached) { setData(cached); setLoading(false); }
    async function load() { if (!isSupabaseConfigured()) { setError("Supabase غير مهيأ"); setLoading(false); return; } try { const res = await fetch(`/api/public/cafe/${encodeURIComponent(slug)}/menu`, { cache: "no-store" }); if (!res.ok) { if (!cached) setError(res.status === 404 ? "المقهى غير موجود" : "تعذر تحميل المنيو"); setLoading(false); return; } const json = await res.json(); if (cancelled) return; const payload = { products: json.products ?? [], categories: json.categories ?? [], offers: json.offers ?? [], branches: json.branches ?? [], loyaltySettings: json.loyaltySettings ?? emptyPayload.loyaltySettings, loyaltyRewards: json.loyaltyRewards ?? [], pages: [], reservationServices: json.reservationServices ?? [] }; setData(payload); writeCache(slug, payload); setError(null); } catch { if (!cancelled && !cached) setError("تعذر الاتصال بالخادم"); } finally { if (!cancelled) setLoading(false); } }
    void load(); return () => { cancelled = true; }; }, [slug]);
  return { ...data, loading, error };
}
