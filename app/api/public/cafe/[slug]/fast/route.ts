import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getPublicCafeFeatureCodesBySlug, filterPublicCafePayloadByFeatures } from "@/lib/data/feature-entitlements";
import { getPublicMenuBySlug } from "@/lib/data/menu";
import { getPublicOffersBySlug } from "@/lib/data/offers";
import { getPublicExperienceCampaigns } from "@/lib/data/experience";
import { getPublicReservationServicesBySlug } from "@/lib/data/platform-upgrade";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity, getPublicThemeId } from "@/lib/data/theme";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { publicCacheHeader } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

const FAST_LAYER_TTL_SECONDS = 120;
const FAST_LAYER_STALE_SECONDS = 60 * 10;

type Params = { params: Promise<{ slug: string }> };

const emptyLoyaltySettings = {
  pointsPerSar: 0,
  welcomePoints: 0,
  enabled: false,
  earnRules: [],
  redemptionRules: [],
};

const emptyMenu = { products: [], categories: [] };

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

async function safeMenu(slug: string) {
  try {
    return await getPublicMenuBySlug(slug);
  } catch (error) {
    console.warn("[public/cafe/fast/menu-fallback]", error);
    return emptyMenu;
  }
}

async function safeOffers(slug: string) {
  try {
    return await getPublicOffersBySlug(slug);
  } catch (error) {
    console.warn("[public/cafe/fast/offers-fallback]", error);
    return [];
  }
}

async function safeBranches(slug: string) {
  try {
    return await getPublicBranchesBySlug(slug);
  } catch (error) {
    console.warn("[public/cafe/fast/branches-fallback]", error);
    return [];
  }
}

async function safeReservationServices(slug: string) {
  try {
    return await getPublicReservationServicesBySlug(slug);
  } catch (error) {
    console.warn("[public/cafe/fast/reservations-fallback]", error);
    return [];
  }
}

async function safeExperienceCampaigns(slug: string) {
  try {
    return await getPublicExperienceCampaigns(slug);
  } catch (error) {
    console.warn("[public/cafe/fast/experience-campaigns-fallback]", error);
    return [];
  }
}

function canUseFeature(features: string[], feature: string) {
  // Fail open if entitlement loading fails, to avoid hiding the public branch by mistake.
  return !features.length || featureCodesAllow(features, feature);
}

async function loadPublicCafeFastLayer(slug: string) {
  const [settings, themeId, customIdentity, features] = await Promise.all([
    getPublicCafeSettings(slug),
    safeThemeId(slug),
    safeCustomIdentity(slug),
    safeFeatures(slug),
  ]);

  if (!settings) return null;

  const [menu, offers, branches, reservationServices, experienceCampaigns] = await Promise.all([
    canUseFeature(features, "menu") ? safeMenu(slug) : Promise.resolve(emptyMenu),
    canUseFeature(features, "offers") ? safeOffers(slug) : Promise.resolve([]),
    canUseFeature(features, "branches") ? safeBranches(slug) : Promise.resolve([]),
    canUseFeature(features, "reservations") ? safeReservationServices(slug) : Promise.resolve([]),
    canUseFeature(features, "experience_reviews") ? safeExperienceCampaigns(slug) : Promise.resolve([]),
  ]);

  const rawMenuPayload = {
    ...menu,
    offers,
    branches,
    loyaltySettings: emptyLoyaltySettings,
    loyaltyRewards: [],
    pages: [],
    reservationServices,
    experienceCampaigns,
  };

  let menuPayload = rawMenuPayload;
  if (features.length) {
    try {
      menuPayload = filterPublicCafePayloadByFeatures(rawMenuPayload, features);
    } catch (error) {
      console.warn("[public/cafe/fast/filter-fallback]", error);
    }
  }

  const now = Date.now();
  return {
    cafe: { settings, themeId, customIdentity, features },
    menu: menuPayload,
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
        "x-barndaksa-fast-layer": "public-cafe-v1",
      },
    });
  } catch (error) {
    console.error("[public/cafe/fast]", error);
    return NextResponse.json({ error: "Failed to load fast cafe payload" }, { status: 500 });
  }
}
