import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity, getPublicThemeId } from "@/lib/data/theme";
import { publicCacheHeader, PUBLIC_CAFE_CACHE_SECONDS } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Params = { params: Promise<{ slug: string }> };

async function safePublicFeatures(slug: string) {
  try {
    return await getPublicCafeFeatureCodesBySlug(slug);
  } catch (error) {
    console.warn("[public/cafe/features]", error);
    return [];
  }
}

async function safeThemeId(slug: string) {
  try {
    return await getPublicThemeId(slug);
  } catch (error) {
    console.warn("[public/cafe/theme]", error);
    return null;
  }
}

async function safeCustomIdentity(slug: string) {
  try {
    return await getPublicCustomIdentity(slug);
  } catch (error) {
    console.warn("[public/cafe/identity]", error);
    return null;
  }
}

async function loadPublicCafe(slug: string) {
  const [settings, themeId, customIdentity, features] = await Promise.all([
    getPublicCafeSettings(slug),
    safeThemeId(slug),
    safeCustomIdentity(slug),
    safePublicFeatures(slug),
  ]);

  if (!settings) return null;
  return { settings, themeId, customIdentity, features };
}

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();

  try {
    let payload = await cachedServerValue(
      `public-cafe:${normalizedSlug}`,
      PUBLIC_CAFE_CACHE_SECONDS * 1000,
      () => loadPublicCafe(normalizedSlug),
    );

    if (!payload) {
      payload = await loadPublicCafe(normalizedSlug);
    }

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
