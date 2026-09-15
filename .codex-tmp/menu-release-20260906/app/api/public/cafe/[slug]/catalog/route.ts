import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicProductCatalogSummaryBySlug } from "@/lib/data/menu";
import {
  publicCacheHeader,
  PUBLIC_MENU_CACHE_SECONDS,
} from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  try {
    const payload = await cachedServerValue(
      `public-product-catalog-summary:${normalizedSlug}`,
      PUBLIC_MENU_CACHE_SECONDS * 1000,
      () => getPublicProductCatalogSummaryBySlug(normalizedSlug),
    );
    if (!payload) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": publicCacheHeader(PUBLIC_MENU_CACHE_SECONDS),
      },
    });
  } catch (error) {
    console.error("[public/catalog]", error);
    return NextResponse.json(
      { error: "Failed to load product catalog" },
      { status: 500 },
    );
  }
}
