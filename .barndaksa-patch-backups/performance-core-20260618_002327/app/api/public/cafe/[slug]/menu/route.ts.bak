import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicMenuBySlug } from "@/lib/data/menu";
import { getPublicOffersBySlug } from "@/lib/data/offers";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicReservationServicesBySlug } from "@/lib/data/platform-upgrade";
import { publicCacheHeader, PUBLIC_MENU_CACHE_SECONDS } from "@/lib/performance/server-cache";

type Params = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const emptyLoyaltySettings = {
  pointsPerSar: 0,
  welcomePoints: 0,
  enabled: false,
  earnRules: [],
  redemptionRules: [],
};

async function loadPublicMenu(slug: string) {
  const settings = await getPublicCafeSettings(slug);
  if (!settings) return null;

  const [menu, offers, branches, reservationServices] = await Promise.all([
    getPublicMenuBySlug(slug),
    getPublicOffersBySlug(slug),
    getPublicBranchesBySlug(slug),
    getPublicReservationServicesBySlug(slug),
  ]);

  return {
    ...menu,
    offers,
    branches,
    loyaltySettings: emptyLoyaltySettings,
    loyaltyRewards: [],
    pages: [],
    reservationServices,
  };
}

export async function GET(_request: Request, { params }: Params) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { slug } = await params;

  try {
    const payload = await loadPublicMenu(slug);
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
