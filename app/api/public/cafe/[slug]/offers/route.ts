import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicOffersBySlug } from "@/lib/data/offers";
import { publicCacheHeader, PUBLIC_MENU_CACHE_SECONDS } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") ?? 12) || 12, 1), 20);
  const offers = await cachedServerValue(
    `public-offers:${normalizedSlug}:${limit}`,
    PUBLIC_MENU_CACHE_SECONDS * 1000,
    async () => (await getPublicOffersBySlug(normalizedSlug)).slice(0, limit),
  );
  return NextResponse.json(
    { offers, products: [], categories: [], nextCursor: null },
    { headers: { "Cache-Control": publicCacheHeader(PUBLIC_MENU_CACHE_SECONDS) } },
  );
}
