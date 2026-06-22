import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicMenuBySlug } from "@/lib/data/menu";
import { getPublicOffersBySlug } from "@/lib/data/offers";
import { getPublicExperienceCampaigns } from "@/lib/data/experience";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicReservationServicesBySlug } from "@/lib/data/platform-upgrade";
import { publicCacheHeader, PUBLIC_MENU_CACHE_SECONDS } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Params = { params: Promise<{ slug: string }> };

const emptyLoyaltySettings = {
  pointsPerSar: 0,
  welcomePoints: 0,
  enabled: false,
  earnRules: [],
  redemptionRules: [],
};

const emptyMenu = { products: [], categories: [] };

async function safeMenu(slug: string) {
  try {
    return await getPublicMenuBySlug(slug);
  } catch (error) {
    console.warn("[public/menu/menu-fallback]", error);
    return emptyMenu;
  }
}

async function safeOffers(slug: string) {
  try {
    return await getPublicOffersBySlug(slug);
  } catch (error) {
    console.warn("[public/menu/offers-fallback]", error);
    return [];
  }
}

async function safeBranches(slug: string) {
  try {
    return await getPublicBranchesBySlug(slug);
  } catch (error) {
    console.warn("[public/menu/branches-fallback]", error);
    return [];
  }
}

async function safeReservationServices(slug: string) {
  try {
    return await getPublicReservationServicesBySlug(slug);
  } catch (error) {
    console.warn("[public/menu/reservations-fallback]", error);
    return [];
  }
}

async function safeExperienceCampaigns(slug: string) {
  try {
    return await getPublicExperienceCampaigns(slug);
  } catch (error) {
    console.warn("[public/menu/experience-campaigns-fallback]", error);
    return [];
  }
}

async function loadPublicMenu(slug: string) {
  const settings = await getPublicCafeSettings(slug);
  if (!settings) return null;

  const [menu, offers, branches, reservationServices, experienceCampaigns] = await Promise.all([
    safeMenu(slug),
    safeOffers(slug),
    safeBranches(slug),
    safeReservationServices(slug),
    safeExperienceCampaigns(slug),
  ]);

  return {
    ...menu,
    offers,
    branches,
    loyaltySettings: emptyLoyaltySettings,
    loyaltyRewards: [],
    pages: [],
    reservationServices,
    experienceCampaigns,
  };
}

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();

  try {
    let payload = await cachedServerValue(
      `public-menu:${normalizedSlug}`,
      PUBLIC_MENU_CACHE_SECONDS * 1000,
      () => loadPublicMenu(normalizedSlug),
    );

    if (!payload) {
      payload = await loadPublicMenu(normalizedSlug);
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
