import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicProductBySlug } from "@/lib/data/menu";
import { publicCacheHeader, PUBLIC_MENU_CACHE_SECONDS } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Params = { params: Promise<{ slug: string; id: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const { slug, id } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const product = await cachedServerValue(
    `public-product:${normalizedSlug}:${id}`,
    PUBLIC_MENU_CACHE_SECONDS * 1000,
    () => getPublicProductBySlug(normalizedSlug, id),
  );
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  return NextResponse.json(
    { products: [product], categories: [], nextCursor: null },
    { headers: { "Cache-Control": publicCacheHeader(PUBLIC_MENU_CACHE_SECONDS) } },
  );
}
