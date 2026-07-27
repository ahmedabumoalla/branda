import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicMenuPageBySlug } from "@/lib/data/menu";
import { publicCacheHeader, PUBLIC_MENU_CACHE_SECONDS } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const url = new URL(request.url);
  const cursor = Math.max(Number(url.searchParams.get("cursor") ?? 0) || 0, 0);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 16) || 16, 1), 20);

  try {
    let payload = await cachedServerValue(
      `public-products:${normalizedSlug}:${cursor}:${limit}:all`,
      PUBLIC_MENU_CACHE_SECONDS * 1000,
      () => getPublicMenuPageBySlug(normalizedSlug, { cursor, limit }),
    );

    if (!payload) {
      payload = await getPublicMenuPageBySlug(normalizedSlug, { cursor, limit });
    }

    if (!payload) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": publicCacheHeader(PUBLIC_MENU_CACHE_SECONDS) },
    });
  } catch (err) {
    console.error("[public/menu]", err);
    return NextResponse.json({ error: "Failed to load menu" }, { status: 500 });
  }
}
