import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity, getPublicThemeId } from "@/lib/data/theme";
import { publicCacheHeader } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

const FAST_LAYER_TTL_SECONDS = 120;
const FAST_LAYER_STALE_SECONDS = 60 * 10;

type Params = { params: Promise<{ slug: string }> };

async function safeFeatures(slug: string) {
  try {
    return await getPublicCafeFeatureCodesBySlug(slug);
  } catch (error) {
    console.warn("[public/cafe/fast/features]", error);
    return [];
  }
}

async function safeThemeId(slug: string) {
  try {
    return await getPublicThemeId(slug);
  } catch (error) {
    console.warn("[public/cafe/fast/theme]", error);
    return null;
  }
}

async function safeCustomIdentity(slug: string) {
  try {
    return await getPublicCustomIdentity(slug);
  } catch (error) {
    console.warn("[public/cafe/fast/identity]", error);
    return null;
  }
}

async function loadPublicCafeFastLayer(slug: string) {
  const [settings, themeId, customIdentity, features] = await Promise.all([
    getPublicCafeSettings(slug),
    safeThemeId(slug),
    safeCustomIdentity(slug),
    safeFeatures(slug),
  ]);

  if (!settings) return null;

  const now = Date.now();
  return {
    cafe: { settings, themeId, customIdentity, features },
    fetchedAt: now,
    staleAt: now + FAST_LAYER_TTL_SECONDS * 1000,
    expiresAt: now + FAST_LAYER_STALE_SECONDS * 1000,
    source: "network" as const,
  };
}

export async function GET(request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";

  try {
    let payload = fresh
      ? await loadPublicCafeFastLayer(normalizedSlug)
      : await cachedServerValue(
          `public-cafe-fast:${normalizedSlug}`,
          FAST_LAYER_TTL_SECONDS * 1000,
          () => loadPublicCafeFastLayer(normalizedSlug),
        );

    if (!payload && !fresh) {
      payload = await loadPublicCafeFastLayer(normalizedSlug);
    }

    if (!payload) {
      return NextResponse.json({ error: "Cafe not found" }, { status: 404 });
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": publicCacheHeader(FAST_LAYER_TTL_SECONDS),
        "x-barndaksa-fast-layer": "public-cafe-bootstrap-v2",
      },
    });
  } catch (error) {
    console.error("[public/cafe/fast]", error);
    return NextResponse.json({ error: "Failed to load fast cafe payload" }, { status: 500 });
  }
}
