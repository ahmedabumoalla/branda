import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity, getPublicThemeId } from "@/lib/data/theme";
import { publicCacheHeader, PUBLIC_CAFE_CACHE_SECONDS } from "@/lib/performance/server-cache";

type Params = { params: Promise<{ slug: string }> };
export const revalidate = 300;

const loadPublicCafe = unstable_cache(
  async (slug: string) => {
    const [settings, themeId, customIdentity] = await Promise.all([
      getPublicCafeSettings(slug),
      getPublicThemeId(slug),
      getPublicCustomIdentity(slug),
    ]);

    if (!settings) return null;
    return { settings, themeId, customIdentity };
  },
  ["barndaksa-public-cafe-v2"],
  { revalidate: PUBLIC_CAFE_CACHE_SECONDS },
);

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;

  try {
    const payload = await loadPublicCafe(slug);

    if (!payload) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }

    return NextResponse.json(payload, {
      headers: { "Cache-Control": publicCacheHeader(PUBLIC_CAFE_CACHE_SECONDS) },
    });
  } catch (err) {
    console.error("[public/cafe]", err);
    return NextResponse.json({ error: "Failed to load cafe" }, { status: 500 });
  }
}
