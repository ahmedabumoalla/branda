import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { publicCacheHeader, PUBLIC_MENU_CACHE_SECONDS } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const branches = await cachedServerValue(
    `public-branches:${normalizedSlug}`,
    PUBLIC_MENU_CACHE_SECONDS * 1000,
    () => getPublicBranchesBySlug(normalizedSlug),
  );
  return NextResponse.json(
    { branches, products: [], categories: [], nextCursor: null },
    { headers: { "Cache-Control": publicCacheHeader(PUBLIC_MENU_CACHE_SECONDS) } },
  );
}
